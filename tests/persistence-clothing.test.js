/**
 * Walks the character schema: every clothing field (garment slots, belt, socks, shoes and every
 * accessory field) must have a creator control, the control's write must survive
 * save → (debounced) write → reload, and the reloaded definition must build into a character that
 * differs from the one before the edit (the field is not inert). Every other field round-trips too.
 */
import { describe, test, expect } from 'vitest';
import { buildCharacter, disposeCharacter } from '../src/character/build.js';
import { SCHEMA, ACCESSORY_SCHEMAS, normalizeDefinition } from '../src/character/definition.js';
import { PRESETS_BY_ID } from '../src/character/presets/index.js';
import { createEditStore } from '../src/character/persistence.js';
import { loadSavedDefinition } from '../src/character/saved.js';
import { planControls, allLeafPaths, readControl, applyControl } from '../src/app/schema-controls.js';
import { characterHash } from './helpers.js';
import { memoryStorage } from './persistence.test.js';

const ID = 'trial-default';
const CLOTHING = ['top', 'outer', 'bottom', 'legwear', 'dress', 'socks', 'shoes', 'accessories'];
const SLOT_TOGGLES = ['top', 'outer', 'bottom', 'bottom.belt', 'legwear', 'dress', 'socks'];

/**
 * Some fields only show in a particular garment style (a trucker cap's mesh, a skirt's length).
 * CONTEXT sets that style first; ALT picks the edited value where the generic choice is a no-op
 * (jeans → pants share a cut: the fabric `kind` decides the look).
 */
const CONTEXT = {
  'top.trim': { 'top.type': 'rugby' },
  'top.stripe': { 'top.pattern': 'stripes' },
  'top.number': { 'top.pattern': 'stripes' },
  'top.accent': { 'top.pattern': 'floral' },
  'outer.open': { 'outer.type': 'zipHoodie' },
  'outer.fabric': { 'outer.type': 'hoodie' },
  'outer.hood': { 'outer.type': 'hoodie' },
  'outer.length': { 'outer.type': 'hoodie' },
  'outer.trim': { 'outer.type': 'hoodie' },
  'outer.stripe': { 'outer.type': 'track' },
  'bottom.skirtLength': { 'bottom.type': 'skirt' },
  'bottom.skirtStyle': { 'bottom.type': 'skirt' },
  'bottom.drawstring': { 'bottom.kind': 'cotton' },
  'bottom.accent': { 'bottom.pattern': 'floral' },
  'dress.sleeve': { 'dress.bodice': 'tee' },
  'dress.accent': { 'dress.pattern': 'floral' },
  'accessories.cap.mesh': { 'accessories.cap.style': 'trucker' },
};
const ALT = { 'bottom.type': 'shorts' };

/** Schema node for a dotted leaf path. */
function schemaAt(path) {
  const keys = path.split('.');
  if (keys[0] === 'accessories') return ACCESSORY_SCHEMAS[keys[1]].fields[keys[2]];
  let s = SCHEMA;
  for (const k of keys) s = s.fields[k];
  return s;
}

/** A valid value different from `cur` (and from the default, which "unset" would also give). */
function altValue(path, cur) {
  if (path in ALT) return ALT[path];
  const s = schemaAt(path);
  if (s.type === 'enum') return s.values.find((v) => v !== cur && v !== s.default) ?? s.values.find((v) => v !== cur);
  if (s.type === 'color') return cur === '#22cc44' ? '#cc2244' : '#22cc44';
  if (s.type === 'number') {
    const c = cur ?? s.default ?? s.min;
    return Math.abs(c - s.min) > Math.abs(c - s.max) ? s.min : s.max;
  }
  if (s.type === 'boolean') return !cur;
  if (s.type === 'string') return cur === '23' ? '7' : '23';
  throw new Error(`no alt for ${path}`);
}

const controlFor = (def, path) => planControls(def).find((c) => !['folder'].includes(c.kind) && c.path.join('.') === path);

/** Drives the creator's own control code: find the control for `path` in the current menu and write it. */
function edit(def, path, value) {
  const c = controlFor(def, path);
  if (!c) throw new Error(`no control for ${path}`);
  applyControl(def, c, value);
  return normalizeDefinition(def).value;
}

