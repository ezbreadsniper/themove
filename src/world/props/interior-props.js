import * as THREE from 'three';
import { FURNITURE } from '../units.js';
import { rect, softBox, slab, taperLeg, turnedLeg, front, handle, hinges, pipingLoop, piping, strapRing, shellSeat } from '../kit/shapes.js';

/**
 * Interior furniture and fixtures, authored at the local origin on y = 0 (the floor of the frame
 * they are placed in), front facing +Z unless noted. Sizes follow real furniture (units.js
 * FURNITURE) so a 1.78 m character reads at the right scale. Forms follow the loft reference photos
 * (docs/world/pass03.md); detail budget: chunky chamfers, real legs and fronts, 4–6 sided curves.
 *
 * Seats register `seat` interactables when given an `id`; lamps and the TV register their lights.
 */
const SOFA_SEAT = 0.45;

/**
 * Button-tufted leather sofa section (Landskrona-like) along +X, back at z = 0, seats toward +Z:
 * wrapped plinth on low tapered wooden legs, separate seat cushions with welted edges, tufted back
 * cushions bulging forward, thin square arms. `cornerRight` adds a return back cushion so two
 * sections make an L. Registers one seat per cushion when `id` is given.
 */
export function sofaSection(kit, length, { depth = 0.92, armLeft = true, armRight = true, cornerRight = false, mat = 'leather', id = null, seats: count = null } = {}) {
  const arm = 0.13;
  const x0 = armLeft ? arm : 0;
  const x1 = length - (armRight ? arm : 0);
  const legH = 0.12;
  softBox(kit, mat, [0, legH, 0], [length, 0.29, depth], { r: 0.025, occlude: false });
  softBox(kit, mat, [0, 0.29, 0], [length, FURNITURE.sofaBack - 0.04, 0.09], { r: 0.03 });
  const legX = length > 2.2 ? [0.07, length / 2, length - 0.07] : [0.07, length - 0.07];
  for (const x of legX) for (const z of [0.07, depth - 0.07]) taperLeg(kit, 'woodDark', [x, 0, z], legH, { top: 0.024, bottom: 0.016, splay: [0, z < 0.5 ? -0.01 : 0.01] });
  const cornerD = cornerRight ? 0.22 : 0;
  const n = count ?? Math.max(1, Math.round((x1 - x0) / 0.8));
  const w = (x1 - x0) / n;
  const welt = 'plasticBlack';
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w;
    const b = a + w;
    const sa = [a + 0.008, 0.29, 0.25];
    const sb = [b - 0.008, SOFA_SEAT, depth - 0.01];
    softBox(kit, mat, sa, sb, { r: 0.04, puff: 0.018, dent: [(a + b) / 2, depth * 0.6, 0.012, 0.3], occlude: false });
    pipingLoop(kit, welt, sa, sb, SOFA_SEAT - 0.012, 0.03, 0.007);
    const last = i === n - 1;
    const bx1 = last && cornerD ? b - cornerD : b - 0.008;
    softBox(kit, mat, [a + 0.008, 0.31, 0.06], [bx1, FURNITURE.sofaBack, 0.25], { r: 0.045, puff: 0.03, puffAxis: 2, occlude: false });
    if (id) {
      const corner = last && cornerD;
      const cx = (a + b) / 2 - (corner ? cornerD / 2 : 0);
      // the corner seat of an L has the return section in front of it: step out diagonally
      const exit = corner ? [a - 0.3, 0, depth + 0.45] : [cx, 0, depth + 0.42];
      kit.interactable({ id: `${id}.seat${i + 1}`, kind: 'seat', pos: [cx, SOFA_SEAT, depth * 0.55], yaw: corner ? -0.6 : 0, radius: 1.4, prompt: 'Sit', data: { seatHeight: SOFA_SEAT, variant: 'sofa', exit } });
    }
  }
  if (cornerD) softBox(kit, mat, [x1 - cornerD, 0.31, 0.25], [x1 - 0.008, FURNITURE.sofaBack, depth - 0.02], { r: 0.045, puff: 0.03, puffAxis: 0, occlude: false });
  for (const [ax, on] of [[0, armLeft], [length - arm, armRight]]) {
    if (!on) continue;
    softBox(kit, mat, [ax, legH, 0], [ax + arm, 0.6, depth], { r: 0.03, puff: 0.01, occlude: false });
    piping(kit, welt, [[ax + 0.01, 0.6, depth - 0.004], [ax + arm - 0.01, 0.6, depth - 0.004]], 0.006);
  }
  kit.solid(rect(0, 0, length, depth), 0, FURNITURE.sofaBack, 'sofa');
  kit.occluder([0, 0, 0], [length, SOFA_SEAT, depth]);
}

/**
 * Knit throw left on a seat, authored in the sofa section's frame: a rumpled layer lying on the
 * cushion, a rolled fold over the cushion's front edge and a fall hanging down the front, all
 * touching (no floating cloth). x = centre along the sofa; front = cushion front (z).
 */
export function throwBlanket(kit, mat, { x, front, top = SOFA_SEAT, w = 0.62 } = {}) {
  softBox(kit, mat, [x - w / 2, top - 0.012, front - 0.5], [x + w / 2 - 0.05, top + 0.035, front - 0.02], { r: 0.018, puff: 0.03, dent: [x + 0.08, front - 0.28, 0.025, 0.18], occlude: false });
  softBox(kit, mat, [x - w / 2 + 0.06, top + 0.02, front - 0.42], [x - w / 2 + 0.3, top + 0.075, front - 0.18], { r: 0.025, puff: 0.02, occlude: false });
  softBox(kit, mat, [x - w / 2 + 0.01, top - 0.06, front - 0.05], [x + w / 2 - 0.06, top + 0.03, front + 0.035], { r: 0.035, occlude: false });
  softBox(kit, mat, [x - w / 2 + 0.03, top - 0.3, front + 0.002], [x + w / 2 - 0.1, top - 0.04, front + 0.032], { r: 0.012, puff: 0.012, puffAxis: 2, occlude: false });
}

/** Glossy black marble coffee table on a recessed plinth (reference: low square lacquer table). */
export function coffeeTable(kit, w = 0.95, d = 1.25, h = 0.38) {
  slab(kit, 'marbleBlack', [-w / 2, h - 0.07, -d / 2], [w / 2, h, d / 2], { r: 0.008, uv: 'box' });
  slab(kit, 'plasticBlack', [-w / 2 + 0.09, 0.02, -d / 2 + 0.09], [w / 2 - 0.09, h - 0.07, d / 2 - 0.09], { r: 0.005, occlude: false });
  slab(kit, 'plasticBlack', [-w / 2 + 0.12, 0, -d / 2 + 0.12], [w / 2 - 0.12, 0.02, d / 2 - 0.12], { r: 0.002, occlude: false });
  kit.panel('floorSheen', [0.05, h + 0.002, 0], [w * 0.45, d * 0.9], '+y', { rot: 0.4 });
  kit.solid(rect(-w / 2, -d / 2, w / 2, d / 2), 0, h, 'table');
  kit.walkable(rect(-w / 2, -d / 2, w / 2, d / 2), h);
  kit.occluder([-w / 2 + 0.09, 0, -d / 2 + 0.09], [w / 2 - 0.09, h, d / 2 - 0.09]);
}

