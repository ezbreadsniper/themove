import { describe, test, expect, vi } from 'vitest';
import { createEditStore, migrateStore, applyDiff, STORE_KEY, LEGACY_KEYS, STORE_VERSION, STORE_FORMAT } from '../src/character/persistence.js';
import { loadSavedDefinition, savedPlayerId, MAIN_IDS, NPC_IDS, DEFAULT_PLAYER_ID } from '../src/character/saved.js';
import { normalizeDefinition } from '../src/character/definition.js';
import { PRESETS, PRESETS_BY_ID, MAIN_PRESETS, NPC_PRESETS, PRESET_META, roleOf } from '../src/character/presets/index.js';

export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}
const sync = { debounceMs: 0 };
const [A, B] = MAIN_PRESETS;
const npc = NPC_PRESETS[0];

describe('save format', () => {
  test('writes a versioned blob under the current key', () => {
    const storage = memoryStorage();
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    store.save({ ...store.get(A.id), name: 'Renamed' });
    const blob = JSON.parse(storage.getItem(STORE_KEY));
    expect(blob.format).toBe(STORE_FORMAT);
    expect(blob.version).toBe(STORE_VERSION);
    expect(blob.edits[A.id].diff.changes).toEqual({ name: 'Renamed' });
  });

  test('diffs are taken against the normalized preset, so untouched defaults are not pinned', () => {
    const store = createEditStore(memoryStorage(), PRESETS_BY_ID, sync);
    const def = store.get(A.id);
    store.save(def);
    expect(store.isEdited(A.id)).toBe(false);
    def.top.color = '#102030';
    store.save(def);
    expect(store.exportBundle().edits[A.id].diff.changes).toEqual({ 'top.color': '#102030' });
    def.top.color = store.revert(A.id).top.color;
    store.save(def);
    expect(store.isEdited(A.id)).toBe(false);
  });

  test('get returns a normalized definition with the id preserved', () => {
    const store = createEditStore(memoryStorage(), PRESETS_BY_ID, sync);
    for (const p of PRESETS) {
      const def = store.get(p.id);
      expect(def).toEqual(normalizeDefinition(p).value);
    }
    expect(store.get('nope')).toBeNull();
  });
});

describe('per-character independence, switching, revert', () => {
  test('edits to one character never leak into another, and survive switching and reload', () => {
    const storage = memoryStorage();
    let store = createEditStore(storage, PRESETS_BY_ID, sync);
    const a = store.get(A.id);
    a.top.color = '#aa0000';
    a.shoes.type = 'runner';
    store.save(a);
    const b = store.get(B.id);
    b.top.color = '#00aa00';
    store.save(b);
    const n = store.get(npc.id);
    n.socks = null;
    store.save(n);
    // switch back and forth
    expect(store.get(A.id).top.color).toBe('#aa0000');
    expect(store.get(B.id).top.color).toBe('#00aa00');
    store = createEditStore(storage, PRESETS_BY_ID, sync);
    expect(store.get(A.id).top.color).toBe('#aa0000');
    expect(store.get(A.id).shoes.type).toBe('runner');
    expect(store.get(B.id).top.color).toBe('#00aa00');
    expect(store.get(B.id).shoes.type).toBe(normalizeDefinition(B).value.shoes.type);
    expect(store.get(npc.id).socks).toBeNull();
    for (const p of PRESETS.filter((q) => ![A.id, B.id, npc.id].includes(q.id))) expect(store.isEdited(p.id)).toBe(false);
  });

  test('get hands out copies: mutating one does not change the store', () => {
    const store = createEditStore(memoryStorage(), PRESETS_BY_ID, sync);
    const a = store.get(A.id);
    a.top.color = '#123123';
    expect(store.get(A.id).top.color).not.toBe('#123123');
    expect(store.isEdited(A.id)).toBe(false);
  });

  test('revert restores the shipped preset for one character only', () => {
    const storage = memoryStorage();
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    for (const p of [A, B]) store.save({ ...store.get(p.id), name: `${p.id}!` });
    const restored = store.revert(A.id);
    expect(restored).toEqual(normalizeDefinition(A).value);
    expect(store.isEdited(A.id)).toBe(false);
    expect(store.get(B.id).name).toBe(`${B.id}!`);
    expect(createEditStore(storage, PRESETS_BY_ID, sync).isEdited(A.id)).toBe(false);
  });

  test('custom characters are stored whole, listed, and removable', () => {
    const storage = memoryStorage();
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    store.save({ ...store.get(A.id), id: 'my-custom', name: 'Mine' });
    expect(store.customIds()).toEqual(['my-custom']);
    expect(createEditStore(storage, PRESETS_BY_ID, sync).get('my-custom').name).toBe('Mine');
    store.remove('my-custom');
    expect(store.customIds()).toEqual([]);
    expect(store.get('my-custom')).toBeNull();
  });

  test('preset improvements show up for characters the user already edited', () => {
    const storage = memoryStorage();
    const v1 = { ...PRESETS[4], accessories: [] };
    let store = createEditStore(storage, { [v1.id]: v1 }, sync);
    store.save({ ...store.get(v1.id), skin: { tone: '#654321' } });
    const v2 = { ...PRESETS[4], accessories: [{ type: 'cap', style: 'trucker' }] };
    store = createEditStore(storage, { [v2.id]: v2 }, sync);
    const now = store.get(v2.id);
    expect(now.skin.tone).toBe('#654321');
    expect(now.accessories.map((a) => a.type)).toContain('cap');
  });

  test('view, open folders, active and player ids persist', () => {
    const storage = memoryStorage();
    let store = createEditStore(storage, PRESETS_BY_ID, sync);
    store.setView({ mode: 'lineup', clip: 'walk' });
    store.setOpenFolders(new Set(['top', 'accessories/cap']));
    store.activeId = npc.id;
    store.playerId = B.id;
    store = createEditStore(storage, PRESETS_BY_ID, sync);
    expect(store.view.mode).toBe('lineup');
    expect([...store.openFolders]).toEqual(['top', 'accessories/cap']);
    expect(store.activeId).toBe(npc.id);
    expect(store.playerId).toBe(B.id);
  });
});

