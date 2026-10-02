import * as THREE from 'three';
import { softBox, slab, taperLeg } from '../kit/shapes.js';
import { FURNITURE } from '../units.js';

/**
 * Debris and loose props. Debris is cheap, deterministic (rng-driven) and non-colliding: floor
 * decals from the atlas plus a few tiny 3D bits (crumpled paper, butts, bottle caps) so the floor
 * reads as lived-on at play distance without blocking navigation. Loose props are `kit.physical`
 * dynamics for the physics owner to simulate (contracts §3).
 */
const FLOOR_DECALS = {
  paper: [['paper1', 0.28], ['paper2', 0.36]],
  butts: [['butts', 0.32]],
  leaves: [['leaves', 0.5], ['leafDrift', 0.9]],
  trash: [['wrapper', 0.18], ['can', 0.16], ['gum', 0.6]],
  grime: [['stainBig', 1.1], ['footprints', 0.6]],
  wet: [['puddle', 1.4], ['wetPatch', 0.8]],
};

/**
 * Scatters debris over the floor rectangle [x0, x1] × [z0, z1] at height y. `mix` weights the
 * decal families; `bits` adds that many 3D bits; `avoid` is a list of [x, z, r] circles (doorways,
 * paths) kept clear. Returns the number of pieces placed.
 */
export function debris(kit, rng, { x0, x1, z0, z1, y = 0, count = 8, mix = { paper: 1 }, bits = 0, avoid = [], edge = 0 }) {
  const fams = Object.entries(mix);
  const total = fams.reduce((s, [, w]) => s + w, 0);
  const pickFam = () => {
    let r = rng.next() * total;
    for (const [f, w] of fams) if ((r -= w) <= 0) return f;
    return fams[0][0];
  };
  const spot = () => {
    for (let k = 0; k < 8; k++) {
      let x = x0 + rng.next() * (x1 - x0);
      let z = z0 + rng.next() * (z1 - z0);
      if (edge > 0) {
        const side = rng.int(0, 3);
        if (side === 0) x = x0 + rng.next() * edge;
        else if (side === 1) x = x1 - rng.next() * edge;
        else if (side === 2) z = z0 + rng.next() * edge;
        else z = z1 - rng.next() * edge;
      }
      if (!avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) return [x, z];
    }
    return null;
  };
  let placed = 0;
  for (let i = 0; i < count; i++) {
    const p = spot();
    if (!p) continue;
    const [name, size] = rng.pick(FLOOR_DECALS[pickFam()]);
    const s = size * (0.75 + rng.next() * 0.5);
    const big = name === 'leafDrift';
    kit.decal(name, [p[0], y + 0.003 + i * 0.0002, p[1]], big ? [s, s / 2] : [s, s], '+y', { rot: rng.next() * Math.PI * 2, flip: rng.chance(0.5) });
    placed++;
  }
  for (let i = 0; i < bits; i++) {
    const p = spot();
    if (!p) continue;
    const kind = rng.next();
    if (kind < 0.4) kit.sphere('paper', [p[0], y + 0.03, p[1]], 0.035 + rng.next() * 0.02, { detail: 0, scale: [1, 0.8, 1.1] });
    else if (kind < 0.75) kit.at(p[0], y, p[1], rng.next() * Math.PI, () => {
      kit.box('paper', [-0.016, 0, -0.004], [0.012, 0.008, 0.004], { seg: 9, occlude: false });
      kit.box('candleJar', [0.012, 0, -0.004], [0.022, 0.008, 0.004], { seg: 9, occlude: false });
    });
    else kit.at(p[0], y, p[1], rng.next() * Math.PI, () => kit.geometry(rng.chance(0.5) ? 'bottleBrown' : 'steelGray', new THREE.CylinderGeometry(0.03, 0.03, 0.11, 6).rotateZ(Math.PI / 2).translate(0, 0.03, 0)));
    placed++;
  }
  return placed;
}