/** Table-top still life: magazines fanned, a candle jar with wooden lid, a black tray. */
export function tableTop(kit, rng) {
  const mags = [['magazines', 0.24, 0.32, 0.25], ['magazines', 0.21, 0.28, -0.35], ['books', 0.2, 0.26, 0.05]];
  let y = 0;
  mags.forEach(([mat, w, d, rot], i) => kit.at(-0.12 + i * 0.05, y, -0.18 + i * 0.03, rot, () => {
    kit.box(mat, [-w / 2, 0, -d / 2], [w / 2, 0.008, d / 2], { seg: 9, uv: 'fit', occlude: false });
    y += 0.008;
  }));
  kit.cylinder('candleJar', [0.2, 0, 0.12], 0.045, 0.09, { sides: 8 });
  kit.cylinder('maple', [0.2, 0.09, 0.12], 0.047, 0.018, { sides: 8 });
  kit.at(0.05, 0, 0.32, 0.2 + rng.next() * 0.2, () => {
    slab(kit, 'plasticBlack', [-0.16, 0, -0.1], [0.16, 0.008, 0.1], { r: 0.002, occlude: false });
    for (const [a, b] of [[[-0.16, 0, -0.1], [0.16, 0.025, -0.092]], [[-0.16, 0, 0.092], [0.16, 0.025, 0.1]], [[-0.16, 0, -0.1], [-0.152, 0.025, 0.1]], [[0.152, 0, -0.1], [0.16, 0.025, 0.1]]]) kit.box('plasticBlack', a, b, { seg: 9, occlude: false });
    kit.box('plasticBlack', [-0.04, 0.008, -0.03], [0.05, 0.03, 0.05], { seg: 9, occlude: false });
  });
}

/** Persian rug with a fringe at both short ends (fringe = cut-out strips). */
export function rug(kit, w, d) {
  kit.box('rug', [-w / 2, 0, -d / 2], [w / 2, 0.012, d / 2], { seg: 9, uv: 'fit', occlude: false });
  for (const s of [-1, 1]) kit.panel('paper', [0, 0.004, s * (d / 2 + 0.03)], [w - 0.06, 0.06], '+y');
}

/**
 * White three-box media console (Besta-like), long side along +X, back at z = 0: each box is a real
 * carcass (top, sides, bottom, back) so the open cubbies read as hollow; outer boxes have an open
 * cubby over a drawer, the centre box a full drop-front door. Handleless fronts with push gaps.
 */
export function mediaConsole(kit, modules = 3) {
  const w = 0.8;
  const H = FURNITURE.console;
  const D = 0.42;
  const t = 0.018;
  for (let i = 0; i < modules; i++) {
    const x = i * w + 0.002;
    const X = x + w - 0.004;
    slab(kit, 'laminate', [x, H - t, 0], [X, H, D], { r: 0.003, occlude: false });
    slab(kit, 'laminate', [x, 0, 0], [X, t + 0.01, D], { r: 0.002, occlude: false });
    slab(kit, 'laminate', [x, 0, 0], [x + t, H - t, D], { r: 0.002, occlude: false });
    slab(kit, 'laminate', [X - t, 0, 0], [X, H - t, D], { r: 0.002, occlude: false });
    kit.box('plasticGrey', [x + t, t, 0.005], [X - t, H - t, 0.012], { seg: 9, occlude: false });
    const centre = i === Math.floor(modules / 2);
    if (centre) front(kit, 'laminate', [x, 0.01, X, H - 0.002], D - 0.019, { handle: 'none', gap: 0.003 });
    else {
      const split = 0.31;
      slab(kit, 'laminate', [x + t, split - t / 2, 0.012], [X - t, split + t / 2, D - 0.02], { r: 0.002, occlude: false });
      front(kit, 'laminate', [x, 0.01, X, split], D - 0.019, { handle: 'none', gap: 0.003 });
    }
  }
  kit.solid(rect(0, 0, modules * w, D + 0.02), 0, H, 'console');
  kit.walkable(rect(0, 0, modules * w, D), H);
  kit.occluder([0, 0, 0], [modules * w, H, D]);
}

/** Console top kit: white games tower (original), headphones on a stand, small box speaker, controller. */
export function consoleDressing(kit) {
  kit.at(0.32, 0, 0.18, 0.12, () => {
    softBox(kit, 'plasticWhite', [-0.05, 0, -0.13], [0.05, 0.39, 0.13], { r: 0.02, occlude: false });
    kit.box('plasticBlack', [-0.012, 0.01, -0.131], [0.012, 0.37, 0.131], { seg: 9, occlude: false });
  });
  kit.at(0.75, 0, 0.2, 0, () => {
    kit.cylinder('plasticBlack', [0, 0, 0], 0.06, 0.012, { sides: 8 });
    kit.cylinder('steelGray', [0, 0.012, 0], 0.008, 0.28, { sides: 4 });
    for (const s of [-1, 1]) softBox(kit, 'plasticBlack', [s * 0.07 - 0.02, 0.17, -0.04], [s * 0.07 + 0.02, 0.25, 0.04], { r: 0.012, occlude: false });
    kit.tube('plasticBlack', Array.from({ length: 7 }, (_, i) => {
      const a = Math.PI - (i / 6) * Math.PI;
      return [Math.cos(a) * 0.075, 0.22 + Math.sin(a) * 0.09, 0];
    }), 0.01, { sides: 4 });
  });
  kit.at(1.25, 0, 0.2, 0, () => {
    softBox(kit, 'plasticBlack', [-0.1, 0, -0.07], [0.1, 0.1, 0.07], { r: 0.01, occlude: false });
    kit.cylinder('steelGray', [0, 0.04, 0.071], 0.03, 0.002, { sides: 8 });
  });
  kit.at(0.95, 0, 0.3, -0.3, () => {
    softBox(kit, 'plasticWhite', [-0.07, 0, -0.04], [0.07, 0.04, 0.04], { r: 0.015, occlude: false });
  });
}

/** Lava lamp: tapered emissive glass body on a chrome cone base with a cap. */
export function lavaLamp(kit, name) {
  kit.lathe('chrome', [0, 0, 0], [[0.001, 0], [0.05, 0], [0.032, 0.09], [0.022, 0.1]], { sides: 8 });
  kit.glow(name, () => kit.lathe('lavaLamp', [0, 0.1, 0], [[0.022, 0], [0.034, 0.12], [0.02, 0.24], [0.001, 0.24]], { sides: 8 }));
  kit.lathe('chrome', [0, 0.34, 0], [[0.02, 0], [0.012, 0.05], [0.001, 0.055]], { sides: 8 });
  kit.light({ name, pos: [0.08, 0.25, 0], color: '#ff5a6a', intensity: 0.4, range: 1.8, switchable: true, fill: 0.2, zone: 'unit' });
}

