import { UNIT as U, GROUND } from './layout.js';
import {
  sofaSection, throwBlanket, coffeeTable, tableTop, rug, mediaConsole, consoleDressing, lavaLamp, wallTV, floorLamp, orbPendant, trackLight, spiralDuct, register,
  kitchenRun, fridge, toilet, vanity, shower, towel, bed, nightstand, tableLamp, clothesRack, cubeTable, tolixStool, shellChair, artFrame, leaningMirror, flightCase,
  metalCart, speaker, hifi, basketball, bookStack, bookRow, broom, waterBottle,
} from '../../props/interior-props.js';
import { lightSwitch, sprinklers, conduit, smokeDetector } from '../../props/fixtures.js';
import { trashBin, bottle, cardboardBox, kitchenChair, loose, beerBottle, shoes, bookBlock, recordCrate } from '../../props/clutter.js';
import { spiderPlant, snakePlant, palm, pothos, hangingVines } from '../../props/plants.js';
import { slab, softBox, front, rect } from '../../kit/shapes.js';

/**
 * Loft 1B furnished from the reference photos (docs/world/pass03.md lists them by file name).
 * Facing the window (-Z): TV wall on the left (x = 10.1), art + spiral duct on the right
 * (x = 14.9), black tufted L-sofa against the painted block knee wall under the window, Persian rug
 * and black marble table, maple cube + red stool with palm at the end of the sofa, spiral stair and
 * mezzanine at the back with the kitchen and bath beneath.
 *
 * Every loose item is a `kit.physical` body (contracts §8); furniture tops register `kit.surface`.
 * Lighting circuits: 'loft-track' (both track rails), 'orb-high' / 'orb-low' (pendants, shadowed,
 * swing on their chains), 'floor-lamp', 'tv-glow', 'lava-lamp', 'neon-sign', 'kitchen' (cans +
 * under-cabinet), 'bath', 'mezz-lamp', 'hifi'. Seats + `act_*` markers host the five resident NPCs
 * (contracts §5/§7); `speaker_L` / `speaker_R` place the music.
 */
const F = GROUND.floor;
const FACE_X = Math.PI / 2;
const FACE_NEG_X = -Math.PI / 2;
const POT = { material: 'ceramic', breakable: true, shape: 'cylinder' };

function livingRoom(kit, rng) {
  kit.at(10.95, F, U.z0 + 0.03, 0, () => {
    sofaSection(kit, 3.92, { armLeft: true, armRight: false, cornerRight: true, id: 'loft.sofa.a', seats: 4 });
    loose(kit, 'blanket', [3.0, 0.43, 0.65], { mass: 1.2, material: 'fabric' }, () => throwBlanket(kit, 'knit', { x: 3.0, front: 0.91 }));
  });
  kit.at(U.x1 - 0.03, F, U.z0 + 0.95, FACE_NEG_X, () => sofaSection(kit, 3.05, { armLeft: false, armRight: true, id: 'loft.sofa.b', seats: 3 }));
  kit.at(12.45, F, 2.95, 0, () => rug(kit, 2.5, 3.3));
  kit.at(12.55, F + 0.012, 2.7, 0, () => coffeeTable(kit));
  kit.at(12.55, F + 0.392, 2.7, 0, () => tableTop(kit, rng.fork('table')));
  kit.at(12.8, F + 0.392, 3.05, 0.4, () => kit.physical('phone', () => {
    slab(kit, 'plasticBlack', [-0.038, 0, -0.075], [0.038, 0.009, 0.075], { r: 0.003, occlude: false });
    kit.interactable({ id: 'loft.item.phone', kind: 'item', pos: [0, 0.01, 0], radius: 0.9, prompt: 'Take', data: { item: 'phone' } });
  }, { mass: 0.2, material: 'electronics' }));
  kit.interactable({ id: 'loft.item.magazine', kind: 'item', pos: [12.43, F + 0.4, 2.52], radius: 0.9, prompt: 'Read', data: { item: 'magazine', prop: 'table-mag-0' } });
  for (let i = 0; i < 2; i++) beerBottle(kit, `beer-table-${i}`, [12.3 + i * 0.09, F + 0.392, 3.15 - i * 0.05], { lime: i === 0 });
  kit.at(11.75, F + 0.012, 4.35, Math.PI + 0.25, () => kit.physical('shell-chair', () => shellChair(kit, { id: 'loft.chair' }), { mass: 4.5, material: 'plastic' }));
  shoes(kit, 'shoes-rug', [12.95, F + 0.012, 4.25], 0.15);
  kit.at(12.35, F + 1.62, U.z0, 0, () => kit.physical('neon-sign', () => {
    kit.glow('neon-sign', () => kit.panel('worldIsYours', [0, 0, 0.025], [0.8, 0.3], '+z'));
    kit.box('steelGray', [-0.38, -0.12, 0.005], [0.38, 0.12, 0.022], { seg: 9, occlude: false });
    kit.light({ name: 'neon-sign', pos: [0, 0, 0.3], color: '#cfe4ff', intensity: 0.45, range: 2.2, switchable: true, zone: 'unit', fill: 0.3 });
  }, { mass: 2, material: 'glass', breakable: true, anchored: 'wall', anchor: [0, 0.12, 0] }));
  kit.at(10.8, F, U.z0 + 0.05, -0.15, () => broom(kit));
  kit.at(10.5, F, 0.8, 0.9, () => floorLamp(kit, 'floor-lamp', { id: 'loft.lamp.floor' }));
  bottle(kit, 'bottle-sofa', [13.35, F + 0.012, 1.62], { mat: 'bottleBrown', h: 0.24, r: 0.032 });
}