/** The starting point: the preset with every slot and the accessory for `path` worn, plus `path`'s context. */
function contextFor(store, path) {
  let def = store.get(ID);
  const [root, sub] = path.split('.');
  for (const slot of SLOT_TOGGLES) {
    if (slot === 'legwear' && root !== 'legwear') continue;
    if (readControl(def, controlFor(def, slot)) === false) def = edit(def, slot, true);
  }
  if (root === 'legwear') def = edit(def, 'bottom.type', 'shorts');
  if (root === 'accessories') def = edit(def, `accessories.${sub}`, true);
  if (root !== 'dress') def = edit(def, 'dress', false);
  for (const [p, v] of Object.entries(CONTEXT[path] ?? {})) def = edit(def, p, v);
  return def;
}

/** Save through a debounced store, flush as the page would on unload, reload from storage. */
function saveAndReload(def) {
  const storage = memoryStorage();
  const timers = [];
  const store = createEditStore(storage, PRESETS_BY_ID, { debounceMs: 300, setTimer: (fn) => timers.push(fn), clearTimer: () => {} });
  store.save(def);
  store.activeId = def.id;
  expect(storage.getItem('themove.creator.v3')).toBeNull();
  store.flush();
  return { reloaded: createEditStore(storage, PRESETS_BY_ID).get(def.id), storage };
}

const hashCache = new Map();
function buildHash(def) {
  const key = JSON.stringify(def);
  if (!hashCache.has(key)) {
    const group = buildCharacter(def);
    expect(group.userData.errors, def.id).toEqual([]);
    hashCache.set(key, characterHash(group));
    disposeCharacter(group);
  }
  return hashCache.get(key);
}

const leaves = allLeafPaths();
const clothingLeaves = leaves.filter((p) => CLOTHING.includes(p.split('.')[0]));
const otherLeaves = leaves.filter((p) => !CLOTHING.includes(p.split('.')[0]));
const scratch = createEditStore(null, PRESETS_BY_ID, { debounceMs: 0 });

describe('every clothing field: control → save → reload → build', () => {
  test('the walk covers every garment slot and accessory field', () => {
    for (const slot of ['top', 'outer', 'bottom', 'legwear', 'dress', 'socks', 'shoes']) {
      for (const key of Object.keys(SCHEMA.fields[slot].fields)) {
        const sub = SCHEMA.fields[slot].fields[key];
        if (sub.type === 'object') for (const k of Object.keys(sub.fields)) expect(clothingLeaves).toContain(`${slot}.${key}.${k}`);
        else expect(clothingLeaves).toContain(`${slot}.${key}`);
      }
    }
    for (const [type, s] of Object.entries(ACCESSORY_SCHEMAS)) {
      for (const k of Object.keys(s.fields)) if (k !== 'type') expect(clothingLeaves).toContain(`accessories.${type}.${k}`);
    }
    expect(clothingLeaves.length).toBeGreaterThan(90);
  });

  test.each(clothingLeaves)('%s', (path) => {
    const before = contextFor(scratch, path);
    const c = controlFor(before, path);
    expect(c, `control for ${path}`).toBeDefined();
    expect(['number', 'color', 'enum', 'boolean', 'string']).toContain(c.kind);
    const value = altValue(path, readControl(before, c));
    const after = edit(structuredClone(before), path, value);
    expect(readControl(after, c), 'write applied').toEqual(value);

    const { reloaded, storage } = saveAndReload(after);
    expect(reloaded).toEqual(after);
    expect(readControl(reloaded, controlFor(reloaded, path))).toEqual(value);
    expect(loadSavedDefinition(ID, { storage })).toEqual(after);

    // The edited field changes what is built (and the reloaded definition builds the same character).
    expect(buildHash(reloaded), `${path} has no visible effect`).not.toBe(buildHash(before));
  });
});

