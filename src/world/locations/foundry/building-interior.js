import { BUILDING as B, UNIT as U, CORRIDOR as C, HALL as H, EMPTY_UNITS, GROUND } from './layout.js';
import { wall } from '../../kit/arch.js';
import { swingDoor, doorFrame } from '../../kit/openings.js';
import { spiralStair } from '../../kit/stairs.js';

/**
 * Interior shell: cement floors, the entry hall from the street door, the corridor along the back,
 * the empty apartments (1A, 1C, 1D) and the loft's mezzanine, spiral stair, guards and bathroom.
 * Every room is a closed box up to its ceiling so the bake treats it as its own space.
 */
const F = GROUND.floor;
const SLAB = F - 0.01;
const DOOR_H = 2.13;
const DRY = [{ mat: 'drywall', t: 0.1 }, { mat: 'drywall', t: 0.1 }];

/** Wall along X at z (thickness toward +Z) or along Z at x (thickness toward -X). */
function partition(kit, axis, fixed, from, to, layers, opts) {
  const len = to - from;
  if (axis === 'x') kit.at(from, 0, fixed, 0, () => wall(kit, len, layers, opts));
  else kit.at(fixed, 0, from, -Math.PI / 2, () => wall(kit, len, layers, opts));
}

function floors(kit) {
  kit.box('concreteRough', [B.x0 + B.wall, -0.3, B.z0 + B.wall], [B.x1 - B.wall, SLAB, B.z1 - B.wall], { seg: 1.5, walk: true, collide: true, uv: 'world', faces: { ny: false } });
  kit.box('concreteFloor', [B.x0 + B.wall, SLAB, B.z0 + B.wall], [B.x1 - B.wall, F, B.z1 - B.wall], { seg: 1.0, walk: true, uv: 'world', occlude: false, faces: { ny: false } });
}

function apartmentWalls(kit) {
  partition(kit, 'z', H.x1 + 0.2, B.z0 + B.wall, U.z1, [{ mat: 'drywall', t: 0.1 }, { mat: 'cmu', t: 0.1 }], { y0: SLAB, y1: B.deckUnderside, seg: 0.8 });
  for (const x of [10, 15, 20]) partition(kit, 'z', x + 0.1, B.z0 + B.wall, U.z1, DRY, { y0: SLAB, y1: B.deckUnderside, seg: 0.8 });
}

function door(kit, name, x, opts = {}) {
  kit.at(H.x1, 0, U.z1, 0, () => {
    const x0 = x - H.x1;
    doorFrame(kit, { x0, x1: x0 + 0.92, y0: SLAB, y1: F + DOOR_H, z0: 0, z1: 0.2 });
    swingDoor(kit, name, { hx: x0, hz: 0.1, y: F, width: 0.92, height: DOOR_H, mat: 'woodDark', locked: !!opts.locked });
    kit.panel('houseNumber', [x0 + 0.46, F + 2.3, 0.204], [0.3, 0.11], '+z');
  });
}

/** Corridor south wall (apartment doors), drop ceiling, fluorescent fixtures, exit signs. */
function corridor(kit) {
  const doors = [EMPTY_UNITS[0].door, U.door.x0, EMPTY_UNITS[1].door, EMPTY_UNITS[2].door];
  const openings = doors.map((x) => ({ x0: x - H.x1, x1: x - H.x1 + 0.92, y0: SLAB, y1: F + DOOR_H }));
  partition(kit, 'x', U.z1, H.x1, C.x1, [{ mat: 'drywall', t: 0.1 }, { mat: 'cmu', t: 0.1 }], { y0: SLAB, y1: B.deckUnderside, openings, seg: 0.8 });
  door(kit, 'door-1A', EMPTY_UNITS[0].door);
  door(kit, 'door-unit', U.door.x0);
  door(kit, 'door-1C', EMPTY_UNITS[1].door);
  door(kit, 'door-1D', EMPTY_UNITS[2].door);
  kit.box('drywall', [C.x0, C.ceiling, C.z0], [C.x1, C.ceiling + 0.05, C.z1], { seg: 1.0, faces: { py: false } });
  kit.box('drywall', [H.x0, H.ceiling, H.z0], [H.x1, H.ceiling + 0.05, C.z0], { seg: 1.0, faces: { py: false } });
  kit.box('cmu', [C.x0, C.ceiling + 0.05, C.z0 - 0.2], [H.x1 + 0.2, B.deckUnderside, C.z0], { seg: 0.8, faces: { pz: false } });
  for (const x of [6.5, 11.5, 16.5, 21.5]) {
    kit.box('plasticWhite', [x - 0.6, C.ceiling - 0.06, 12.35], [x + 0.6, C.ceiling, 12.65], { seg: 9, occlude: false });
    kit.panel('bulbCool', [x, C.ceiling - 0.062, 12.5], [1.1, 0.22], '-y');
    kit.light({ name: `corridor-${x}`, pos: [x, C.ceiling - 0.25, 12.5], color: '#e9f1ff', intensity: 3.2, range: 6, zone: 'corridor', dynamic: x === 11.5 || x === 21.5 });
  }
  kit.panel('signExit', [C.x1 - 0.004, 2.55, 12.5], [0.36, 0.13], '-x');
  kit.panel('signExit', [H.x0 + 0.8, 2.55, H.z0 + 0.405], [0.36, 0.13], '+z');
  kit.panel('grime', [(H.x1 + C.x1) / 2, F + 0.12, U.z1 + 0.204], [C.x1 - H.x1, 0.24], '+z');
  kit.panel('grime', [(C.x0 + C.x1) / 2, F + 0.12, C.z1 - 0.004], [C.x1 - C.x0, 0.24], '-z');
  kit.marker('corridor', [18, F, 12.5], { yaw: -Math.PI / 2 });
}