function tvWall(kit, rng) {
  kit.at(U.x0, F, 4.85, FACE_X, () => {
    mediaConsole(kit, 3);
    kit.at(0, 0.48, 0, 0, () => {
      consoleDressing(kit, 'console');
      hifi(kit, { id: 'loft.music', turntableX: 1.45, mixerX: 1.02 });
      loose(kit, 'snake-plant', [2.17, 0, 0.25], POT, () => kit.at(2.17, 0, 0.25, 0, () => snakePlant(kit)));
      loose(kit, 'pothos-console', [0.17, 0, 0.2], POT, () => kit.at(0.17, 0, 0.2, 0, () => pothos(kit, { trail: 0.55 })));
      kit.at(1.9, 0, 0.25, 0, () => lavaLamp(kit, 'lava-lamp'));
    });
  });
  kit.at(U.x0, F + 1.78, 3.65, FACE_X, () => wallTV(kit, { id: 'loft.tv' }));
  // tall speakers either side of the console (audio markers speaker_L / speaker_R)
  kit.at(U.x0 + 0.2, F, 2.13, FACE_X, () => kit.physical('speaker-L', () => speaker(kit, { marker: 'speaker_L' }), { mass: 18, material: 'wood' }));
  kit.at(U.x0 + 0.2, F, 5.12, FACE_X, () => kit.physical('speaker-R', () => speaker(kit, { marker: 'speaker_R' }), { mass: 18, material: 'wood' }));
  kit.at(U.x0 + 0.02, F, 1.95, FACE_X, () => metalCart(kit, 0.62, 0.45, 1.0, { dress: true }));
  kit.interactable({ id: 'loft.item.camera', kind: 'item', pos: [10.42, F + 1.06, 1.5], radius: 0.9, prompt: 'Take', data: { item: 'camcorder', prop: 'cart-camcorder' } });
  kit.at(U.x0, F + 2.4, 1.6, FACE_X, () => kit.physical('art-photo', () => artFrame(kit, 'artPhoto', 0.8, 1.05), { mass: 4, material: 'wood', breakable: true, anchored: 'wall', anchor: [0, 0.5, 0] }));
  kit.at(U.x0, F, 5.8, FACE_X, () => kit.physical('mirror', () => leaningMirror(kit), { mass: 14, material: 'glass', breakable: true }));
  kit.at(10.45, F, 5.75, FACE_X, () => kit.physical('flight-case', () => flightCase(kit), { mass: 11, material: 'wood' }));
  basketball(kit, [10.85, F + 0.12, 5.45]);
  loose(kit, 'pot-under-stair', [10.75, F, 6.05], POT, () => kit.lathe('terracotta', [10.75, F, 6.05], [[0.13, 0], [0.18, 0.2], [0.2, 0.24], [0.17, 0.24]], { sides: 10 }));
  recordCrate(kit, 'records-floor', [10.55, F, 2.62], FACE_X);
}