/** Wall-mounted TV: thin black bezel, screen glowing on the TV's layer. Back on z = 0, faces +Z. */
export function wallTV(kit, { w = 1.45, h = 0.84, name = 'tv-glow', id = null } = {}) {
  slab(kit, 'plasticBlack', [-w / 2, -h / 2, 0.02], [w / 2, h / 2, 0.055], { r: 0.004, occlude: false });
  kit.box('plasticBlack', [-0.2, -0.15, 0], [0.2, 0.15, 0.02], { seg: 9, occlude: false });
  kit.glow(name, () => kit.panel('tv', [0, 0.005, 0.0555], [w - 0.024, h - 0.034], '+z'));
  kit.light({ name, pos: [0, 0, 0.6], color: '#9a8cf0', intensity: 1.0, range: 3.4, dir: [0, -0.15, 1], cone: 0.1, zone: 'unit', switchable: true, fill: 0.4 });
  if (id) kit.interactable({ id, kind: 'tv', pos: [0, -0.4, 0.3], yaw: Math.PI, radius: 2.4, prompt: 'TV', data: { lights: [name], on: true } });
}

/**
 * Hektar-style floor lamp: weighted disc base, thin stem, angled matte grey dome shade glowing on
 * its own layer (and a shadowed rig candidate).
 */
export function floorLamp(kit, name, { id = null } = {}) {
  kit.lathe('steelGray', [0, 0, 0], [[0.001, 0], [0.17, 0], [0.17, 0.02], [0.14, 0.035], [0.02, 0.04]], { sides: 10 });
  kit.cylinder('steelGray', [0, 0.04, 0], 0.012, 1.55, { sides: 5 });
  kit.cylinder('steelGray', [0, 1.4, 0], 0.016, 0.06, { sides: 5 });
  kit.tube('steelGray', [[0, 1.59, 0], [0.05, 1.66, 0.04], [0.14, 1.7, 0.1]], 0.012, { sides: 4 });
  const m = new THREE.Matrix4().makeRotationX(-0.55).setPosition(0.2, 1.62, 0.14);
  const prof = [[0.012, 0.21], [0.05, 0.2], [0.1, 0.15], [0.14, 0.06], [0.16, 0.0]];
  kit.geometry('steelGray', new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 10), m);
  kit.geometry('steelGray', new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r - 0.004, y)).reverse(), 10), m);
  kit.glow(name, () => kit.geometry('bulbWarm', new THREE.CircleGeometry(0.15, 10).rotateX(Math.PI / 2), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.004, 0))));
  const dir = new THREE.Vector3(0, -1, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.55)).toArray();
  kit.solid(rect(-0.17, -0.17, 0.17, 0.17), 0, 1.8, 'lamp');
  kit.light({ name, pos: [0.2, 1.52, 0.2], color: '#ffd09a', intensity: 2.0, range: 5, dir, cone: 0.15, dynamic: true, zone: 'unit', switchable: true, shadow: true, fill: 0.8 });
  if (id) kit.interactable({ id, kind: 'lamp', pos: [0, 1.0, 0], yaw: 0, radius: 1.2, prompt: 'Lamp', data: { lights: [name], on: true } });
}

/**
 * Strap-metal orb pendant: interlaced curved bronze bands around a bare bulb on a long chain
 * (reference: two banded spheres at different heights). Origin is the ceiling attachment.
 */
export function orbPendant(kit, name, { drop = 2.2, r = 0.32 } = {}) {
  const c = [0, -drop, 0];
  const band = (yaw, tilt) => strapRing(kit, 'bronze', r, 0.045, 0.006, new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(tilt)).setPosition(...c), 16);
  for (let i = 0; i < 6; i++) band((i / 6) * Math.PI, Math.PI / 2 - 0.18 * (i % 3));
  band(0, 0);
  band(0.4, 0.5);
  band(-0.6, -0.5);
  kit.cylinder('bronze', [0, c[1] + r - 0.02, 0], 0.03, 0.05, { sides: 6 });
  kit.glow(name, () => kit.sphere('bulbWarm', [0, c[1] - 0.02, 0], 0.055, { w: 6, h: 5, scale: [1, 1.25, 1] }));
  for (const yaw of [0, Math.PI / 2]) kit.at(0, 0, 0, yaw, () => kit.decal('chain', [0, -(drop - r) / 2, 0], [0.04, drop - r], '+z', { cut: true }));
  kit.cylinder('steelBlack', [0, -0.04, 0], 0.05, 0.04, { sides: 8 });
  kit.light({ name, pos: [0, c[1] - 0.05, 0], color: '#ffd49a', intensity: 2.4, range: 7, dynamic: true, zone: 'unit', switchable: true, shadow: true, fill: 0.9 });
}

/** Ceiling track with cylindrical spot heads aimed along `aim` (local). Origin at the track centre. */
export function trackLight(kit, name, length, heads, aim = [0, -1, 0.3], { layer = name } = {}) {
  slab(kit, 'steelBlack', [-length / 2, -0.035, -0.018], [length / 2, 0, 0.018], { r: 0.004, occlude: false });
  const d = new THREE.Vector3(...aim).normalize();
  for (let i = 0; i < heads; i++) {
    const x = -length / 2 + ((i + 0.5) / heads) * length;
    kit.box('steelBlack', [x - 0.02, -0.06, -0.015], [x + 0.02, -0.035, 0.015], { seg: 9, occlude: false });
    kit.tube('steelBlack', [[x - 0.035, -0.06, 0], [x - 0.035, -0.13, 0], [x + 0.035, -0.13, 0], [x + 0.035, -0.06, 0]], 0.005, { sides: 3 });
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, new THREE.Vector3(0, 1, 0.0001)).setPosition(x, -0.14, 0);
    kit.geometry('steelBlack', new THREE.CylinderGeometry(0.042, 0.042, 0.13, 8).rotateX(Math.PI / 2), m);
    kit.geometry('steelBlack', new THREE.CylinderGeometry(0.047, 0.047, 0.015, 8).rotateX(Math.PI / 2).translate(0, 0, -0.06), m);
    kit.glow(layer, () => kit.geometry('bulbWarm', new THREE.CircleGeometry(0.034, 8).rotateY(Math.PI).translate(0, 0, -0.0655), m));
    kit.light({ name: `${name}-${i}`, pos: [x + d.x * 0.1, -0.14 + d.y * 0.1, d.z * 0.1], color: '#ffe2c0', intensity: 0.9, range: 6.0, dir: d.toArray(), cone: Math.cos(0.4), zone: 'unit', layer, fill: 0.25 });
  }
}

/**
 * Spiral-seam galvanised duct along a frame-local polyline: lock-seam rings every 0.6 m, a
 * rectangular register near its end, hanger straps.
 */
