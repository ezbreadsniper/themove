import * as THREE from 'three';
import { Raster } from '../tex/raster.js';
import { createRng } from '../core/rng.js';

/**
 * Pixel textures for combat FX, painted in code with the project's Raster (y up = v up) and
 * deterministic per seed. Decal textures are drawn over a transparent canvas whose colour is already
 * the ink colour, so soft edges fade in alpha only (the multiply blend then darkens the surface
 * underneath by colour × alpha and never adds a dark fringe).
 */
export const BLOOD = Object.freeze({ fresh: '#7a0a0c', dark: '#4a0507', dry: '#3a0a08', mist: '#8c1012' });

function blank(size, color) {
  const r = new Raster(size, size);
  r.fill(color);
  for (let i = 3; i < r.data.length; i += 4) r.data[i] = 0;
  return r;
}

export function toTexture(r, name) {
  const tex = new THREE.DataTexture(r.data, r.width, r.height, THREE.RGBAFormat);
  tex.name = name;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Spatter: a core blob, satellite drops and streaks thrown toward +y (the travel direction). */
export function paintSplat(seed, size = 32) {
  const rng = createRng(`fx-splat:${seed}`);
  const r = blank(size, BLOOD.fresh);
  const c = size / 2;
  const s = size / 32;
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = rng.next() * 3 * s;
    const rr = (2.5 + rng.next() * 3.5) * s;
    r.ellipse(c + Math.cos(a) * d, c - 3 * s + Math.sin(a) * d, rr, rr * (0.7 + rng.next() * 0.5), BLOOD.fresh, 1);
  }
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (rng.next() * 2 - 1) * 0.8;
    const len = (6 + rng.next() * 9) * s;
    const x1 = c + Math.cos(a) * len;
    const y1 = c - 3 * s + Math.sin(a) * len;
    r.line(c, c - 3 * s, x1, y1, BLOOD.fresh, Math.max(1, (1 + rng.next() * 1.5) * s), 0.95);
    r.ellipse(x1, y1, (1 + rng.next() * 1.4) * s, (1.2 + rng.next() * 1.6) * s, BLOOD.fresh, 1);
  }
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = (7 + rng.next() * 7) * s;
    r.ellipse(c + Math.cos(a) * d, c - 2 * s + Math.sin(a) * d * (Math.sin(a) > 0 ? 1.2 : 0.7), (0.6 + rng.next()) * s, (0.6 + rng.next()) * s, BLOOD.fresh, 0.9);
  }
  r.toneEllipse(c, c - 3 * s, 5 * s, 4 * s, 0.75);
  return r;
}

/** A single drop with a couple of satellites (floor drips, trails). */
export function paintDrop(seed, size = 16) {
  const rng = createRng(`fx-drop:${seed}`);
  const r = blank(size, BLOOD.dark);
  const c = size / 2;
  r.ellipse(c, c, 2.6 + rng.next() * 1.4, 2.4 + rng.next() * 1.4, BLOOD.dark, 1);
  for (let i = 0; i < 4; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = 3.5 + rng.next() * 3;
    r.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.7 + rng.next() * 0.6, 0.7 + rng.next() * 0.6, BLOOD.dark, 0.9);
  }
  return r;
}

/** Pool: an even dark fill with a wobbly edge; the geometry does the real outline (clipped). */
export function paintPool(seed, size = 64) {
  const rng = createRng(`fx-pool:${seed}`);
  const r = blank(size, BLOOD.dark);
  const c = size / 2;
  const n = 24;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = c * (0.82 + rng.next() * 0.16);
    pts.push([c + Math.cos(a) * rad, c + Math.sin(a) * rad]);
  }
  r.polygon(pts, BLOOD.dark, 1);
  r.ellipse(c, c, c * 0.55, c * 0.5, BLOOD.dry, 0.35, 0.8);
  // A thin glossy-looking lighter ring just inside the edge reads as a liquid meniscus.
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    r.plot(c + (x - c) * 0.9, c + (y - c) * 0.9, '#6a0a0c', 0.5);
  }
  return r;
}

/** Bullet hole: black bore, a darkened crush ring and a few chips. */
export function paintBulletHole(seed, size = 16) {
  const rng = createRng(`fx-hole:${seed}`);
  const r = blank(size, '#2a2522');
  const c = size / 2;
  r.ellipse(c, c, 5.5, 5.5, '#4a4440', 0.55, 0.6);
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * Math.PI * 2;
    r.line(c, c, c + Math.cos(a) * (3 + rng.next() * 3), c + Math.sin(a) * (3 + rng.next() * 3), '#3a3430', 1, 0.6);
  }
  r.ellipse(c, c, 2.2, 2.2, '#0d0b0a', 1);
  r.plot(c - 1, c, '#000000', 1);
  return r;
}

/** Round particle sprite (alpha cut), white so vertex colours tint it. */
export function paintDot(size = 8) {
  const r = blank(size, '#ffffff');
  r.ellipse(size / 2, size / 2, size / 2 - 0.5, size / 2 - 0.5, '#ffffff', 1);
  return r;
}

/** Soft puff (dust). */
export function paintPuff(seed, size = 16) {
  const rng = createRng(`fx-puff:${seed}`);
  const r = blank(size, '#ffffff');
  for (let i = 0; i < 5; i++) {
    r.ellipse(size / 2 + (rng.next() * 2 - 1) * 2.5, size / 2 + (rng.next() * 2 - 1) * 2.5, 3 + rng.next() * 2.5, 3 + rng.next() * 2.5, '#ffffff', 0.55, 0.9);
  }
  return r;
}

/** Muzzle flash star (seen from the side or the front: a cross of spikes around a hot core). */
export function paintFlash(seed, size = 32) {
  const rng = createRng(`fx-flash:${seed}`);
  const r = blank(size, '#ffd27a');
  const c = size / 2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.next() * 0.4;
    const len = c * (0.55 + rng.next() * 0.45);
    r.line(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len, '#ffb347', 2, 0.9);
  }
  r.ellipse(c, c, c * 0.42, c * 0.42, '#ffcf6a', 0.95, 0.5);
  r.ellipse(c, c, c * 0.22, c * 0.22, '#fff6d8', 1);
  return r;
}

/** Small bloodstain for clothing (soaked fabric spot). */
export function paintStain(seed, size = 16) {
  const rng = createRng(`fx-stain:${seed}`);
  const r = blank(size, BLOOD.dark);
  const c = size / 2;
  for (let i = 0; i < 4; i++) r.ellipse(c + (rng.next() * 2 - 1) * 2, c + (rng.next() * 2 - 1) * 2, 2.5 + rng.next() * 2.5, 2.5 + rng.next() * 2.5, BLOOD.dark, 0.9, 0.5);
  r.ellipse(c, c, 1.6, 1.6, '#1a0405', 1);
  return r;
}

/** Every FX texture, built once per FxSystem. */
export function buildFxTextures(seed = 'fx') {
  const t = (r, name) => toTexture(r, `${seed}-${name}`);
  return {
    splats: [0, 1, 2, 3].map((i) => t(paintSplat(`${seed}-${i}`), `splat${i}`)),
    drops: [0, 1, 2].map((i) => t(paintDrop(`${seed}-${i}`), `drop${i}`)),
    pool: t(paintPool(seed), 'pool'),
    holes: [0, 1].map((i) => t(paintBulletHole(`${seed}-${i}`), `hole${i}`)),
    stain: t(paintStain(seed), 'stain'),
    dot: t(paintDot(), 'dot'),
    puff: t(paintPuff(seed), 'puff'),
    flash: t(paintFlash(seed), 'flash'),
  };
}