function rightWall(kit, rng) {
  kit.at(U.x1, F + 2.55, 3.0, FACE_NEG_X, () => kit.physical('art-pop', () => artFrame(kit, 'artPop', 1.3, 0.98), { mass: 6, material: 'wood', breakable: true, anchored: 'wall', anchor: [0, 0.45, 0] }));
  kit.at(U.x1, F + 1.9, 6.7, FACE_NEG_X, () => kit.physical('art-abstract', () => artFrame(kit, 'artAbstract', 0.75, 0.9, { matWidth: 0.0 }), { mass: 3, material: 'wood', anchored: 'wall', anchor: [0, 0.4, 0] }));
  kit.at(U.x1 - 0.57, F, 4.45, 0, () => cubeTable(kit, 0.55, 0.92, 0.62));
  loose(kit, 'spider-cube', [U.x1 - 0.22, F + 0.62, 5.15], POT, () => kit.at(U.x1 - 0.22, F + 0.62, 5.15, 0, () => spiderPlant(kit, { r: 0.12, size: 0.55, mat: 'ceramic' })));
  bookBlock(kit, 'books-cube-top', [U.x1 - 0.5, F + 0.62, 4.62], rng.fork('cube-top'), { count: 6, yaw: FACE_NEG_X });
  waterBottle(kit, [U.x1 - 0.42, F + 0.62, 4.85]);
  kit.physical('key-dish', () => {
    kit.lathe('ceramic', [0, 0, 0], [[0.001, 0], [0.07, 0], [0.09, 0.02], [0.085, 0.022], [0.065, 0.006], [0.001, 0.006]], { sides: 8 });
    kit.at(0.01, 0.008, 0, 0.3, () => kit.box('chrome', [-0.03, 0, -0.012], [0.03, 0.006, 0.012], { seg: 9, occlude: false }));
    kit.interactable({ id: 'loft.item.keys', kind: 'item', pos: [0, 0.02, 0], radius: 0.9, prompt: 'Take', data: { item: 'keys' } });
  }, { pos: [U.x1 - 0.32, F + 0.62, 5.05], shape: 'cylinder', mass: 0.4, material: 'ceramic', breakable: true });
  kit.at(U.x1 - 0.42, F, 5.95, 0, () => kit.physical('stool-palm', () => tolixStool(kit), { mass: 3.5, material: 'metal' }));
  loose(kit, 'palm', [U.x1 - 0.42, F + 0.76, 5.95], { ...POT, mass: 9 }, () => kit.at(U.x1 - 0.42, F + 0.76, 5.95, 0, () => palm(kit)));
  loose(kit, 'spider-floor', [U.x1 - 0.35, F, 6.75], POT, () => kit.at(U.x1 - 0.35, F, 6.75, 0, () => spiderPlant(kit, { r: 0.16, size: 0.6 })));
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
  // a seat on the second tread (feet on the floor), facing down the flight
  const a = -1.5 * step;
  const top = F + 2 * rise;
  kit.interactable({ id: 'loft.stair.seat', kind: 'seat', pos: [S.cx + Math.cos(a) * 0.55, top, S.cz + Math.sin(a) * 0.55], yaw: Math.atan2(-Math.sin(a), Math.cos(a)) + Math.PI / 2, radius: 1.1, prompt: 'Sit', data: { seatHeight: top - F, variant: 'stair', exit: [12.2, F, 6.95] } });
}

