import { UNIT as U, GROUND } from './layout.js';
import {
  sofaSection, throwBlanket, coffeeTable, tableTop, rug, mediaConsole, consoleDressing, lavaLamp, wallTV, floorLamp, orbPendant, trackLight, spiralDuct, register,
  kitchenRun, fridge, toilet, vanity, shower, towel, bed, nightstand, tableLamp, clothesRack, cubeTable, tolixStool, shellChair, artFrame, leaningMirror, flightCase,
  metalCart, speaker, basketball, bookStack, bookRow, broom, waterBottle,
} from '../../props/interior-props.js';
import { lightSwitch, sprinklers, conduit, smokeDetector } from '../../props/fixtures.js';
import { trashBin, bottle, cardboardBox, kitchenChair } from '../../props/clutter.js';
import { spiderPlant, snakePlant, palm, pothos, hangingVines } from '../../props/plants.js';
import { slab, softBox, front } from '../../kit/shapes.js';

/**
 * Loft 1B furnished from the reference photos (docs/world/pass03.md lists them by file name).
 * Facing the window (-Z): TV wall on the left (x = 10.1), art + spiral duct on the right
 * (x = 14.9), black tufted L-sofa against the painted block knee wall under the window, Persian rug
 * and black marble table, maple cube + red stool with palm at the end of the sofa, spiral stair and
 * mezzanine at the back with the kitchen and bath beneath.
 *
 * Lighting circuits: 'loft-track' (both track rails), 'orb-high' / 'orb-low' (pendants, shadowed),
 * 'floor-lamp', 'tv-glow', 'lava-lamp', 'neon-sign', 'kitchen' (cans + under-cabinet), 'bath',
 * 'mezz-lamp'. Switches by the door drive them; lamps and the TV have their own interactables.
 */
const F = GROUND.floor;
const FACE_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;

function livingRoom(kit, rng) {
  kit.at(10.95, F, U.z0 + 0.03, 0, () => {
    sofaSection(kit, 3.92, { armLeft: true, armRight: false, cornerRight: true, id: 'loft.sofa.a', seats: 4 });
    throwBlanket(kit, 'knit', { x: 3.0, front: 0.91 });
  });
  kit.at(U.x1 - 0.03, F, U.z0 + 0.95, FACE_NEG_X, () => sofaSection(kit, 3.05, { armLeft: false, armRight: true, id: 'loft.sofa.b', seats: 3 }));
  kit.at(12.45, F, 2.95, 0, () => rug(kit, 2.5, 3.3));
  kit.at(12.55, F + 0.012, 2.7, 0, () => coffeeTable(kit));
  kit.at(12.55, F + 0.392, 2.7, 0, () => tableTop(kit, rng.fork('table')));
  kit.interactable({ id: 'loft.item.magazine', kind: 'item', pos: [12.43, F + 0.4, 2.52], radius: 0.9, prompt: 'Read', data: { item: 'magazine' } });
  kit.interactable({ id: 'loft.item.phone', kind: 'item', pos: [12.8, F + 0.4, 3.05], radius: 0.9, prompt: 'Take', data: { item: 'phone' } });
  kit.at(12.8, F + 0.392, 3.05, 0.4, () => slab(kit, 'plasticBlack', [-0.038, 0, -0.075], [0.038, 0.009, 0.075], { r: 0.003, occlude: false }));
  kit.at(11.75, F + 0.012, 4.35, Math.PI + 0.25, () => shellChair(kit, { id: 'loft.chair' }));
  for (const [x, z, r] of [[12.95, 4.2, 0.2], [13.12, 4.28, -0.1]]) kit.at(x, F + 0.012, z, r, () => softBox(kit, 'plasticBlack', [-0.05, 0, -0.14], [0.05, 0.08, 0.14], { r: 0.025, occlude: false }));
  kit.at(12.35, F + 1.62, U.z0 + 0.005, 0, () => {
    kit.glow('neon-sign', () => kit.panel('worldIsYours', [0, 0, 0.02], [0.8, 0.3], '+z'));
    kit.box('steelGray', [-0.38, -0.12, 0], [0.38, 0.12, 0.018], { seg: 9, occlude: false });
  });
  kit.light({ name: 'neon-sign', pos: [12.35, F + 1.6, U.z0 + 0.3], color: '#cfe4ff', intensity: 0.45, range: 2.2, switchable: true, zone: 'unit', fill: 0.3 });
  kit.at(10.8, F, U.z0 + 0.05, -0.15, () => broom(kit));
  kit.at(10.5, F, 0.8, 0.9, () => floorLamp(kit, 'floor-lamp', { id: 'loft.lamp.floor' }));
  bottle(kit, 'bottle-sofa', [13.35, F + 0.012, 1.62], { mat: 'bottleBrown', h: 0.24, r: 0.032 });
  for (const [x, z, r] of [[12.0, 4.75, 0.3], [12.12, 4.8, 0.15]]) kit.at(x, F + 0.012, z, r, () => softBox(kit, 'plasticBlack', [-0.045, 0, -0.13], [0.045, 0.09, 0.13], { r: 0.03, occlude: false }));
}

