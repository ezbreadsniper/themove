import * as THREE from 'three';
import { FURNITURE } from '../units.js';

/**
 * Interior furniture and fixtures, authored at the local origin on y = 0 (the floor of the frame
 * they are placed in), front facing +Z unless noted. Sizes follow real furniture so characters
 * read at the right scale (see units.js FURNITURE).
 */
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** Tufted leather sofa section along +X, back at z = 0, seats toward +Z (Landskrona-like). */
export function sofaSection(kit, length, { depth = 0.92, armLeft = true, armRight = true, mat = 'leather' } = {}) {
  const arm = 0.16;
  const x0 = armLeft ? arm : 0;
  const x1 = length - (armRight ? arm : 0);
  kit.box(mat, [0, 0.12, 0], [length, 0.3, depth], { seg: 9 });
  const seats = Math.max(1, Math.round((x1 - x0) / 0.78));
  const w = (x1 - x0) / seats;
  for (let i = 0; i < seats; i++) {
    const a = x0 + i * w;
    kit.box(mat, [a + 0.01, 0.3, 0.2], [a + w - 0.01, FURNITURE.seat + 0.02, depth - 0.02], { seg: 9 });
    kit.box(mat, [a + 0.01, 0.3, 0.02], [a + w - 0.01, FURNITURE.sofaBack, 0.22], { seg: 9 });
  }
  kit.box(mat, [0, 0.12, 0], [length, FURNITURE.sofaBack - 0.06, 0.06], { seg: 9 });
  if (armLeft) kit.box(mat, [0, 0.12, 0], [arm, 0.62, depth], { seg: 9 });
  if (armRight) kit.box(mat, [length - arm, 0.12, 0], [length, 0.62, depth], { seg: 9 });
  for (const x of [0.06, length - 0.06]) for (const z of [0.06, depth - 0.06]) kit.cylinder('chrome', [x, 0, z], 0.018, 0.12, { sides: 5 });
  kit.solid(rect(0, 0, length, depth), 0, FURNITURE.sofaBack, 'sofa');
  kit.occluder([0, 0, 0], [length, FURNITURE.seat, depth]);
}

export function pillow(kit, mat, c, { w = 0.45, h = 0.42, t = 0.13, yaw = 0, tilt = 0.25 } = {}) {
  const g = new THREE.BoxGeometry(w, h, t, 1, 1, 1);
  const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(-tilt)).setPosition(c[0], c[1], c[2]);
  kit.geometry(mat, g, m, { uvScale: [1, 1] });
}

/** Rumpled throw blanket draped over a seat edge: a few tilted slabs. */
export function throwBlanket(kit, mat, c, yaw = 0) {
  kit.at(c[0], c[1], c[2], yaw, () => {
    kit.geometry(mat, new THREE.BoxGeometry(0.55, 0.06, 0.6), new THREE.Matrix4().makeRotationZ(0.08).setPosition(0, 0.03, 0), { uv: 'box' });
    kit.geometry(mat, new THREE.BoxGeometry(0.5, 0.35, 0.05), new THREE.Matrix4().makeRotationX(0.15).setPosition(0, -0.12, 0.32), { uv: 'box' });
    kit.geometry(mat, new THREE.BoxGeometry(0.3, 0.12, 0.3), new THREE.Matrix4().makeRotationY(0.6).setPosition(0.12, 0.08, -0.05), { uv: 'box' });
  });
}

/** Black high-gloss coffee table (reference: black lacquer cube table). */
export function coffeeTable(kit, w = 0.95, d = 1.25, h = 0.38) {
  kit.box('plasticBlack', [-w / 2, 0.05, -d / 2], [w / 2, h, d / 2], { seg: 9, collide: true, tag: 'table' });
  kit.box('plasticBlack', [-w / 2 + 0.05, 0, -d / 2 + 0.05], [w / 2 - 0.05, 0.05, d / 2 - 0.05], { seg: 9 });
  kit.panel('floorSheen', [0, h + 0.002, 0], [w * 0.5, d * 0.9], '+y', { rot: 0.4 });
}