/** Entry hall: mailboxes, ceiling lights, worn cement, a bench. */
function hall(kit) {
  kit.panel('mailboxes', [H.x1 - 0.004, 1.35, 3.0], [1.2, 0.9], '-x');
  kit.box('woodDark', [H.x0 + 0.05, F, 5.6], [H.x0 + 0.45, F + 0.45, 7.0], { seg: 9, collide: true });
  for (const z of [2.5, 7.5]) {
    kit.panel('bulbWarm', [(H.x0 + H.x1) / 2, H.ceiling - 0.004, z], [0.35, 0.35], '-y');
    kit.light({ name: `hall-${z}`, pos: [(H.x0 + H.x1) / 2, H.ceiling - 0.3, z], color: '#ffe2b8', intensity: 2.4, range: 5, zone: 'hall', dynamic: z === 2.5 });
  }
  kit.panel('grime', [H.x0 + 0.004, F + 0.12, (H.z0 + H.z1) / 2], [H.z1 - H.z0, 0.24], '+x');
  kit.panel('grime', [H.x1 - 0.004, F + 0.12, (H.z0 + H.z1) / 2], [H.z1 - H.z0, 0.24], '-x');
  kit.marker('hall', [(H.x0 + H.x1) / 2, F, 1.6], { yaw: 0 });
}

/** Empty apartments: bare cement and drywall, one bare bulb each, open to explore. */
function emptyUnits(kit) {
  for (const u of EMPTY_UNITS) {
    const cx = (u.x0 + u.x1) / 2;
    kit.tube('wire', [[cx, B.deckUnderside, 5], [cx, 4.4, 5]], 0.006, { sides: 3 });
    kit.sphere('bulbWarm', [cx, 4.35, 5], 0.05, { w: 6, h: 4 });
    kit.light({ name: `bulb-${u.id}`, pos: [cx, 4.3, 5], color: '#ffd9a0', intensity: 1.6, range: 7, zone: u.id });
    kit.panel('grime', [cx, F + 0.12, U.z1 - 0.004], [u.x1 - u.x0, 0.24], '-z');
    kit.marker(`apt-${u.id}`, [cx, F, 8.5], { yaw: Math.PI });
  }
}

/** Black steel mezzanine guard: posts, rails, hex-perforated infill (reference IMG_0059 / IMG_7900). */
function guard(kit, a, b, y) {
  const h = 1.05;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 1.25));
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const z = a[1] + ((b[1] - a[1]) * i) / n;
    kit.box('steelBlack', [x - 0.025, y, z - 0.025], [x + 0.025, y + h, z + 0.025], { seg: 9, occlude: false });
  }
  kit.tube('steelBlack', [[a[0], y + h, a[1]], [b[0], y + h, b[1]]], 0.025, { sides: 4 });
  kit.tube('steelBlack', [[a[0], y + 0.06, a[1]], [b[0], y + 0.06, b[1]]], 0.015, { sides: 4 });
  const dx = (b[0] - a[0]) / len;
  const dz = (b[1] - a[1]) / len;
  kit.quad('perfHex', [a[0], y + 0.08, a[1]], [b[0], y + 0.08, b[1]], [b[0], y + h - 0.03, b[1]], [a[0], y + h - 0.03, a[1]], { uvs: [[0, 0], [len / 0.25, 0], [len / 0.25, (h - 0.11) / 0.25], [0, (h - 0.11) / 0.25]] });
  kit.solid([[a[0] - dz * 0.04, a[1] + dx * 0.04], [b[0] - dz * 0.04, b[1] + dx * 0.04], [b[0] + dz * 0.04, b[1] - dx * 0.04], [a[0] + dz * 0.04, a[1] - dx * 0.04]], y, y + h, 'guard');
}