function tvWall(kit, rng) {
  kit.at(U.x0, F, 4.85, FACE_X, () => {
    mediaConsole(kit, 3);
    kit.at(0, 0.48, 0, 0, () => consoleDressing(kit));
  });
  kit.at(U.x0, F + 1.78, 3.65, FACE_X, () => wallTV(kit, { id: 'loft.tv' }));
  const top = F + 0.48;
  kit.at(10.35, top, 2.95, 0, () => lavaLamp(kit, 'lava-lamp'));
  kit.at(10.35, top, 2.68, 0, () => snakePlant(kit));
  kit.at(10.33, top, 4.68, 0, () => pothos(kit, { trail: 0.55 }));
  kit.at(U.x0 + 0.35, F, 4.98, 0, () => speaker(kit));
  kit.at(U.x0 + 0.02, F, 2.3, FACE_X, () => metalCart(kit, 0.62, 0.45, 1.0, { dress: true }));
  kit.interactable({ id: 'loft.item.camera', kind: 'item', pos: [10.42, F + 1.06, 1.85], radius: 0.9, prompt: 'Take', data: { item: 'camcorder' } });
  kit.at(U.x0, F + 2.4, 1.85, FACE_X, () => artFrame(kit, 'artPhoto', 0.8, 1.05));
  kit.at(U.x0, F, 5.75, FACE_X, () => leaningMirror(kit));
  kit.at(10.4, F, 5.25, FACE_X, () => flightCase(kit));
  basketball(kit, [10.75, F + 0.12, 5.55]);
  kit.at(10.75, F, 6.05, 0, () => kit.lathe('terracotta', [0, 0, 0], [[0.13, 0], [0.18, 0.2], [0.2, 0.24], [0.17, 0.24]], { sides: 10 }));
}