export function rug(kit, w, d) {
  kit.box('rug', [-w / 2, 0, -d / 2], [w / 2, 0.012, d / 2], { seg: 9, uv: 'fit', occlude: false });
}

/** White three-module media console (Besta-like), long side along +X, back at z = 0. */
export function mediaConsole(kit, modules = 3) {
  const w = 0.8;
  for (let i = 0; i < modules; i++) {
    const x = i * w;
    kit.box('laminate', [x + 0.002, 0.02, 0], [x + w - 0.002, FURNITURE.console, 0.42], { seg: 9 });
    const drop = i === 1 ? 0.0 : 0.16;
    kit.box('laminate', [x + 0.01, 0.03, 0.42], [x + w - 0.01, FURNITURE.console - 0.03 - drop, 0.44], { seg: 9 });
    if (drop) kit.box('plasticBlack', [x + 0.03, FURNITURE.console - drop - 0.01, 0.38], [x + w - 0.03, FURNITURE.console - 0.04, 0.42], { seg: 9 });
  }
  kit.solid(rect(0, 0, modules * w, 0.45), 0, FURNITURE.console, 'console');
  kit.walkable(rect(0, 0, modules * w, 0.45), FURNITURE.console);
}

/** Wall-mounted TV: screen faces +Z, back on z = 0. */
export function wallTV(kit, w = 1.45, h = 0.84) {
  kit.box('plasticBlack', [-w / 2, -h / 2, 0], [w / 2, h / 2, 0.05], { seg: 9 });
  kit.panel('tv', [0, 0, 0.0505], [w - 0.03, h - 0.03], '+z');
  kit.light({ name: 'tv-glow', pos: [0, 0, 0.5], color: '#c38be8', intensity: 0.9, range: 3.2, dir: [0, 0, 1], cone: 0.2 });
}

export function floorLamp(kit, name) {
  kit.cylinder('steelGray', [0, 0, 0], 0.16, 0.03, { sides: 10 });
  kit.cylinder('steelGray', [0, 0.03, 0], 0.014, 1.62, { sides: 5 });
  kit.tube('steelGray', [[0, 1.62, 0], [0.12, 1.72, 0.08], [0.2, 1.74, 0.14]], 0.014, { sides: 4 });
  kit.lathe('steelGray', [0.24, 1.48, 0.16], [[0.01, 0.26], [0.06, 0.25], [0.1, 0.16], [0.17, 0.0]], { sides: 10 });
  kit.panel('bulbWarm', [0.24, 1.481, 0.16], [0.24, 0.24], '-y');
  kit.solid(rect(-0.17, -0.17, 0.17, 0.17), 0, 1.8, 'lamp');
  kit.light({ name, pos: [0.24, 1.4, 0.16], color: '#ffcf8f', intensity: 2.2, range: 4.5, dir: [0, -1, 0], cone: 0.2, dynamic: true, zone: 'unit' });
}

/**
 * Strap-metal orb pendant (reference: two banded spheres hanging on chains near the window).
 * Origin is the ceiling attachment; the orb centre hangs `drop` below.
 */
export function orbPendant(kit, name, { drop = 2.2, r = 0.32 } = {}) {
  const c = [0, -drop, 0];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.TorusGeometry(r, 0.02, 3, 16);
    const m = new THREE.Matrix4().makeRotationY((i / 6) * Math.PI).multiply(new THREE.Matrix4().makeRotationX(i % 2 ? 0.5 : -0.3)).setPosition(...c);
    kit.geometry('steelGray', g, m);
  }
  const eq = new THREE.TorusGeometry(r * 1.01, 0.022, 3, 16);
  kit.geometry('steelGray', eq, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(...c));
  kit.sphere('bulbWarm', c, 0.06, { w: 6, h: 4 });
  kit.tube('steelBlack', [[0, 0, 0], [0, -drop + r, 0]], 0.008, { sides: 3 });
  kit.light({ name, pos: c, color: '#ffc983', intensity: 2.6, range: 6.5, dynamic: true, zone: 'unit' });
}

