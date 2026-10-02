import { BUILDING as B, UNIT, HALL, CORRIDOR, EMPTY_UNITS, GROUND } from './layout.js';
import { wall, slab } from '../../kit/arch.js';
import { steelWindow, swingDoor, doorFrame } from '../../kit/openings.js';

/**
 * The warehouse shell (half the original block): four brick facades in wall frames (local +X
 * along the wall, z = 0 the outside face), parapet, roof and rooftop units. The street facade
 * follows the reference collage: projecting piers, stone sill band, tall steel factory windows,
 * one per apartment, plus the entry door to the hall.
 */
const T = B.wall;
const LAYERS = [{ mat: 'brick', t: 0.26 }, { mat: 'cmu', t: T - 0.26 }];
const TOP = B.roofTop;
const W = B.x1 - B.x0;
const D = B.z1 - B.z0;

export const FACADES = {
  street: { o: [B.x0, 0, B.z0], yaw: 0, len: W },
  east: { o: [B.x1, 0, B.z0], yaw: -Math.PI / 2, len: D },
  back: { o: [B.x1, 0, B.z1], yaw: Math.PI, len: W },
  west: { o: [B.x0, 0, B.z1], yaw: Math.PI / 2, len: D },
};

function inFacade(kit, name, fn) {
  const f = FACADES[name];
  kit.at(f.o[0], f.o[1], f.o[2], f.yaw, () => fn(f.len));
}

function lintel(kit, o) {
  kit.box('steelGray', [o.x0 - 0.15, o.y1, -0.03], [o.x1 + 0.15, o.y1 + 0.16, 0.08], { seg: 9 });
  kit.panel('rainStreak', [o.x0 + 0.5, o.y0 - 0.55, -0.004], [0.7, 1.0], '-z');
  kit.panel('rainStreak', [o.x1 - 0.7, o.y0 - 0.7, -0.004], [0.6, 1.3], '-z');
}

function sill(kit, o) {
  kit.box('stoneTrim', [o.x0 - 0.12, o.y0 - 0.12, -0.08], [o.x1 + 0.12, o.y0 + 0.01, 0.2], { seg: 9 });
}

/** Projecting brick piers at `piers` (local x), base course, cornice band, parapet coping. */
function piersAndBands(kit, len, rng, piers, gaps = []) {
  for (const x of piers) {
    const corner = x === 0 || Math.abs(x - len) < 1e-6;
    const w = corner ? 0.55 : 0.4;
    const xa = Math.max(-0.14, x - w);
    const xb = Math.min(len + 0.14, x + w);
    kit.box('brick', [xa, -0.3, -0.14], [xb, TOP + 0.1, 0], { seg: 0.8, occlude: false });
    kit.box('stoneTrim', [xa - 0.03, TOP + 0.1, -0.2], [xb + 0.03, TOP + 0.25, 0], { seg: 9 });
  }
  let from = -0.14;
  for (const g of [...gaps, { x0: len + 0.14, x1: len + 0.14 }]) {
    if (g.x0 > from) kit.box('concreteRough', [from, -0.3, -0.2], [g.x0, 0.45, 0], { seg: 0.8, occlude: false });
    from = g.x1;
  }
  kit.box('brick', [-0.14, TOP - 0.25, -0.2], [len + 0.14, TOP + 0.1, 0], { seg: 0.8, occlude: false });
  kit.box('brick', [-0.14, TOP + 0.25, -0.14], [len + 0.14, B.parapetTop, 0], { seg: 0.8, occlude: false });
  kit.box('stoneTrim', [-0.2, B.parapetTop, -0.22], [len + 0.2, B.parapetTop + 0.1, T + 0.05], { seg: 1.2 });
  kit.panel('grime', [len / 2, 0.85, -0.205], [len, 0.75], '-z');
  for (let i = 0; i < Math.round(len / 4); i++) kit.panel('rainStreak', [0.5 + rng.next() * (len - 1), TOP - 1.2, -0.145], [0.9, 2.2], '-z');
}