export function spiralDuct(kit, points, r = 0.28, { hangers = [] } = {}) {
  kit.tube('galvanized', points, r, { sides: 10 });
  for (let s = 0; s < points.length - 1; s++) {
    const a = new THREE.Vector3(...points[s]);
    const b = new THREE.Vector3(...points[s + 1]);
    const len = a.distanceTo(b);
    for (let t = 0.3; t < len - 0.1; t += 0.6) {
      const p = a.clone().lerp(b, t / len);
      const q = a.clone().lerp(b, (t + 0.025) / len);
      kit.tube('steelGray', [p.toArray(), q.toArray()], r + 0.006, { sides: 10 });
    }
  }
  const end = points[points.length - 1];
  kit.cylinder('galvanized', [end[0], end[1] - r * 0.98, end[2]], r * 0.98, 0.01, { sides: 10, rings: 1 });
  for (const h of hangers) {
    kit.tube('wire', [[h[0], h[1], h[2]], [h[0], h[3], h[2]]], 0.004, { sides: 3 });
    kit.tube('steelGray', [[h[0] - r - 0.01, h[3] - r, h[2]], [h[0] - r - 0.01, h[3], h[2]], [h[0] + r + 0.01, h[3], h[2]], [h[0] + r + 0.01, h[3] - r, h[2]]], 0.006, { sides: 3 });
  }
}

/** Rectangular duct register (louvred grille box) facing -Y under a duct, origin at its centre. */
export function register(kit, w = 0.5, d = 0.2, h = 0.22) {
  slab(kit, 'galvanized', [-w / 2, -h, -d / 2], [w / 2, 0, d / 2], { r: 0.006, occlude: false });
  for (let x = -w / 2 + 0.04; x < w / 2 - 0.03; x += 0.035) kit.box('steelBlack', [x, -h - 0.004, -d / 2 + 0.02], [x + 0.012, -h + 0.002, d / 2 - 0.02], { seg: 9, occlude: false });
}

/**
 * Kitchen run along +X, back on z = 0: plinth-recessed base cabinets with door and drawer fronts and
 * bar pulls, a stone counter with a front nosing, tiled splash, undermount sink and gooseneck tap,
 * a freestanding range with knobs, oven window and handle, a microwave over the range and wall
 * uppers with doors and an under-cabinet light rail.
 */
export function kitchenRun(kit, length, { fridge = true, layer = null } = {}) {
  const d = 0.62;
  const C = FURNITURE.counter;
  const rangeX = 1.0;
  const rw = 0.38;
  kit.box('plasticBlack', [0, 0, 0.02], [length, 0.1, d - 0.08], { seg: 9, occlude: false });
  for (const [xa, xb] of [[0, rangeX - rw], [rangeX + rw, length]]) {
    kit.box('cabinet', [xa, 0.1, 0], [xb, C - 0.04, d - 0.05], { seg: 9, occlude: false });
    const span = xb - xa;
    const doors = Math.max(1, Math.round(span / 0.6));
    const dw = span / doors;
    for (let i = 0; i < doors; i++) {
      const fa = xa + i * dw;
      front(kit, 'cabinet', [fa, C - 0.21, fa + dw, C - 0.045], d - 0.05, { handle: 'bar', place: 'mid', handleMat: 'stainless' });
      front(kit, 'cabinet', [fa, 0.1, fa + dw, C - 0.21], d - 0.05, { handle: 'bar', place: i % 2 ? 'left' : 'right', handleMat: 'stainless', style: 'slab' });
    }
  }
  slab(kit, 'concreteGray', [-0.01, C - 0.04, -0.01], [length + 0.01, C, d + 0.01], { r: 0.006 });
  kit.box('tileWhite', [0, C, 0], [length, C + 0.5, 0.012], { seg: 9, uv: 'world', occlude: false });
  const sink = Math.min(length - 0.5, 2.2);
  kit.box('stainless', [sink - 0.36, C - 0.2, 0.12], [sink + 0.36, C + 0.002, 0.5], { seg: 9, faces: { py: false }, occlude: false });
  kit.box('plasticBlack', [sink - 0.34, C - 0.2, 0.14], [sink + 0.34, C - 0.19, 0.48], { seg: 9, occlude: false });
  kit.cylinder('stainless', [sink, C, 0.07], 0.025, 0.04, { sides: 6 });
  kit.tube('chrome', [[sink, C + 0.04, 0.07], [sink, C + 0.33, 0.07], [sink, C + 0.37, 0.12], [sink, C + 0.33, 0.22], [sink, C + 0.29, 0.23]], 0.012, { sides: 5 });
  kit.box('chrome', [sink + 0.05, C + 0.12, 0.06], [sink + 0.07, C + 0.14, 0.12], { seg: 9, occlude: false });
  slab(kit, 'stainless', [rangeX - rw, 0.0, 0.0], [rangeX + rw, C + 0.01, d], { r: 0.008 });
  kit.box('plasticBlack', [rangeX - rw + 0.02, C + 0.011, 0.04], [rangeX + rw - 0.02, C + 0.016, d - 0.04], { seg: 9, occlude: false });
  for (const [bx, bz, br] of [[-0.17, 0.18, 0.09], [0.17, 0.18, 0.07], [-0.17, 0.44, 0.07], [0.17, 0.44, 0.09]]) kit.cylinder('steelBlack', [rangeX + bx, C + 0.016, bz], br, 0.012, { sides: 8 });
  kit.box('stainless', [rangeX - rw, C + 0.01, 0], [rangeX + rw, C + 0.13, 0.06], { seg: 9, occlude: false });
  for (let k = 0; k < 4; k++) kit.geometry('plasticBlack', new THREE.CylinderGeometry(0.016, 0.018, 0.025, 6).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(rangeX - 0.24 + k * 0.16, C - 0.06, d + 0.012));
  kit.box('plasticBlack', [rangeX - 0.3, 0.2, d], [rangeX + 0.3, 0.68, d + 0.008], { seg: 9, occlude: false });
  kit.box('glassDark', [rangeX - 0.22, 0.32, d + 0.008], [rangeX + 0.22, 0.58, d + 0.01], { seg: 9, occlude: false });
  kit.tube('chrome', [[rangeX - 0.28, 0.72, d], [rangeX - 0.28, 0.72, d + 0.04], [rangeX + 0.28, 0.72, d + 0.04], [rangeX + 0.28, 0.72, d]], 0.008, { sides: 4 });
  slab(kit, 'stainless', [rangeX - rw, 1.55, 0.02], [rangeX + rw, 1.88, 0.42], { r: 0.008 });
  kit.box('plasticBlack', [rangeX - rw + 0.03, 1.59, 0.42], [rangeX + 0.12, 1.84, 0.425], { seg: 9, occlude: false });
  kit.box('plasticBlack', [rangeX + 0.16, 1.62, 0.42], [rangeX + rw - 0.04, 1.82, 0.424], { seg: 9, occlude: false });
  handle(kit, 'vbar', [rangeX + 0.135, 1.715], 0.42, { len: 0.18, mat: 'chrome' });
  const upperY = 1.45;
  kit.box('cabinet', [rangeX + 0.4, upperY, 0], [length, 2.25, 0.32], { seg: 9, occlude: false });
  kit.box('cabinet', [0, 1.9, 0], [rangeX + 0.4, 2.25, 0.32], { seg: 9, occlude: false });
  const uspan = length - rangeX - 0.4;
  const ud = Math.max(1, Math.round(uspan / 0.5));
  for (let i = 0; i < ud; i++) {
    const fa = rangeX + 0.4 + (i * uspan) / ud;
    front(kit, 'cabinet', [fa, upperY, fa + uspan / ud, 2.25], 0.32, { handle: 'bar', place: i % 2 ? 'bottom' : 'bottom', handleMat: 'stainless', handleLen: 0.12 });
  }
  for (let i = 0; i < 2; i++) front(kit, 'cabinet', [i * (rangeX + 0.4) / 2, 1.9, (i + 1) * (rangeX + 0.4) / 2, 2.25], 0.32, { handle: 'bar', place: 'bottom', handleMat: 'stainless', handleLen: 0.12 });
  kit.box('steelGray', [rangeX + 0.42, upperY - 0.025, 0.24], [length - 0.02, upperY, 0.3], { seg: 9, occlude: false });
  const glow = () => kit.panel('bulbWarm', [(rangeX + 0.4 + length) / 2, upperY - 0.026, 0.27], [length - rangeX - 0.5, 0.03], '-y');
  if (layer) kit.glow(layer, glow);
  else glow();
  if (fridge) {
    slab(kit, 'stainless', [-0.78, 0, 0], [-0.02, 1.82, 0.7], { r: 0.012 });
    kit.box('plasticBlack', [-0.77, 1.16, 0.7], [-0.03, 1.175, 0.705], { seg: 9, occlude: false });
    handle(kit, 'vbar', [-0.08, 0.8], 0.7, { len: 0.5 });
    handle(kit, 'vbar', [-0.08, 1.45], 0.7, { len: 0.3 });
  }
  kit.solid(rect(fridge ? -0.78 : 0, 0, length, d), 0, C, 'counter');
  if (fridge) kit.solid(rect(-0.78, 0, -0.02, 0.72), 0, 1.82, 'fridge');
  kit.occluder([fridge ? -0.78 : 0, 0, 0], [length, C, d]);
}

