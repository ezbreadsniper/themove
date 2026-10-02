import { STREET, GROUND, BUILDING, HALL } from './layout.js';
import { railing } from '../../kit/arch.js';
import { streetlight, utilityPole, wire, signPost, hydrant, dumpster, trashBag, trashCan, bikeRack, tree } from '../../props/street-props.js';
import { debris } from '../../props/clutter.js';
import { buildingAcross } from './building-across.js';

/**
 * Foundry St. in front of the warehouse, the Mill Ave. T-intersection stub, the lot the building
 * stands in, and the hedge + railing frontage on the far sidewalk.
 */
const R = GROUND.road;

function pavement(kit) {
  const { x0, x1, road, sidewalkN, sidewalkS, mill, lotZ1 } = STREET;
  kit.box('asphalt', [x0, R - 0.3, road[0]], [x1, R, road[1]], { uv: 'world', seg: 2, collide: true, walk: true, tag: 'road' });
  kit.box('asphalt', [mill.x[0], R - 0.3, road[1]], [mill.x[1], R, mill.z1], { uv: 'world', seg: 2, collide: true, walk: true, tag: 'road' });
  const walk = (a, b) => kit.box('sidewalk', [a[0], -0.45, a[1]], [b[0], 0, b[1]], { uv: 'world', seg: 1.8, collide: true, walk: true, tag: 'sidewalk' });
  walk([x0, sidewalkN[0]], [mill.x[0], sidewalkN[1]]);
  walk([mill.x[1], sidewalkN[0]], [x1, sidewalkN[1]]);
  walk([mill.sidewalkW[0], 0], [mill.x[0], mill.z1]);
  walk([mill.sidewalkE[0], 0], [mill.sidewalkE[1], mill.z1]);
  walk([x0, sidewalkS[0]], [x1, sidewalkS[1]]);
  const lot = (a, b) => kit.box('concreteRough', [a[0], -0.45, a[1]], [b[0], -0.01, b[1]], { uv: 'world', seg: 2.5, collide: true, walk: true, tag: 'lot' });
  lot([x0, 0], [BUILDING.x0, lotZ1]);
  lot([BUILDING.x1, 0], [mill.sidewalkW[0], lotZ1]);
  lot([BUILDING.x0, BUILDING.z1], [BUILDING.x1, lotZ1]);
  lot([mill.sidewalkE[1], 0], [x1, lotZ1]);
  lot([x0, sidewalkS[0] - 14], [x1, sidewalkS[0] - 3.3]);
  curbs(kit);
}

/** Curb caps and the concrete gutter pan along every curb line. */
function curbs(kit) {
  const { x0, x1, sidewalkN, sidewalkS, mill } = STREET;
  const capX = (xa, xb, z, side) => {
    kit.box('curb', [xa, -0.16, z - (side > 0 ? 0 : 0.18)], [xb, 0.005, z + (side > 0 ? 0.18 : 0)], { uv: 'world', seg: 1.5, occlude: false });
    kit.box('concreteRough', [xa, R - 0.05, z - (side > 0 ? 0.32 : 0)], [xb, R + 0.006, z + (side > 0 ? 0 : 0.32)], { uv: 'world', seg: 1.5, occlude: false });
  };
  const capZ = (za, zb, x, side) => {
    kit.box('curb', [x - (side > 0 ? 0 : 0.18), -0.16, za], [x + (side > 0 ? 0.18 : 0), 0.005, zb], { uv: 'world', seg: 1.5, occlude: false });
    kit.box('concreteRough', [x - (side > 0 ? 0.32 : 0), R - 0.05, za], [x + (side > 0 ? 0 : 0.32), R + 0.006, zb], { uv: 'world', seg: 1.5, occlude: false });
  };
  capX(x0, mill.x[0], sidewalkN[0], 1);
  capX(mill.x[1], x1, sidewalkN[0], 1);
  capX(x0, x1, sidewalkS[1], -1);
  capZ(sidewalkN[0], mill.z1, mill.x[0], -1);
  capZ(sidewalkN[0], mill.z1, mill.x[1], 1);
}

