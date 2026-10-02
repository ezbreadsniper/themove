import * as THREE from 'three';
import { rect, slab, softBox } from '../kit/shapes.js';

/**
 * Building fixtures: the trim and services layer that makes rooms read as built (baseboards,
 * outlets, switches, radiators, conduit, sprinklers) and the practical light fittings that carry the
 * corridor and hall (fluorescent wraps, sconces, exit signs, light spilling under doors).
 * Wall-mounted pieces are authored on a wall frame: wall surface at z = 0, facing +Z.
 */

/** Rubber cove / painted baseboard along +X from 0 to length (skips `gaps` [[x0, x1]]). */
export function baseboard(kit, length, { h = 0.1, t = 0.012, mat = 'rubber', gaps = [] } = {}) {
  let from = 0;
  for (const g of [...gaps].sort((a, b) => a[0] - b[0]).concat([[length, length]])) {
    if (g[0] - from > 0.02) kit.box(mat, [from, 0, 0], [g[0], h, t], { seg: 9, occlude: false });
    from = Math.max(from, g[1]);
  }
}

/** Duplex outlet plate at height y (wall frame). */
export function outlet(kit, x, y = 0.3) {
  kit.box('plasticWhite', [x - 0.035, y - 0.058, 0], [x + 0.035, y + 0.058, 0.006], { seg: 9, occlude: false });
  kit.decal('outlet', [x, y, 0.0075], [0.07, 0.116], '+z');
}

/**
 * Light switch plate (wall frame, plate centre at x, y) registering a `switch` interactable for
 * `lights`. The player stands 0.55 m out from the wall facing it.
 */
export function lightSwitch(kit, id, x, lights, { y = 1.2, gang = 1 } = {}) {
  const w = 0.075 + (gang - 1) * 0.045;
  kit.box('plasticWhite', [x - w / 2, y - 0.058, 0], [x + w / 2, y + 0.058, 0.007], { seg: 9, occlude: false });
  for (let g = 0; g < gang; g++) {
    const gx = x - (gang - 1) * 0.0225 + g * 0.045;
    kit.box('paintWhiteGloss', [gx - 0.008, y - 0.02, 0.007], [gx + 0.008, y + 0.014, 0.016], { seg: 9, occlude: false });
  }
  kit.decal('handprint', [x + 0.02, y - 0.04, 0.004], [0.16, 0.18], '+z');
  kit.interactable({ id, kind: 'switch', pos: [x, y, 0.55], yaw: Math.PI, radius: 1.0, prompt: 'Lights', data: { lights, on: true } });
}

/** Cast-iron column radiator under a window (wall frame, centred on x), with its supply pipe and valve. */
export function radiator(kit, x, { w = 1.0, h = 0.62, sections = null, y0 = 0.1 } = {}) {
  const n = sections ?? Math.round(w / 0.065);
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const a = x - w / 2 + i * sw;
    softBox(kit, 'paintRadiator', [a + 0.004, y0 + 0.06, 0.05], [a + sw - 0.004, y0 + h, 0.2], { r: 0.012, occlude: false });
  }
  kit.box('paintRadiator', [x - w / 2, y0 + 0.1, 0.1], [x + w / 2, y0 + 0.14, 0.15], { seg: 9, occlude: false });
  kit.box('paintRadiator', [x - w / 2, y0 + h - 0.08, 0.1], [x + w / 2, y0 + h - 0.04, 0.15], { seg: 9, occlude: false });
  for (const s of [-1, 1]) kit.box('paintRadiator', [x + s * (w / 2 - 0.03) - 0.02, y0, 0.08], [x + s * (w / 2 - 0.03) + 0.02, y0 + 0.07, 0.17], { seg: 9, occlude: false });
  kit.tube('copper', [[x - w / 2 - 0.05, -0.02, 0.12], [x - w / 2 - 0.05, y0 + 0.12, 0.12], [x - w / 2, y0 + 0.12, 0.12]], 0.014, { sides: 5 });
  kit.cylinder('brass', [x - w / 2 - 0.05, y0 + 0.16, 0.12], 0.025, 0.04, { sides: 6 });
  kit.solid(rect(x - w / 2, 0, x + w / 2, 0.22), 0, y0 + h, 'radiator');
  kit.occluder([x - w / 2, y0, 0.05], [x + w / 2, y0 + h, 0.2]);
}