/** Two-door stainless fridge facing +Z (freezer on top), handles on the right. */
export function fridge(kit, w = 0.74, h = 1.82, d = 0.7) {
  slab(kit, 'stainless', [-w / 2, 0.02, 0], [w / 2, h, d - 0.04], { r: 0.012, collide: true, tag: 'fridge' });
  slab(kit, 'stainless', [-w / 2 + 0.005, 0.03, d - 0.04], [w / 2 - 0.005, h * 0.64, d], { r: 0.01, occlude: false });
  slab(kit, 'stainless', [-w / 2 + 0.005, h * 0.64 + 0.008, d - 0.04], [w / 2 - 0.005, h - 0.005, d], { r: 0.01, occlude: false });
  kit.box('plasticBlack', [-w / 2 + 0.02, 0, 0.05], [w / 2 - 0.02, 0.03, d - 0.05], { seg: 9, occlude: false });
  handle(kit, 'vbar', [w / 2 - 0.06, h * 0.42], d, { len: 0.55, mat: 'chrome' });
  handle(kit, 'vbar', [w / 2 - 0.06, h * 0.8], d, { len: 0.3, mat: 'chrome' });
  kit.decal('noticeMeeting', [-0.12, h * 0.48, d + 0.004], [0.14, 0.14], '+z');
  kit.decal('flyerCat', [0.08, h * 0.38, d + 0.004], [0.13, 0.13], '+z', { rot: 0.1 });
}

export function toilet(kit) {
  kit.lathe('ceramic', [0, 0, 0.34], [[0.001, 0], [0.13, 0], [0.12, 0.08], [0.15, 0.24], [0.2, 0.37], [0.19, 0.39], [0.001, 0.39]], { sides: 10 });
  kit.geometry('ceramic', new THREE.TorusGeometry(0.155, 0.022, 3, 12).rotateX(Math.PI / 2).scale(1, 1, 1.22), new THREE.Matrix4().makeTranslation(0, 0.41, 0.36));
  softBox(kit, 'ceramic', [-0.2, 0.39, 0.0], [0.2, 0.78, 0.18], { r: 0.02, occlude: false });
  softBox(kit, 'ceramic', [-0.21, 0.78, -0.005], [0.21, 0.81, 0.19], { r: 0.012, occlude: false });
  kit.box('chrome', [0.12, 0.72, 0.18], [0.16, 0.74, 0.2], { seg: 9, occlude: false });
  kit.solid(rect(-0.2, 0, 0.2, 0.58), 0, 0.78, 'toilet');
}

/** Wall vanity: dark wood cabinet with two doors, ceramic top with basin, tap, framed mirror, light bar. */
export function vanity(kit, w = 0.75) {
  kit.box('woodDark', [-w / 2, 0.12, 0], [w / 2, 0.82, 0.45], { seg: 9, occlude: false });
  kit.box('plasticBlack', [-w / 2 + 0.02, 0, 0.02], [w / 2 - 0.02, 0.12, 0.4], { seg: 9, occlude: false });
  front(kit, 'woodDark', [-w / 2, 0.12, 0, 0.82], 0.45, { handle: 'knob', place: 'right', handleMat: 'chrome' });
  front(kit, 'woodDark', [0, 0.12, w / 2, 0.82], 0.45, { handle: 'knob', place: 'left', handleMat: 'chrome' });
  slab(kit, 'ceramic', [-w / 2 - 0.01, 0.82, -0.01], [w / 2 + 0.01, 0.86, 0.5], { r: 0.008 });
  kit.lathe('ceramic', [0, 0.86, 0.26], [[0.16, 0.003], [0.14, 0.002], [0.1, -0.06], [0.001, -0.07]], { sides: 10 });
  kit.cylinder('chrome', [0, 0.86, 0.06], 0.018, 0.06, { sides: 6 });
  kit.tube('chrome', [[0, 0.92, 0.06], [0, 0.95, 0.06], [0, 0.95, 0.16]], 0.01, { sides: 4 });
  slab(kit, 'plasticBlack', [-w * 0.42, 1.04, 0], [w * 0.42, 1.86, 0.025], { r: 0.003, occlude: false });
  kit.panel('mirror', [0, 1.45, 0.026], [w * 0.8, 0.78], '+z');
  kit.box('chrome', [-0.3, 1.92, 0], [0.3, 1.97, 0.08], { seg: 9, occlude: false });
  kit.panel('bulbWarm', [0, 1.919, 0.05], [0.55, 0.05], '-y');
  for (const [x, mat, h] of [[0.26, 'bottleGreen', 0.16], [0.3, 'plasticWhite', 0.12], [-0.28, 'ceramic', 0.08]]) kit.cylinder(mat, [x, 0.86, 0.1], 0.025, h, { sides: 6 });
  kit.solid(rect(-w / 2, 0, w / 2, 0.5), 0, 0.86, 'vanity');
}