function markings(kit) {
  const { x0, centerZ, parkingN, parkingS, mill, road } = STREET;
  const y = R + 0.004;
  const stripe = (mat, cx, cz, w, l, rot = 0) => kit.panel(mat, [cx, y, cz], [w, l], '+y', { rot });
  for (let x = x0; x < mill.x[0] - 1; x += 6) {
    const len = Math.min(6, mill.x[0] - 1 - x);
    stripe('paintYellow', x + len / 2, centerZ - 0.1, 0.1, len, Math.PI / 2);
    stripe('paintYellow', x + len / 2, centerZ + 0.1, 0.1, len, Math.PI / 2);
  }
  for (let x = mill.x[1] + 1; x < STREET.x1; x += 6) {
    const len = Math.min(6, STREET.x1 - x);
    stripe('paintYellow', x + len / 2, centerZ, 0.1, len, Math.PI / 2);
  }
  for (const z of [parkingN, parkingS]) {
    for (let x = x0; x < mill.x[0] - 2; x += 6.5) {
      stripe('paintWhite', x + 3, z, 0.1, 6, Math.PI / 2);
      stripe('paintWhite', x, z + (z > centerZ ? 1.1 : -1.1), 0.1, 2.2);
    }
  }
  for (let z = 3; z < mill.z1; z += 7) stripe('paintYellow', (mill.x[0] + mill.x[1]) / 2, z + 2, 0.1, 4);
  for (let x = mill.x[0] + 0.5; x < mill.x[1] - 0.3; x += 0.9) stripe('paintWhite', x + 0.22, -1.6, 0.45, 2.6);
  for (let z = road[0] + 0.5; z < road[1] - 0.3; z += 0.9) stripe('paintWhite', 31.6, z + 0.22, 0.45, 2.4, Math.PI / 2);
  stripe('paintWhite', (mill.x[0] + 38.1) / 2, 0.6, 0.4, 38.1 - mill.x[0], Math.PI / 2);
  kit.panel('curbYellow', [28.6, 0.008, STREET.sidewalkN[0] + 0.09], [4.4, 0.18], '+y');
}

function wear(kit, rng) {
  const y = R + 0.003;
  for (const [x, z, w, l] of [[3.5, -6.2, 2.6, 1.4], [17.5, -9.6, 1.6, 3.2], [36.5, 6, 2.2, 2.2], [-12, -11.2, 3.4, 1.2], [26, -4.6, 1.2, 1.0]]) {
    kit.box('asphaltPatch', [x - w / 2, R - 0.02, z - l / 2], [x + w / 2, R + 0.006, z + l / 2], { uv: 'world', seg: 9, occlude: false });
  }
  for (let i = 0; i < 26; i++) {
    const onMill = i % 4 === 0;
    const x = onMill ? 34 + rng.next() * 8.5 : STREET.x0 + rng.next() * 58;
    const z = onMill ? -2 + rng.next() * 40 : STREET.road[0] + 0.4 + rng.next() * 9;
    kit.panel('crack', [x, y, z], [1.4 + rng.next(), 1.4 + rng.next()], '+y', { rot: rng.next() * 6.28 });
  }
  for (let i = 0; i < 9; i++) kit.panel('oilStain', [STREET.x0 + 4 + rng.next() * 50, y, STREET.parkingN + 1.0 + rng.next() * 0.6], [1.6, 1.2], '+y', { rot: rng.next() * 6.28 });
  for (let i = 0; i < 14; i++) {
    kit.panel(i % 3 ? 'gum' : 'crack', [STREET.x0 + 6 + rng.next() * 52, 0.004, -2.9 + rng.next() * 2.6], [1.2, 1.2], '+y', { rot: rng.next() * 6.28 });
  }
  for (const [x, z] of [[1, -3.3], [26.5, -3.3], [33.4, 9], [12.5, -3.32], [-8, -12.8]]) kit.panel('leafLitter', [x, R + 0.009, z + 0.1], [2.4, 0.7], '+y');
  kit.panel('manhole', [6, y + 0.002, -8.6], [1.2, 1.2], '+y');
  kit.panel('manhole', [38.2, y + 0.002, 12], [1.2, 1.2], '+y');
  for (const [x, z, rot] of [[12.5, -3.36, 0], [-10, -3.36, 0], [33.36, 8.5, Math.PI / 2]]) {
    kit.panel('drainGrate', [x, R + 0.008, z], [0.9, 0.42], '+y', { rot });
    if (rot === 0) kit.panel('plasticBlack', [x, -0.1, -3.2 - 0.003], [0.9, 0.08], '-z');
    else kit.panel('plasticBlack', [33.2 + 0.003, -0.1, z], [0.9, 0.08], '+x');
  }
}