function kitchen(kit) {
  kit.at(U.x0, F, 11.35, FACE_X, () => kitchenRun(kit, 2.85, { fridge: false, layer: 'kitchen' }));
  kit.light({ name: 'kitchen-under', pos: [U.x0 + 0.3, F + 1.38, 10.0], color: '#ffd8a0', intensity: 0.7, range: 2.2, dir: [0, -1, 0], cone: 0.0, zone: 'unit', layer: 'kitchen', fill: 0.4 });
  kit.at(U.x0, F, 8.09, FACE_X, () => fridge(kit, { id: 'loft.fridge', contents: ['beer', 'lime', 'leftovers', 'hot sauce'] }));
  const top = F + 0.91;
  const counter = (name, pos, opts, fn) => loose(kit, name, pos, opts, () => fn(pos));
  counter('banana', [10.45, top, 9.9], { mass: 0.2, material: 'fabric' }, (p) => kit.sphere('yellowPaint', [p[0], p[1] + 0.03, p[2]], 0.06, { w: 6, h: 4, scale: [2, 0.6, 1] }));
  counter('kettle', [10.4, top, 10.45], { mass: 1.2, material: 'metal', shape: 'cylinder' }, (p) => {
    kit.lathe('stainless', p, [[0.001, 0], [0.085, 0], [0.09, 0.14], [0.06, 0.2], [0.001, 0.21]], { sides: 8 });
    kit.tube('plasticBlack', [[p[0], p[1] + 0.17, p[2] - 0.08], [p[0], p[1] + 0.2, p[2] - 0.14], [p[0], p[1] + 0.08, p[2] - 0.14]], 0.01, { sides: 3 });
  });
  counter('cutting-board', [10.42, top, 8.9], { mass: 0.8, material: 'wood' }, (p) => kit.box('woodDark', [p[0] - 0.17, p[1], p[2] - 0.2], [p[0] + 0.18, p[1] + 0.02, p[2] + 0.2], { seg: 9, occlude: false }));
  counter('knife-block', [10.2, top, 9.35], { mass: 1.5, material: 'wood' }, (p) => kit.at(p[0], p[1], p[2], 0, () => {
    kit.box('woodDark', [-0.06, 0, -0.04], [0.06, 0.2, 0.04], { seg: 9, occlude: false });
    for (const z of [-0.02, 0.0, 0.02]) kit.box('plasticBlack', [-0.01, 0.2, z - 0.004], [0.01, 0.27, z + 0.004], { seg: 9, occlude: false });
  }));
  kit.at(10.2, top + 0.3, 10.9, 0, () => kit.cylinder('chrome', [0, 0, 0], 0.01, 0.3, { sides: 4 }));
  counter('paper-towel', [10.2, top + 0.32, 10.9], { mass: 0.3, material: 'paper', shape: 'cylinder' }, (p) => kit.cylinder('paper', p, 0.055, 0.26, { sides: 8 }));
  counter('dish-soap', [10.3, top, 10.05], { mass: 0.5, material: 'plastic', shape: 'cylinder' }, (p) => kit.cylinder('bottleGreen', p, 0.03, 0.2, { sides: 6 }));
  // beer on the counter: a few loose bottles and a six-pack carton
  [[10.52, 9.62], [10.6, 9.73], [10.47, 9.78], [10.58, 11.0]].forEach(([x, z], i) => beerBottle(kit, `beer-counter-${i}`, [x, top, z], { mat: i === 3 ? 'bottleBrown' : 'glassLager' }));
  kit.physical('six-pack', () => {
    slab(kit, 'cardboard', [-0.09, 0, -0.13], [0.09, 0.13, 0.13], { r: 0.006, occlude: false });
    for (let i = 0; i < 6; i++) kit.cylinder('glassLager', [(i % 2 ? 0.04 : -0.04), 0.13, -0.08 + Math.floor(i / 2) * 0.08], 0.013, 0.09, { sides: 5 });
  }, { pos: [10.32, top, 11.05], mass: 2.4, material: 'paper' });
  for (const z of [8.3, 9.7]) {
    kit.cylinder('steelBlack', [11.4, U.mezz.top - U.mezz.thick - 0.03, z], 0.075, 0.03, { sides: 10 });
    kit.glow('kitchen', () => kit.panel('bulbWarm', [11.4, U.mezz.top - U.mezz.thick - 0.032, z], [0.11, 0.11], '-y'));
    kit.light({ name: `kitchen-can-${z}`, pos: [11.4, U.mezz.top - U.mezz.thick - 0.2, z], color: '#ffd9a8', intensity: 1.5, range: 3.5, dir: [0, -1, 0], cone: 0.25, zone: 'unit', layer: 'kitchen', fill: 0.7 });
  }
  trashBin(kit, 'bin-kitchen', [10.93, F, 11.05], { r: 0.15, h: 0.5 });
  kitchenChair(kit, 'chair-kitchen', [12.45, F, 8.25], -Math.PI / 2 - 0.25, { id: 'loft.kitchen-chair' });
  // a red stool pulled up to the counter (sits facing the room, back to the counter)
  kit.at(11.0, F, 9.95, FACE_X, () => kit.physical('stool-kitchen', () => tolixStool(kit, 0.66, { id: 'loft.stool.kitchen' }), { mass: 3.5, material: 'metal' }));
}

