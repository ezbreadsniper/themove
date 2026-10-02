import { UNIT as U, GROUND } from './layout.js';
import {
  sofaSection, pillow, throwBlanket, coffeeTable, rug, mediaConsole, wallTV, floorLamp, orbPendant, trackLight, spiralDuct,
  kitchenRun, toilet, vanity, shower, bed, clothesRack, cubeTable, tolixStool, shellChair, artFrame, leaningMirror, flightCase,
  metalCart, speaker, basketball, bookStack, bookRow, broom,
} from '../../props/interior-props.js';
import { spiderPlant, snakePlant, palm, pothos, hangingVines } from '../../props/plants.js';

/**
 * Loft 1B furnished from the reference photos. Facing the window (-Z): TV wall on the left (x = 10.1),
 * art + spiral duct on the right (x = 14.9), black tufted L-sofa against the painted block wall under
 * the window, Persian rug and black gloss table, maple cube + red stool with palm at the end of the
 * sofa, spiral stair and mezzanine at the back with the kitchen and bath beneath.
 */
const F = GROUND.floor;
const FACE_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;

function livingRoom(kit, rng) {
  kit.at(10.95, F, U.z0 + 0.03, 0, () => sofaSection(kit, 3.92, { armLeft: true, armRight: false }));
  kit.at(U.x1 - 0.03, F, U.z0 + 0.95, FACE_NEG_X, () => sofaSection(kit, 3.05, { armLeft: false, armRight: true }));
  const pillows = ['rainbow', 'rainbow', 'kilim', 'stripeBW', 'sage', 'rainbow'];
  pillows.forEach((mat, i) => pillow(kit, mat, [11.45 + i * 0.5, F + 0.62, U.z0 + 0.32], { yaw: (rng.next() - 0.5) * 0.3 }));
  pillow(kit, 'kilim', [U.x1 - 0.35, F + 0.62, 1.7], { yaw: FACE_NEG_X, tilt: 0.3 });
  pillow(kit, 'mustard', [U.x1 - 0.35, F + 0.62, 4.0], { yaw: FACE_NEG_X - 0.3, tilt: 0.4 });
  throwBlanket(kit, 'knit', [11.25, F + 0.47, 0.95], 0.2);
  throwBlanket(kit, 'sage', [11.6, F + 0.47, 1.05], -0.3);
  throwBlanket(kit, 'mustard', [U.x1 - 0.5, F + 0.47, 3.75], 1.2);
  kit.at(12.45, F, 2.95, 0, () => rug(kit, 2.5, 3.3));
  kit.at(12.55, F + 0.012, 2.7, 0, () => coffeeTable(kit));
  kit.box('magazines', [12.35, F + 0.393, 2.35], [12.75, F + 0.41, 2.75], { seg: 9, uv: 'fit', occlude: false });
  kit.cylinder('maple', [12.75, F + 0.39, 3.05], 0.05, 0.11, { sides: 8 });
  kit.at(11.75, F + 0.012, 4.35, Math.PI, () => shellChair(kit));
  pillow(kit, 'knit', [11.75, F + 0.55, 4.4], { yaw: Math.PI, tilt: 1.3, w: 0.42, h: 0.4, t: 0.1 });
  for (const [x, z] of [[12.95, 4.25], [13.1, 4.3]]) kit.box('plasticBlack', [x - 0.05, F + 0.012, z - 0.14], [x + 0.05, F + 0.09, z + 0.14], { seg: 9, occlude: false });
  kit.at(12.35, F + 1.6, U.z0 + 0.005, 0, () => kit.panel('worldIsYours', [0, 0, 0], [0.8, 0.3], '+z'));
  kit.light({ name: 'neon-blimp', pos: [12.35, F + 1.6, U.z0 + 0.3], color: '#d8ecff', intensity: 0.5, range: 2 });
  kit.at(10.8, F, U.z0 + 0.05, -0.15, () => broom(kit));
  kit.at(10.5, F, 0.8, 0.9, () => floorLamp(kit, 'floor-lamp'));
}

