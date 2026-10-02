import { STREET, GROUND, BUILDING, HALL } from './layout.js';
import { railing } from '../../kit/arch.js';
import { streetlight, utilityPole, wire, signPost, hydrant, dumpster, trashBag, trashCan, bikeRack, tree, car } from '../../props/street-props.js';

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
  kit.at(-13, 0, STREET.sidewalkN[0] + 0.35, Math.PI, (k) => streetlight(k, 'streetlight-foundry-w'));
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
  kit.at(-2.4, R, STREET.parkingN + 1.15, Math.PI / 2, (k) => car(k, 'carBlue'));
  kit.at(12.8, R, STREET.parkingS - 1.15, -Math.PI / 2, (k) => car(k, 'carWhite'));
  kit.at(STREET.mill.x[0] + 1.25, R, 16.9, Math.PI, (k) => car(k, 'carWhite', 'van'));
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
}
