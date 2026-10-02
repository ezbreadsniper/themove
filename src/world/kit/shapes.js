import * as THREE from 'three';
import { projectUV } from './builder.js';

/**
 * Furniture-grade shape helpers on top of the Kit. Everything stays chunky and low-poly (late-PS2
 * budget): rounded edges are a single 45° facet ring, cushions get one centre line so they can puff,
 * legs are 4–6 sided tapered prisms. Shared by every room so new sets inherit the same language.
 * All functions take frame-local coordinates.
 */
export const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

const FACES = [
  { k: 0, s: 1, u: 2, v: 1 }, { k: 0, s: -1, u: 2, v: 1 },
  { k: 1, s: 1, u: 0, v: 2 }, { k: 1, s: -1, u: 0, v: 2 },
  { k: 2, s: 1, u: 0, v: 1 }, { k: 2, s: -1, u: 0, v: 1 },
];

function stops(lo, hi, r, mid) {
  const out = [lo];
  if (r > 0) out.push(lo + r);
  if (mid) out.push((lo + hi) / 2);
  if (r > 0) out.push(hi - r);
  out.push(hi);
  return out.filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-5);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Box from a to b with rounded (r) edges. opts:
 *  r       edge radius (one facet ring; clamped to the box)
 *  puff    top bulge in metres (cushions) — needs the centre line, added automatically
 *  dent    [x, z, depth, radius] presses the top down around a point (sat-in seat)
 *  flat    faceted normals (hard furniture) instead of smooth (soft goods)
 *  mid     force centre lines on every face
 *  collide / walk / occlude / tag as kit.box
 */
export function softBox(kit, mat, a, b, opts = {}) {
  const size = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  if (size.some((s) => s <= 0)) throw new Error(`softBox ${mat}: non-positive size ${size}`);
  const r = Math.min(opts.r ?? 0.02, Math.min(...size) / 2 - 1e-4);
  const mid = !!(opts.mid || opts.puff || opts.dent);
  const st = [0, 1, 2].map((i) => stops(a[i], b[i], r, mid));
  const lo = a.map((v) => v + r);
  const hi = b.map((v) => v - r);
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const tile = kit.lib.tile(mat);
  const verts = [];
  const tris = [];
  const place = (P, fn) => {
    const q = P.map((v, i) => Math.min(hi[i], Math.max(lo[i], v)));
    const d = sub(P, q);
    const len = Math.hypot(d[0], d[1], d[2]);
    let p = len > 1e-9 && r > 0 ? q.map((v, i) => v + (d[i] / len) * r) : [...P];
    let n = len > 1e-9 ? d.map((v) => v / len) : fn;
    const pa = opts.puffAxis ?? 1;
    const [ua, va] = [0, 1, 2].filter((i) => i !== pa);
    if (P[pa] >= b[pa] - r - 1e-6 && (opts.puff || opts.dent)) {
      const fu = Math.max(0, 1 - ((P[ua] - c[ua]) / (size[ua] / 2)) ** 2);
      const fv = Math.max(0, 1 - ((P[va] - c[va]) / (size[va] / 2)) ** 2);
      const puff = opts.puff ?? 0;
      let dp = puff * fu * fv;
      const gu = puff * fv * (-2 * (P[ua] - c[ua])) / (size[ua] / 2) ** 2;
      const gv = puff * fu * (-2 * (P[va] - c[va])) / (size[va] / 2) ** 2;
      if (opts.dent) {
        const [du, dv, depth, rad] = opts.dent;
        const w = Math.max(0, 1 - ((P[ua] - du) ** 2 + (P[va] - dv) ** 2) / (rad * rad));
        dp -= depth * w * w;
      }
      p = [...p];
      p[pa] += dp;
      if (n[pa] > 0.2) {
        const m = [...n];
        m[ua] -= gu * n[pa];
        m[va] -= gv * n[pa];
        n = nrm(m);
      }
    }
    return { p, n };
  };
  for (const f of FACES) {
    const fn = [0, 0, 0];
    fn[f.k] = f.s;
    const us = st[f.u];
    const vs = st[f.v];
    const base = verts.length;
    const grid = [];
    for (let j = 0; j < vs.length; j++) {
      for (let i = 0; i < us.length; i++) {
        const P = [0, 0, 0];
        P[f.k] = f.s > 0 ? b[f.k] : a[f.k];
        P[f.u] = us[i];
        P[f.v] = vs[j];
        const { p, n } = place(P, fn);
        grid.push({ p, n, uv: projectUV(P, fn, tile) });
      }
    }
    const eu = [0, 0, 0];
    eu[f.u] = 1;
    const ev = [0, 0, 0];
    ev[f.v] = 1;
    const flip = crs(eu, ev)[f.k] * f.s < 0;
    const W = us.length;
    for (let j = 0; j < vs.length - 1; j++) {
      for (let i = 0; i < W - 1; i++) {
        const q = [j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i];
        if (opts.flat) {
          const pts = q.map((k) => grid[k].p);
          let n = nrm(crs(sub(pts[2], pts[0]), sub(pts[3], pts[1])));
          if (flip) n = n.map((v) => -v);
          const b0 = verts.length;
          q.forEach((k) => verts.push({ p: grid[k].p, n, uv: grid[k].uv }));
          tris.push(...(flip ? [b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2] : [b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3]));
        } else {
          const [i0, i1, i2, i3] = q.map((k) => base + k);
          tris.push(...(flip ? [i0, i2, i1, i0, i3, i2] : [i0, i1, i2, i0, i2, i3]));
        }
      }
    }
    if (!opts.flat) verts.push(...grid);
  }
  kit.append(mat, verts, tris, { uv: 'raw', uvScale: [1, 1] });
  const poly = rect(a[0], a[2], b[0], b[2]);
  if (opts.collide) kit.solid(poly, a[1], b[1], opts.tag);
  if (opts.walk) kit.walkable(poly, b[1], opts.tag);
  if (opts.occlude ?? Math.max(...size) > 0.25) kit.occluder(a, b);
  return kit;
}