/** Corner shower: tiled curb, chrome-framed glass screen, rain head, wall valve, a hanging towel. */
export function shower(kit, w = 0.95, d = 0.95) {
  slab(kit, 'tileWhite', [0, 0, 0], [w, 0.08, d], { r: 0.008 });
  kit.box('drainGrate', [w / 2 - 0.05, 0.081, d / 2 - 0.05], [w / 2 + 0.05, 0.083, d / 2 + 0.05], { seg: 9, uv: 'fit', occlude: false });
  kit.panel('glass', [w / 2, 1.06, d], [w - 0.03, 1.9], '+z');
  kit.box('chrome', [w - 0.02, 0.08, d - 0.02], [w + 0.01, 2.02, d + 0.01], { seg: 9, occlude: false });
  kit.box('chrome', [0, 2.0, d - 0.015], [w, 2.02, d + 0.015], { seg: 9, occlude: false });
  kit.box('chrome', [0, 0.08, d - 0.015], [w, 0.1, d + 0.015], { seg: 9, occlude: false });
  kit.tube('chrome', [[0.01, 1.95, d / 2], [0.25, 2.02, d / 2]], 0.012, { sides: 4 });
  kit.cylinder('chrome', [0.25, 1.99, d / 2], 0.1, 0.018, { sides: 10 });
  kit.cylinder('chrome', [0.01, 1.05, d / 2], 0.04, 0.03, { sides: 8, radiusTop: 0.04 });
  kit.solid(rect(0, 0, w, d + 0.02), 0, 2.0, 'shower');
}

/** Towel draped over a bar on a wall (bar along X at the origin, wall at z = 0). */
export function towel(kit, mat = 'knit', w = 0.45) {
  kit.tube('chrome', [[-w / 2 - 0.05, 0, 0], [-w / 2 - 0.05, 0, 0.07], [w / 2 + 0.05, 0, 0.07], [w / 2 + 0.05, 0, 0]], 0.009, { sides: 4 });
  softBox(kit, mat, [-w / 2, -0.55, 0.055], [w / 2, 0.015, 0.085], { r: 0.012, puff: 0.006, puffAxis: 2, occlude: false });
}

/**
 * Platform bed: walnut frame on tapered legs, upholstered headboard, puffed mattress, duvet with a
 * folded-back top edge, two pillows. Head at z = 0, foot toward +Z. Registers an edge seat with `id`.
 */
export function bed(kit, { w = 1.55, l = 2.05, id = null } = {}) {
  slab(kit, 'woodDark', [-w / 2, 0.12, 0], [w / 2, 0.28, l], { r: 0.012 });
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [0.08, l - 0.08]) taperLeg(kit, 'woodDark', [x, 0, z], 0.12, { top: 0.03, bottom: 0.022 });
  softBox(kit, 'ceramic', [-w / 2 + 0.03, 0.28, 0.03], [w / 2 - 0.03, 0.47, l - 0.03], { r: 0.04, puff: 0.015 });
  softBox(kit, 'bedding', [-w / 2 + 0.01, 0.4, 0.6], [w / 2 - 0.01, FURNITURE.bed + 0.05, l + 0.01], { r: 0.05, puff: 0.03, dent: [0.2, 1.3, 0.025, 0.5], occlude: false });
  softBox(kit, 'bedding', [-w / 2 + 0.005, 0.47, 0.55], [w / 2 - 0.005, 0.6, 0.78], { r: 0.05, puff: 0.02, occlude: false });
  for (const s of [-1, 1]) kit.at(s * w / 4, 0.48, 0.3, s * 0.06, () => softBox(kit, 'ceramic', [-0.32, 0, -0.18], [0.32, 0.13, 0.18], { r: 0.05, puff: 0.04, occlude: false }));
  softBox(kit, 'sage', [-w / 2 - 0.03, 0.15, -0.08], [w / 2 + 0.03, 1.05, 0.0], { r: 0.035, puff: 0.025, puffAxis: 2 });
  kit.solid(rect(-w / 2 - 0.03, -0.08, w / 2 + 0.03, l + 0.02), 0, 0.6, 'bed');
  if (id) kit.interactable({ id, kind: 'seat', pos: [0, FURNITURE.bed, l * 0.62], yaw: 0, radius: 1.3, prompt: 'Sit', data: { seatHeight: FURNITURE.bed, variant: 'bed', exit: [0, 0, l + 0.45] } });
}

/** Nightstand with a drawer and an open shelf, tapered legs. */
export function nightstand(kit, w = 0.45, d = 0.4, h = 0.52) {
  slab(kit, 'woodDark', [-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], { r: 0.006 });
  slab(kit, 'woodDark', [-w / 2, 0.12, -d / 2], [w / 2, 0.15, d / 2], { r: 0.004, occlude: false });
  for (const s of [-1, 1]) kit.box('woodDark', [s > 0 ? w / 2 - 0.02 : -w / 2, 0.15, -d / 2], [s > 0 ? w / 2 : -w / 2 + 0.02, h - 0.03, d / 2], { seg: 9, occlude: false });
  kit.box('woodDark', [-w / 2, 0.15, -d / 2], [w / 2, h - 0.03, -d / 2 + 0.015], { seg: 9, occlude: false });
  front(kit, 'woodDark', [-w / 2 + 0.02, h - 0.17, w / 2 - 0.02, h - 0.03], d / 2 - 0.02, { handle: 'knob', place: 'mid', handleMat: 'brass' });
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) taperLeg(kit, 'woodDark', [x, 0, z], 0.12, { top: 0.016, bottom: 0.011 });
  kit.solid(rect(-w / 2, -d / 2, w / 2, d / 2), 0, h, 'nightstand');
  kit.walkable(rect(-w / 2, -d / 2, w / 2, d / 2), h);
}

/** Brass bedside lamp with a fabric drum shade glowing on its own layer. */
export function tableLamp(kit, name, { id = null, zone = 'unit' } = {}) {
  kit.lathe('brass', [0, 0, 0], [[0.001, 0], [0.07, 0], [0.07, 0.015], [0.02, 0.03], [0.015, 0.3], [0.001, 0.31]], { sides: 8 });
  kit.glow(name, () => {
    kit.lathe('mustard', [0, 0.24, 0], [[0.11, 0], [0.08, 0.18], [0.079, 0.18], [0.109, 0.0]], { sides: 10 });
    kit.sphere('bulbWarm', [0, 0.3, 0], 0.03, { w: 6, h: 4 });
  });
  kit.light({ name, pos: [0, 0.32, 0], color: '#ffc27e', intensity: 1.2, range: 3.2, dynamic: true, zone, switchable: true, fill: 1.0 });
  if (id) kit.interactable({ id, kind: 'lamp', pos: [0, 0.3, 0], radius: 1.0, prompt: 'Lamp', data: { lights: [name], on: true } });
}

/** Chrome garment rack on casters with hanging shirts, a jacket and jeans (rng picks colours). */
export function clothesRack(kit, w = 1.2, rng) {
  for (const x of [-w / 2, w / 2]) {
    kit.tube('chrome', [[x, 0.08, 0], [x, 1.62, 0]], 0.013, { sides: 5 });
    kit.tube('chrome', [[x, 0.08, -0.25], [x, 0.08, 0.25]], 0.013, { sides: 5 });
    for (const z of [-0.24, 0.24]) kit.cylinder('rubber', [x, 0, z], 0.03, 0.06, { sides: 6 });
  }
  kit.tube('chrome', [[-w / 2, 1.62, 0], [w / 2, 1.62, 0]], 0.012, { sides: 5 });
  for (let i = 0; i < 9; i++) {
    const x = -w / 2 + 0.12 + i * ((w - 0.24) / 8);
    const mat = rng.pick(['bedding', 'sage', 'mustard', 'plasticBlack', 'knit', 'denim', 'redPaint']);
    const len = 0.6 + rng.next() * 0.25;
    kit.tube('chrome', [[x - 0.17, 1.52, 0], [x, 1.59, 0], [x + 0.17, 1.52, 0]], 0.004, { sides: 3 });
    softBox(kit, mat, [x - 0.025, 1.55 - len, -0.2], [x + 0.025, 1.55, 0.2], { r: 0.02, puff: 0.01, puffAxis: 0, occlude: false });
  }
  kit.solid(rect(-w / 2, -0.27, w / 2, 0.27), 0, 1.6, 'rack');
}

