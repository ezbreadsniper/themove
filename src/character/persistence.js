/**
 * Saved character edits (the creator's store, also read by the game through saved.js).
 *
 * Edits are stored as the changes the user made relative to the preset they started from, and
 * replayed on top of the *current* preset, so improvements to a preset (a new hat, a fixed shoe)
 * still show up for characters the user tweaked. Characters with no preset (duplicates, imports)
 * are stored whole. Revert restores the shipped preset.
 *
 * Storage format (localStorage key STORE_KEY, JSON):
 *   { format: 'themove.creator', version: 3, savedAt, activeId, playerId, view, open: [],
 *     edits: { [id]: { diff: { changes: { 'a.b': value }, accessories: { [type]: item | null } } }
 *                  | { def: <whole definition> } } }
 * Older saves (v2 key, unversioned, or whole definitions per id) are migrated on load; anything
 * unreadable is skipped with a warning instead of crashing, and the shipped presets are used.
 *
 * Writes are debounced (one setItem per burst of edits) and flushed on demand (page hide/unload).
 * A storage that throws (private mode, quota, blocked cookies) leaves the edits in memory for the
 * session and reports it through `status`, so the UI can point at Export.
 */
import { normalizeDefinition } from './definition.js';

export const STORE_FORMAT = 'themove.creator';
export const STORE_VERSION = 3;
export const STORE_KEY = 'themove.creator.v3';
/** Keys older builds wrote, newest first. Read only when STORE_KEY is absent; never deleted. */
export const LEGACY_KEYS = ['themove.creator.v2'];

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Paths whose null means "slot switched off" (kept as null) rather than "field removed". */
const NULLABLE_SLOTS = ['top', 'outer', 'bottom', 'legwear', 'dress', 'socks'];

/** Leaf-level changes from base to def: { 'a.b': value }, accessories as add/remove/modify by type. */
export function diffDefinition(base, def) {
  const changes = {};
  const walk = (b, d, path) => {
    const keys = new Set([...Object.keys(b ?? {}), ...Object.keys(d ?? {})]);
    for (const k of keys) {
      const p = path ? `${path}.${k}` : k;
      if (p === 'accessories') continue;
      const bv = b?.[k];
      const dv = d?.[k];
      if (isObj(bv) && isObj(dv)) walk(bv, dv, p);
      else if (!same(bv, dv)) changes[p] = dv === undefined ? null : clone(dv);
    }
  };
  walk(base, def, '');
  const bAcc = Object.fromEntries((base?.accessories ?? []).map((a) => [a.type, a]));
  const dAcc = Object.fromEntries((def?.accessories ?? []).map((a) => [a.type, a]));
  const acc = {};
  for (const t of new Set([...Object.keys(bAcc), ...Object.keys(dAcc)])) {
    if (!same(bAcc[t], dAcc[t])) acc[t] = dAcc[t] ? clone(dAcc[t]) : null;
  }
  return { changes, accessories: acc };
}

export function applyDiff(preset, diff) {
  const out = clone(preset);
  for (const [path, value] of Object.entries(diff.changes ?? {})) {
    const keys = path.split('.');
    if (keys.some((k) => !k || k === '__proto__' || k === 'constructor' || k === 'prototype')) continue;
    let o = out;
    for (const k of keys.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k];
    }
    const last = keys[keys.length - 1];
    if (value === null && !NULLABLE_SLOTS.includes(path) && !path.endsWith('.belt')) delete o[last];
    else o[last] = clone(value);
  }
  const accDiff = diff.accessories ?? {};
  const acc = (out.accessories ?? []).filter((a) => !(a?.type in accDiff));
  for (const item of Object.values(accDiff)) if (isObj(item)) acc.push(clone(item));
  out.accessories = acc;
  return out;
}

const emptyData = () => ({ activeId: null, playerId: null, view: {}, open: [], edits: {} });

/** A stored edit entry in the current shape, or null when it cannot be used. */
function sanitizeEntry(e, preset) {
  if (!isObj(e)) return null;
  if ('diff' in e) {
    const d = e.diff;
    if (!isObj(d)) return null;
    return { diff: { changes: isObj(d.changes) ? d.changes : {}, accessories: isObj(d.accessories) ? d.accessories : {} } };
  }
  if ('def' in e) return isObj(e.def) ? { def: e.def } : null;
  // v1: the whole definition stored per id. Keep its changes, but let accessories the preset gained
  // since then through (old saves never removed accessories on purpose).
  if (!preset) return { def: e };
  const diff = diffDefinition(preset, e);
  diff.accessories = Object.fromEntries(Object.entries(diff.accessories).filter(([, v]) => v !== null));
  return { diff };
}