function bathroom(kit) {
  kit.at(14.3, F, U.z1, Math.PI, () => toilet(kit));
  kit.at(U.x1, F, 9.75, FACE_NEG_X, () => {
    vanity(kit);
    [[0.26, 'bottleGreen', 0.16, 'glass'], [0.3, 'plasticWhite', 0.12, 'plastic'], [-0.28, 'ceramic', 0.08, 'ceramic']].forEach(([x, mat, h, material], i) => kit.physical(`vanity-bottle-${i}`, () => kit.cylinder(mat, [0, 0, 0], 0.025, h, { sides: 6 }), { pos: [x, 0.86, 0.1], shape: 'cylinder', mass: 0.3, material, breakable: material !== 'plastic' }));
  });
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

/** Open steel bookshelf on the mezzanine: four shelves of books (blocks), records and a plant. */
function bookshelf(kit, rng) {
  const y0 = U.mezz.top;
  kit.at(U.x0, y0, 8.1, FACE_X, () => {
    const w = 1.0;
    const d = 0.32;
    const shelves = [0.06, 0.48, 0.9, 1.32, 1.72];
    for (const x of [-w / 2, w / 2 - 0.03]) for (const z of [0.0, d - 0.03]) kit.box('steelBlack', [x, 0, z], [x + 0.03, 1.78, z + 0.03], { seg: 9, occlude: false });
    for (const y of shelves) {
      slab(kit, 'woodDark', [-w / 2, y - 0.025, 0], [w / 2, y, d], { r: 0.004, occlude: false });
      kit.surface(`mezz-shelf-${y}`, rect(-w / 2, 0, w / 2, d), y);
    }
    kit.solid(rect(-w / 2, 0, w / 2, d), 0, 1.78, 'shelf');
    const r = rng.fork('books');
    bookBlock(kit, 'shelf-books-0', [-0.45, shelves[1], 0.16], r, { count: 7 });
    bookBlock(kit, 'shelf-books-1', [0.05, shelves[1], 0.16], r, { count: 5, lean: 0.3 });
    bookBlock(kit, 'shelf-books-2', [-0.42, shelves[2], 0.16], r, { count: 9 });
    bookBlock(kit, 'shelf-books-3', [-0.2, shelves[3], 0.16], r, { count: 6 });
    recordCrate(kit, 'shelf-records', [0.0, shelves[0], 0.16], 0);
    kit.physical('shelf-records-loose', () => {
      for (let i = 0; i < 12; i++) kit.box(i % 2 ? 'plasticBlack' : 'magazines', [-0.006 + i * 0.012, 0, -0.155], [0.004 + i * 0.012, 0.31, 0.155], { seg: 9, occlude: false, uv: 'fit' });
    }, { pos: [0.25, shelves[0], 0.16], mass: 3, material: 'paper' });
    loose(kit, 'shelf-plant', [0.3, shelves[3], 0.16], POT, () => kit.at(0.3, shelves[3], 0.16, 0, () => pothos(kit, { trail: 0.4, r: 0.1 })));
    kit.physical('shelf-candle', () => kit.cylinder('candleJar', [0, 0, 0], 0.04, 0.08, { sides: 8 }), { pos: [0.3, shelves[2], 0.16], shape: 'cylinder', mass: 0.4, material: 'glass', breakable: true });
    kit.physical('shelf-box', () => slab(kit, 'cardboard', [-0.14, 0, -0.12], [0.14, 0.2, 0.12], { r: 0.006, occlude: false }), { pos: [0.3, shelves[4], 0.15], mass: 1, material: 'paper' });
  });
}

function mezzanine(kit, rng) {
  const y = U.mezz.top;
  kit.at(12.6, y, U.z1 - 0.1, Math.PI, () => bed(kit, { id: 'loft.bed' }));
  kit.at(11.38, y, 11.08, Math.PI, () => nightstand(kit));
  kit.at(11.38, y + 0.52, 11.12, 0, () => tableLamp(kit, 'mezz-lamp', { id: 'loft.lamp.bedside' }));
  kit.at(U.x1 - 0.32, y, 9.5, FACE_NEG_X, () => clothesRack(kit, 1.2, rng.fork('rack')));
  kit.at(12.6, y, 9.0, 0, () => kit.box('rug', [-0.9, 0, -0.6], [0.9, 0.01, 0.6], { seg: 9, uv: 'fit', occlude: false }));
  // jeans hung over the mezzanine guard (reference 4.jpg)
  kit.at(10.78, y + 1.05, U.mezz.z0 - 0.03, 0, () => {
    softBox(kit, 'denim', [-0.17, -0.62, -0.02], [0.17, 0.02, 0.005], { r: 0.012, occlude: false });
    softBox(kit, 'denim', [-0.17, -0.2, 0.0], [0.17, 0.02, 0.03], { r: 0.012, occlude: false });
  });
  loose(kit, 'spider-mezz', [14.4, y, 8.0], POT, () => kit.at(14.4, y, 8.0, 0, () => spiderPlant(kit, { r: 0.13 })));
  // low dresser: three drawers with bar pulls
  kit.at(U.x0, y, 9.7, FACE_X, () => {
    slab(kit, 'plasticBlack', [-0.5, 0.08, 0], [0.5, 0.75, 0.4], { r: 0.006, collide: true, tag: 'dresser' });
    kit.box('steelBlack', [-0.46, 0, 0.04], [0.46, 0.08, 0.36], { seg: 9, occlude: false });
    for (let i = 0; i < 3; i++) front(kit, 'plasticBlack', [-0.49, 0.09 + i * 0.22, 0.49, 0.09 + (i + 1) * 0.22], 0.4, { handle: 'bar', place: 'mid', handleMat: 'brass' });
    kit.walkable([[-0.5, 0], [0.5, 0], [0.5, 0.4], [-0.5, 0.4]], 0.75);
    kit.surface('dresser-top', rect(-0.5, 0, 0.5, 0.4), 0.75);
    kit.at(0.2, 0.75, 0.2, 0, () => bookStack(kit, 3, rng.fork('dresser'), 'dresser-books'));
  });
  bookshelf(kit, rng.fork('shelf'));
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

/**
 * Standing / activity spots for the resident NPCs (contracts §7): forward = (sin yaw, 0, cos yaw).
 * act_dance_* by the speakers, act_tv_* facing the TV, act_counter_* leaning on the kitchen counter,
 * act_window_* looking out, act_rail_* on the mezzanine guard, act_fridge_1, act_console_1 (records).
 */
function activities(kit) {
  const m = (name, x, y, z, yaw, role) => kit.marker(name, [x, y, z], { yaw, role });
  m('act_dance_1', 11.05, F, 2.35, -Math.PI / 2 + 0.35, 'dance');
  m('act_dance_2', 11.1, F, 4.95, -Math.PI / 2 - 0.3, 'dance');
  m('act_dance_3', 11.45, F, 3.05, -Math.PI / 2, 'dance');
  m('act_tv_1', 11.7, F, 3.65, -Math.PI / 2, 'game');
  m('act_tv_2', 11.75, F, 3.15, -Math.PI / 2 + 0.2, 'game');
  m('act_console_1', 10.95, F, 3.4, -Math.PI / 2, 'records');
  m('act_counter_1', 11.0, F, 10.75, Math.PI / 2, 'lean');
  m('act_counter_2', 11.0, F, 9.05, Math.PI / 2 + 0.25, 'lean');
  m('act_fridge_1', 11.2, F, 8.1, -Math.PI / 2, 'fridge');
  m('act_window_1', 10.7, F, 1.62, Math.PI, 'window');
  m('act_window_2', 13.25, F, 1.75, Math.PI - 0.2, 'window');
  m('act_rail_1', 13.6, U.mezz.top, 7.75, Math.PI, 'rail');
  m('act_rail_2', 10.75, U.mezz.top, 7.75, Math.PI + 0.15, 'rail');
}

export function dressLoft(kit, rng) {
  kit.bucket('clutter');
  livingRoom(kit, rng.fork('living'));
  tvWall(kit, rng.fork('tv'));
  rightWall(kit, rng.fork('right'));
  ceiling(kit);
  stairVines(kit);
  kitchen(kit);
  bathroom(kit);
  mezzanine(kit, rng.fork('mezz'));
  switches(kit);
  activities(kit);
}