/** Ceiling track with spot heads aimed along `aim` (local). Origin at the track centre. */
export function trackLight(kit, name, length, heads, aim = [0, -1, 0.3]) {
  kit.box('steelBlack', [-length / 2, -0.03, -0.02], [length / 2, 0, 0.02], { seg: 9, occlude: false });
  for (let i = 0; i < heads; i++) {
    const x = -length / 2 + ((i + 0.5) / heads) * length;
    kit.box('steelBlack', [x - 0.01, -0.12, -0.01], [x + 0.01, -0.03, 0.01], { seg: 9, occlude: false });
    const d = new THREE.Vector3(...aim).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, new THREE.Vector3(0, 1, 0.0001)).setPosition(x, -0.17, 0);
    kit.geometry('steelBlack', new THREE.CylinderGeometry(0.05, 0.06, 0.16, 8).rotateX(Math.PI / 2), m);
    kit.light({ name: `${name}-${i}`, pos: [x + d.x * 0.15, -0.17 + d.y * 0.15, d.z * 0.15], color: '#ffe0b0', intensity: 1.5, range: 6, dir: d.toArray(), cone: Math.cos(0.5), zone: 'unit' });
  }
}

/** Spiral galvanised duct along a frame-local polyline with a linear diffuser near its end. */
export function spiralDuct(kit, points, r = 0.28, { hangers = [] } = {}) {
  kit.tube('galvanized', points, r, { sides: 10 });
  const end = points[points.length - 1];
  kit.cylinder('galvanized', [end[0], end[1] - r, end[2]], r * 1.02, 0.01, { sides: 10 });
  for (const h of hangers) kit.tube('wire', [[h[0], h[1], h[2]], [h[0], h[3], h[2]]], 0.004, { sides: 3 });
}