describe('debounced writes and blocked storage', () => {
  test('a burst of edits is written once after the debounce, flush writes immediately', () => {
    vi.useFakeTimers();
    try {
      const storage = memoryStorage();
      const spy = vi.spyOn(storage, 'setItem');
      const store = createEditStore(storage, PRESETS_BY_ID, { debounceMs: 200 });
      for (let i = 0; i < 20; i++) store.save({ ...store.get(A.id), name: `n${i}` });
      expect(spy).not.toHaveBeenCalled();
      expect(store.status.pending).toBe(true);
      vi.advanceTimersByTime(250);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(storage.getItem(STORE_KEY)).edits[A.id].diff.changes.name).toBe('n19');
      store.save({ ...store.get(A.id), name: 'last' });
      expect(store.flush()).toBe(true);
      expect(JSON.parse(storage.getItem(STORE_KEY)).edits[A.id].diff.changes.name).toBe('last');
      expect(store.status.pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('setItem throwing (quota / private mode) keeps edits in memory and reports it', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    };
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    expect(() => store.save({ ...store.get(A.id), name: 'kept' })).not.toThrow();
    expect(store.get(A.id).name).toBe('kept');
    expect(store.status.ok).toBe(false);
    expect(store.status.error).toMatch(/QuotaExceededError/);
    expect(store.exportBundle().definitions[A.id].name).toBe('kept');
  });

  test('getItem throwing (storage disabled) starts from presets', () => {
    const storage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    expect(store.status.ok).toBe(false);
    expect(store.get(A.id)).toEqual(normalizeDefinition(A).value);
    store.save({ ...store.get(A.id), name: 'x' });
    expect(store.get(A.id).name).toBe('x');
  });

  test('no storage at all works for the session', () => {
    const store = createEditStore(null, PRESETS_BY_ID, sync);
    store.save({ ...store.get(A.id), name: 'x' });
    expect(store.get(A.id).name).toBe('x');
  });
});

describe('migration and corrupt saves', () => {
  test('v2 diff saves migrate to v3 and are rewritten under the new key on the next save', () => {
    const legacy = LEGACY_KEYS[0];
    const storage = memoryStorage({
      [legacy]: JSON.stringify({ activeId: B.id, view: { mode: 'single' }, open: ['top'], edits: { [B.id]: { diff: { changes: { 'top.color': '#010203', 'bottom.length': 'shorts' }, accessories: { cap: { type: 'cap', color: '#ff0000' } } } } } }),
    });
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    expect(store.status.migratedFrom).toBe(2);
    const def = store.get(B.id);
    expect(def.top.color).toBe('#010203');
    expect(def.bottom.length).toBe('shorts');
    expect(def.accessories.find((a) => a.type === 'cap').color).toBe('#ff0000');
    expect(store.activeId).toBe(B.id);
    store.flush();
    const blob = JSON.parse(storage.getItem(STORE_KEY));
    expect(blob.version).toBe(STORE_VERSION);
    expect(blob.edits[B.id].diff.changes['top.color']).toBe('#010203');
    expect(storage.getItem(legacy)).not.toBeNull();
  });

  test('v1 whole-definition saves keep edits but let new preset accessories through', () => {
    const preset = PRESETS[4];
    const storage = memoryStorage({ [LEGACY_KEYS[0]]: JSON.stringify({ edits: { [preset.id]: { ...preset, accessories: [], skin: { tone: '#111111' } } } }) });
    const now = createEditStore(storage, PRESETS_BY_ID, sync).get(preset.id);
    expect(now.skin.tone).toBe('#111111');
    expect(now.accessories.map((a) => a.type)).toContain('cap');
  });

  test('the current key wins over legacy keys', () => {
    const storage = memoryStorage({
      [LEGACY_KEYS[0]]: JSON.stringify({ edits: { [A.id]: { diff: { changes: { name: 'old' }, accessories: {} } } } }),
      [STORE_KEY]: JSON.stringify({ format: STORE_FORMAT, version: 3, edits: { [A.id]: { diff: { changes: { name: 'new' }, accessories: {} } } } }),
    });
    expect(createEditStore(storage, PRESETS_BY_ID, sync).get(A.id).name).toBe('new');
  });

  test.each([
    ['not JSON', '{not json'],
    ['a number', '42'],
    ['null', 'null'],
    ['edits as array', JSON.stringify({ version: 3, edits: [1, 2] })],
  ])('corrupt blob (%s) falls back to presets', (_, raw) => {
    const store = createEditStore(memoryStorage({ [STORE_KEY]: raw }), PRESETS_BY_ID, sync);
    for (const p of PRESETS) expect(store.get(p.id)).toEqual(normalizeDefinition(p).value);
  });

  test('corrupt current blob falls through to a readable legacy save', () => {
    const storage = memoryStorage({
      [STORE_KEY]: '{oops',
      [LEGACY_KEYS[0]]: JSON.stringify({ edits: { [A.id]: { diff: { changes: { name: 'rescued' }, accessories: {} } } } }),
    });
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    expect(store.get(A.id).name).toBe('rescued');
    expect(store.status.warnings.join()).toMatch(/corrupt JSON/);
  });

  test('bad entries are skipped one by one; bad values inside entries are repaired', () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify({
        version: 3,
        edits: {
          [A.id]: 'garbage',
          [B.id]: { diff: { changes: { 'top.color': 'not a colour', 'body.height': 99, 'bottom.type': 'jetpack', '__proto__.x': 1, 'shoes.size': '"big"' }, accessories: { cap: 'nope', glasses: { type: 'glasses', width: 'wide' } } } },
          [npc.id]: { diff: 7 },
          'custom-x': { def: { name: 'Has no body' } },
        },
      }),
    });
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    expect(store.get(A.id)).toEqual(normalizeDefinition(A).value);
    const b = store.get(B.id);
    expect(b.top.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(b.body.height).toBe(2.05);
    expect(b.bottom.type).toBe('jeans');
    expect(b.accessories.find((a) => a.type === 'glasses').width).toBe(1);
    expect(({}).x).toBeUndefined();
    expect(store.get(npc.id)).toEqual(normalizeDefinition(npc).value);
    expect(store.get('custom-x').name).toBe('Has no body');
    expect(store.status.warnings.length).toBeGreaterThan(0);
  });

  test('a newer save version is read as far as understood', () => {
    const { data, warnings } = migrateStore({ version: 99, edits: { [A.id]: { diff: { changes: { name: 'future' }, accessories: {} } } } }, PRESETS_BY_ID);
    expect(warnings.join()).toMatch(/newer version/);
    expect(applyDiff(A, data.edits[A.id].diff).name).toBe('future');
  });
});