/**
 * Blond-wood storage cube table by the sofa (reference: long honey maple box), with an open shelf
 * facing +Z holding books. Walkable top.
 */
export function cubeTable(kit, w, d, h) {
  const t = 0.022;
  slab(kit, 'maple', [0, h - t, 0], [w, h, d], { r: 0.006 });
  slab(kit, 'maple', [0, 0, 0], [w, t, d], { r: 0.004, occlude: false });
  slab(kit, 'maple', [0, t, 0], [t, h - t, d], { r: 0.004, occlude: false });
  slab(kit, 'maple', [w - t, t, 0], [w, h - t, d], { r: 0.004, occlude: false });
  slab(kit, 'maple', [t, t, 0], [w - t, h - t, t], { r: 0.003, occlude: false });
  slab(kit, 'maple', [t, h / 2 - t / 2, t], [w - t, h / 2 + t / 2, d - 0.01], { r: 0.003, occlude: false });
  kit.box('books', [t + 0.02, t, 0.05], [t + 0.02 + 0.3, t + 0.24, 0.22], { seg: 9, uv: 'box', occlude: false });
  kit.box('magazines', [w * 0.45, h / 2 + t / 2, 0.06], [w * 0.45 + 0.22, h / 2 + t / 2 + 0.06, 0.34], { seg: 9, uv: 'fit', occlude: false });
  kit.solid(rect(0, 0, w, d), 0, h, 'cube');
  kit.walkable(rect(0, 0, w, d), h);
  kit.occluder([0, 0, 0], [w, h, d]);
}

/** Tolix-style red metal stool: splayed folded-sheet legs, rimmed seat, cross bracing ring. */
export function tolixStool(kit, h = 0.76, { id = null } = {}) {
  const t = 0.17;
  slab(kit, 'redPaint', [-t, h - 0.025, -t], [t, h, t], { r: 0.008 });
  for (const s of [-1, 1]) {
    kit.box('redPaint', [-t, h - 0.07, s > 0 ? t - 0.006 : -t], [t, h - 0.025, s > 0 ? t : -t + 0.006], { seg: 9, occlude: false });
    kit.box('redPaint', [s > 0 ? t - 0.006 : -t, h - 0.07, -t], [s > 0 ? t : -t + 0.006, h - 0.025, t], { seg: 9, occlude: false });
  }
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) taperLeg(kit, 'redPaint', [x * (t - 0.025), 0, z * (t - 0.025)], h - 0.03, { top: 0.022, bottom: 0.016, splay: [x * 0.07, z * 0.07] });
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([x, z]) => [x * (t + 0.022), 0.24, z * (t + 0.022)]);
  kit.tube('redPaint', ring, 0.008, { sides: 4 });
  kit.solid(rect(-t - 0.06, -t - 0.06, t + 0.06, t + 0.06), 0, h, 'stool');
  if (id) kit.interactable({ id, kind: 'seat', pos: [0, h, 0], yaw: 0, radius: 1.2, prompt: 'Sit', data: { seatHeight: h, variant: 'stool', exit: [0, 0, 0.6] } });
}

/** Eames-style grey shell side chair on a stacking frame (legs + side rails), facing +Z. */
export function shellChair(kit, { id = null, mat = 'plasticGrey' } = {}) {
  shellSeat(kit, mat, { y0: FURNITURE.seat + 0.02 });
  for (const s of [-1, 1]) {
    kit.tube('chrome', [[s * 0.19, 0.0, 0.2], [s * 0.18, FURNITURE.seat - 0.02, 0.15], [s * 0.18, FURNITURE.seat - 0.02, -0.15], [s * 0.19, 0.0, -0.2]], 0.008, { sides: 4 });
    kit.tube('chrome', [[s * 0.185, 0.22, 0.18], [s * 0.185, 0.22, -0.18]], 0.006, { sides: 3 });
    for (const z of [0.2, -0.2]) kit.cylinder('rubber', [s * 0.19, 0, z], 0.011, 0.012, { sides: 5 });
  }
  kit.tube('chrome', [[-0.18, FURNITURE.seat - 0.02, 0], [0.18, FURNITURE.seat - 0.02, 0]], 0.006, { sides: 3 });
  kit.solid(rect(-0.24, -0.27, 0.24, 0.24), 0, 0.82, 'chair');
  if (id) kit.interactable({ id, kind: 'seat', pos: [0, FURNITURE.seat + 0.02, 0.02], yaw: 0, radius: 1.2, prompt: 'Sit', data: { seatHeight: FURNITURE.seat + 0.02, variant: 'chair', exit: [0, 0, 0.62] } });
}

/** Framed print: black frame with real depth, white mat, art panel. Back on z = 0, faces +Z. */
export function artFrame(kit, mat, w, h, { depth = 0.035, matWidth = 0.07 } = {}) {
  const f = 0.03;
  for (const [a, b] of [[[-w / 2, -h / 2], [w / 2, -h / 2 + f]], [[-w / 2, h / 2 - f], [w / 2, h / 2]], [[-w / 2, -h / 2 + f], [-w / 2 + f, h / 2 - f]], [[w / 2 - f, -h / 2 + f], [w / 2, h / 2 - f]]]) {
    slab(kit, 'plasticBlack', [a[0], a[1], 0], [b[0], b[1], depth], { r: 0.004, occlude: false });
  }
  kit.panel('paper', [0, 0, depth - 0.01], [w - 2 * f, h - 2 * f], '+z');
  kit.panel(mat, [0, 0, depth - 0.009], [w - 2 * f - 2 * matWidth, h - 2 * f - 2 * matWidth], '+z');
}

/** Tall leaning mirror: base on the floor at z = 0.12, top touching the wall (z = 0). Faces +Z. */
export function leaningMirror(kit, w = 0.7, h = 1.9) {
  const lean = Math.atan2(0.12, h);
  const m = new THREE.Matrix4().makeRotationX(-lean).setPosition(0, 0, 0.12);
  const f = 0.035;
  for (const [a, b] of [[[-w / 2, 0], [w / 2, f]], [[-w / 2, h - f], [w / 2, h]], [[-w / 2, f], [-w / 2 + f, h - f]], [[w / 2 - f, f], [w / 2, h - f]]]) {
    const g = new THREE.BoxGeometry(b[0] - a[0], b[1] - a[1], 0.03).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0);
    kit.geometry('plasticBlack', g, m, { uv: 'box' });
  }
  kit.geometry('plasticBlack', new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, h / 2, -0.015), m);
  kit.geometry('mirror', new THREE.PlaneGeometry(w - 2 * f, h - 2 * f).translate(0, h / 2, 0.008), m);
  kit.solid(rect(-w / 2, 0, w / 2, 0.14), 0, h, 'mirror');
}