/** Kitchen run along +X, back on z = 0: base cabinets, counter, sink, range, uppers, fridge at x<0. */
export function kitchenRun(kit, length, { fridge = true } = {}) {
  const d = 0.62;
  kit.box('cabinet', [0, 0.1, 0], [length, FURNITURE.counter - 0.04, d - 0.03], { seg: 9 });
  kit.box('plasticBlack', [0, 0, 0.04], [length, 0.1, d - 0.08], { seg: 9 });
  kit.box('concreteGray', [-0.01, FURNITURE.counter - 0.04, -0.01], [length + 0.01, FURNITURE.counter, d], { seg: 9 });
  for (let x = 0.3; x < length; x += 0.6) kit.box('chrome', [x - 0.08, FURNITURE.counter - 0.14, d - 0.03], [x + 0.08, FURNITURE.counter - 0.12, d - 0.01], { seg: 9, occlude: false });
  const sink = Math.min(length - 0.5, 2.2);
  kit.box('stainless', [sink - 0.36, FURNITURE.counter - 0.2, 0.12], [sink + 0.36, FURNITURE.counter + 0.002, 0.5], { seg: 9, faces: { py: false } });
  kit.box('plasticBlack', [sink - 0.34, FURNITURE.counter - 0.2, 0.14], [sink + 0.34, FURNITURE.counter - 0.18, 0.48], { seg: 9, occlude: false });
  kit.tube('chrome', [[sink, FURNITURE.counter, 0.06], [sink, FURNITURE.counter + 0.32, 0.06], [sink, FURNITURE.counter + 0.36, 0.22]], 0.014, { sides: 4 });
  const rng = 1.0;
  kit.box('stainless', [rng - 0.38, 0.0, 0.0], [rng + 0.38, FURNITURE.counter + 0.01, d], { seg: 9 });
  kit.box('plasticBlack', [rng - 0.36, FURNITURE.counter + 0.011, 0.04], [rng + 0.36, FURNITURE.counter + 0.016, d - 0.04], { seg: 9, occlude: false });
  kit.box('plasticBlack', [rng - 0.3, 0.25, d], [rng + 0.3, 0.7, d + 0.01], { seg: 9, occlude: false });
  kit.box('stainless', [rng - 0.38, 1.55, 0.02], [rng + 0.38, 1.88, 0.42], { seg: 9 });
  kit.panel('plasticBlack', [rng - 0.06, 1.715, 0.4205], [0.5, 0.25], '+z');
  kit.box('cabinet', [rng + 0.4, 1.45, 0], [length, 2.25, 0.34], { seg: 9 });
  kit.box('cabinet', [0, 1.88, 0], [rng + 0.4, 2.25, 0.34], { seg: 9 });
  kit.panel('bulbWarm', [(rng + 0.4 + length) / 2, 1.448, 0.3], [length - rng - 0.5, 0.03], '-y');
  if (fridge) {
    kit.box('stainless', [-0.78, 0, 0], [-0.02, 1.82, 0.72], { seg: 9 });
    kit.box('plasticBlack', [-0.77, 1.16, 0.72], [-0.03, 1.18, 0.725], { seg: 9, occlude: false });
    kit.box('chrome', [-0.09, 0.4, 0.72], [-0.06, 1.6, 0.75], { seg: 9, occlude: false });
    kit.panel('magazines', [-0.4, 1.45, 0.722], [0.2, 0.2], '+z');
  }
  kit.solid(rect(fridge ? -0.78 : 0, 0, length, d), 0, FURNITURE.counter, 'counter');
  kit.solid(rect(-0.78, 0, -0.02, 0.72), 0, 1.82, 'fridge');
  kit.occluder([fridge ? -0.78 : 0, 0, 0], [length, FURNITURE.counter, d]);
}

export function toilet(kit) {
  kit.lathe('ceramic', [0, 0, 0.32], [[0.12, 0], [0.16, 0.2], [0.2, 0.36], [0.19, 0.4], [0.01, 0.4]], { sides: 10 });
  kit.box('ceramic', [-0.19, 0.38, 0], [0.19, 0.78, 0.18], { seg: 9 });
  kit.box('ceramic', [-0.2, 0.4, 0.15], [0.2, 0.42, 0.55], { seg: 9 });
  kit.solid(rect(-0.2, 0, 0.2, 0.55), 0, 0.78, 'toilet');
}

export function vanity(kit, w = 0.75) {
  kit.box('woodDark', [-w / 2, 0.1, 0], [w / 2, 0.82, 0.48], { seg: 9 });
  kit.box('ceramic', [-w / 2 - 0.01, 0.82, -0.01], [w / 2 + 0.01, 0.86, 0.5], { seg: 9 });
  kit.box('chrome', [-0.015, 0.86, 0.05], [0.015, 1.0, 0.08], { seg: 9, occlude: false });
  kit.panel('mirror', [0, 1.45, 0.005], [w * 0.8, 0.8], '+z');
  kit.box('chrome', [-0.3, 1.9, 0], [0.3, 1.95, 0.08], { seg: 9, occlude: false });
  kit.panel('bulbWarm', [0, 1.899, 0.05], [0.55, 0.05], '-y');
  kit.solid(rect(-w / 2, 0, w / 2, 0.5), 0, 0.86, 'vanity');
}

