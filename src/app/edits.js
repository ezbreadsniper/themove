/**
 * Persistent per-character edits for the creator. Edits are stored as the changes the user made
 * relative to the preset they started from, and replayed on top of the *current* preset, so
 * improvements to a preset (a new hat, a fixed shoe) still show up for characters the user tweaked.
 * Revert restores the shipped preset. `storage` is any getItem/setItem object (localStorage).
 */
export const EDITS_KEY = 'themove.creator.v2';

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  for (const [path, value] of Object.entries(diff.changes)) {
    const keys = path.split('.');
    let o = out;
    for (const k of keys.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k];
    }
    if (value === null && !['top', 'outer', 'bottom', 'socks'].includes(path) && !path.endsWith('.belt')) delete o[keys[keys.length - 1]];
    else o[keys[keys.length - 1]] = value;
  }
  const acc = (out.accessories ?? []).filter((a) => !(a.type in diff.accessories));
  for (const item of Object.values(diff.accessories)) if (item) acc.push(item);
  out.accessories = acc;
  return out;
}

export function createEditStore(storage, presetsById) {
  let data = { activeId: null, view: {}, open: [], edits: {} };
  try {
    const raw = storage?.getItem(EDITS_KEY);
    if (raw) data = { ...data, ...JSON.parse(raw) };
  } catch {
    data = { activeId: null, view: {}, open: [], edits: {} };
  }
  const persist = () => {
    try {
      storage?.setItem(EDITS_KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked: edits live for this session only */
    }
  };
  /** Old saves stored the whole definition; keep their changes but let preset accessories through. */
  const entry = (id) => {
    const e = data.edits[id];
    if (!e) return null;
    if (e.diff || e.def) return e;
    const preset = presetsById[id];
    if (!preset) return { def: e };
    const diff = diffDefinition(preset, e);
    diff.accessories = Object.fromEntries(Object.entries(diff.accessories).filter(([, v]) => v !== null));
    return { diff };
  };
  return {
    /** Current definition for an id: preset with the user's changes replayed on top. */
    get(id) {
      const e = entry(id);
      const preset = presetsById[id];
      if (!e) return preset ? clone(preset) : null;
      if (e.def) return clone(e.def);
      return applyDiff(preset, e.diff);
    },
    save(def) {
      const preset = presetsById[def.id];
      data.edits[def.id] = preset ? { diff: diffDefinition(preset, def) } : { def: clone(def) };
      persist();
    },
    isEdited(id) {
      const e = entry(id);
      if (!e) return false;
      if (e.def) return true;
      return Object.keys(e.diff.changes).length > 0 || Object.keys(e.diff.accessories).length > 0;
    },
    revert(id) {
      delete data.edits[id];
      persist();
      return presetsById[id] ? clone(presetsById[id]) : null;
    },
    revertAll() {
      data.edits = {};
      persist();
    },
    customIds() {
      return Object.keys(data.edits).filter((id) => !presetsById[id]);
    },
    get activeId() {
      return data.activeId;
    },
    set activeId(id) {
      data.activeId = id;
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
  };
}