function tvWall(kit, rng) {
  kit.at(U.x0, F, 4.85, FACE_X, () => mediaConsole(kit, 3));
  kit.at(U.x0, F + 1.78, 3.65, FACE_X, () => wallTV(kit));
  const top = F + 0.48;
  kit.box('plasticWhite', [10.3, top, 4.42], [10.4, top + 0.39, 4.62], { seg: 9, occlude: false });
  kit.box('plasticBlack', [10.32, top, 4.2], [10.38, top + 0.3, 4.36], { seg: 9, occlude: false });
  kit.box('plasticBlack', [10.25, top, 3.55], [10.45, top + 0.1, 3.85], { seg: 9, occlude: false });
  kit.box('plasticBlack', [10.28, top, 3.25], [10.42, top + 0.08, 3.45], { seg: 9, occlude: false });
  kit.cylinder('chrome', [10.35, top, 2.95], 0.045, 0.06, { sides: 8 });
  kit.cylinder('lavaLamp', [10.35, top + 0.06, 2.95], 0.035, 0.24, { radiusTop: 0.02, sides: 8 });
  kit.light({ name: 'lava-lamp', pos: [10.45, top + 0.2, 2.95], color: '#ff5a6a', intensity: 0.35, range: 1.6 });
  kit.at(10.35, top, 2.65, 0, () => snakePlant(kit));
  kit.at(10.35, top, 4.75, 0, () => pothos(kit, { trail: 0.5 }));
  kit.at(U.x0 + 0.35, F, 4.98, 0, () => speaker(kit));
  kit.at(U.x0 + 0.02, F, 2.3, FACE_X, () => metalCart(kit, 0.62, 0.45, 1.0));
  kit.at(10.35, F + 1.0, 2.0, 0, () => spiderPlant(kit, { r: 0.12, size: 0.5 }));
  kit.box('electricPanel', [10.4, F + 1.0, 1.72], [10.48, F + 1.15, 1.8], { seg: 9, occlude: false });
  kit.at(10.32, F + 0.55, 1.95, 0.3, () => bookStack(kit, 3, rng));
  kit.at(U.x0, F + 2.45, 1.95, FACE_X, () => artFrame(kit, 'artHands', 0.95, 1.15));
  kit.at(U.x0, F, 5.75, FACE_X, () => leaningMirror(kit));
  kit.at(10.4, F, 5.25, FACE_X, () => flightCase(kit));
  basketball(kit, [10.75, F + 0.12, 5.55]);
  kit.at(10.75, F, 6.05, 0, () => kit.lathe('terracotta', [0, 0, 0], [[0.13, 0], [0.18, 0.2], [0.2, 0.24], [0.17, 0.24]], { sides: 10 }));
}

function rightWall(kit) {
  kit.at(U.x1, F + 2.55, 3.0, FACE_NEG_X, () => artFrame(kit, 'artGun', 1.3, 0.95));
  kit.at(U.x1, F + 1.9, 6.7, FACE_NEG_X, () => artFrame(kit, 'artAbstract', 0.75, 0.9, { depth: 0.02 }));
  kit.at(U.x1 - 0.57, F, 4.45, 0, () => cubeTable(kit, 0.55, 0.92, 0.62));
  kit.at(U.x1 - 0.22, F + 0.62, 5.15, 0, () => spiderPlant(kit, { r: 0.12, size: 0.55, mat: 'ceramic' }));
  kit.at(U.x1 - 0.02, F + 0.62, 4.5, FACE_NEG_X, () => bookRow(kit, 0.45));
  kit.cylinder('chrome', [U.x1 - 0.42, F + 0.62, 4.75], 0.04, 0.24, { sides: 8 });
  kit.box('ceramic', [U.x1 - 0.5, F + 0.62, 4.95], [U.x1 - 0.3, F + 0.64, 5.15], { seg: 9, occlude: false });
  kit.at(U.x1 - 0.42, F, 5.95, 0, () => tolixStool(kit));
  kit.at(U.x1 - 0.42, F + 0.76, 5.95, 0, () => palm(kit));
  kit.at(U.x1 - 0.35, F, 6.75, 0, () => spiderPlant(kit, { r: 0.16, size: 0.6 }));
  const y = 5.55;
  spiralDuct(kit, [[U.x1 - 0.42, y, U.z1 - 0.05], [U.x1 - 0.42, y, 2.3]], 0.28, {
    hangers: [3.5, 6.0, 8.5, 10.8].map((z) => [U.x1 - 0.42, U.ceiling, z, y + 0.28]),
  });
  kit.box('steelGray', [U.x1 - 0.72, y - 0.2, 2.3], [U.x1 - 0.12, y + 0.05, 2.5], { seg: 9, occlude: false });
  kit.panel('plasticBlack', [U.x1 - 0.42, y - 0.205, 2.4], [0.5, 0.12], '-y');
}