function lighting(kit) {
  kit.at(21, 0, STREET.sidewalkN[0] + 0.35, Math.PI, (k) => streetlight(k, 'streetlight-foundry-n'));
  kit.at(-13, 0, STREET.sidewalkN[0] + 0.35, Math.PI, (k) => streetlight(k, 'streetlight-foundry-w', { flicker: { rate: 0.25, depth: 0.85, seed: 'sodium-w', dropout: 0.2, dim: 0.25, hum: 0.02 } }));
  kit.at(2.5, 0, STREET.sidewalkS[1] - 0.35, 0, (k) => streetlight(k, 'streetlight-foundry-s'));
  kit.at(STREET.mill.x[0] - 0.35, 0, 4.5, Math.PI / 2, (k) => streetlight(k, 'streetlight-mill'));
}

function utilities(kit) {
  const z = STREET.sidewalkS[1] - 0.5;
  const tips = [[-9, false], [17, true], [44, false]].map(([x, transformer]) => {
    let t;
    kit.at(x, 0, z, 0, (k) => { t = utilityPole(k, { transformer }); });
    return t;
  });
  for (let i = 0; i < tips.length - 1; i++) for (let w = 0; w < 4; w++) wire(kit, tips[i][w], tips[i + 1][w], 0.55 + w * 0.04);
  wire(kit, tips[1][3], [19.5, 7.6, -0.02], 0.9, 0.01);
  wire(kit, tips[1][2], [19.3, 7.6, -0.02], 0.95, 0.01);
}

function furniture(kit, rng) {
  const N = STREET.sidewalkN;
  for (const x of [1.2, 26.5]) {
    kit.box('dirt', [x - 0.6, -0.03, N[0] + 0.5], [x + 0.6, -0.005, N[0] + 1.7], { seg: 9, occlude: false });
    kit.box('steelGray', [x - 0.65, -0.006, N[0] + 0.45], [x + 0.65, 0.008, N[0] + 0.5], { seg: 9, occlude: false });
    kit.box('steelGray', [x - 0.65, -0.006, N[0] + 1.7], [x + 0.65, 0.008, N[0] + 1.75], { seg: 9, occlude: false });
    kit.at(x, -0.02, N[0] + 1.1, 0, (k) => tree(k, rng.fork(`tree${x}`)));
  }
  kit.at(STREET.mill.x[0] + 4, -0.02, 22.5, 0, (k) => tree(k, rng.fork('tree-mill-e'), { height: 4.6 }));
  kit.at(29.3, 0, N[0] + 0.45, 0, (k) => hydrant(k));
  kit.at(STREET.mill.x[0] - 0.35, 0, -0.35, 0, (k) => signPost(k, [
    { mat: 'signStop', w: 0.75, h: 0.75, y: 2.2, yaw: 0 },
    { mat: 'signStreetName', w: 0.9, h: 0.17, y: 2.85, yaw: Math.PI / 2 },
    { mat: 'signStreetName2', w: 0.9, h: 0.17, y: 3.05, yaw: 0 },
  ], { height: 3.15 }));
  kit.at(HALL.door.x1 + 1.6, 0, N[0] + 0.35, Math.PI, (k) => signPost(k, [{ mat: 'signNoParking', w: 0.32, h: 0.42, y: 2.1 }], { height: 2.4 }));
  kit.at(-13, 0, N[0] + 0.35, Math.PI, (k) => signPost(k, [{ mat: 'signOneWay', w: 0.75, h: 0.25, y: 2.4, yaw: Math.PI / 2 }], { height: 2.6 }));
  kit.at(31.8, 0, N[0] + 0.6, 0, (k) => trashCan(k));
  kit.at(1.4, 0, -1.05, 0, (k) => bikeRack(k));
  kit.at(BUILDING.x1 + 1.6, 0, 9.5, Math.PI / 2, (k) => dumpster(k));
  for (const [x, z, s] of [[BUILDING.x1 + 0.6, 7.9, 1], [BUILDING.x1 + 1.3, 7.6, 0.85], [BUILDING.x1 + 0.7, 11.3, 0.9]]) kit.at(x, 0, z, rng.next() * 6, (k) => trashBag(k, s));
}