describe('export / import backup', () => {
  test('export → import into an empty store restores every character, the player and customs', () => {
    const src = createEditStore(memoryStorage(), PRESETS_BY_ID, sync);
    const a = src.get(A.id);
    a.top.pattern = 'stripes';
    a.accessories = [...a.accessories, { type: 'earrings', size: 1.5 }];
    src.save(a);
    const n = src.get(npc.id);
    n.bottom.color = '#334455';
    src.save(n);
    src.save({ ...src.get(B.id), id: 'dup-1', name: 'Dup' });
    src.playerId = A.id;
    const text = JSON.stringify(src.exportBundle());

    const storage = memoryStorage();
    const dst = createEditStore(storage, PRESETS_BY_ID, sync);
    const res = dst.importBundle(text);
    expect(res.errors).toEqual([]);
    expect(res.ids.sort()).toEqual([A.id, npc.id, 'dup-1'].sort());
    const reloaded = createEditStore(storage, PRESETS_BY_ID, sync);
    for (const id of [A.id, npc.id, 'dup-1']) expect(reloaded.get(id)).toEqual(src.get(id));
    expect(reloaded.playerId).toBe(A.id);
    expect(reloaded.isEdited(B.id)).toBe(false);
  });

  test('import accepts a single definition and an old store blob', () => {
    const store = createEditStore(memoryStorage(), PRESETS_BY_ID, sync);
    const single = { ...normalizeDefinition(B).value, name: 'From file' };
    expect(store.importBundle(JSON.stringify(single)).ids).toEqual([B.id]);
    expect(store.get(B.id).name).toBe('From file');
    store.importBundle({ edits: { [A.id]: { diff: { changes: { name: 'old blob' }, accessories: {} } } } });
    expect(store.get(A.id).name).toBe('old blob');
  });

  test('bad import files report errors and change nothing', () => {
    const store = createEditStore(memoryStorage(), PRESETS_BY_ID, sync);
    expect(store.importBundle('{nope').errors[0]).toMatch(/JSON parse error/);
    expect(store.importBundle('[1,2]').errors[0]).toMatch(/expected a JSON object/);
    expect(store.importBundle({ definitions: { [A.id]: 5 } }).errors[0]).toMatch(/skipped/);
    for (const p of PRESETS) expect(store.isEdited(p.id)).toBe(false);
  });
});

