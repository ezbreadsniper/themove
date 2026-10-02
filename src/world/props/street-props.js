import * as THREE from 'three';

/**
 * Street furniture. Each prop is authored at the local origin standing on y = 0, facing +Z, and is
 * placed with kit.at(x, y, z, yaw, ...). Props register their own collision and lights.
 */
const circle = (r, n = 8) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);

/**
 * Cobra-head streetlight; the arm reaches toward +Z over the road. Its sodium lamp is a light layer
 * (so it can flicker), a shadowed rig candidate, and glows through a faint haze cone.
 */
export function streetlight(kit, name, { height = 8.2, reach = 2.2, flicker = null, intensity = 22 } = {}) {
  kit.cylinder('concreteGray', [0, 0, 0], 0.22, 0.35, { sides: 8 });
  kit.cylinder('galvanized', [0, 0.35, 0], 0.11, height - 0.35, { radiusTop: 0.07, sides: 8 });
  const arm = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    arm.push([0, height - 0.2 + Math.sin(t * Math.PI * 0.5) * 0.55, t * reach]);
  }
  kit.tube('galvanized', arm, 0.05, { sides: 6 });
  const hz = reach + 0.25;
  const hy = height + 0.32;
  kit.box('steelGray', [-0.2, hy - 0.08, hz - 0.45], [0.2, hy + 0.1, hz + 0.25], { seg: 9 });
  kit.glow(name, () => {
    kit.panel('sodium', [0, hy - 0.085, hz - 0.1], [0.3, 0.5], '-y');
    const cone = new THREE.CylinderGeometry(0.2, 2.6, hy - 0.4, 10, 1, true);
    kit.geometry('beamSodium', cone, new THREE.Matrix4().makeTranslation(0, (hy - 0.4) / 2, hz - 0.1));
  });
  kit.solid(circle(0.24), 0, height, 'pole');
  kit.light({ name, pos: [0, hy - 0.3, hz - 0.1], color: '#ffa04a', intensity, range: 15, dir: [0, -1, 0], cone: Math.cos((68 * Math.PI) / 180), dynamic: true, zone: 'street', layer: name, flicker, shadow: true, fill: 0 });
}

/** Wooden utility pole with crossarm and insulators. Returns world attachment points for wires. */
export function utilityPole(kit, { height = 9.6, transformer = false } = {}) {
  kit.cylinder('woodDark', [0, 0, 0], 0.15, height, { radiusTop: 0.11, sides: 7 });
  kit.box('woodDark', [-1.1, height - 0.7, -0.06], [1.1, height - 0.56, 0.06], { seg: 9 });
  const tips = [];
  for (const x of [-0.95, -0.35, 0.35, 0.95]) {
    kit.cylinder('ceramic', [x, height - 0.56, 0], 0.035, 0.12, { sides: 5 });
    tips.push(kit.toWorld([x, height - 0.44, 0]));
  }
  if (transformer) {
    kit.cylinder('steelGray', [0, height - 2.6, 0.32], 0.26, 0.9, { sides: 8 });
    kit.box('steelGray', [-0.08, height - 2.2, 0.08], [0.08, height - 2.0, 0.2], { seg: 9 });
  }
  kit.box('steelGray', [-0.06, 2.2, 0.14], [0.06, 2.5, 0.16], { seg: 9 });
  kit.solid(circle(0.17), 0, height, 'pole');
  return tips;
}

/** Sagging wire between two world points (parabolic approximation of the catenary). */
export function wire(kit, a, b, sag = 0.5, radius = 0.012) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  kit.push();
  kit.stack[kit.stack.length - 1].identity();
  kit.tube('wire', pts, radius, { sides: 3 });
  kit.pop();
}

/** Signpost with a list of signs: [{ mat, w, h, y, yaw }]. */
export function signPost(kit, signs, { height = 2.9 } = {}) {
  kit.cylinder('galvanized', [0, 0, 0], 0.03, height, { sides: 6 });
  for (const s of signs) {
    kit.at(0, 0, 0, s.yaw ?? 0, () => {
      kit.panel(s.mat, [s.x ?? 0, s.y, 0.04], [s.w, s.h], '+z');
      kit.panel('steelGray', [s.x ?? 0, s.y, 0.035], [s.w, s.h], '-z');
    });
  }
  kit.solid(circle(0.06, 6), 0, height, 'pole');
}