/**
 * Street grit: leaf drifts and wet patches along the gutters, butts and papers where people stand
 * (entry stoop, bike rack, bus-stop corner), trash around the dumpster, weeds at the building base
 * and in sidewalk joints. All rng-driven and non-colliding.
 */
function grit(kit, rng) {
  const N = STREET.sidewalkN;
  const S = STREET.sidewalkS;
  for (let x = STREET.x0 + 2; x < STREET.x1 - 2; x += 3.5 + rng.next() * 3) {
    kit.decal('leafDrift', [x, R + 0.006, N[0] - 0.28], [2.4 + rng.next(), 0.55], '+y', { flip: rng.chance(0.5) });
    if (rng.chance(0.5)) kit.decal('leafDrift', [x + 1.3, R + 0.006, S[1] + 0.28], [2.2, 0.5], '+y', { rot: Math.PI });
  }
  for (const [x, z, s] of [[12.5, -3.9, 1.6], [-10, -3.8, 1.3], [6.5, -8.0, 1.2], [21, -12.4, 1.5], [36.2, 6.5, 1.4], [33.8, 9.2, 1.1], [-3.5, -10.5, 1.0]]) {
    kit.decal('puddle', [x, R + 0.007, z], [s * 1.6, s], '+y', { rot: rng.next() * 0.5 });
  }
  debris(kit, rng.fork('stoop'), { x0: HALL.door.x0 - 1.0, x1: HALL.door.x1 + 1.6, z0: -2.6, z1: -0.7, y: 0.002, count: 6, mix: { butts: 2, paper: 1, trash: 0.6 }, bits: 7 });
  debris(kit, rng.fork('north-walk'), { x0: STREET.x0 + 4, x1: 32, z0: N[0] + 0.3, z1: N[1] - 0.2, y: 0.002, count: 18, mix: { paper: 1, butts: 1, trash: 1.2, leaves: 1.5, grime: 0.8 }, bits: 8 });
  debris(kit, rng.fork('south-walk'), { x0: STREET.x0 + 4, x1: STREET.x1 - 4, z0: S[0] + 0.3, z1: S[1] - 0.3, y: 0.002, count: 12, mix: { leaves: 2, paper: 1, trash: 0.5 } });
  debris(kit, rng.fork('dumpster'), { x0: BUILDING.x1 + 0.2, x1: BUILDING.x1 + 3.2, z0: 6.8, z1: 12.4, y: 0, count: 8, mix: { trash: 2, paper: 1, wet: 1, grime: 1 }, bits: 6 });
  debris(kit, rng.fork('road'), { x0: STREET.x0 + 2, x1: 32, z0: STREET.road[0] + 0.5, z1: STREET.road[1] - 0.5, y: R + 0.004, count: 10, mix: { paper: 1, trash: 1, wet: 0.8 } });
  // weeds at the facade base and in sidewalk joints (upright cut-out cards)
  const weed = (x, z, s) => {
    for (const yaw of [0.3, 0.3 + Math.PI / 2]) kit.at(x, 0, z, yaw, () => kit.decal('weeds', [0, s * 0.45, 0], [s, s * 0.9], '+z', { cut: true }));
  };
  for (let x = BUILDING.x0 + 0.7; x < BUILDING.x1; x += 1.4 + rng.next() * 2.2) if (rng.chance(0.6)) weed(x, -0.2, 0.3 + rng.next() * 0.2);
  for (let i = 0; i < 14; i++) weed(STREET.x0 + 3 + rng.next() * 52, N[0] + 0.25 + rng.next() * 2.7, 0.16 + rng.next() * 0.12);
  for (let i = 0; i < 10; i++) weed(STREET.x0 + 3 + rng.next() * 52, S[1] - 0.2, 0.25 + rng.next() * 0.2);
  for (let i = 0; i < 18; i++) kit.decal('weedTuft', [STREET.x0 + 3 + rng.next() * 52, 0.004, rng.chance(0.5) ? N[0] + 0.2 + rng.next() * 2.8 : S[0] + 0.2 + rng.next() * 2.6], [0.3, 0.3], '+y', { rot: rng.next() * 6 });
  // stickers / flyers on poles and the utility boxes
  kit.decal('stickerSkate', [21 - 0.11, 1.5, STREET.sidewalkN[0] + 0.35], [0.1, 0.1], '-x');
  kit.decal('flyerRent', [-13.11, 1.45, STREET.sidewalkN[0] + 0.35], [0.22, 0.22], '-x', { rot: 0.08 });
  kit.decal('stickerEye', [2.5 + 0.115, 1.7, STREET.sidewalkS[1] - 0.35], [0.1, 0.1], '+x');
}