describe('roster and the game-side loader', () => {
  test('meta.json roles match the main / NPC rosters', () => {
    expect(MAIN_PRESETS.map((p) => p.id)).toEqual(['sheet-01-black-tee', 'sheet-02-denim-vest', 'sheet-03-red-rugby', 'sheet-04-camo-cargo', 'sheet-05-curly-denim']);
    expect(NPC_PRESETS.map((p) => p.id)).toEqual(['sheet-06-floral-cutoffs', 'sheet-07-puffer-balaclava']);
    for (const p of MAIN_PRESETS) expect(PRESET_META[p.id].role).toBe('main');
    for (const p of NPC_PRESETS) expect(PRESET_META[p.id].role).toBe('npc');
    for (const p of PRESETS) expect(['main', 'npc', 'test']).toContain(roleOf(p.id));
    expect(MAIN_IDS).toEqual(MAIN_PRESETS.map((p) => p.id));
    expect(NPC_IDS).toEqual(NPC_PRESETS.map((p) => p.id));
  });

  test('loadSavedDefinition reads the creator save, and the selected player', () => {
    const storage = memoryStorage();
    const store = createEditStore(storage, PRESETS_BY_ID, sync);
    const b = store.get(B.id);
    b.top.color = '#abcdef';
    store.save(b);
    expect(loadSavedDefinition(B.id, { storage }).top.color).toBe('#abcdef');
    expect(savedPlayerId({ storage })).toBe(DEFAULT_PLAYER_ID);
    expect(loadSavedDefinition(null, { storage }).id).toBe(DEFAULT_PLAYER_ID);
    store.playerId = B.id;
    expect(savedPlayerId({ storage })).toBe(B.id);
    expect(loadSavedDefinition(undefined, { storage }).top.color).toBe('#abcdef');
    // NPCs keep their edits too, but cannot be the player
    store.playerId = npc.id;
    expect(savedPlayerId({ storage })).toBe(DEFAULT_PLAYER_ID);
  });

  test('loadSavedDefinition falls back safely and never writes', () => {
    expect(loadSavedDefinition(A.id, { storage: null })).toEqual(normalizeDefinition(A).value);
    expect(loadSavedDefinition('no-such-id', { storage: null }).id).toBe('trial-default');
    const broken = memoryStorage({ [STORE_KEY]: '{corrupt' });
    const spy = vi.spyOn(broken, 'setItem');
    expect(loadSavedDefinition(A.id, { storage: broken })).toEqual(normalizeDefinition(A).value);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadSavedDefinition(B.id, { storage: throwing })).toEqual(normalizeDefinition(B).value);
    expect(spy).not.toHaveBeenCalled();
    // Without an explicit storage it reads globalThis.localStorage (absent under node) without throwing.
    expect(loadSavedDefinition(A.id).id).toBe(A.id);
  });
});