/** Corner shower: tiled curb and a glass screen. Origin at the room corner, extends +X/+Z. */
export function shower(kit, w = 0.95, d = 0.95) {
  kit.box('tileWhite', [0, 0, 0], [w, 0.08, d], { seg: 9 });
  kit.panel('glass', [w / 2, 1.05, d], [w, 1.9], '+z');
  kit.box('chrome', [w - 0.02, 0.08, d - 0.02], [w + 0.01, 2.0, d + 0.01], { seg: 9, occlude: false });
  kit.tube('chrome', [[0.06, 1.9, w / 2], [0.25, 2.0, w / 2]], 0.015, { sides: 4 });
  kit.cylinder('chrome', [0.25, 1.97, w / 2], 0.09, 0.02, { sides: 8 });
  kit.solid(rect(0, 0, w, d + 0.02), 0, 2.0, 'shower');
}

export function bed(kit, w = 1.55, l = 2.05) {
  kit.box('woodDark', [-w / 2, 0.08, 0], [w / 2, 0.3, l], { seg: 9 });
  kit.box('ceramic', [-w / 2 + 0.03, 0.3, 0.03], [w / 2 - 0.03, 0.5, l - 0.03], { seg: 9 });
  kit.box('bedding', [-w / 2 + 0.01, 0.45, 0.55], [w / 2 - 0.01, FURNITURE.bed + 0.06, l - 0.01], { seg: 9 });
  kit.box('bedding', [-w / 2 - 0.02, 0.2, l - 0.02], [w / 2 + 0.02, 0.56, l + 0.01], { seg: 9 });
  for (const s of [-1, 1]) pillow(kit, 'ceramic', [s * w / 4, 0.6, 0.3], { w: 0.6, h: 0.18, t: 0.38, tilt: 0 });
  kit.box('woodDark', [-w / 2 - 0.02, 0.08, -0.06], [w / 2 + 0.02, 1.0, 0], { seg: 9 });
  kit.solid(rect(-w / 2, -0.06, w / 2, l + 0.02), 0, 0.6, 'bed');
}

export function clothesRack(kit, w = 1.2, rng) {
  for (const x of [-w / 2, w / 2]) kit.tube('chrome', [[x, 0, 0], [x, 1.6, 0]], 0.014, { sides: 4 });
  kit.tube('chrome', [[-w / 2, 1.6, 0], [w / 2, 1.6, 0]], 0.012, { sides: 4 });
  for (let i = 0; i < 9; i++) {
    const x = -w / 2 + 0.12 + i * ((w - 0.24) / 8);
    const mat = rng.pick(['bedding', 'sage', 'mustard', 'plasticBlack', 'knit', 'carBlue']);
    kit.box(mat, [x - 0.02, 0.75 + rng.next() * 0.2, -0.22], [x + 0.02, 1.55, 0.22], { seg: 9, occlude: false });
  }
  kit.solid(rect(-w / 2, -0.25, w / 2, 0.25), 0, 1.6, 'rack');
}

/** Square shelving cube on short legs (the honey-maple box table by the sofa). */
export function cubeTable(kit, w, d, h) {
  kit.box('maple', [0, 0, 0], [w, h, d], { seg: 9, collide: true, tag: 'cube' });
  kit.walkable(rect(0, 0, w, d), h);
}

/** Tolix-style red metal stool. */
export function tolixStool(kit, h = 0.76) {
  const t = 0.18;
  kit.box('redPaint', [-t, h - 0.03, -t], [t, h, t], { seg: 9 });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    kit.tube('redPaint', [[x * (t - 0.02), h - 0.03, z * (t - 0.02)], [x * (t + 0.05), 0, z * (t + 0.05)]], 0.016, { sides: 4 });
  }
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([x, z]) => [x * (t + 0.03), 0.22, z * (t + 0.03)]);
  kit.tube('redPaint', ring, 0.008, { sides: 3 });
  kit.solid(rect(-t - 0.05, -t - 0.05, t + 0.05, t + 0.05), 0, h, 'stool');
}