/** Taped cardboard box (physical). */
export function cardboardBox(kit, name, pos, [w, h, d] = [0.45, 0.32, 0.35], yaw = 0, mass = 3) {
  kit.physical(name, pos, { shape: 'box', size: [w, h, d], mass }, () => {
    slab(kit, 'cardboard', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], { r: 0.006, occlude: false });
    kit.box('candleJar', [-0.03, h, -d / 2 - 0.002], [0.03, h + 0.002, d / 2 + 0.002], { seg: 9, occlude: false });
    kit.box('candleJar', [-0.03, h * 0.7, d / 2], [0.03, h + 0.001, d / 2 + 0.002], { seg: 9, occlude: false });
    kit.box('plasticBlack', [-w / 2 + 0.04, h * 0.45, d / 2 + 0.001], [-w / 2 + 0.16, h * 0.55, d / 2 + 0.002], { seg: 9, occlude: false });
  }, yaw);
}

/** Small pedal / kitchen bin with a liner lip (physical cylinder). */
export function trashBin(kit, name, pos, { r = 0.15, h = 0.42, mat = 'stainless', mass = 2 } = {}) {
  kit.physical(name, pos, { shape: 'cylinder', radius: r, height: h, mass }, () => {
    kit.lathe(mat, [0, 0, 0], [[0.001, 0], [r * 0.9, 0], [r, 0.02], [r, h - 0.02], [r * 1.02, h]], { sides: 10 });
    kit.lathe('trashBag', [0, h - 0.04, 0], [[r * 1.03, 0], [r * 1.04, 0.05], [r * 0.9, 0.05]], { sides: 10 });
    kit.cylinder('plasticBlack', [0, 0, r * 0.95], 0.03, 0.02, { sides: 4 });
  });
}

/** Glass bottle (physical cylinder). */
export function bottle(kit, name, pos, { mat = 'bottleGreen', h = 0.3, r = 0.036, mass = 0.6 } = {}) {
  kit.physical(name, pos, { shape: 'cylinder', radius: r, height: h, mass }, () => {
    kit.lathe(mat, [0, 0, 0], [[0.001, 0], [r, 0], [r, h * 0.62], [r * 0.4, h * 0.8], [r * 0.38, h], [0.001, h]], { sides: 7 });
  });
}

/** Paint bucket (physical cylinder) with a wire bail and paint drips. */
export function bucket(kit, name, pos, mass = 4) {
  kit.physical(name, pos, { shape: 'cylinder', radius: 0.15, height: 0.3, mass }, () => {
    kit.lathe('plasticWhite', [0, 0, 0], [[0.001, 0], [0.13, 0], [0.15, 0.29], [0.155, 0.3]], { sides: 10 });
    kit.tube('steelGray', [[-0.15, 0.25, 0], [-0.1, 0.38, 0], [0.1, 0.38, 0], [0.15, 0.25, 0]], 0.004, { sides: 3 });
    kit.decal('drip', [0, 0.2, 0.146], [0.16, 0.18], '+z');
  });
}

/** Simple bentwood kitchen chair (physical box), facing +Z; registers a seat when `id` is set. */
export function kitchenChair(kit, name, pos, yaw = 0, { id = null } = {}) {
  const S = FURNITURE.seat;
  kit.physical(name, pos, { shape: 'box', size: [0.44, 0.88, 0.46], mass: 5 }, () => {
    slab(kit, 'woodDark', [-0.21, S - 0.03, -0.2], [0.21, S, 0.22], { r: 0.008 });
    for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [0.18, 0.19], [-0.18, 0.19]]) taperLeg(kit, 'woodDark', [x, 0, z], S - 0.03, { top: 0.018, bottom: 0.013, sides: 6, splay: [x * 0.1, z * 0.1] });
    for (const x of [-0.18, 0.18]) kit.tube('woodDark', [[x, S, -0.17], [x, 0.86, -0.22]], 0.014, { sides: 5 });
    softBox(kit, 'woodDark', [-0.2, 0.68, -0.235], [0.2, 0.84, -0.2], { r: 0.012, occlude: false });
    kit.tube('woodDark', [[-0.18, 0.16, -0.17], [-0.18, 0.16, 0.19]], 0.008, { sides: 4 });
    kit.tube('woodDark', [[0.18, 0.16, -0.17], [0.18, 0.16, 0.19]], 0.008, { sides: 4 });
  }, yaw);
  if (id) {
    kit.at(pos[0], pos[1], pos[2], yaw, () => kit.interactable({ id, kind: 'seat', pos: [0, S, 0.02], yaw: 0, radius: 1.2, prompt: 'Sit', data: { seatHeight: S, variant: 'chair', exit: [0, 0, 0.6], physical: name } }));
  }
}