/** Surface conduit run along a frame-local polyline with junction boxes at its corners. */
export function conduit(kit, points, { boxes = true } = {}) {
  kit.tube('galvanized', points, 0.011, { sides: 4 });
  if (!boxes) return;
  for (const p of points.slice(1, -1)) kit.box('galvanized', [p[0] - 0.05, p[1] - 0.05, p[2] - 0.05], [p[0] + 0.05, p[1] + 0.05, p[2] + 0.05], { seg: 9, occlude: false });
}

/** Sprinkler main along a polyline with pendant heads every `every` metres (drops `drop`). */
export function sprinklers(kit, points, { every = 2.6, drop = 0.18, mat = 'sprinklerRed' } = {}) {
  kit.tube(mat, points, 0.026, { sides: 6 });
  for (let s = 0; s < points.length - 1; s++) {
    const a = new THREE.Vector3(...points[s]);
    const b = new THREE.Vector3(...points[s + 1]);
    const len = a.distanceTo(b);
    for (let t = every / 2; t < len; t += every) {
      const p = a.clone().lerp(b, t / len);
      kit.tube(mat, [[p.x, p.y, p.z], [p.x, p.y - drop, p.z]], 0.01, { sides: 4 });
      kit.cylinder('brass', [p.x, p.y - drop - 0.03, p.z], 0.022, 0.03, { sides: 6, radiusTop: 0.01 });
    }
    for (const t of [0.6, len - 0.6]) {
      if (t <= 0 || t >= len) continue;
      const p = a.clone().lerp(b, t / len);
      kit.tube('steelGray', [[p.x, p.y + 0.03, p.z], [p.x, p.y + 0.6, p.z]], 0.005, { sides: 3 });
    }
  }
}

export function smokeDetector(kit, c) {
  kit.cylinder('plasticWhite', [c[0], c[1] - 0.04, c[2]], 0.065, 0.04, { sides: 10 });
  kit.cylinder('plasticWhite', [c[0], c[1] - 0.05, c[2]], 0.04, 0.01, { sides: 8 });
}

/**
 * Surface wraparound fluorescent fixture (ceiling frame, origin at the ceiling, long axis X):
 * white steel housing, prismatic diffuser glowing on its own layer, a cool light that is a shadow
 * candidate, optional flicker, and a faint haze shaft below.
 */
export function fluorescent(kit, name, { len = 1.22, w = 0.3, flicker = null, zone = null, intensity = 2.4, range = 4.6, beam = true, on = true } = {}) {
  slab(kit, 'plasticWhite', [-len / 2, -0.05, -w / 2], [len / 2, 0, w / 2], { r: 0.008, occlude: false });
  for (const s of [-1, 1]) kit.box('steelGray', [s > 0 ? len / 2 - 0.02 : -len / 2, -0.07, -w / 2 + 0.01], [s > 0 ? len / 2 : -len / 2 + 0.02, -0.05, w / 2 - 0.01], { seg: 9, occlude: false });
  kit.glow(name, () => {
    kit.box('bulbTube', [-len / 2 + 0.02, -0.075, -w / 2 + 0.03], [len / 2 - 0.02, -0.05, w / 2 - 0.03], { seg: 9, faces: { py: false }, occlude: false });
    if (beam) for (const yaw of [0, Math.PI / 2]) kit.at(0, 0, 0, yaw, () => kit.panel('beamCool', [0, -1.2, 0], [yaw ? w * 2.4 : len * 1.25, 2.3], '+z', { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]] }));
  });
  kit.light({ name, pos: [0, -0.12, 0], color: '#d9e6f0', intensity, range, dir: [0, -1, 0], cone: 0.05, dynamic: true, zone, flicker, shadow: true, switchable: true, fill: 0.7, on });
}