function ceiling(kit) {
  for (const z of [1.3, 3.1, 4.9, 6.7, 8.5, 10.3]) {
    kit.box('steelBlack', [U.x0, U.ceiling - 0.07, z - 0.04], [U.x1, U.ceiling - 0.02, z + 0.04], { seg: 9, occlude: false });
    kit.box('steelBlack', [U.x0, U.ceiling - 0.45, z - 0.035], [U.x1, U.ceiling - 0.41, z + 0.035], { seg: 9, occlude: false });
    for (let x = U.x0 + 0.2; x < U.x1 - 0.2; x += 0.4) kit.tube('steelBlack', [[x, U.ceiling - 0.07, z], [x + 0.2, U.ceiling - 0.43, z], [x + 0.4, U.ceiling - 0.07, z]], 0.012, { sides: 3 });
  }
  kit.tube('galvanized', [[U.x0 + 0.3, U.ceiling - 0.12, U.z1], [U.x0 + 0.3, U.ceiling - 0.12, 1.2], [13.8, U.ceiling - 0.12, 1.2]], 0.02, { sides: 4 });
  kit.at(12.5, U.ceiling - 0.05, 0.95, 0, () => trackLight(kit, 'track-window', 4.0, 5, [0, -1, 0.7]));
  kit.at(12.5, U.ceiling - 0.05, 4.4, FACE_X, () => trackLight(kit, 'track-centre', 4.6, 4, [0, -1, 0.45]));
  kit.at(12.1, U.ceiling, 2.2, 0, () => orbPendant(kit, 'orb-high', { drop: 2.45, r: 0.3 }));
  kit.at(12.85, U.ceiling, 3.0, 0, () => orbPendant(kit, 'orb-low', { drop: 3.3, r: 0.34 }));
}

/** Pothos trailing down the spiral stair's outer rail (reference IMG_0059 / 523CF3C2). */
function stairVines(kit) {
  const S = U.stair;
  const rise = (U.mezz.top - F) / (S.treads + 1);
  const step = S.sweep / S.treads;
  const pts = [];
  for (const deg of [-120, -145, -165, -185, -205, -225, -245]) {
    const a = (deg * Math.PI) / 180;
    const s = -a / step;
    pts.push([S.cx + Math.cos(a) * (S.r - 0.02), F + rise * (s + 1) + 0.95, S.cz + Math.sin(a) * (S.r - 0.02), -a]);
  }
  hangingVines(kit, pts, 0.55);
}