function rightWall(kit) {
  kit.at(U.x1, F + 2.55, 3.0, FACE_NEG_X, () => artFrame(kit, 'artPop', 1.3, 0.98));
  kit.at(U.x1, F + 1.9, 6.7, FACE_NEG_X, () => artFrame(kit, 'artAbstract', 0.75, 0.9, { matWidth: 0.0 }));
  kit.at(U.x1 - 0.57, F, 4.45, 0, () => cubeTable(kit, 0.55, 0.92, 0.62));
  kit.at(U.x1 - 0.22, F + 0.62, 5.15, 0, () => spiderPlant(kit, { r: 0.12, size: 0.55, mat: 'ceramic' }));
  kit.at(U.x1 - 0.02, F + 0.62, 4.5, FACE_NEG_X, () => bookRow(kit, 0.45));
  waterBottle(kit, [U.x1 - 0.42, F + 0.62, 4.75]);
  kit.box('ceramic', [U.x1 - 0.5, F + 0.62, 4.95], [U.x1 - 0.3, F + 0.64, 5.15], { seg: 9, occlude: false });
  kit.at(U.x1 - 0.4, F + 0.62, 4.95, 0.3, () => kit.box('chrome', [-0.03, 0, -0.012], [0.03, 0.006, 0.012], { seg: 9, occlude: false }));
  kit.interactable({ id: 'loft.item.keys', kind: 'item', pos: [U.x1 - 0.4, F + 0.63, 4.95], radius: 0.9, prompt: 'Take', data: { item: 'keys' } });
  kit.at(U.x1 - 0.42, F, 5.95, 0, () => tolixStool(kit));
  kit.at(U.x1 - 0.42, F + 0.76, 5.95, 0, () => palm(kit));
  kit.at(U.x1 - 0.35, F, 6.75, 0, () => spiderPlant(kit, { r: 0.16, size: 0.6 }));
  const y = 5.55;
  spiralDuct(kit, [[U.x1 - 0.42, y, U.z1 - 0.05], [U.x1 - 0.42, y, 2.3]], 0.28, {
    hangers: [3.5, 6.0, 8.5, 10.8].map((z) => [U.x1 - 0.42, U.ceiling, z, y + 0.28]),
  });
  kit.at(U.x1 - 0.42, y - 0.2, 2.42, FACE_X, () => register(kit, 0.5, 0.22, 0.12));
}