/**
 * Brings any stored blob (v1, v2, v3) to the v3 in-memory shape. Never throws.
 * Returns { data, warnings, migratedFrom }.
 */
export function migrateStore(raw, presetsById = {}) {
  const warnings = [];
  const data = emptyData();
  if (!isObj(raw)) {
    if (raw != null) warnings.push('saved edits: not an object, ignored');
    return { data, warnings, migratedFrom: null };
  }
  const from = typeof raw.version === 'number' ? raw.version : 2;
  if (from > STORE_VERSION) warnings.push(`saved edits: written by a newer version (${raw.version}), reading what is understood`);
  if (typeof raw.activeId === 'string') data.activeId = raw.activeId;
  if (typeof raw.playerId === 'string') data.playerId = raw.playerId;
  if (isObj(raw.view)) data.view = raw.view;
  if (Array.isArray(raw.open)) data.open = raw.open.filter((s) => typeof s === 'string');
  if (isObj(raw.edits)) {
    for (const [id, e] of Object.entries(raw.edits)) {
      const entry = sanitizeEntry(e, presetsById[id]);
      if (entry) data.edits[id] = entry;
      else warnings.push(`saved edits for ${id}: unreadable, using the preset`);
    }
  } else if (raw.edits !== undefined) warnings.push('saved edits: edits is not an object, ignored');
  return { data, warnings, migratedFrom: from === STORE_VERSION ? null : from };
}

function readStorage(storage, presetsById) {
  const warnings = [];
  if (!storage) return { data: emptyData(), warnings, error: 'no storage' };
  for (const key of [STORE_KEY, ...LEGACY_KEYS]) {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (err) {
      return { data: emptyData(), warnings, error: `storage blocked: ${err.message}` };
    }
    if (raw == null) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnings.push(`saved edits (${key}): corrupt JSON, ignored`);
      continue;
    }
    const res = migrateStore(parsed, presetsById);
    return { data: res.data, warnings: [...warnings, ...res.warnings], migratedFrom: res.migratedFrom, key };
  }
  return { data: emptyData(), warnings };
}

/**
 * The creator's store. `storage` is any getItem/setItem object (localStorage) or null.
 * Options: debounceMs (default 250; 0 writes synchronously), setTimer/clearTimer (for tests).
 */