/** Builds an indexed BufferGeometry from flat arrays (helper for custom strips). */
function geom(pos, nrmA, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrmA, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Flat metal strap bent into a hoop (pendant cages, barrel bands): radius r, strap width w along the
 * hoop axis, thickness t. The hoop lies in the local XZ plane around +Y; `matrix` orients and places
 * it. Outer and inner skins only (edges are thinner than a pixel at play distance).
 */
export function strapRing(kit, mat, r, w, t, matrix, segs = 14) {
  const pos = [];
  const nr = [];
  const uv = [];
  const idx = [];
  for (const [rad, sgn] of [[r, 1], [r - t, -1]]) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      for (const y of [-w / 2, w / 2]) {
        pos.push(cx * rad, y, cz * rad);
        nr.push(cx * sgn, 0, cz * sgn);
        uv.push(i / segs * 4, y > 0 ? 1 : 0);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      if (sgn > 0) idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      else idx.push(a, a + 3, a + 1, a, a + 2, a + 3);
    }
  }
  return kit.geometry(mat, geom(pos, nr, uv, idx), matrix);
}

/**
 * Moulded shell seat (Eames-style side chair), facing +Z, seat front at z = +d/2. The profile runs
 * from the front lip, across the seat (height y0), up the back to `backTop`; the sides curl up.
 * Two skins `t` apart so the shell has a readable edge thickness.
 */
export function shellSeat(kit, mat, { w = 0.47, d = 0.42, y0 = 0.45, backTop = 0.82, curl = 0.05, t = 0.012, cols = 6 } = {}) {
  const prof = [[d / 2 + 0.01, y0 - 0.025], [d / 2 - 0.04, y0 + 0.005], [0.05, y0], [-d / 2 + 0.06, y0 + 0.01], [-d / 2 + 0.01, y0 + 0.08], [-d / 2 - 0.03, y0 + 0.22], [-d / 2 - 0.06, backTop - 0.07], [-d / 2 - 0.07, backTop]];
  const width = (k) => w * (k < 3 ? 1 - (2 - k) * 0.03 : k > 5 ? 0.96 : 1);
  const pos = [];
  const nr = [];
  const uv = [];
  const idx = [];
  const rows = prof.length;
  const P = (k, i) => {
    const s = i / cols - 0.5;
    const [z, y] = prof[k];
    const back = k >= 4;
    const lift = curl * (2 * s) ** 2;
    return back ? [s * width(k), y, z + lift * 0.8] : [s * width(k), y + lift, z];
  };
  const normalAt = (k, i) => {
    const a = P(Math.max(0, k - 1), i);
    const b = P(Math.min(rows - 1, k + 1), i);
    const c = P(k, Math.max(0, i - 1));
    const e = P(k, Math.min(cols, i + 1));
    return nrm(crs(sub(e, c), sub(b, a)));
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let k = 0; k < rows; k++) {
      for (let i = 0; i <= cols; i++) {
        const p = P(k, i);
        const n = normalAt(k, i);
        const o = side > 0 ? 0 : -t;
        pos.push(p[0] + n[0] * o, p[1] + n[1] * o, p[2] + n[2] * o);
        nr.push(n[0] * side, n[1] * side, n[2] * side);
        uv.push(i / cols, k / rows);
      }
    }
    for (let k = 0; k < rows - 1; k++) {
      for (let i = 0; i < cols; i++) {
        const a = base + k * (cols + 1) + i;
        const b = a + cols + 1;
        if (side > 0) idx.push(a, a + 1, b + 1, a, b + 1, b);
        else idx.push(a, b + 1, a + 1, a, b, b + 1);
      }
    }
  }
  return kit.geometry(mat, geom(pos, nr, uv, idx), null);
}