export function hydrant(kit) {
  kit.cylinder('hydrantRed', [0, 0, 0], 0.17, 0.08, { sides: 8 });
  kit.cylinder('hydrantRed', [0, 0.08, 0], 0.13, 0.55, { sides: 8 });
  kit.cylinder('hydrantRed', [0, 0.63, 0], 0.15, 0.06, { sides: 8 });
  kit.sphere('hydrantRed', [0, 0.69, 0], 0.13, { w: 8, h: 4, scale: [1, 0.7, 1] });
  kit.cylinder('brass', [0, 0.78, 0], 0.03, 0.06, { sides: 5 });
  for (const s of [-1, 1]) kit.geometry('hydrantRed', new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(s * 0.17, 0.45, 0));
  kit.geometry('hydrantRed', new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.42, 0.16));
  kit.solid(circle(0.2), 0, 0.85, 'hydrant');
}

export function bollard(kit, mat = 'yellowPaint') {
  kit.cylinder(mat, [0, 0, 0], 0.1, 1.0, { sides: 8 });
  kit.sphere(mat, [0, 1.0, 0], 0.1, { w: 8, h: 4, scale: [1, 0.5, 1] });
  kit.panel('paintBlack', [0, 0.85, 0.101], [0.12, 0.06], '+z');
  kit.solid(circle(0.12), 0, 1.05, 'bollard');
}

/** Commercial dumpster, long side along X, lids slightly ajar. */
export function dumpster(kit) {
  kit.box('dumpster', [-0.95, 0.15, -0.6], [0.95, 1.2, 0.6], { seg: 9, collide: true, tag: 'dumpster' });
  kit.box('greenPaint', [-1.0, 1.2, -0.66], [1.0, 1.27, 0.66], { seg: 9 });
  kit.quad('plasticBlack', [-0.96, 1.28, -0.62], [0, 1.28, -0.62], [0, 1.38, 0.62], [-0.96, 1.38, 0.62]);
  kit.quad('plasticBlack', [0, 1.28, -0.62], [0.96, 1.28, -0.62], [0.96, 1.33, 0.62], [0, 1.33, 0.62]);
  for (const x of [-0.8, 0.8]) for (const z of [-0.45, 0.45]) kit.cylinder('rubber', [x, 0, z], 0.07, 0.15, { sides: 6 });
  kit.box('greenPaint', [-1.05, 0.75, -0.08], [-0.95, 0.85, 0.08], { seg: 9 });
}

export function trashBag(kit, s = 1) {
  kit.sphere('trashBag', [0, 0.26 * s, 0], 0.32 * s, { detail: 0, scale: [1, 0.8, 0.9] });
  kit.cylinder('trashBag', [0, 0.45 * s, 0], 0.05 * s, 0.14 * s, { radiusTop: 0.02, sides: 5 });
}

export function trashCan(kit) {
  kit.cylinder('greenPaint', [0, 0, 0], 0.3, 0.95, { sides: 10, radiusTop: 0.32 });
  kit.cylinder('steelBlack', [0, 0.95, 0], 0.34, 0.08, { sides: 10 });
  kit.solid(circle(0.33), 0, 1.0, 'bin');
}

export function bikeRack(kit, loops = 3) {
  for (let i = 0; i < loops; i++) {
    const x = (i - (loops - 1) / 2) * 0.7;
    const arc = Array.from({ length: 9 }, (_, k) => {
      const a = Math.PI - (k / 8) * Math.PI;
      return [x + Math.cos(a) * 0.3, 0.6 + Math.sin(a) * 0.3, 0];
    });
    kit.tube('galvanized', [[x - 0.3, 0, 0], ...arc, [x + 0.3, 0, 0]], 0.024, { sides: 5 });
  }
  kit.solid([[-(loops * 0.35) - 0.05, -0.08], [loops * 0.35 + 0.05, -0.08], [loops * 0.35 + 0.05, 0.08], [-(loops * 0.35) - 0.05, 0.08]], 0, 0.9, 'rack');
}

/** Street tree: lean trunk, a few branches and clustered cut-out canopy blobs. */
export function tree(kit, rng, { height = 5.2 } = {}) {
  const lean = (rng.next() - 0.5) * 0.25;
  kit.tube('bark', [[0, 0, 0], [lean * 0.4, height * 0.45, 0.05], [lean, height * 0.7, 0.1]], 0.12, { sides: 6 });
  const canopy = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.next();
    const r = 0.6 + rng.next() * 0.7;
    const c = [lean + Math.cos(a) * r, height * 0.72 + rng.next() * 1.4, 0.1 + Math.sin(a) * r];
    kit.tube('bark', [[lean, height * 0.62, 0.1], c], 0.045, { sides: 4 });
    canopy.push(c);
  }
  canopy.push([lean, height * 0.95, 0.1]);
  for (const c of canopy) kit.sphere('treeLeaves', c, 0.9 + rng.next() * 0.5, { detail: 1, uvScale: [3, 2] });
  kit.solid(circle(0.18), 0, height, 'tree');
}
