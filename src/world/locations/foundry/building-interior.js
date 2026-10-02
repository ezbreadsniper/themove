import { BUILDING as B, UNIT as U, CORRIDOR as C, HALL as H, EMPTY_UNITS, GROUND } from './layout.js';
import { wall } from '../../kit/arch.js';
import { swingDoor, doorFrame } from '../../kit/openings.js';
import { spiralStair } from '../../kit/stairs.js';
import { slab } from '../../kit/shapes.js';
import { baseboard, outlet, lightSwitch, radiator, conduit, sprinklers, smokeDetector, fluorescent, sconce, exitSign, doorSpill, extinguisher, wallBox, doormat } from '../../props/fixtures.js';
import { debris, cardboardBox, bucket, trashBin, bottle } from '../../props/clutter.js';

/**
 * Interior shell: cement floors, the entry hall from the street door, the corridor along the back,
 * the empty apartments (1A, 1C, 1D) and the loft's mezzanine, spiral stair, guards and bathroom.
 * Every room is a closed box up to its ceiling so the bake treats it as its own space.
 *
 * The corridor is the building's lighting set-piece: a long, dark, lived-in hall where practical
 * fixtures carry the look — three cool fluorescent wraps (one with a tired starter) making pools
 * with dark gaps between them, warm sconces by the apartment doors, light leaking under the doors
 * of occupied units, a red exit sign at the far end and orange sodium streetlight through the end
 * window. Wear is ordinary age: scuffed two-tone paint, stained ceiling tiles, flyers, grit.
 */
const F = GROUND.floor;
const SLAB = F - 0.01;
const DOOR_H = 2.13;
const DRY = [{ mat: 'drywall', t: 0.1 }, { mat: 'drywall', t: 0.1 }];
const LOFT_WALL = [{ mat: 'plasterWhite', t: 0.1 }, { mat: 'plasterWhite', t: 0.1 }];
const CZ = (C.z0 + C.z1) / 2;
/** Corridor wall faces: south (apartment doors) faces +Z, north (back wall) faces -Z. */
const SOUTH = U.z1 + 0.2;
const NORTH = B.z1 - B.wall;
const DOORS = [
  { name: 'door-1A', x: EMPTY_UNITS[0].door, unit: '1A', occupied: true },
  { name: 'door-unit', x: U.door.x0, unit: '1B', occupied: true },
  { name: 'door-1C', x: EMPTY_UNITS[1].door, unit: '1C', occupied: false },
  { name: 'door-1D', x: EMPTY_UNITS[2].door, unit: '1D', occupied: true, locked: true },
];

/** Wall along X at z (thickness toward +Z) or along Z at x (thickness toward -X). */
function partition(kit, axis, fixed, from, to, layers, opts) {
  const len = to - from;
  if (axis === 'x') kit.at(from, 0, fixed, 0, () => wall(kit, len, layers, opts));
  else kit.at(fixed, 0, from, -Math.PI / 2, () => wall(kit, len, layers, opts));
}

/** Runs fn in a wall frame: south corridor wall (+Z facing) or north corridor wall (-Z facing, +X → -X). */
const south = (kit, fn) => kit.at(0, F, SOUTH, 0, fn);
const north = (kit, fn) => kit.at(0, F, NORTH, Math.PI, fn);

function floors(kit) {
  kit.box('concreteRough', [B.x0 + B.wall, -0.3, B.z0 + B.wall], [B.x1 - B.wall, SLAB, B.z1 - B.wall], { seg: 1.5, walk: true, collide: true, uv: 'world', faces: { ny: false } });
  kit.box('concreteFloor', [B.x0 + B.wall, SLAB, B.z0 + B.wall], [B.x1 - B.wall, F, B.z1 - B.wall], { seg: 1.0, walk: true, uv: 'world', occlude: false, faces: { ny: false } });
  for (const z of [2.4, 5.2]) kit.decal('sawcut', [(U.x0 + U.x1) / 2, F + 0.002, z], [U.x1 - U.x0, 0.06], '+y');
  kit.decal('sawcut', [12.5, F + 0.002, 4.0], [7.0, 0.06], '+y', { rot: Math.PI / 2 });
}