/** Warm wall sconce (wall frame): backplate, frosted half-drum shade on the fixture's layer. */
export function sconce(kit, name, x, y, { zone = null, intensity = 1.1, range = 3.2, layer = null } = {}) {
  kit.box('brass', [x - 0.06, y - 0.1, 0], [x + 0.06, y + 0.1, 0.012], { seg: 9, occlude: false });
  kit.glow(layer ?? name, () => {
    kit.geometry('bulbWarm', new THREE.CylinderGeometry(0.075, 0.09, 0.16, 8, 1, true, -Math.PI / 2, Math.PI), new THREE.Matrix4().makeTranslation(x, y, 0.012));
    kit.panel('beamWarm', [x, y + 0.45, 0.02], [0.5, 0.9], '+z', { uvs: [[0, 1], [1, 1], [1, 0], [0, 0]] });
    kit.panel('beamWarm', [x, y - 0.42, 0.02], [0.45, 0.75], '+z');
  });
  kit.light({ name, pos: [x, y, 0.2], color: '#ffc58a', intensity, range, dynamic: true, zone, switchable: true, layer, fill: 0.8 });
}

/** Illuminated exit sign box hanging off a wall (wall frame) or ceiling (`hang`). */
export function exitSign(kit, name, x, y, { zone = null } = {}) {
  slab(kit, 'plasticWhite', [x - 0.19, y - 0.08, 0], [x + 0.19, y + 0.08, 0.06], { r: 0.004, occlude: false });
  kit.panel('signExit', [x, y, 0.0605], [0.34, 0.12], '+z');
  kit.glow(name, () => kit.box('exitGlow', [x - 0.15, y - 0.081, 0.01], [x + 0.15, y - 0.08, 0.05], { seg: 9, occlude: false }));
  kit.light({ name, pos: [x, y - 0.1, 0.25], color: '#ff4a32', intensity: 0.35, range: 2.0, zone, layer: name, fill: 0.15 });
}

/**
 * Light leaking from under an apartment door into the corridor (door frame: door centre x, wall
 * face z = 0, corridor toward +Z): a glowing gap strip, an additive spill on the floor, and a low
 * warm light. Lives on `layer` (the apartment's lights).
 */
export function doorSpill(kit, name, x, y, { width = 0.86, zone = null, layer = null, intensity = 0.55 } = {}) {
  kit.glow(layer ?? name, () => {
    kit.box('bulbWarm', [x - width / 2, y + 0.001, -0.02], [x + width / 2, y + 0.012, 0.002], { seg: 9, occlude: false });
    kit.panel('doorSpill', [x, y + 0.004, 0.32], [width + 0.4, 0.62], '+y');
  });
  kit.light({ name, pos: [x, y + 0.06, 0.12], color: '#ffb466', intensity, range: 1.8, dir: [0, 0.2, 1], cone: -0.2, zone, layer: layer ?? name, fill: 0.15 });
}

/** Wall-mounted fire extinguisher cabinet (wall frame) with its sign. */
export function extinguisher(kit, x, y = 1.1) {
  slab(kit, 'redPaint', [x - 0.16, y - 0.35, 0], [x + 0.16, y + 0.35, 0.16], { r: 0.008, occlude: false });
  kit.panel('glassDark', [x, y + 0.02, 0.161], [0.24, 0.56], '+z');
  kit.cylinder('hydrantRed', [x, y - 0.28, 0.08], 0.06, 0.42, { sides: 8 });
  kit.decal('fireExt', [x, y + 0.55, 0.004], [0.22, 0.22], '+z');
}

/** Thermostat / intercom style small wall box. */
export function wallBox(kit, x, y, { w = 0.08, h = 0.12, mat = 'plasticWhite' } = {}) {
  slab(kit, mat, [x - w / 2, y - h / 2, 0], [x + w / 2, y + h / 2, 0.03], { r: 0.008, occlude: false });
}

/** Door mat on a floor (centre c, along X). */
export function doormat(kit, c, w = 0.8, d = 0.5, rot = 0) {
  kit.at(c[0], c[1], c[2], rot, () => slab(kit, 'doormat', [-w / 2, 0, -d / 2], [w / 2, 0.012, d / 2], { r: 0.004, occlude: false }));
}
