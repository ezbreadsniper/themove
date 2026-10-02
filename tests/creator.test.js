import { describe, test, expect } from 'vitest';
import { createEditStore, EDITS_KEY } from '../src/app/edits.js';
import { planControls, allLeafPaths } from '../src/app/schema-controls.js';
import { normalizeDefinition, ACCESSORY_SCHEMAS } from '../src/character/definition.js';
import { PRESETS, PRESETS_BY_ID } from '../src/character/presets/index.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('creator edit persistence', () => {
  test('edits survive switching characters and a reload, revert restores the preset', () => {
    const storage = memoryStorage();
    const id = PRESETS[0].id;
    let store = createEditStore(storage, PRESETS_BY_ID, { debounceMs: 0 });
    const edited = store.get(id);
    edited.skin.tone = '#123456';
    store.save(edited);
    store.get(PRESETS[1].id);
    store = createEditStore(storage, PRESETS_BY_ID, { debounceMs: 0 });
    expect(store.get(id).skin.tone).toBe('#123456');
    expect(store.isEdited(id)).toBe(true);
    expect(store.revert(id).skin.tone).toBe(PRESETS[0].skin.tone);
    expect(store.isEdited(id)).toBe(false);
  });

  test('revert all clears every character, custom characters are listed', () => {
    const storage = memoryStorage();
    const store = createEditStore(storage, PRESETS_BY_ID, { debounceMs: 0 });
    store.save({ ...store.get(PRESETS[0].id), name: 'changed' });
    store.save({ ...store.get(PRESETS[1].id), id: 'my-custom' });
    expect(store.customIds()).toEqual(['my-custom']);
    store.revertAll();
    expect(store.isEdited(PRESETS[0].id)).toBe(false);
    expect(store.customIds()).toEqual([]);
  });

  test('preset improvements show up for characters the user already edited', () => {
    const storage = memoryStorage();
    const v1 = { ...PRESETS[4], accessories: [] };
    let store = createEditStore(storage, { [v1.id]: v1 }, { debounceMs: 0 });
    const edited = store.get(v1.id);
    edited.skin.tone = '#654321';
    store.save(edited);
    const v2 = { ...PRESETS[4], accessories: [{ type: 'cap', style: 'trucker' }] };
    store = createEditStore(storage, { [v2.id]: v2 }, { debounceMs: 0 });
    const now = store.get(v2.id);
    expect(now.skin.tone).toBe('#654321');
    expect(now.accessories.map((a) => a.type)).toContain('cap');
  });

  test('legacy whole-definition saves keep edits but let new preset accessories through', () => {
    const storage = memoryStorage();
    const preset = PRESETS[4];
    storage.setItem(EDITS_KEY, JSON.stringify({ edits: { [preset.id]: { ...preset, accessories: [], skin: { tone: '#111111' } } } }));
    const store = createEditStore(storage, PRESETS_BY_ID, { debounceMs: 0 });
    const now = store.get(preset.id);
    expect(now.skin.tone).toBe('#111111');
    expect(now.accessories.map((a) => a.type)).toContain('cap');
  });

  test('corrupt storage falls back to presets instead of crashing', () => {
    const storage = memoryStorage();
    storage.setItem(EDITS_KEY, '{not json');
    const store = createEditStore(storage, PRESETS_BY_ID, { debounceMs: 0 });
    expect(store.get(PRESETS[0].id).id).toBe(PRESETS[0].id);
  });
});

describe('creator menu coverage', () => {
  test('every field in the character format has a control when its slot is worn', () => {
    const everything = normalizeDefinition({
      ...PRESETS[0],
      outer: {},
      socks: {},
      dress: {},
      legwear: {},
      bottom: { ...PRESETS[0].bottom, belt: {} },
      accessories: Object.keys(ACCESSORY_SCHEMAS).map((type) => ({ type })),
    }).value;
    const planned = new Set(planControls(everything).filter((c) => !['folder', 'toggle', 'accessory'].includes(c.kind)).map((c) => c.path.join('.')));
    const missing = allLeafPaths().filter((p) => !planned.has(p));
    expect(missing).toEqual([]);
  });

  test('optional slots and accessories always have an on/off toggle', () => {
    const plan = planControls(normalizeDefinition({ id: 'bare' }).value);
    const toggles = plan.filter((c) => c.kind === 'toggle').map((c) => c.path.join('.'));
    expect(toggles).toEqual(expect.arrayContaining(['top', 'outer', 'bottom', 'dress', 'socks']));
    expect(plan.filter((c) => c.kind === 'accessory').map((c) => c.accessory)).toEqual(Object.keys(ACCESSORY_SCHEMAS));
  });
});
