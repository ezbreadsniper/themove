import * as THREE from 'three';

/**
 * House plants as PS2-style cut-out cards: a lathed pot, soil disc and crossed / radiating leaf
 * quads. Origin at the pot base.
 */
export function pot(kit, r = 0.16, h = 0.26, mat = 'terracotta') {
  kit.lathe(mat, [0, 0, 0], [[r * 0.72, 0], [r * 0.95, h * 0.85], [r, h * 0.86], [r * 1.05, h], [r * 0.93, h]], { sides: 10, uvScale: [2, 1] });
  kit.cylinder('dirt', [0, h * 0.9, 0], r * 0.92, 0.01, { sides: 10 });
  return h * 0.9;
}

/** n vertical cards around the axis, each w × h, bent outward by `splay`. */
function cards(kit, mat, base, n, w, h, { splay = 0.2, yaw0 = 0, droop = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = yaw0 + (i / n) * Math.PI;
    const g = new THREE.PlaneGeometry(w, h, 1, 2);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const t = pos.getY(k) / h;
      pos.setZ(k, Math.sin(t * Math.PI * 0.5) * splay * h - droop * t * t * h * Math.abs(pos.getX(k)) / w);
    }
    g.computeVertexNormals();
    kit.geometry(mat, g, new THREE.Matrix4().makeRotationY(a).setPosition(...base));
  }
}

export function spiderPlant(kit, { r = 0.14, size = 0.55, mat = 'terracotta' } = {}) {
  const top = pot(kit, r, r * 1.5, mat);
  cards(kit, 'leafSpider', [0, top - 0.05, 0], 3, size * 1.4, size, { splay: 0.05 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(size * 0.8, size * 0.7);
    g.translate(0, -size * 0.25, 0);
    kit.geometry('leafSpider', g, new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(0.5)).setPosition(Math.cos(a) * r * 1.4, top, Math.sin(a) * r * 1.4));
  }
}

export function snakePlant(kit, { r = 0.13, h = 0.75 } = {}) {
  const top = pot(kit, r, r * 1.8);
  cards(kit, 'leafSnake', [0, top - 0.02, 0], 3, 0.32, h, { splay: 0.05 });
}

/** Majesty palm: fronds radiating up and out from a central stem (red stool palm in the photos). */
export function palm(kit, { r = 0.24, h = 1.25 } = {}) {
  const top = pot(kit, r, r * 1.3);
  kit.cylinder('bark', [0, top, 0], 0.025, h * 0.35, { sides: 4 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + i * 0.4;
    const tilt = 0.35 + (i % 3) * 0.28;
    const len = h * (0.55 + (i % 3) * 0.15);
    const g = new THREE.PlaneGeometry(len, 0.38, 3, 1);
    g.translate(len / 2, 0, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, pos.getY(k) - (pos.getX(k) / len) ** 2 * 0.25 * len);
    g.computeVertexNormals();
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationZ(tilt)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.3)).setPosition(0, top + h * 0.3, 0);
    kit.geometry('leafPalm', g, m);
  }
}

/** Trailing pothos: soft mound plus vines draped over an edge toward +Z, length `trail`. */
export function pothos(kit, { r = 0.13, trail = 0.6, mat = 'ceramic' } = {}) {
  const top = pot(kit, r, r * 1.4, mat);
  kit.sphere('leafPothos', [0, top + 0.08, 0], r * 1.3, { detail: 0, scale: [1, 0.6, 1], uvScale: [1, 1] });
  for (let i = 0; i < 4; i++) {
    const a = -0.6 + i * 0.4;
    const g = new THREE.PlaneGeometry(0.22, trail);
    g.translate(0, -trail / 2, 0);
    kit.geometry('leafPothos', g, new THREE.Matrix4().makeRotationY(a).setPosition(Math.sin(a) * r, top + 0.05, Math.cos(a) * r + 0.02));
  }
}

/** Vines hanging from a rail between two points (pothos along the spiral stair). */
export function hangingVines(kit, points, length = 0.5) {
  for (const p of points) {
    const g = new THREE.PlaneGeometry(0.3, length);
    g.translate(0, -length / 2, 0);
    kit.geometry('leafPothos', g, new THREE.Matrix4().makeRotationY(p[3] ?? 0).setPosition(p[0], p[1], p[2]));
  }
}