function apartmentWalls(kit) {
  partition(kit, 'z', H.x1 + 0.2, B.z0 + B.wall, U.z1, [{ mat: 'drywall', t: 0.1 }, { mat: 'cmu', t: 0.1 }], { y0: SLAB, y1: B.deckUnderside, seg: 0.8 });
  for (const x of [10, 15, 20]) partition(kit, 'z', x + 0.1, B.z0 + B.wall, U.z1, x === 20 ? DRY : LOFT_WALL, { y0: SLAB, y1: B.deckUnderside, seg: 0.8 });
}

function door(kit, d) {
  kit.at(H.x1, 0, U.z1, 0, () => {
    const x0 = d.x - H.x1;
    doorFrame(kit, { x0, x1: x0 + 0.92, y0: SLAB, y1: F + DOOR_H, z0: 0, z1: 0.2, mat: 'trimDark' });
    swingDoor(kit, d.name, { hx: x0, hz: 0.1, y: F, width: 0.92, height: DOOR_H, mat: 'woodDark', locked: !!d.locked, style: 'panel', kick: true, peephole: true, hardware: 'brass' });
    kit.panel('houseNumber', [x0 + 0.46, F + 2.32, 0.222], [0.3, 0.11], '+z');
  });
}

/** Two-tone painted block: darker wainscot to 1.05 m with a timber chair rail, skipping openings. */
function wainscot(kit, len, gaps) {
  let from = 0;
  for (const g of [...gaps, [len, len]]) {
    if (g[0] - from > 0.05) {
      kit.box('cmuDark', [from, 0, 0], [g[0], 1.05, 0.006], { seg: 0.8, occlude: false, uv: 'world' });
      kit.box('woodDark', [from, 1.05, 0], [g[0], 1.09, 0.022], { seg: 9, occlude: false });
    }
    from = g[1];
  }
  baseboard(kit, len, { gaps, h: 0.1, t: 0.014, mat: 'rubber' });
}