describe('slot and accessory toggles persist and rebuild', () => {
  test.each(SLOT_TOGGLES)('%s on/off', (path) => {
    for (const on of [true, false]) {
      let def = scratch.get(ID);
      if (path === 'bottom.belt') def = edit(def, 'bottom', true);
      def = edit(def, path, !on);
      const before = def;
      const after = edit(structuredClone(before), path, on);
      const { reloaded } = saveAndReload(after);
      expect(readControl(reloaded, controlFor(reloaded, path))).toBe(on);
      expect(buildHash(reloaded)).not.toBe(buildHash(before));
    }
  });

  test.each(Object.keys(ACCESSORY_SCHEMAS))('accessory %s on/off', (type) => {
    const path = `accessories.${type}`;
    const off = edit(scratch.get(ID), path, false);
    const on = edit(structuredClone(off), path, true);
    const { reloaded } = saveAndReload(on);
    expect(reloaded.accessories.map((a) => a.type)).toContain(type);
    expect(buildHash(reloaded)).not.toBe(buildHash(off));
    const { reloaded: removed } = saveAndReload(edit(structuredClone(on), path, false));
    expect(removed.accessories.map((a) => a.type)).not.toContain(type);
  });

  test('removing an accessory the preset ships with survives reload (diff records the removal)', () => {
    const preset = PRESETS_BY_ID['sheet-04-camo-cargo'];
    const def = edit(scratch.get(preset.id), 'accessories.cap', false);
    const { reloaded } = saveAndReload(def);
    expect(reloaded.accessories.map((a) => a.type)).not.toContain('cap');
    expect(reloaded.accessories.map((a) => a.type)).toContain('glasses');
  });

  test('trouser type carries its hem and cloth: shorts are short, jeans are denim, pants are not', () => {
    let def = scratch.get(ID);
    def = edit(def, 'bottom.type', 'shorts');
    expect(def.bottom.length).toBe('shorts');
    def = edit(def, 'bottom.length', 'cutoff');
    def = edit(def, 'bottom.type', 'pants');
    expect([def.bottom.length, def.bottom.kind]).toEqual(['full', 'twill']);
    const pants = buildHash(def);
    def = edit(def, 'bottom.type', 'jeans');
    expect(def.bottom.kind).toBe('denim');
    expect(buildHash(def)).not.toBe(pants);
    const { reloaded } = saveAndReload(def);
    expect(reloaded.bottom).toEqual(def.bottom);
  });

  test('layers: leggings under shorts persist and build both layers', () => {
    let def = scratch.get(ID);
    def = edit(def, 'bottom.type', 'shorts');
    def = edit(def, 'legwear', true);
    def = edit(def, 'legwear.color', '#202024');
    const { reloaded } = saveAndReload(def);
    expect(reloaded.legwear).toEqual({ length: 'full', color: '#202024', kind: 'spandex' });
    const g = buildCharacter(reloaded);
    const names = [];
    g.traverse((o) => o.isMesh && names.push(o.name));
    disposeCharacter(g);
    expect(names).toEqual(expect.arrayContaining(['bottom', 'legwear']));
  });

  test('layers: a vest over a tee persists and builds both layers', () => {
    let def = scratch.get(ID);
    def = edit(def, 'outer', true);
    def = edit(def, 'outer.type', 'vest');
    def = edit(def, 'top.type', 'tee');
    const { reloaded } = saveAndReload(def);
    const g = buildCharacter(reloaded);
    const parts = [];
    g.traverse((o) => o.isMesh && parts.push(o.name));
    disposeCharacter(g);
    expect(parts).toEqual(expect.arrayContaining(['top', 'outer', 'bottom']));
    expect(reloaded.outer.type).toBe('vest');
  });
});

describe('every other creator field round-trips', () => {
  test.each(otherLeaves)('%s', (path) => {
    const before = scratch.get(ID);
    const c = controlFor(before, path);
    expect(c, `control for ${path}`).toBeDefined();
    if (c.kind === 'enum' && c.values.length < 2) return; // nothing to choose (rig profile)
    const value = altValue(path, readControl(before, c));
    const after = edit(structuredClone(before), path, value);
    const { reloaded } = saveAndReload(after);
    expect(readControl(reloaded, controlFor(reloaded, path))).toEqual(value);
  });
});