/** Eames-style shell chair (black) on a wire base, facing +Z. */
export function shellChair(kit) {
  kit.box('plasticBlack', [-0.23, 0.44, -0.2], [0.23, 0.47, 0.22], { seg: 9 });
  kit.geometry('plasticBlack', new THREE.BoxGeometry(0.46, 0.42, 0.03), new THREE.Matrix4().makeRotationX(-0.2).setPosition(0, 0.66, -0.22));
  for (const [x, z] of [[-0.2, -0.18], [0.2, -0.18], [0.2, 0.2], [-0.2, 0.2]]) kit.tube('steelBlack', [[x * 0.6, 0.44, z * 0.6], [x, 0, z]], 0.008, { sides: 3 });
  kit.solid(rect(-0.25, -0.25, 0.25, 0.25), 0, 0.85, 'chair');
}

/** Framed art on a wall: back at z = 0, faces +Z. */
export function artFrame(kit, mat, w, h, { depth = 0.03 } = {}) {
  kit.box('plasticBlack', [-w / 2, -h / 2, 0], [w / 2, h / 2, depth], { seg: 9, occlude: false });
  kit.panel(mat, [0, 0, depth + 0.001], [w - 0.02, h - 0.02], '+z');
}

/** Tall leaning mirror: base on the floor at z = 0.12, top touching the wall (z = 0). Faces +Z. */
export function leaningMirror(kit, w = 0.7, h = 1.9) {
  const lean = Math.atan2(0.12, h);
  const m = new THREE.Matrix4().makeRotationX(-lean).setPosition(0, h / 2, 0.06);
  kit.geometry('plasticBlack', new THREE.BoxGeometry(w, h, 0.03), m);
  kit.geometry('mirror', new THREE.PlaneGeometry(w - 0.06, h - 0.06), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.016)));
  kit.solid(rect(-w / 2, 0, w / 2, 0.14), 0, h, 'mirror');
}

/** Road / flight case with stencil (reference "48F" case). */
export function flightCase(kit, w = 0.55, h = 0.55, d = 0.4) {
  kit.box('plasticBlack', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], { seg: 9, collide: true, tag: 'case' });
  kit.panel('case48', [0, h / 2, d / 2 + 0.002], [w * 0.9, h * 0.9], '+z');
  for (const y of [0.02, h - 0.03]) kit.box('chrome', [-w / 2 - 0.005, y, -d / 2 - 0.005], [w / 2 + 0.005, y + 0.015, d / 2 + 0.005], { seg: 9, occlude: false });
}

/** Utility cart / metal kitchen cart with two shelves (white, chipped). */
export function metalCart(kit, w = 0.62, d = 0.45, h = 1.0) {
  for (const y of [0.18, 0.55, h]) kit.box('paintWhiteGloss', [0, y - 0.03, 0], [w, y, d], { seg: 9 });
  for (const [x, z] of [[0, 0], [w, 0], [w, d], [0, d]]) kit.box('paintWhiteGloss', [x - 0.02, 0, z - 0.02], [x + 0.02, h, z + 0.02], { seg: 9, occlude: false });
  kit.solid(rect(-0.02, -0.02, w + 0.02, d + 0.02), 0, h, 'cart');
  kit.walkable(rect(0, 0, w, d), h);
}

export function speaker(kit, w = 0.3, h = 0.95, d = 0.32) {
  kit.box('plasticBlack', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], { seg: 9, collide: true, tag: 'speaker' });
  for (const y of [0.25, 0.6]) kit.cylinder('rubber', [0, y, d / 2], 0.09, 0.01, { sides: 10 });
}

export function basketball(kit, c, mat = 'plasticBlack') {
  kit.sphere(mat, c, 0.12, { w: 8, h: 6 });
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
  kit.geometry('woodDark', new THREE.CylinderGeometry(0.012, 0.012, 1.3, 4), new THREE.Matrix4().makeRotationZ(0.1).setPosition(0.065, 0.75, 0.0));
  kit.box('plasticBlack', [-0.14, 0, -0.04], [0.14, 0.12, 0.04], { seg: 9, occlude: false });
}