function parapet(kit, len) {
  kit.box('brick', [0, TOP, 0], [len, B.parapetTop, T], { seg: 0.8 });
}

function streetFacade(kit, rng, len) {
  const lx = (x) => x - B.x0;
  const door = { x0: lx(HALL.door.x0), x1: lx(HALL.door.x1), y0: -0.3, y1: 3.0 };
  const windows = [UNIT, ...EMPTY_UNITS].map((u) => ({ x0: lx(u.window.x0), x1: lx(u.window.x1), y0: UNIT.window.y0, y1: UNIT.window.y1, loft: u === UNIT }));
  wall(kit, len, LAYERS, { y0: -0.3, y1: TOP, openings: [door, ...windows], seg: 0.7 });
  parapet(kit, len);
  piersAndBands(kit, len, rng, [B.x0, 5.5, 10, 15, 20, B.x1].map(lx), [door]);
  for (const o of windows) {
    lintel(kit, o);
    sill(kit, o);
    steelWindow(kit, { x0: o.x0, x1: o.x1, y0: o.y0, y1: o.y1, z: 0.2, transomY: UNIT.window.transomY, rowsBelow: 3, rowsAbove: 2 });
  }
  entry(kit, door);
  kit.panel('graffiti', [lx(18.3), 1.2, -0.006], [2.0, 1.0], '-z');
}

/** Street door into the hall: steel frame, glazed door, transom, canopy, sign and light. */
function entry(kit, o) {
  const mid = (o.x0 + o.x1) / 2;
  const doorTop = GROUND.floor + 2.13;
  doorFrame(kit, { x0: o.x0, x1: o.x1, y0: GROUND.floor - 0.02, y1: doorTop, z0: 0, z1: T, mat: 'steelBlack' });
  kit.box('steelBlack', [o.x0, doorTop, 0.17], [o.x1, doorTop + 0.08, 0.27], { seg: 9, occlude: false });
  kit.panel('glass', [mid, (doorTop + 0.08 + o.y1) / 2, 0.22], [o.x1 - o.x0, o.y1 - doorTop - 0.08], '-z');
  kit.box('concreteRough', [o.x0 - 0.3, -0.02, -0.6], [o.x1 + 0.3, GROUND.floor, T], { seg: 9, walk: true, collide: true, occlude: false });
  swingDoor(kit, 'door-street', { hx: o.x0, hz: 0.22, width: o.x1 - o.x0, y: GROUND.floor, height: 2.13, mat: 'steelBlack', glassPanel: true, swing: 'both', kick: true });
  kit.box('steelBlack', [mid - 0.9, 3.3, -1.1], [mid + 0.9, 3.4, 0], { seg: 9 });
  for (const x of [mid - 0.8, mid + 0.8]) kit.tube('steelBlack', [[x, 3.4, -1.05], [x, 4.2, -0.02]], 0.016, { sides: 4 });
  kit.panel('signBuilding', [mid + 1.9, 3.55, -0.15], [2.6, 0.34], '-z');
  kit.panel('houseNumber', [mid, 3.15, -0.012], [0.42, 0.16], '-z');
  kit.panel('bulbWarm', [mid, 3.295, -0.55], [1.2, 0.1], '-y');
  kit.light({ name: 'entry-canopy', pos: [mid, 3.1, -0.7], color: '#ffd9a8', intensity: 5, range: 6, dir: [0, -1, 0], cone: Math.cos(1.2), dynamic: true, zone: 'street' });
  kit.marker('entry', [mid, 0, -1.4], { yaw: 0 });
}