function ceiling(kit) {
  for (const z of [1.3, 3.1, 4.9, 6.7, 8.5, 10.3]) {
    kit.box('steelBlack', [U.x0, U.ceiling - 0.07, z - 0.04], [U.x1, U.ceiling - 0.02, z + 0.04], { seg: 9, occlude: false });
    kit.box('steelBlack', [U.x0, U.ceiling - 0.45, z - 0.035], [U.x1, U.ceiling - 0.41, z + 0.035], { seg: 9, occlude: false });
    for (let x = U.x0 + 0.2; x < U.x1 - 0.2; x += 0.4) kit.tube('steelBlack', [[x, U.ceiling - 0.07, z], [x + 0.2, U.ceiling - 0.43, z], [x + 0.4, U.ceiling - 0.07, z]], 0.012, { sides: 3 });
  }
  conduit(kit, [[U.x0 + 0.3, U.ceiling - 0.12, U.z1], [U.x0 + 0.3, U.ceiling - 0.12, 1.2], [13.8, U.ceiling - 0.12, 1.2]], { boxes: true });
  conduit(kit, [[12.5, U.ceiling - 0.05, 4.4], [12.5, U.ceiling - 0.2, 4.4]], { boxes: false });
  sprinklers(kit, [[11.0, U.ceiling - 0.6, U.z1 - 0.2], [11.0, U.ceiling - 0.6, 1.6]], { every: 3.0, drop: 0.1, mat: 'steelBlack' });
  smokeDetector(kit, [12.0, U.ceiling, 5.8]);
  kit.at(12.5, U.ceiling - 0.05, 0.95, 0, () => trackLight(kit, 'track-window', 4.0, 5, [0, -1, 0.7], { layer: 'loft-track' }));
  kit.at(12.5, U.ceiling - 0.05, 4.4, FACE_X, () => trackLight(kit, 'track-centre', 4.6, 4, [0, -1, 0.45], { layer: 'loft-track' }));
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
  kit.at(U.x0, F, 11.35, FACE_X, () => kitchenRun(kit, 2.85, { fridge: false, layer: 'kitchen' }));
  kit.light({ name: 'kitchen-under', pos: [U.x0 + 0.3, F + 1.38, 10.0], color: '#ffd8a0', intensity: 0.7, range: 2.2, dir: [0, -1, 0], cone: 0.0, zone: 'unit', layer: 'kitchen', fill: 0.4 });
  kit.at(U.x0, F, 8.09, FACE_X, () => fridge(kit));
  kit.interactable({ id: 'loft.fridge', kind: 'container', pos: [U.x0 + 1.0, F + 1.0, 8.09], yaw: -Math.PI / 2, radius: 1.1, prompt: 'Open', data: { contents: ['beer', 'leftovers', 'hot sauce'] } });
  const top = F + 0.91;
  kit.sphere('yellowPaint', [10.45, top + 0.05, 9.9], 0.06, { w: 6, h: 4, scale: [2, 0.7, 1] });
  kit.lathe('stainless', [10.4, top, 10.45], [[0.001, 0], [0.085, 0], [0.09, 0.14], [0.06, 0.2], [0.001, 0.21]], { sides: 8 });
  kit.tube('plasticBlack', [[10.4, top + 0.17, 10.37], [10.4, top + 0.2, 10.31], [10.4, top + 0.08, 10.31]], 0.01, { sides: 3 });
  kit.box('woodDark', [10.25, top, 8.7], [10.6, top + 0.02, 9.1], { seg: 9, occlude: false });
  kit.at(10.2, top, 9.35, 0, () => {
    kit.box('woodDark', [-0.06, 0, -0.04], [0.06, 0.2, 0.04], { seg: 9, occlude: false });
    for (const z of [-0.02, 0.0, 0.02]) kit.box('plasticBlack', [-0.01, 0.2, z - 0.004], [0.01, 0.27, z + 0.004], { seg: 9, occlude: false });
  });
  kit.at(10.2, top + 0.3, 10.9, 0, () => {
    kit.cylinder('chrome', [0, 0, 0], 0.01, 0.3, { sides: 4 });
    kit.cylinder('paper', [0, 0.02, 0], 0.055, 0.26, { sides: 8 });
  });
  kit.cylinder('bottleGreen', [10.32, top, 10.05], 0.03, 0.2, { sides: 6 });
  for (const z of [8.3, 9.7]) {
    kit.cylinder('steelBlack', [11.4, U.mezz.top - U.mezz.thick - 0.03, z], 0.075, 0.03, { sides: 10 });
    kit.glow('kitchen', () => kit.panel('bulbWarm', [11.4, U.mezz.top - U.mezz.thick - 0.032, z], [0.11, 0.11], '-y'));
    kit.light({ name: `kitchen-can-${z}`, pos: [11.4, U.mezz.top - U.mezz.thick - 0.2, z], color: '#ffd9a8', intensity: 1.5, range: 3.5, dir: [0, -1, 0], cone: 0.25, zone: 'unit', layer: 'kitchen', fill: 0.7 });
  }
  trashBin(kit, 'bin-kitchen', [10.95, F, 8.0], { r: 0.15, h: 0.5 });
  kitchenChair(kit, 'chair-kitchen', [12.45, F, 8.25], -Math.PI / 2 - 0.25, { id: 'loft.kitchen-chair' });
}

function bathroom(kit) {
  kit.at(14.3, F, U.z1, Math.PI, () => toilet(kit));
  kit.at(U.x1, F, 9.75, FACE_NEG_X, () => vanity(kit));
  kit.at(U.bath.x0 + 0.05, F, U.z1 - 0.95, 0, () => shower(kit));
  kit.at(U.x1, F + 1.2, 10.75, FACE_NEG_X, () => towel(kit, 'knit', 0.4));
  kit.at(13.9, F, 9.45, 0, () => slab(kit, 'sage', [-0.3, 0, -0.2], [0.3, 0.012, 0.2], { r: 0.004, occlude: false }));
  kit.at(14.65, F + 0.7, U.z1, Math.PI, () => {
    kit.tube('chrome', [[-0.07, 0, 0], [-0.07, 0, 0.08], [0.07, 0, 0.08], [0.07, 0, 0]], 0.006, { sides: 3 });
    kit.cylinder('paper', [-0.055, -0.055, 0.07], 0.055, 0.11, { sides: 8 });
  });
  kit.cylinder('bulbWarm', [13.9, U.mezz.top - U.mezz.thick - 0.03, 10.1], 0.13, 0.03, { sides: 10 });
  kit.glow('bath', () => kit.panel('bulbWarm', [13.9, U.mezz.top - U.mezz.thick - 0.031, 10.1], [0.2, 0.2], '-y'));
  kit.light({ name: 'bath', pos: [13.9, 2.5, 10.1], color: '#fff0d8', intensity: 1.7, range: 3.5, zone: 'unit', switchable: true, dynamic: true, fill: 0.8 });
}