/** Corridor: the set-piece (see file header). */
function corridor(kit, rng) {
  const openings = DOORS.map((d) => ({ x0: d.x - H.x1, x1: d.x - H.x1 + 0.92, y0: SLAB, y1: F + DOOR_H }));
  partition(kit, 'x', U.z1, H.x1, C.x1, [{ mat: 'drywall', t: 0.1 }, { mat: 'cmu', t: 0.1 }], { y0: SLAB, y1: B.deckUnderside, openings, seg: 0.8 });
  for (const d of DOORS) door(kit, d);

  // drop ceiling (acoustic tiles in a T-bar grid) and the bulkhead over the hall junction
  kit.box('ceilingTile', [C.x0, C.ceiling, C.z0], [C.x1, C.ceiling + 0.05, C.z1], { seg: 0.6, uv: 'world', faces: { py: false } });
  kit.box('ceilingTile', [H.x0, H.ceiling, H.z0], [H.x1, H.ceiling + 0.05, C.z0], { seg: 0.6, uv: 'world', faces: { py: false } });
  kit.box('cmu', [C.x0, C.ceiling + 0.05, C.z0 - 0.2], [H.x1 + 0.2, B.deckUnderside, C.z0], { seg: 0.8, faces: { pz: false } });
  for (const [x, z, s] of [[9.7, 12.2, 0.7], [17.9, 12.9, 0.9], [22.6, 12.3, 0.55], [5.2, 12.9, 0.6]]) kit.decal('waterStain', [x, C.ceiling - 0.003, z], [s, s], '-y', { rot: rng.next() * 6 });

  // wall finish: wainscot + chair rail on both long walls, baseboards
  const doorGaps = DOORS.map((d) => [d.x - 0.09, d.x + 0.92 + 0.09]);
  south(kit, () => kit.at(H.x1, 0, 0, 0, () => wainscot(kit, C.x1 - H.x1, doorGaps.map(([a, b]) => [a - H.x1, b - H.x1]))));
  north(kit, () => kit.at(-C.x1, 0, 0, 0, () => wainscot(kit, C.x1 - C.x0, [])));

  // practicals: cool fluorescents in pools (one tired), warm sconces by the doors, exit sign, door spill
  const fl = [
    { x: 8.85, flicker: null },
    { x: 14.0, flicker: { rate: 0.55, depth: 0.55, seed: 'corridor-14', dropout: 0.16, dim: 0.22, hum: 0.06 } },
    { x: 19.6, flicker: null },
  ];
  for (const f of fl) kit.at(f.x, C.ceiling, CZ, 0, () => fluorescent(kit, `corridor-fl-${f.x}`, { zone: 'corridor', flicker: f.flicker, intensity: 2.3, range: 4.4 }));
  for (const d of DOORS) {
    const sx = d.x + 0.92 + 0.32;
    south(kit, () => {
      if (d.unit !== '1C') sconce(kit, `sconce-${d.unit}`, sx, 1.95, { zone: 'corridor', intensity: 0.9, range: 2.8 });
      else {
        kit.box('brass', [sx - 0.06, 1.85, 0], [sx + 0.06, 2.05, 0.012], { seg: 9, occlude: false });
        kit.box('plasticBlack', [sx - 0.05, 1.88, 0.012], [sx + 0.05, 2.02, 0.05], { seg: 9, occlude: false });
      }
      if (d.occupied) doorSpill(kit, `spill-${d.unit}`, d.x + 0.46, 0, { zone: 'corridor', layer: d.unit === '1B' ? 'loft-track' : `unit-${d.unit}`, intensity: d.unit === '1B' ? 0.6 : 0.45 });
      kit.decal('scuff', [d.x + 0.46, 0.14, 0.03], [1.1, 0.28], '+z');
    });
  }
  kit.at(C.x1, F, CZ, -Math.PI / 2, () => exitSign(kit, 'exit-sign', 0, 2.42, { zone: 'corridor' }));
  kit.at((H.door.x0 + H.door.x1) / 2, F, H.z0, 0, () => exitSign(kit, 'exit-sign-hall', 0, 2.55, { zone: 'hall' }));

  // services along the ceiling line and the back wall
  north(kit, () => {
    conduit(kit, [[-24.6, 2.95, 0.03], [-18.2, 2.95, 0.03], [-18.2, 1.4, 0.03]]);
    wallBox(kit, -18.2, 1.32, { w: 0.12, h: 0.16, mat: 'steelGray' });
    extinguisher(kit, -15.6, 1.05);
    radiator(kit, -11.5, { w: 0.9, h: 0.55 });
    kit.box('woodDark', [-8.0, 1.25, 0], [-6.9, 1.95, 0.02], { seg: 9, occlude: false });
    kit.box('cardboard', [-7.95, 1.3, 0.02], [-6.95, 1.9, 0.024], { seg: 9, occlude: false });
    [['noticeMeeting', -7.75, 1.72, 0.22, -0.05], ['flyerRent', -7.4, 1.68, 0.2, 0.06], ['noticeRecycle', -7.15, 1.5, 0.2, 0.0], ['flyerCat', -7.6, 1.45, 0.2, 0.1], ['stickerBand', -7.1, 1.8, 0.1, 0.2]].forEach(([n, x, y, s, r]) => kit.decal(n, [x, y, 0.027], [s, s], '+z', { rot: r }));
    kit.decal('noticeDoor', [-23.3, 1.5, 0.004], [0.26, 0.26], '+z');
    kit.decal('noticeSmoking', [-4.6, 1.6, 0.004], [0.24, 0.24], '+z');
    outlet(kit, -13.2, 0.3);
    outlet(kit, -21.0, 0.3);
    for (const [x, y, n, s] of [[-12.6, 0.7, 'plasterCrack', 0.5], [-20.4, 1.7, 'peel', 0.4], [-9.4, 0.35, 'scuff', 0.9], [-16.9, 0.5, 'grime', 0.7], [-5.3, 2.4, 'drip', 0.5]]) kit.decal(n, [x, y, 0.009], [s, s], '+z', { rot: n === 'plasterCrack' ? 0.3 : 0 });
  });
  sprinklers(kit, [[C.x0 + 0.3, C.ceiling - 0.14, 13.05], [C.x1 - 0.3, C.ceiling - 0.14, 13.05]], { every: 3.0, drop: 0.08 });
  for (const x of [11.4, 22.4]) smokeDetector(kit, [x, C.ceiling, CZ]);
  south(kit, () => {
    for (const [x, n, s] of [[10.2, 'plasterCrack', 0.45], [18.9, 'scuff', 0.7], [23.6, 'tag', 0.35], [14.9, 'peel', 0.32]]) kit.decal(n, [x, n === 'tag' ? 1.35 : 0.8, 0.009], [s, s], '+z');
    outlet(kit, 9.0, 0.3);
    outlet(kit, 18.4, 0.3);
  });

  // floor: worn path, grit, a few papers and butts near the exit and the hall end
  for (let x = 6; x < C.x1 - 1; x += 3.1) kit.decal('stainBig', [x + rng.next(), F + 0.003, CZ + (rng.next() - 0.5) * 0.4], [1.6, 1.0], '+y', { rot: rng.next() * 6 });
  debris(kit, rng.fork('corridor-debris'), { x0: C.x0 + 0.2, x1: C.x1 - 0.2, z0: C.z0 + 0.1, z1: C.z1 - 0.1, y: F, count: 14, mix: { paper: 2, butts: 1, trash: 1.2, grime: 0.6 }, bits: 10, edge: 0.35, avoid: DOORS.map((d) => [d.x + 0.46, SOUTH + 0.3, 0.7]) });
  debris(kit, rng.fork('exit-butts'), { x0: C.x1 - 1.4, x1: C.x1 - 0.2, z0: C.z0 + 0.2, z1: C.z1 - 0.2, y: F, count: 4, mix: { butts: 1 }, bits: 6 });
  doormat(kit, [U.door.x0 + 0.46, F, SOUTH + 0.3], 0.8, 0.5);
  doormat(kit, [EMPTY_UNITS[2].door + 0.46, F, SOUTH + 0.3], 0.75, 0.45, 0.05);
  trashBin(kit, 'bin-corridor', [C.x1 - 0.45, F, C.z1 - 0.3], { r: 0.2, h: 0.62, mat: 'greenPaint', mass: 6 });
  cardboardBox(kit, 'box-corridor', [22.0, F, SOUTH + 0.32], [0.5, 0.36, 0.4], 0.2);
  bottle(kit, 'bottle-corridor', [24.0, F, 12.9], { mat: 'bottleBrown' });

  // markers
  kit.marker('corridor', [18, F, CZ], { yaw: -Math.PI / 2 });
  kit.marker('spawn_corridor', [6.2, F, CZ], { yaw: Math.PI / 2 });
  kit.marker('npc_corridor_1', [EMPTY_UNITS[2].door + 1.4, F, SOUTH + 0.45], { yaw: -Math.PI / 2 - 0.35, role: 'resident' });
}