function wallPack(kit, name, x, y, dynamic = false) {
  kit.box('steelBlack', [x - 0.16, y, -0.18], [x + 0.16, y + 0.24, 0], { seg: 9 });
  kit.panel('bulbWarm', [x, y - 0.002, -0.09], [0.26, 0.14], '-y');
  kit.light({ name, pos: [x, y - 0.15, -0.35], color: '#ffcf8a', intensity: 7, range: 8, dir: [0, -0.8, -0.6], cone: Math.cos(1.25), dynamic, zone: 'street' });
}

function eastFacade(kit, rng, len) {
  const ex = CORRIDOR.exit;
  const ops = [
    { x0: 1.5, x1: 4.5, y0: 2.4, y1: 5.8 }, { x0: 6.5, x1: 9.5, y0: 2.4, y1: 5.8 },
    { x0: ex.z0, x1: ex.z1, y0: -0.3, y1: GROUND.floor + 2.13, door: true },
  ];
  wall(kit, len, LAYERS, { y0: -0.3, y1: TOP, openings: ops, seg: 0.7 });
  parapet(kit, len);
  piersAndBands(kit, len, rng, [0, 5.5, 11, len], [ops[2]]);
  for (const o of ops) {
    if (o.door) continue;
    lintel(kit, o);
    sill(kit, o);
    steelWindow(kit, { x0: o.x0, x1: o.x1, y0: o.y0, y1: o.y1, z: 0.2, rowsBelow: 3, rowsAbove: 0, colsPerSide: 2 });
  }
  doorFrame(kit, { x0: ex.z0, x1: ex.z1, y0: GROUND.floor - 0.02, y1: GROUND.floor + 2.13, z0: 0, z1: T });
  kit.box('concreteRough', [ex.z0 - 0.3, -0.02, -0.6], [ex.z1 + 0.3, GROUND.floor, T], { seg: 9, walk: true, collide: true, occlude: false });
  swingDoor(kit, 'door-exit', { hx: ex.z0, hz: 0.2, y: GROUND.floor, width: ex.z1 - ex.z0, height: 2.13, mat: 'steelGray', swing: 'both', kick: true });
  wallPack(kit, 'wallpack-exit', (ex.z0 + ex.z1) / 2, 2.6, true);
  kit.panel('ghostSign', [7.5, 6.55, -0.006], [6.0, 1.3], '-z');
  kit.box('electricPanel', [10.3, 1.1, -0.16], [10.75, 1.85, 0], { seg: 9, uv: 'fit' });
  kit.tube('steelGray', [[10.52, 1.85, -0.08], [10.52, 3.4, -0.08], [10.9, 3.6, -0.08]], 0.025, { sides: 4 });
  kit.cylinder('steelGray', [9.9, 1.25, -0.13], 0.11, 0.35, { sides: 8 });
  kit.box('steelGray', [9.7, 0.4, -0.12], [10.1, 1.25, -0.02], { seg: 9 });
}

function backFacade(kit, rng, len) {
  wall(kit, len, LAYERS, { y0: -0.3, y1: TOP, seg: 0.7 });
  parapet(kit, len);
  piersAndBands(kit, len, rng, [0, 5.5, 11, 16.5, len]);
  kit.panel('graffiti', [8.5, 1.5, -0.006], [3.0, 1.5], '-z');
}

/**
 * West wall: the corridor's end window (local x = B.z1 - world z) with a sodium yard light on a
 * bracket outside, so streetlight falls into the far end of the corridor.
 */