function mezzanine(kit, rng) {
  const y = U.mezz.top;
  kit.at(12.6, y, U.z1 - 0.1, Math.PI, () => bed(kit, { id: 'loft.bed' }));
  kit.at(11.38, y, 11.08, Math.PI, () => nightstand(kit));
  kit.at(11.38, y + 0.52, 11.12, 0, () => tableLamp(kit, 'mezz-lamp', { id: 'loft.lamp.bedside' }));
  kit.at(U.x1 - 0.32, y, 9.5, FACE_NEG_X, () => clothesRack(kit, 1.2, rng.fork('rack')));
  kit.at(12.6, y, 9.0, 0, () => kit.box('rug', [-0.9, 0, -0.6], [0.9, 0.01, 0.6], { seg: 9, uv: 'fit', occlude: false }));
  // jeans hung over the mezzanine guard (reference IMG_5)
  kit.at(10.78, y + 1.05, U.mezz.z0 - 0.03, 0, () => {
    softBox(kit, 'denim', [-0.17, -0.62, -0.02], [0.17, 0.02, 0.005], { r: 0.012, occlude: false });
    softBox(kit, 'denim', [-0.17, -0.2, 0.0], [0.17, 0.02, 0.03], { r: 0.012, occlude: false });
  });
  kit.at(14.4, y, 8.0, 0, () => spiderPlant(kit, { r: 0.13 }));
  // low dresser: three drawers with bar pulls
  kit.at(U.x0, y, 9.7, FACE_X, () => {
    slab(kit, 'plasticBlack', [-0.5, 0.08, 0], [0.5, 0.75, 0.4], { r: 0.006, collide: true });
    kit.box('steelBlack', [-0.46, 0, 0.04], [0.46, 0.08, 0.36], { seg: 9, occlude: false });
    for (let i = 0; i < 3; i++) front(kit, 'plasticBlack', [-0.49, 0.09 + i * 0.22, 0.49, 0.09 + (i + 1) * 0.22], 0.4, { handle: 'bar', place: 'mid', handleMat: 'brass' });
    kit.walkable([[-0.5, 0], [0.5, 0], [0.5, 0.4], [-0.5, 0.4]], 0.75);
    bookStack(kit, 2, rng.fork('dresser'));
  });
  cardboardBox(kit, 'box-mezz', [13.9, y, 10.9], [0.5, 0.35, 0.4], 0.1);
}

/** Switch plates by the loft door and the bath door, wired to whole circuits. */
function switches(kit) {
  const circuit = (...layers) => kit.lights.filter((l) => layers.includes(l.layerName)).map((l) => l.name);
  kit.at(12.62, F, U.z1, Math.PI, () => {
    lightSwitch(kit, 'loft.switch.main', 0, circuit('loft-track', 'orb-high', 'orb-low'), { y: 1.2, gang: 2 });
    lightSwitch(kit, 'loft.switch.kitchen', -0.16, circuit('kitchen'), { y: 1.2 });
  });
  kit.at(U.bath.x0 - 0.05, F, U.bath.z0 + 0.15, -Math.PI / 2, () => lightSwitch(kit, 'loft.switch.bath', 0, ['bath'], { y: 1.2 }));
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
  switches(kit);
}