/** Entry hall: lobby tile, mailboxes with names, bench, notice board, two warm dome lights on a switch. */
function hall(kit, rng) {
  kit.box('lobbyFloor', [H.x0, F, H.z0], [H.x1, F + 0.004, C.z0], { seg: 1.0, uv: 'world', occlude: false });
  kit.at(H.x1, F, 3.0, -Math.PI / 2, () => {
    slab(kit, 'steelGray', [-0.62, 0.88, 0], [0.62, 1.82, 0.05], { r: 0.006, occlude: false });
    kit.panel('mailboxes', [0, 1.35, 0.052], [1.2, 0.9], '+z');
    kit.decal('mailLabel', [0.3, 1.0, 0.054], [0.36, 0.36], '+z');
  });
  kit.at(H.x0, F, 6.3, Math.PI / 2, () => {
    slab(kit, 'woodDark', [-0.7, 0.42, 0.05], [0.7, 0.47, 0.42], { r: 0.008, collide: true });
    for (const x of [-0.62, 0.62]) slab(kit, 'steelBlack', [x - 0.02, 0, 0.08], [x + 0.02, 0.42, 0.39], { r: 0.004, occlude: false });
    kit.interactable({ id: 'hall.bench.seat', kind: 'seat', pos: [0, 0.47, 0.24], yaw: 0, radius: 0.8, prompt: 'Sit', data: { seatHeight: 0.47, variant: 'chair', exit: [0, 0, 0.9] } });
    kit.decal('posterFlea', [0.2, 1.55, 0.004], [0.36, 0.72], '+z');
    radiator(kit, -1.4, { w: 0.7, h: 0.55 });
  });
  for (const z of [2.5, 7.5]) {
    kit.at((H.x0 + H.x1) / 2, H.ceiling, z, 0, () => {
      kit.cylinder('brass', [0, -0.02, 0], 0.13, 0.02, { sides: 10 });
      kit.glow('hall-lights', () => kit.lathe('bulbWarm', [0, -0.12, 0], [[0.001, 0], [0.09, 0.02], [0.12, 0.1], [0.001, 0.1]], { sides: 10 }));
    });
    kit.light({ name: `hall-${z}`, pos: [(H.x0 + H.x1) / 2, H.ceiling - 0.25, z], color: '#ffd9a8', intensity: 1.9, range: 4.2, zone: 'hall', dynamic: true, layer: 'hall-lights', switchable: true, fill: 0.8 });
  }
  kit.at(H.x0, F, H.z0 + 1.1, Math.PI / 2, () => lightSwitch(kit, 'hall.switch', 0, ['hall-2.5', 'hall-7.5'], { y: 1.2 }));
  for (const s of [1, -1]) {
    kit.at(s > 0 ? H.x0 : H.x1, F, s > 0 ? H.z1 : H.z0, s * Math.PI / 2, () => {
      baseboard(kit, H.z1 - H.z0, { mat: 'rubber', gaps: s > 0 ? [[3.9, 5.7]] : [] });
      kit.decal('scuff', [(H.z1 - H.z0) / 2, 0.18, 0.016], [3.0, 0.3], '+z');
    });
  }
  debris(kit, rng.fork('hall-debris'), { x0: H.x0 + 0.1, x1: H.x1 - 0.1, z0: H.z0 + 0.3, z1: C.z0, y: F + 0.004, count: 6, mix: { paper: 1.5, grime: 1 }, bits: 3, edge: 0.3 });
  kit.marker('hall', [(H.x0 + H.x1) / 2, F, 1.6], { yaw: 0 });
}