/** Hard furniture slab: softBox with a 4–8 mm faceted chamfer. */
export function slab(kit, mat, a, b, opts = {}) {
  return softBox(kit, mat, a, b, { r: 0.006, flat: true, ...opts });
}

/**
 * Tapered leg from a top centre down to the floor. `top`/`bottom` are half-widths, `sides` 4
 * (square, faces on the axes) or 6/8 (round-ish), `splay` [dx, dz] offsets the foot. Faceted.
 */
export function taperLeg(kit, mat, [x, y0, z], height, { top = 0.022, bottom = 0.014, sides = 4, splay = [0, 0], cap = true } = {}) {
  const k = sides === 4 ? Math.SQRT2 : 1 / Math.cos(Math.PI / sides);
  const ring = (cx, cy, cz, hw) => Array.from({ length: sides }, (_, i) => {
    const ang = (i / sides) * Math.PI * 2 + (sides === 4 ? Math.PI / 4 : 0);
    return [cx + Math.cos(ang) * hw * k, cy, cz + Math.sin(ang) * hw * k];
  });
  const tr = ring(x, y0 + height, z, top);
  const br = ring(x + splay[0], y0, z + splay[1], bottom);
  const verts = [];
  const tris = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const quad = [br[i], br[j], tr[j], tr[i]];
    let n = nrm(crs(sub(quad[1], quad[0]), sub(quad[3], quad[0])));
    const mx = (quad[0][0] + quad[2][0]) / 2 - (x + splay[0] / 2);
    const mz = (quad[0][2] + quad[2][2]) / 2 - (z + splay[1] / 2);
    const out = n[0] * mx + n[2] * mz > 0;
    if (!out) n = n.map((v) => -v);
    const b0 = verts.length;
    quad.forEach((p, q) => verts.push({ p, n, uv: [q === 1 || q === 2 ? 1 : 0, q >= 2 ? height / kit.lib.tile(mat)[1] : 0] }));
    tris.push(...(out ? [b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3] : [b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2]));
  }
  if (cap) {
    const b0 = verts.length;
    br.forEach((p) => verts.push({ p, n: [0, -1, 0], uv: [0, 0] }));
    for (let i = 1; i < sides - 1; i++) tris.push(b0, b0 + i, b0 + i + 1);
  }
  kit.append(mat, verts, tris, { uv: 'raw' });
  return kit;
}

/** Turned (lathed) leg: bun foot, slim waist, block top. Origin at the floor. */
export function turnedLeg(kit, mat, [x, y0, z], height, r = 0.025, sides = 6) {
  const h = height;
  kit.lathe(mat, [x, y0, z], [[0.001, 0], [r * 0.7, 0], [r * 0.9, h * 0.04], [r * 0.65, h * 0.1], [r * 0.5, h * 0.45], [r * 0.75, h * 0.62], [r * 0.6, h * 0.7], [r, h * 0.78], [r, h], [0.001, h]], { sides });
  return kit;
}

/** Hairpin leg: two rods from the top plate meeting at the floor foot. */
export function hairpinLeg(kit, mat, [x, y0, z], height, { spread = 0.08, along = [1, 0] } = {}) {
  const [ax, az] = along;
  kit.tube(mat, [[x - ax * spread, y0 + height, z - az * spread], [x - ax * 0.008, y0 + 0.02, z - az * 0.008], [x + ax * 0.008, y0 + 0.02, z + az * 0.008], [x + ax * spread, y0 + height, z + az * spread]], 0.006, { sides: 3 });
  kit.cylinder(mat, [x, y0, z], 0.012, 0.012, { sides: 5 });
  return kit;
}

/**
 * Handle on a front face at z (pointing +Z). kind: 'bar' (horizontal pull), 'vbar' (vertical),
 * 'knob', 'cup', 'edge' (thin finger lip along the top edge, for handleless doors).
 */