function loft(kit) {
  const M = U.mezz;
  const S = U.stair;
  kit.box('deck', [U.x0, M.top - M.thick, M.z0], [U.x1, M.top - 0.05, U.z1], { seg: 0.8, collide: true });
  kit.box('woodFloor', [U.x0, M.top - 0.05, M.z0], [U.x1, M.top, U.z1], { seg: 0.8, walk: true, uv: 'world', occlude: false });
  kit.box('steelBlack', [U.x0, M.top - 0.4, M.z0 - 0.07], [U.x1, M.top, M.z0], { seg: 0.8 });
  kit.box('steelBlack', [12.86, F, M.z0 - 0.07], [13.0, M.top - 0.4, M.z0 + 0.07], { seg: 9, collide: true, tag: 'column' });
  const plate = { x0: S.cx, x1: S.cx + 1.0, z0: 6.95 };
  kit.box('steelBlack', [plate.x0, M.top - 0.15, plate.z0], [plate.x1, M.top, M.z0], { seg: 9, collide: true, walk: true });
  spiralStair(kit, { cx: S.cx, cz: S.cz, y0: F, y1: M.top, r: S.r, pole: S.pole, treads: S.treads, sweep: S.sweep, start: 0, dir: -1 });
  guard(kit, [U.x0, M.z0 - 0.03], [S.cx, M.z0 - 0.03], M.top);
  guard(kit, [plate.x1, M.z0 - 0.03], [U.x1, M.z0 - 0.03], M.top);
  guard(kit, [plate.x1, plate.z0], [plate.x1, M.z0 - 0.03], M.top);
  guard(kit, [plate.x0 + 0.05, plate.z0], [plate.x1, plate.z0], M.top);
  kit.marker('stair-bottom', [S.cx + 0.6, F, S.cz + 0.25], { yaw: Math.PI });
  kit.marker('stair-top', [S.cx + 0.55, M.top, 7.2], { yaw: 0 });
  kit.marker('mezzanine', [12.9, M.top, 9.6], { yaw: Math.PI });

  const bz = U.bath.z0;
  partition(kit, 'z', U.bath.x0 + 0.05, bz, U.z1, [{ mat: 'tileWhite', t: 0.05 }, { mat: 'drywall', t: 0.05 }], { y0: SLAB, y1: M.top - M.thick, openings: [{ x0: 0.3, x1: 1.12, y0: SLAB, y1: F + 2.05 }], seg: 0.6 });
  partition(kit, 'x', bz - 0.1, U.bath.x0, U.x1, [{ mat: 'drywall', t: 0.05 }, { mat: 'tileWhite', t: 0.05 }], { y0: SLAB, y1: M.top - M.thick, seg: 0.6 });
  kit.at(U.bath.x0 + 0.05, 0, bz, -Math.PI / 2, () => {
    doorFrame(kit, { x0: 0.3, x1: 1.12, y0: SLAB, y1: F + 2.05, z0: 0, z1: 0.1, mat: 'paintWhiteGloss' });
    swingDoor(kit, 'door-bath', { hx: 0.3, hz: 0.05, y: F, width: 0.82, height: 1.95, mat: 'paintWhiteGloss' });
  });
  kit.box('tileWhite', [U.bath.x0 + 0.05, F, bz], [U.x1, F + 0.005, U.z1], { seg: 9, occlude: false, uv: 'world' });
  kit.marker('bathroom', [13.95, F, 9.7], { yaw: 0 });
  kit.marker('kitchen', [11.8, F, 9.6], { yaw: -Math.PI / 2 });
  kit.marker('living', [12.6, F, 5.0], { yaw: Math.PI });
  kit.marker('unit-door', [11.75, F, 10.7], { yaw: Math.PI });
}

export function buildInterior(kit) {
  kit.bucket('interior');
  floors(kit);
  apartmentWalls(kit);
  corridor(kit);
  hall(kit);
  emptyUnits(kit);
  loft(kit);
}

/** Bake zones: interiors get a faint ambient floor tinted by their dominant light. */
export const ZONES = [
  { name: 'unit', min: [U.x0, 0, U.z0], max: [U.x1, B.deckUnderside, U.z1], ambient: '#bfae94', floor: 0.05 },
  { name: 'corridor', min: [C.x0, 0, C.z0], max: [C.x1, C.ceiling, C.z1], ambient: '#d9e0e4', floor: 0.12 },
  { name: 'hall', min: [H.x0, 0, H.z0], max: [H.x1, H.ceiling, H.z1], ambient: '#e0cdb0', floor: 0.1 },
  ...EMPTY_UNITS.map((u) => ({ name: u.id, min: [u.x0, 0, U.z0], max: [u.x1, B.deckUnderside, U.z1], ambient: '#c9c2b4', floor: 0.05 })),
];