export function createEditStore(storage, presetsById, { debounceMs = 250, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const bases = {};
  const baseOf = (id) => {
    if (!presetsById[id]) return null;
    bases[id] ??= normalizeDefinition(presetsById[id]).value;
    return bases[id];
  };
  const loaded = readStorage(storage, presetsById);
  let data = loaded.data;
  const status = { ok: !loaded.error, error: loaded.error ?? null, warnings: loaded.warnings, migratedFrom: loaded.migratedFrom ?? null, pending: false, savedAt: null };
  let timer = null;

  const write = () => {
    timer = null;
    status.pending = false;
    if (!storage) return false;
    try {
      storage.setItem(STORE_KEY, JSON.stringify({ format: STORE_FORMAT, version: STORE_VERSION, savedAt: new Date().toISOString(), ...data }));
      status.ok = true;
      status.error = null;
      status.savedAt = Date.now();
      return true;
    } catch (err) {
      status.ok = false;
      status.error = `could not save (${err?.name ?? 'error'}): edits kept for this session only, use Export`;
      return false;
    }
  };
  const persist = () => {
    if (debounceMs <= 0) return write();
    status.pending = true;
    if (timer) clearTimer(timer);
    timer = setTimer(write, debounceMs);
    return true;
  };

  const resolve = (id) => {
    const e = data.edits[id];
    const base = baseOf(id);
    try {
      if (!e) return base ? clone(base) : null;
      if (e.def) return normalizeDefinition({ ...e.def, id }).value;
      if (!base) return null;
      return normalizeDefinition({ ...applyDiff(base, e.diff), id }).value;
    } catch (err) {
      status.warnings.push(`saved edits for ${id}: ${err.message}, using the preset`);
      return base ? clone(base) : null;
    }
  };

  const saveDef = (def) => {
    const value = normalizeDefinition(def).value;
    const base = baseOf(value.id);
    if (!base) data.edits[value.id] = { def: value };
    else {
      const diff = diffDefinition(base, value);
      if (Object.keys(diff.changes).length || Object.keys(diff.accessories).length) data.edits[value.id] = { diff };
      else delete data.edits[value.id];
    }
    return value.id;
  };

  const api = {
    status,
    /** Current definition for an id (normalized): preset with the user's changes replayed on top. */
    get(id) {
      return resolve(id);
    },
    has(id) {
      return !!presetsById[id] || !!data.edits[id];
    },
    save(def) {
      saveDef(def);
      persist();
    },
    isEdited(id) {
      const e = data.edits[id];
      if (!e) return false;
      if (e.def) return true;
      return Object.keys(e.diff.changes).length > 0 || Object.keys(e.diff.accessories).length > 0;
    },
    revert(id) {
      delete data.edits[id];
      persist();
      return presetsById[id] ? clone(baseOf(id)) : null;
    },
    /** Removes a custom (non-preset) character; presets are reverted instead. */
    remove(id) {
      return api.revert(id);
    },
    revertAll() {
      data.edits = {};
      persist();
    },
    customIds() {
      return Object.keys(data.edits).filter((id) => !presetsById[id]);
    },
    editedIds() {
      return Object.keys(data.edits).filter((id) => api.isEdited(id));
    },
    get activeId() {
      return data.activeId;
    },
    set activeId(id) {
      if (data.activeId === id) return;
      data.activeId = id;
      persist();
    },
    /** The character the game spawns as the player (resolved against the main roster by saved.js). */
    get playerId() {
      return data.playerId;
    },
    set playerId(id) {
      data.playerId = id;
      persist();
    },
    get view() {
      return data.view;
    },
    setView(view) {
      data.view = { ...view };
      persist();
    },
    get openFolders() {
      return new Set(data.open);
    },
    setOpenFolders(set) {
      data.open = [...set];
      persist();
    },
    /** Writes any pending change now (call on page hide / before unload). Returns false if storage refused it. */
    flush() {
      if (timer) clearTimer(timer);
      return write();
    },
    /** Backup of every saved character: the store plus each edited character's full definition. */
    exportBundle() {
      const definitions = {};
      for (const id of Object.keys(data.edits)) {
        const def = resolve(id);
        if (def) definitions[id] = def;
      }
      return { format: STORE_FORMAT, version: STORE_VERSION, exportedAt: new Date().toISOString(), activeId: data.activeId, playerId: data.playerId, edits: clone(data.edits), definitions };
    },
    /**
     * Restores a backup (exportBundle output, any older store blob, or a single definition).
     * Full definitions win over diffs when both are present. Returns { ids, errors }; never throws.
     */
    importBundle(input) {
      let raw = input;
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch (err) {
          return { ids: [], errors: [`JSON parse error: ${err.message}`] };
        }
      }
      if (!isObj(raw)) return { ids: [], errors: ['import: expected a JSON object'] };
      const ids = [];
      const errors = [];
      if (!('edits' in raw) && !('definitions' in raw)) {
        const { value, errors: e } = normalizeDefinition(raw);
        ids.push(saveDef(value));
        errors.push(...e);
      } else {
        const { data: incoming, warnings } = migrateStore(raw, presetsById);
        errors.push(...warnings);
        const defs = isObj(raw.definitions) ? raw.definitions : {};
        for (const [id, entry] of Object.entries(incoming.edits)) {
          if (id in defs) continue;
          data.edits[id] = entry;
          ids.push(id);
        }
        for (const [id, def] of Object.entries(defs)) {
          if (!isObj(def)) {
            errors.push(`definitions.${id}: not an object, skipped`);
            continue;
          }
          const { value, errors: e } = normalizeDefinition({ ...def, id });
          errors.push(...e.map((m) => `${id}: ${m}`));
          ids.push(saveDef(value));
        }
        if (incoming.playerId) data.playerId = incoming.playerId;
      }
      persist();
      return { ids, errors };
    },
  };
  return api;
}