export function handle(kit, kind, [x, y], z, { len = 0.14, mat = 'chrome' } = {}) {
  if (kind === 'none') return kit;
  if (kind === 'knob') {
    kit.geometry(mat, new THREE.CylinderGeometry(0.015, 0.007, 0.03, 6).rotateX(Math.PI / 2).translate(x, y, z + 0.015));
    return kit;
  }
  if (kind === 'edge') {
    kit.box(mat, [x - len / 2, y - 0.006, z], [x + len / 2, y, z + 0.012], { seg: 9, occlude: false });
    return kit;
  }
  const vertical = kind === 'vbar';
  const h = len / 2;
  const a = vertical ? [x, y - h, z] : [x - h, y, z];
  const b = vertical ? [x, y + h, z] : [x + h, y, z];
  if (kind === 'cup') {
    kit.box(mat, [x - 0.045, y - 0.012, z], [x + 0.045, y + 0.012, z + 0.018], { seg: 9, occlude: false });
    return kit;
  }
  kit.tube(mat, [[a[0], a[1], z], [a[0], a[1], z + 0.028], [b[0], b[1], z + 0.028], [b[0], b[1], z]], 0.006, { sides: 4 });
  return kit;
}

/**
 * Door / drawer front facing +Z with its back on plane z: chamfered slab inset by `gap` from the
 * opening [x0,x1]×[y0,y1]; style 'shaker' adds a raised stile-and-rail frame. Handle placement:
 * 'top' (drawer pull centred near the top), 'mid', 'left'/'right' (door pulls on the latch side).
 */
export function front(kit, mat, [x0, y0, x1, y1], z, { gap = 0.004, t = 0.019, style = 'slab', handle: kind = 'bar', handleMat = 'chrome', place = 'top', handleLen } = {}) {
  const a = [x0 + gap, y0 + gap, z];
  const b = [x1 - gap, y1 - gap, z + t];
  slab(kit, mat, a, b, { r: 0.004, occlude: false });
  const w = b[0] - a[0];
  const h = b[1] - a[1];
  if (style === 'shaker' && w > 0.16 && h > 0.16) {
    const s = Math.min(0.065, w * 0.18);
    const zt = b[2];
    slab(kit, mat, [a[0], a[1], zt], [a[0] + s, b[1], zt + 0.007], { r: 0.002, occlude: false });
    slab(kit, mat, [b[0] - s, a[1], zt], [b[0], b[1], zt + 0.007], { r: 0.002, occlude: false });
    slab(kit, mat, [a[0] + s, b[1] - s, zt], [b[0] - s, b[1], zt + 0.007], { r: 0.002, occlude: false });
    slab(kit, mat, [a[0] + s, a[1], zt], [b[0] - s, a[1] + s, zt + 0.007], { r: 0.002, occlude: false });
  }
  const zf = b[2] + (style === 'shaker' ? 0.007 : 0);
  const cx = (a[0] + b[0]) / 2;
  const len = handleLen ?? Math.min(0.16, w * 0.45);
  if (place === 'top') handle(kit, kind, [cx, b[1] - Math.min(0.05, h * 0.3)], zf, { len, mat: handleMat });
  else if (place === 'mid') handle(kit, kind, [cx, (a[1] + b[1]) / 2], zf, { len, mat: handleMat });
  else if (place === 'bottom') handle(kit, kind, [cx, a[1] + Math.min(0.05, h * 0.3)], zf, { len, mat: handleMat });
  else {
    const hx = place === 'left' ? a[0] + 0.04 : b[0] - 0.04;
    handle(kit, kind === 'bar' ? 'vbar' : kind, [hx, Math.min(b[1] - 0.08, a[1] + h * 0.8)], zf, { len, mat: handleMat });
  }
  return kit;
}

/** Barrel hinge knuckles on a door edge (x, from y0 to y1 at z). */
export function hinges(kit, x, y0, y1, z, mat = 'brass') {
  for (const y of [y0 + 0.18, y1 - 0.2, (y0 + y1) / 2]) kit.cylinder(mat, [x, y - 0.05, z], 0.008, 0.1, { sides: 5 });
  return kit;
}

/** Thin piping cord along a polyline (cushion seams, upholstery welts). */
export function piping(kit, mat, points, r = 0.006) {
  kit.tube(mat, points, r, { sides: 3 });
  return kit;
}

/** Closed rectangular piping loop around the top perimeter of a cushion [a, b] at height y. */
export function pipingLoop(kit, mat, a, b, y, inset = 0.012, r = 0.006) {
  const x0 = a[0] + inset;
  const x1 = b[0] - inset;
  const z0 = a[2] + inset;
  const z1 = b[2] - inset;
  return piping(kit, mat, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0 + 0.0001]], r);
}