function kitchen(kit) {
  kit.at(U.x0, F, 11.35, FACE_X, () => kitchenRun(kit, 2.85, { fridge: false }));
  kit.box('stainless', [U.x0, F, 7.72], [U.x0 + 0.72, F + 1.82, 8.46], { seg: 9, collide: true, tag: 'fridge' });
  kit.box('chrome', [U.x0 + 0.72, F + 0.4, 8.35], [U.x0 + 0.75, F + 1.6, 8.38], { seg: 9, occlude: false });
  kit.box('plasticBlack', [U.x0 + 0.72, F + 1.16, 7.73], [U.x0 + 0.725, F + 1.18, 8.45], { seg: 9, occlude: false });
  kit.box('stainless', [U.x0 + 0.05, F + 1.86, 7.8], [U.x0 + 0.55, F + 2.15, 8.4], { seg: 9, occlude: false });
  const top = F + 0.91;
  kit.sphere('yellowPaint', [10.45, top + 0.05, 9.9], 0.06, { w: 6, h: 4, scale: [2, 0.7, 1] });
  kit.cylinder('stainless', [10.4, top, 10.45], 0.08, 0.2, { sides: 8 });
  kit.box('woodDark', [10.25, top, 8.7], [10.6, top + 0.02, 9.1], { seg: 9, occlude: false });
  for (const z of [8.3, 9.7]) {
    kit.panel('bulbWarm', [11.4, U.mezz.top - U.mezz.thick - 0.002, z], [0.14, 0.14], '-y');
    kit.light({ name: `kitchen-can-${z}`, pos: [11.4, U.mezz.top - U.mezz.thick - 0.2, z], color: '#ffd9a8', intensity: 1.6, range: 3.5, dir: [0, -1, 0], cone: 0.25, zone: 'unit' });
  }
  kit.at(11.0, F + 1.55, U.z1, Math.PI, () => {
    for (const x of [-0.25, 0, 0.25]) kit.cylinder('chrome', [x, 0, -0.02], 0.015, 0.06, { sides: 4 });
    kit.box('carBlue', [-0.32, -0.75, -0.12], [-0.12, 0.0, -0.04], { seg: 9, occlude: false });
  });
}

function bathroom(kit) {
  kit.at(14.3, F, U.z1, Math.PI, () => toilet(kit));
  kit.at(U.x1, F, 9.75, FACE_NEG_X, () => vanity(kit));
  kit.at(U.bath.x0 + 0.05, F, U.z1 - 0.95, 0, () => shower(kit));
  kit.panel('bulbWarm', [13.9, U.mezz.top - U.mezz.thick - 0.002, 10.1], [0.25, 0.25], '-y');
  kit.light({ name: 'bath', pos: [13.9, 2.5, 10.1], color: '#fff0d8', intensity: 1.8, range: 3.5, zone: 'unit' });
  kit.box('knit', [U.x1 - 0.05, F + 1.0, 10.5], [U.x1, F + 1.5, 10.9], { seg: 9, occlude: false });
}

function mezzanine(kit, rng) {
  const y = U.mezz.top;
  kit.at(12.6, y, U.z1 - 0.05, Math.PI, () => bed(kit));
  kit.box('woodDark', [11.15, y, 10.9], [11.6, y + 0.5, 11.35], { seg: 9, collide: true });
  kit.cylinder('brass', [11.38, y + 0.5, 11.12], 0.06, 0.32, { sides: 6 });
  kit.sphere('bulbWarm', [11.38, y + 0.86, 11.12], 0.09, { w: 6, h: 4 });
  kit.light({ name: 'mezz-lamp', pos: [11.38, y + 0.9, 11.0], color: '#ffcf8f', intensity: 1.4, range: 4, zone: 'unit' });
  kit.at(U.x1 - 0.32, y, 9.5, FACE_NEG_X, () => clothesRack(kit, 1.2, rng.fork('rack')));
  kit.at(12.6, y, 9.0, 0, () => kit.box('rug', [-0.9, 0, -0.6], [0.9, 0.01, 0.6], { seg: 9, uv: 'fit', occlude: false }));
  kit.box('carBlue', [10.55, y + 0.62, U.mezz.z0 - 0.08], [11.0, y + 1.1, U.mezz.z0 + 0.02], { seg: 9, occlude: false });
  kit.box('carBlue', [10.6, y + 1.05, U.mezz.z0 - 0.02], [10.95, y + 1.12, U.mezz.z0 + 0.25], { seg: 9, occlude: false });
  kit.at(14.4, y, 8.0, 0, () => spiderPlant(kit, { r: 0.13 }));
  kit.box('plasticBlack', [10.15, y, 9.2], [10.55, y + 0.75, 10.2], { seg: 9, collide: true });
}

export function dressLoft(kit, rng) {
  kit.bucket('clutter');
  livingRoom(kit, rng.fork('living'));
  tvWall(kit, rng.fork('tv'));
  rightWall(kit);
  ceiling(kit);
  stairVines(kit);
  kitchen(kit);
  bathroom(kit);
  mezzanine(kit, rng.fork('mezz'));
}