function westFacade(kit, rng, len) {
  const win = { x0: B.z1 - CORRIDOR.z1 + 0.3, x1: B.z1 - CORRIDOR.z0 - 0.3, y0: 1.05, y1: 2.65 };
  wall(kit, len, LAYERS, { y0: -0.3, y1: TOP, seg: 0.7, openings: [win] });
  parapet(kit, len);
  piersAndBands(kit, len, rng, [0, 7, len]);
  kit.panel('ghostSign', [6.9, 5.6, -0.006], [8, 2.9], '-z');
  lintel(kit, win);
  sill(kit, win);
  steelWindow(kit, { ...win, z: 0.2, colsPerSide: 1, rowsBelow: 3, rowsAbove: 0, heavyCol: true, glass: 'glass' });
  kit.box('stoneTrim', [win.x0 - 0.02, win.y0 - 0.04, T - 0.02], [win.x1 + 0.02, win.y0 + 0.01, T + 0.06], { seg: 9, occlude: false });
  const lx = (win.x0 + win.x1) / 2 + 1.6;
  kit.box('steelBlack', [lx - 0.03, 3.3, -0.6], [lx + 0.03, 3.36, 0], { seg: 9, occlude: false });
  kit.box('steelGray', [lx - 0.14, 3.18, -0.78], [lx + 0.14, 3.36, -0.5], { seg: 9, occlude: false });
  kit.glow('yard-light', () => kit.panel('sodium', [lx, 3.178, -0.64], [0.22, 0.2], '-y'));
  kit.light({ name: 'yard-light', pos: [lx, 3.05, -0.65], color: '#ff9a48', intensity: 9, range: 9, dir: [0, -0.55, 0.85], cone: Math.cos(1.15), dynamic: true, zone: 'street', layer: 'yard-light', fill: 0 });
}

function downspout(kit, x, z, yaw) {
  kit.at(x, 0, z, yaw, () => {
    kit.box('galvanized', [-0.16, TOP - 0.35, -0.3], [0.16, TOP - 0.05, -0.05], { seg: 9 });
    kit.box('galvanized', [-0.06, 0.15, -0.2], [0.06, TOP - 0.35, -0.1], { seg: 9 });
    kit.box('galvanized', [-0.06, 0.02, -0.45], [0.06, 0.15, -0.1], { seg: 9 });
    kit.panel('rainStreak', [0, TOP - 1.6, -0.005], [0.5, 2.4], '-z');
    kit.solid([[-0.1, -0.5], [0.1, -0.5], [0.1, -0.05], [-0.1, -0.05]], 0, 0.2, 'downspout');
  });
}

/** Roof slab (membrane over black steel deck) and one rooftop unit per apartment. */
function roof(kit, rng) {
  kit.box('deck', [B.x0, B.deckUnderside, B.z0], [B.x1, B.deckUnderside + 0.18, B.z1], { seg: 1.2, faces: { py: false } });
  slab(kit, 'roof', [B.x0 + T, B.z0 + T], [B.x1 - T, B.z1 - T], TOP, TOP - B.deckUnderside - 0.18, { seg: 2 });
  for (const x of [7.75, 12.5, 17.5, 22.5]) {
    const z = 9.0;
    kit.box('steelGray', [x - 0.9, TOP, z - 0.7], [x + 0.9, TOP + 1.2, z + 0.7], { seg: 9, collide: true });
    kit.cylinder('steelBlack', [x + 0.35, TOP + 1.2, z], 0.34, 0.06, { sides: 10 });
  }
  for (let i = 0; i < 5; i++) kit.cylinder('galvanized', [B.x0 + 1.5 + rng.next() * (W - 3), TOP, 2 + rng.next() * (D - 4)], 0.08, 0.5 + rng.next() * 0.5, { sides: 6 });
  kit.box('steelGray', [4.6, TOP, 12.0], [5.6, TOP + 0.4, 13.0], { seg: 9 });
}

export function buildExterior(kit, rng) {
  kit.bucket('exterior');
  inFacade(kit, 'street', (len) => streetFacade(kit, rng.fork('street'), len));
  inFacade(kit, 'east', (len) => eastFacade(kit, rng.fork('east'), len));
  inFacade(kit, 'back', (len) => backFacade(kit, rng.fork('back'), len));
  inFacade(kit, 'west', (len) => westFacade(kit, rng.fork('west'), len));
  downspout(kit, B.x1, 4.9, -Math.PI / 2);
  downspout(kit, 12, B.z1, Math.PI);
  roof(kit, rng.fork('roof'));
}