/** Empty apartments: bare cement and drywall, one bare bulb each on a switch, radiators, leftovers. */
function emptyUnits(kit, rng) {
  for (const u of EMPTY_UNITS) {
    const r = rng.fork(u.id);
    const cx = (u.x0 + u.x1) / 2;
    const name = `bulb-${u.id}`;
    kit.tube('wire', [[cx, B.deckUnderside, 5], [cx, 4.4, 5]], 0.006, { sides: 3 });
    kit.cylinder('plasticBlack', [cx, 4.38, 5], 0.02, 0.05, { sides: 6 });
    kit.glow(name, () => kit.sphere('bulbWarm', [cx, 4.33, 5], 0.05, { w: 6, h: 4 }));
    kit.light({ name, pos: [cx, 4.25, 5], color: '#ffd9a0', intensity: 1.5, range: 7, zone: u.id, switchable: true, shadow: true, fill: 1.0, on: u.id !== '1C', layer: `unit-${u.id}` });
    const circuit = kit.lights.filter((l) => l.layerName === `unit-${u.id}`).map((l) => l.name);
    kit.at(u.door + 0.92 + 0.25, F, U.z1, Math.PI, () => lightSwitch(kit, `${u.id}.switch`, 0, circuit, { y: 1.2 }));
    kit.at(cx, F, B.z0 + B.wall, 0, () => radiator(kit, 0, { w: 1.1 }));
    for (const [x0, x1, z, yaw] of [[u.x0, u.x1, B.z0 + B.wall, 0]]) kit.at(x0, F, z, yaw, () => baseboard(kit, x1 - x0, { mat: 'paintWhiteGloss', h: 0.09 }));
    kit.at(u.x0 + 0.1, F, 6.5, -Math.PI / 2, () => outlet(kit, 0, 0.3));
    kit.panel('grime', [cx, F + 0.12, U.z1 - 0.004], [u.x1 - u.x0, 0.24], '-z');
    kit.decal('dustCorner', [u.x0 + 0.35, F + 0.003, U.z1 - 0.35], [0.7, 0.7], '+y', { rot: Math.PI });
    kit.decal('dustCorner', [u.x1 - 0.35, F + 0.003, B.z0 + B.wall + 0.35], [0.7, 0.7], '+y');
    kit.at(u.x1 - 0.2, F, 4.0, -Math.PI / 2, () => kit.decal(r.pick(['peel', 'plasterCrack', 'waterStain']), [0, 1.6 + r.next(), 0.004], [0.5, 0.5], '+z'));
    debris(kit, r.fork('floor'), { x0: u.x0 + 0.3, x1: u.x1 - 0.3, z0: B.z0 + B.wall + 0.3, z1: U.z1 - 0.3, y: F, count: 7, mix: { paper: 2, grime: 1, trash: 0.6 }, bits: 4 });
    cardboardBox(kit, `box-${u.id}-a`, [u.x0 + 0.6 + r.next() * 0.5, F, 9.8 + r.next() * 0.6], [0.5, 0.4, 0.4], r.next() * 1.2);
    if (u.id === '1A') {
      cardboardBox(kit, 'box-1A-b', [u.x0 + 0.62, F + 0.4, 10.05], [0.4, 0.3, 0.32], 0.3, 2);
      bucket(kit, 'bucket-1A', [u.x1 - 0.6, F, 9.5]);
    }
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
  kit.quad('perfHex', [a[0], y + 0.08, a[1]], [b[0], y + 0.08, b[1]], [b[0], y + h - 0.03, b[1]], [a[0], y + h - 0.03, a[1]], { uvs: [[0, 0], [len / 0.25, 0], [len / 0.25, (h - 0.11) / 0.25], [0, (h - 0.11) / 0.25]] });
  kit.solid([[a[0] - (b[1] - a[1]) / len * 0.04, a[1] + (b[0] - a[0]) / len * 0.04], [b[0] - (b[1] - a[1]) / len * 0.04, b[1] + (b[0] - a[0]) / len * 0.04], [b[0] + (b[1] - a[1]) / len * 0.04, b[1] - (b[0] - a[0]) / len * 0.04], [a[0] + (b[1] - a[1]) / len * 0.04, a[1] - (b[0] - a[0]) / len * 0.04]], y, y + h, 'guard');
}

function loft(kit) {
  const M = U.mezz;
  const S = U.stair;
  kit.box('deck', [U.x0, M.top - M.thick, M.z0], [U.x1, M.top - 0.05, U.z1], { seg: 0.8, collide: true });
  kit.box('woodFloor', [U.x0, M.top - 0.05, M.z0], [U.x1, M.top, U.z1], { seg: 0.8, walk: true, uv: 'world', occlude: false });
  kit.box('steelBlack', [U.x0, M.top - 0.4, M.z0 - 0.07], [U.x1, M.top, M.z0], { seg: 0.8 });
  kit.box('steelBlack', [12.86, F, M.z0 - 0.07], [13.0, M.top - 0.4, M.z0 + 0.07], { seg: 9, collide: true, tag: 'column' });
  kit.box('steelBlack', [12.8, F, M.z0 - 0.13], [13.06, F + 0.012, M.z0 + 0.13], { seg: 9, occlude: false });
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
    swingDoor(kit, 'door-bath', { hx: 0.3, hz: 0.05, y: F, width: 0.82, height: 1.95, mat: 'paintWhiteGloss', style: 'panel' });
  });
  kit.box('tileWhite', [U.bath.x0 + 0.05, F, bz], [U.x1, F + 0.005, U.z1], { seg: 9, occlude: false, uv: 'world' });

  // loft trim and services: baseboards, outlets, switches by the door, thermostat, smoke detector
  kit.at(U.x0, F, 7.4, Math.PI / 2, () => baseboard(kit, 7.0, { mat: 'paintWhiteGloss', h: 0.09, gaps: [[2.3, 5.75]] }));
  kit.at(U.x1, F, U.z0 + 0.4, -Math.PI / 2, () => baseboard(kit, 8.0, { mat: 'paintWhiteGloss', h: 0.09, gaps: [[0, 4.4]] }));
  kit.at(U.x0, F, 2.0, Math.PI / 2, () => outlet(kit, 0, 0.3));
  kit.at(U.x0, F, 4.4, Math.PI / 2, () => outlet(kit, 0, 0.62));
  kit.at(U.x1, F, 6.2, -Math.PI / 2, () => outlet(kit, 0, 0.3));
  kit.at(U.x1, F, 4.2, -Math.PI / 2, () => outlet(kit, 0, 0.75));
  kit.at(12.62, F, U.z1, Math.PI, () => wallBox(kit, -0.55, 1.5, { w: 0.09, h: 0.13 }));
  smokeDetector(kit, [12.5, M.top - M.thick, 9.5]);
  kit.marker('bathroom', [13.95, F, 9.7], { yaw: 0 });
  kit.marker('kitchen', [11.8, F, 9.6], { yaw: -Math.PI / 2 });
  kit.marker('living', [12.6, F, 5.0], { yaw: Math.PI });
  kit.marker('unit-door', [11.75, F, 10.7], { yaw: Math.PI });
  kit.marker('spawn_loft', [12.3, F, 7.0], { yaw: Math.PI });
}

export function buildInterior(kit, rng) {
  kit.bucket('interior');
  floors(kit);
  apartmentWalls(kit);
  corridor(kit, rng.fork('corridor'));
  hall(kit, rng.fork('hall'));
  emptyUnits(kit, rng.fork('empty'));
  loft(kit);
}

/**
 * Bake zones: interiors get only a faint ambient floor (the bounce mostly comes from each zone's own
 * lights now, so switching them off darkens the room). Colour = the dominant light's tint.
 */
export const ZONES = [
  { name: 'unit', min: [U.x0, 0, U.z0], max: [U.x1, B.deckUnderside, U.z1], ambient: '#a89a86', floor: 0.012 },
  { name: 'corridor', min: [C.x0, 0, C.z0], max: [C.x1, C.ceiling, C.z1], ambient: '#8b98a6', floor: 0.012 },
  { name: 'hall', min: [H.x0, 0, H.z0], max: [H.x1, H.ceiling, H.z1], ambient: '#b8a690', floor: 0.015 },
  ...EMPTY_UNITS.map((u) => ({ name: u.id, min: [u.x0, 0, U.z0], max: [u.x1, B.deckUnderside, U.z1], ambient: '#9a948a', floor: 0.012 })),
];