/** NPC placement markers for the behaviour workstream (contracts §2). */
function npcMarkers(kit) {
  const midDoor = (HALL.door.x0 + HALL.door.x1) / 2;
  kit.marker('npc_stoop_1', [midDoor + 0.95, 0, -0.95], { yaw: -Math.PI / 2 - 0.6, role: 'smoker' });
  kit.marker('npc_street_1', [2.2, 0, -1.55], { yaw: Math.PI * 0.75, role: 'loiter' });
  kit.marker('npc_street_2', [9.5, 0, -14.6], { yaw: Math.PI / 2, role: 'pedestrian' });
  kit.marker('npc_street_3', [31.5, 0, -1.6], { yaw: -Math.PI / 2, role: 'waiting' });
}

/** Far-side frontage: picket railing and the clipped hedge behind it (seen from the loft window). */
function southFrontage(kit, rng) {
  const z = STREET.sidewalkS[0] + 0.15;
  railing(kit, [[STREET.x0, z], [STREET.x1, z]], 0, { height: 1.05, mat: 'steelGray', picket: 0.13, postEvery: 2.0 });
  for (let x = STREET.x0; x < STREET.x1; x += 2.2) {
    const h = 1.0 + rng.next() * 0.25;
    kit.box('hedge', [x, 0, z - 1.05], [x + 2.3, h, z - 0.12], { seg: 9, uv: 'world', collide: true });
    kit.box('hedge', [x + 0.2, h, z - 0.95], [x + 2.1, h + 0.12, z - 0.25], { seg: 9, uv: 'world', occlude: false });
  }
  kit.box('dirt', [STREET.x0, -0.45, z - 3.3], [STREET.x1, 0, z - 1.05], { uv: 'world', seg: 3, walk: true, collide: true });
}

export function buildStreet(kit, rng) {
  kit.bucket('street');
  pavement(kit);
  markings(kit);
  wear(kit, rng.fork('wear'));
  kit.bucket('street-props');
  lighting(kit);
  utilities(kit);
  furniture(kit, rng.fork('furniture'));
  southFrontage(kit, rng.fork('south'));
  grit(kit, rng.fork('grit'));
  npcMarkers(kit);
  kit.bucket('across');
  buildingAcross(kit, rng.fork('across'));
}