/** Road / flight case: black ply with aluminium edge extrusions, ball corners, latches, handle, "48F". */
export function flightCase(kit, w = 0.55, h = 0.55, d = 0.42) {
  slab(kit, 'plasticBlack', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], { r: 0.006, collide: true, tag: 'case' });
  kit.panel('case48', [0, h / 2, d / 2 + 0.002], [w * 0.86, h * 0.86], '+z');
  const e = 0.012;
  for (const y of [0, h - e]) {
    for (const z of [-d / 2 - 0.003, d / 2 - e + 0.003]) kit.box('chrome', [-w / 2 - 0.003, y, z], [w / 2 + 0.003, y + e, z + e], { seg: 9, occlude: false });
    for (const x of [-w / 2 - 0.003, w / 2 - e + 0.003]) kit.box('chrome', [x, y, -d / 2], [x + e, y + e, d / 2], { seg: 9, occlude: false });
  }
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
    kit.box('chrome', [x - e / 2 - 0.003, e, z - e / 2], [x + e / 2 + 0.003, h - e, z + e / 2], { seg: 9, occlude: false });
    for (const y of [0.01, h - 0.01]) kit.sphere('chrome', [x, y, z], 0.018, { w: 5, h: 4 });
  }
  for (const x of [-w / 4, w / 4]) kit.box('chrome', [x - 0.03, h * 0.7, d / 2 + 0.003], [x + 0.03, h * 0.7 + 0.05, d / 2 + 0.012], { seg: 9, occlude: false });
  kit.tube('chrome', [[-0.08, h, 0], [-0.08, h + 0.03, 0], [0.08, h + 0.03, 0], [0.08, h, 0]], 0.008, { sides: 4 });
}

/**
 * White weathered rolling utility cart (reference: chipped white step-shelf cart): square uprights,
 * three shelves with lips, casters; holds bottles and a camcorder when `dress` is set.
 */
export function metalCart(kit, w = 0.62, d = 0.45, h = 1.0, { dress = false } = {}) {
  for (const y of [0.18, 0.55, h]) {
    slab(kit, 'paintWhiteGloss', [0, y - 0.02, 0], [w, y, d], { r: 0.003, occlude: false });
    kit.box('paintWhiteGloss', [0, y, -0.002], [w, y + 0.025, 0.01], { seg: 9, occlude: false });
  }
  for (const [x, z] of [[0, 0], [w, 0], [w, d], [0, d]]) {
    kit.box('paintWhiteGloss', [x - 0.018, 0.06, z - 0.018], [x + 0.018, h, z + 0.018], { seg: 9, occlude: false });
    kit.cylinder('rubber', [x, 0, z], 0.03, 0.06, { sides: 6 });
  }
  kit.decal('scuff', [w / 2, 0.3, d + 0.02], [w, 0.25], '+z');
  if (dress) {
    [[0.1, 'bottleGreen', 0.3], [0.18, 'bottleBrown', 0.24], [0.26, 'glassDark', 0.27], [0.33, 'plasticWhite', 0.18]].forEach(([x, mat, bh]) => {
      kit.cylinder(mat, [x, h, 0.15], 0.035, bh * 0.7, { sides: 6 });
      kit.cylinder(mat, [x, h + bh * 0.7, 0.15], 0.035, bh * 0.15, { radiusTop: 0.013, sides: 6 });
      kit.cylinder(mat, [x, h + bh * 0.85, 0.15], 0.013, bh * 0.15, { sides: 5 });
    });
    kit.at(0.48, h, 0.22, 0.4, () => {
      softBox(kit, 'plasticBlack', [-0.06, 0, -0.1], [0.06, 0.1, 0.1], { r: 0.015, occlude: false });
      kit.geometry('plasticBlack', new THREE.CylinderGeometry(0.035, 0.04, 0.1, 8).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 0.06, 0.14));
    });
    kit.box('cardboard', [0.06, 0.55, 0.06], [0.36, 0.75, 0.38], { seg: 9, occlude: false });
    kit.box('books', [0.4, 0.18, 0.08], [0.58, 0.42, 0.24], { seg: 9, occlude: false });
  }
  kit.solid(rect(-0.02, -0.02, w + 0.02, d + 0.02), 0, h, 'cart');
  kit.walkable(rect(0, 0, w, d), h);
}

/** Floor speaker: cabinet with chamfer, two driver cones with surrounds, port. */
export function speaker(kit, w = 0.3, h = 0.95, d = 0.32) {
  slab(kit, 'plasticBlack', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], { r: 0.008, collide: true, tag: 'speaker' });
  for (const [y, rr] of [[0.28, 0.1], [0.62, 0.1], [0.84, 0.035]]) {
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, y, d / 2 + 0.002);
    kit.geometry('rubber', new THREE.CylinderGeometry(rr, rr, 0.006, 10), m);
    kit.geometry('steelBlack', new THREE.ConeGeometry(rr * 0.8, 0.04, 10, 1, true).rotateX(Math.PI), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.016, 0)));
  }
  kit.cylinder('rubber', [0, 0.08, d / 2], 0.025, 0.002, { sides: 8 });
}

export function basketball(kit, c, mat = 'plasticBlack') {
  kit.sphere(mat, c, 0.12, { w: 8, h: 6 });
  for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2]]) {
    kit.geometry('rubber', new THREE.TorusGeometry(0.121, 0.003, 3, 14), new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0)).setPosition(...c));
  }
}

export function bookStack(kit, n, rng) {
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = 0.025 + rng.next() * 0.02;
    kit.at(0, y, 0, (rng.next() - 0.5) * 0.4, () => kit.box('books', [-0.12, 0, -0.08], [0.12, t, 0.08], { seg: 9, occlude: false }));
    y += t;
  }
  return y;
}

/** Upright books along +X on a surface. */
export function bookRow(kit, length, h = 0.24) {
  kit.box('books', [0, 0, 0], [length, h, 0.18], { seg: 9, uv: 'box', occlude: false });
}

export function broom(kit) {
  kit.geometry('woodDark', new THREE.CylinderGeometry(0.012, 0.012, 1.3, 5), new THREE.Matrix4().makeRotationZ(0.1).setPosition(0.065, 0.75, 0.0));
  kit.box('redPaint', [-0.05, 0.08, -0.025], [0.05, 0.13, 0.025], { seg: 9, occlude: false });
  kit.geometry('plasticBlack', new THREE.CylinderGeometry(0.03, 0.15, 0.1, 6, 1).scale(1, 1, 0.3), new THREE.Matrix4().makeTranslation(0, 0.04, 0));
}

/** Water bottle (steel, lidded). */
export function waterBottle(kit, c) {
  kit.cylinder('steelGray', c, 0.036, 0.22, { sides: 8 });
  kit.cylinder('plasticBlack', [c[0], c[1] + 0.22, c[2]], 0.026, 0.04, { sides: 8 });
}
