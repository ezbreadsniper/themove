import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder, V, ringRadius, frameFor } from '../mesh-builder.js';
import { HEAD_LANDMARKS as L, featureOffset } from './head.js';
import { torsoRings, torsoWeights } from './body.js';
import { CIGARETTE, cigarettePoints } from '../../anim/cigarette.js';

const HEAD = [[J.Head, 1]];
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Baseball cap: crown shell over the skull plus a curved bill. UV: crown [0,0.35,1,1], bill [0,0,1,0.35]. */
export function buildCap(shape, { lift = 0.013, bill = 0.085, tilt = 0, style = 'baseball' } = {}) {
  const trucker = style === 'trucker';
  if (trucker) lift = 0.02;
  const mb = new MeshBuilder('cap');
  const k = shape.k;
  const sides = 16;
  const rows = 5;
  const band = (theta) => shape.chinY + (L.brow + 0.03 - Math.min(1, Math.abs(theta) / Math.PI) * 0.045 + tilt * Math.cos(theta) * 0.01) * k;
  const starts = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    starts.push(mb.vertexCount);
    for (let s = 0; s <= sides; s++) {
      const u = s / sides;
      const theta = (u - 0.5) * Math.PI * 2;
      const y0 = band(theta);
      const y = y0 + (shape.topY - y0) * (1 - Math.pow(1 - t, 1.8)) * 0.99;
      const front = trucker ? Math.max(0, Math.cos(theta)) * t * 0.012 * k : 0;
      const p = shape.point(theta, y, lift * k * (1 + t * 0.25) + front);
      if (t > 0.5) p.y += lift * k * (t - 0.5) * 0.4;
      mb.addVertex(p, [u, 0.35 + t * 0.62], HEAD);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < sides; s++) mb.quad(starts[r] + s, starts[r] + s + 1, starts[r + 1] + s + 1, starts[r + 1] + s);
  }
  const top = mb.addVertex(V(0, shape.topY + lift * k * (trucker ? 1.6 : 1.25), shape.rings[shape.rings.length - 1].cz), [0.5, 1], HEAD);
  for (let s = 0; s < sides; s++) mb.tri(top, starts[rows] + s, starts[rows] + s + 1);

  if (trucker) {
    mb.newSmoothingGroup();
    mb.box(V(0, shape.topY + lift * k * 1.6 + 0.004 * k, shape.rings[shape.rings.length - 1].cz), [0.009 * k, 0.004 * k, 0.009 * k], [0.95, 0.95, 1, 1], HEAD);
  }
  mb.newSmoothingGroup();
  const cols = 10;
  const span = 0.95;
  const thickness = 0.006 * k;
  const grid = [];
  for (let layer = 0; layer < 2; layer++) {
    const rowIds = [];
    for (let edge = 0; edge < 2; edge++) {
      const ids = [];
      for (let c = 0; c <= cols; c++) {
        const a = -1 + (2 * c) / cols;
        const theta = a * span;
        const inner = shape.point(theta, band(theta) + 0.004 * k, lift * k * 0.9);
        const reach = bill * k * (1 - 0.6 * a * a);
        const droop = trucker ? 0.05 : 0.16;
        const curve = trucker ? 0.006 : 0.018;
        const outer = V(inner.x * (1 + 0.1 * Math.abs(a)), inner.y - reach * droop - a * a * curve * k, inner.z + reach);
        const p = edge === 0 ? inner : outer;
        p.y -= layer * thickness;
        ids.push(mb.addVertex(p, [c / cols, (edge ? 0.02 : 0.3) - layer * 0.0], HEAD));
      }
      rowIds.push(ids);
    }
    grid.push(rowIds);
  }
  for (let c = 0; c < cols; c++) {
    const [a, b] = grid[0];
    mb.quad(a[c], b[c], b[c + 1], a[c + 1]);
    const [a2, b2] = grid[1];
    mb.quad(a2[c], a2[c + 1], b2[c + 1], b2[c]);
    mb.quad(b[c], b2[c], b2[c + 1], b[c + 1]);
  }
  return mb;
}

function bar(mb, a, b, thick, uv) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const d = dir.normalize();
  let side = d.clone().cross(V(0, 1, 0));
  if (side.lengthSq() < 1e-6) side = d.clone().cross(V(0, 0, 1));
  side.normalize();
  const up = side.clone().cross(d).normalize();
  const center = a.clone().add(b).multiplyScalar(0.5);
  mb.box(center, [thick, len, thick], uv, HEAD, { frame: { x: side, y: d, z: up } });
}

/** Rectangular frames with temples. UV: whole texture is frame colour. */
export function buildGlasses(shape, { width = 1, height = 1, thick = 0.0045, frame = 'rect' } = {}) {
  thick *= Math.min(1, height);
  const mb = new MeshBuilder('glasses');
  const k = shape.k;
  const y = shape.lm.eye + 0.002 * k;
  const zFront = 0.108 * k;
  const lensW = 0.05 * k * width;
  const lensH = 0.036 * k * height;
  const uv = [0, 0, 1, 1];
  for (const s of [1, -1]) {
    const cx = s * 0.034 * k;
    const x0 = cx - (lensW / 2);
    const x1 = cx + (lensW / 2);
    const curve = (x) => zFront - Math.abs(x) * 0.12;
    const tl = V(x0, y + lensH / 2, curve(x0));
    const tr = V(x1, y + lensH / 2, curve(x1));
    if (frame === 'rect') {
      const bl = V(x0, y - lensH / 2, curve(x0));
      const br = V(x1, y - lensH / 2, curve(x1));
      bar(mb, tl, tr, thick * 1.5, uv);
      bar(mb, bl, br, thick, uv);
      bar(mb, tl, bl, thick, uv);
      bar(mb, tr, br, thick, uv);
    } else {
      const n = 10;
      const pts = Array.from({ length: n }, (_, i) => {
        const t = (i / n) * Math.PI * 2;
        const c = Math.cos(t);
        const sn = Math.sin(t);
        const ry = frame === 'aviator' ? (sn < 0 ? lensH * 0.62 : lensH * 0.45) : lensH * 0.52;
        const rxl = frame === 'aviator' ? lensW * 0.52 * (sn < 0 ? 1 - 0.25 * Math.abs(c) * (c * s < 0 ? 1 : 0) : 1) : lensH * 0.52;
        const x = cx + c * rxl;
        return V(x, y + sn * ry - (frame === 'aviator' ? lensH * 0.08 : 0), curve(x));
      });
      for (let i = 0; i < n; i++) bar(mb, pts[i], pts[(i + 1) % n], i % 5 === 2 ? thick * 1.3 : thick, uv);
      if (frame === 'aviator') bar(mb, V(cx - s * lensW * 0.45, y + lensH * 0.42, curve(cx)), V(cx + s * lensW * 0.1, y + lensH * 0.42, curve(cx)), thick, uv);
    }
    const outer = s > 0 ? tr : tl;
    const hinge = outer.clone();
    const ear = V(s * (shape.sampleRing(shape.lm.earTop).rx + 0.004 * k), shape.lm.earTop - 0.002 * k, -0.01 * k);
    bar(mb, hinge, ear, thick, uv);
  }
  bar(mb, V(-0.012 * k, y + lensH * 0.3, zFront + 0.002 * k), V(0.012 * k, y + lensH * 0.3, zFront + 0.002 * k), thick, uv);
  return mb;
}

/** Wraparound shield sunglasses: one curved band across the eyes. UV: band [0,0,1,1]. */
export function buildWrapShades(shape, { height = 1 } = {}) {
  const mb = new MeshBuilder('shades');
  const k = shape.k;
  const cols = 14;
  const span = 1.3;
  const y0 = shape.lm.eye - 0.019 * k * height;
  const y1 = shape.lm.eye + 0.02 * k * height;
  const ids = [];
  for (const [ri, y] of [[0, y0], [1, (y0 + y1) / 2], [2, y1]]) {
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const theta = -span + (2 * span * c) / cols;
      const clear = 0.018 + 0.008 * Math.cos(theta);
      const p = shape.point(theta, y, clear * k);
      if (ri === 1) p.addScaledVector(V(Math.sin(theta), 0, Math.cos(theta)), 0.003 * k);
      if (Math.abs(theta) < 0.2 && ri === 0) p.y += 0.006 * k * (1 - Math.abs(theta) / 0.2);
      row.push(mb.addVertex(p, [c / cols, ri / 2], HEAD));
    }
    ids.push(row);
  }
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) mb.quad(ids[r][c], ids[r][c + 1], ids[r + 1][c + 1], ids[r + 1][c]);
  }
  for (const s of [1, -1]) {
    const hinge = shape.point(s * span, (y0 + y1) / 2 + 0.006 * k, 0.018 * k);
    const ear = V(s * (shape.sampleRing(shape.lm.earTop).rx + 0.003 * k), shape.lm.earTop, -0.012 * k);
    bar(mb, hinge, ear, 0.005 * k, [0, 0.45, 0.1, 0.55]);
  }
  return mb;
}

/** Knit beanie: snug dome over the skull with a folded cuff band and a small top bump. */
export function buildBeanie(shape, { cuff = true, slouch = 0 } = {}) {
  const mb = new MeshBuilder('beanie');
  const k = shape.k;
  const sides = 16;
  const rows = 6;
  const band = (theta) => shape.chinY + (L.brow + 0.026 - Math.min(1, Math.abs(theta) / Math.PI) * 0.03) * k;
  const starts = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    starts.push(mb.vertexCount);
    for (let s = 0; s <= sides; s++) {
      const u = s / sides;
      const theta = (u - 0.5) * Math.PI * 2;
      const y0 = band(theta);
      const y = y0 + (shape.topY - y0) * (1 - Math.pow(1 - t, 1.7)) * 0.99;
      const out = (r <= 1 && cuff ? 0.011 : 0.007) * k + slouch * t * t * 0.03 * k * Math.max(0, -Math.cos(theta));
      const p = shape.point(theta, y, out);
      if (t > 0.6) p.y += 0.01 * k * (t - 0.6) + slouch * 0.02 * k * t;
      mb.addVertex(p, [u, t], HEAD);
    }
  }
  for (let r = 0; r < rows; r++) for (let s = 0; s < sides; s++) mb.quad(starts[r] + s, starts[r] + s + 1, starts[r + 1] + s + 1, starts[r + 1] + s);
  const top = mb.addVertex(V(0, shape.topY + 0.016 * k + slouch * 0.03 * k, shape.rings[shape.rings.length - 1].cz - slouch * 0.03 * k), [0.5, 1], HEAD);
  for (let s = 0; s < sides; s++) mb.tri(top, starts[rows] + s, starts[rows] + s + 1);
  return mb;
}

const BALACLAVA_SIDES = 20;
const EYE_SLOT_HALF_ANGLE = 0.62;

/**
 * Knit balaclava: one shell from the neck to the crown that follows the face sculpt (nose, brow,
 * chin) a few millimetres out, bulges over the ears, and leaves a single slot open for the eyes.
 */
export function buildBalaclava(shape, layout) {
  const mb = new MeshBuilder('balaclava');
  const k = shape.k;
  const rel = (y) => (y - shape.chinY) / k;
  const eye = rel(shape.lm.eye);
  const earMid = (rel(shape.lm.earTop) + rel(shape.lm.earBottom)) / 2;
  const trapezius = torsoRings(layout).find((t) => t.key === 'trapezius');
  const bottom = rel(trapezius.y - 0.02);
  const neckRing = torsoRings(layout).find((t) => t.key === 'neck');
  const slot = [eye - 0.022, eye + 0.019];
  const nose = [rel(shape.lm.noseBase), rel(shape.lm.noseTip)].sort((x, y) => x - y);
  const rows = [bottom, bottom * 0.5, -0.01, 0.02, 0.05, nose[0], nose[1], 0.112, slot[0], slot[1], 0.178, 0.204, 0.228, 0.246];
  const starts = [];
  rows.forEach((r, ri) => {
    const y = shape.chinY + r * k;
    const neck = r < -0.02;
    starts.push(mb.vertexCount);
    for (let s = 0; s <= BALACLAVA_SIDES; s++) {
      const theta = (s / BALACLAVA_SIDES - 0.5) * Math.PI * 2;
      const ear = Math.exp(-(((Math.abs(theta) - 1.5) / 0.45) ** 2)) * Math.exp(-(((r - earMid) / 0.045) ** 2)) * 0.03;
      const out = (neck ? 0.012 + 0.05 * smooth(bottom * 0.3, bottom, r) : 0.008 + ear) * k + (neck ? 0 : featureOffset(shape, theta, y) * 1.05 + 0.005 * k * Math.max(0, Math.cos(theta)) ** 6);
      const p = shape.point(theta, Math.max(shape.rings[0].y, Math.min(y, shape.topY - 0.002)), out);
      p.y = Math.min(y, shape.topY - 0.002);
      if (neck) {
        const ring = { rx: neckRing.rx + out, rzF: neckRing.rzF + out, rzB: neckRing.rzB + out, n: 2 };
        const rr = ringRadius(ring, theta);
        const outside = V(Math.sin(theta) * rr, p.y, neckRing.cz + Math.cos(theta) * rr);
        if (Math.hypot(outside.x, outside.z - neckRing.cz) > Math.hypot(p.x, p.z - neckRing.cz)) p.copy(outside);
      }
      const w = neck ? [[J.Neck, 0.6], [J.Head, 0.4]] : r < 0 ? [[J.Neck, 0.15], [J.Head, 0.85]] : HEAD;
      mb.addVertex(p, [s / BALACLAVA_SIDES, ri / (rows.length - 1)], w);
    }
  });
  const slotRow = rows.indexOf(slot[0]);
  for (let r = 0; r < rows.length - 1; r++) {
    for (let s = 0; s < BALACLAVA_SIDES; s++) {
      const mid = ((s + 0.5) / BALACLAVA_SIDES - 0.5) * Math.PI * 2;
      if (r === slotRow && Math.abs(mid) < EYE_SLOT_HALF_ANGLE) continue;
      mb.quad(starts[r] + s, starts[r] + s + 1, starts[r + 1] + s + 1, starts[r + 1] + s);
    }
  }
  const last = starts[rows.length - 1];
  const top = mb.addVertex(V(0, shape.topY + 0.007 * k, shape.rings[shape.rings.length - 1].cz), [0.5, 1], HEAD);
  for (let s = 0; s < BALACLAVA_SIDES; s++) mb.tri(top, last + s, last + s + 1);
  return mb;
}

/** Bucket hat: crown cylinder + downward-sloping brim all the way round. */
export function buildBucket(shape) {
  const mb = new MeshBuilder('bucket');
  const k = shape.k;
  const sides = 16;
  const y0 = shape.chinY + (L.brow + 0.03) * k;
  const crownTop = shape.topY + 0.02 * k;
  const rr = (theta, y, add) => shape.point(theta, Math.min(y, shape.topY - 0.002), add);
  const rows = [
    { y: y0 - 0.004 * k, add: 0.012 * k, brim: 0, v: 0.35 },
    { y: (y0 + crownTop) / 2, add: 0.016 * k, brim: 0, v: 0.6 },
    { y: crownTop - 0.01 * k, add: 0.018 * k, brim: 0, v: 0.9 },
  ];
  const starts = [];
  rows.forEach((row) => {
    starts.push(mb.vertexCount);
    for (let s = 0; s <= sides; s++) {
      const theta = (s / sides - 0.5) * Math.PI * 2;
      const p = rr(theta, row.y, row.add);
      p.y = row.y;
      mb.addVertex(p, [s / sides, row.v], HEAD);
    }
  });
  for (let r = 0; r < rows.length - 1; r++) for (let s = 0; s < sides; s++) mb.quad(starts[r] + s, starts[r] + s + 1, starts[r + 1] + s + 1, starts[r + 1] + s);
  const capC = mb.addVertex(V(0, crownTop + 0.004 * k, shape.rings[shape.rings.length - 1].cz), [0.5, 1], HEAD);
  for (let s = 0; s < sides; s++) mb.tri(capC, starts[2] + s, starts[2] + s + 1);
  mb.newSmoothingGroup();
  const brim = [];
  for (const [ext, drop, v] of [[0, 0, 0.3], [0.05 * k, 0.022 * k, 0.02]]) {
    const row = [];
    for (let s = 0; s <= sides; s++) {
      const theta = (s / sides - 0.5) * Math.PI * 2;
      const p = rr(theta, y0, 0.012 * k);
      const out = V(p.x, 0, p.z - shape.rings[6].cz).normalize();
      p.addScaledVector(out, ext);
      p.y = y0 - 0.004 * k - drop;
      row.push(mb.addVertex(p, [s / sides, v], HEAD));
    }
    brim.push(row);
  }
  for (let s = 0; s < sides; s++) {
    mb.quad(brim[0][s], brim[0][s + 1], brim[1][s + 1], brim[1][s]);
    mb.quad(brim[0][s + 1], brim[0][s], brim[1][s], brim[1][s + 1]);
  }
  return mb;
}

/** Durag: skin-tight cap following the scalp + two tails down the back of the neck. */
export function buildDurag(shape, layout) {
  const mb = buildBeanie(shape, { cuff: false });
  mb.name = 'durag';
  const k = shape.k;
  const neckY = layout.measures.neckY;
  for (const s of [-1, 1]) {
    const root = shape.point(Math.PI - s * 0.18, shape.chinY + L.earTop * k, 0.008 * k);
    const pts = [root, root.clone().add(V(s * 0.01 * k, -0.07 * k, -0.02 * k)), root.clone().add(V(s * 0.018 * k, -(root.y - neckY + 0.06), -0.035 * k))];
    const rings = pts.map((p, i) => ({ c: p, x: V(1, 0, 0), z: V(0, 0, 1), rx: 0.022 * k * (1 - i * 0.15), rzF: 0.003 * k, rzB: 0.003 * k, n: 2, v: i / 2, w: i === 0 ? HEAD : [[J.Head, 0.5], [J.Neck, 0.5]] }));
    mb.newSmoothingGroup();
    mb.loft(rings, { sides: 6, uv: [0, 0, 1, 0.3] });
  }
  return mb;
}

/** Elastic headband around the forehead and back of the head. */
export function buildHeadband(shape) {
  const mb = new MeshBuilder('headband');
  const k = shape.k;
  const sides = 16;
  const rows = [0, 1].map((r) => {
    const start = mb.vertexCount;
    for (let s = 0; s <= sides; s++) {
      const theta = (s / sides - 0.5) * Math.PI * 2;
      const y = shape.chinY + (L.brow + 0.022 + r * 0.024 - Math.min(1, Math.abs(theta) / Math.PI) * 0.01) * k;
      mb.addVertex(shape.point(theta, y, 0.006 * k), [s / sides, r], HEAD);
    }
    return start;
  });
  for (let s = 0; s < sides; s++) mb.quad(rows[0] + s, rows[0] + s + 1, rows[1] + s + 1, rows[1] + s);
  return mb;
}

/** Stud earrings (both lobes). */
export function buildEarrings(shape, { size = 1 } = {}) {
  const mb = new MeshBuilder('earrings');
  const k = shape.k;
  for (const s of [1, -1]) {
    const p = shape.point(s * Math.PI * 0.5, shape.lm.earBottom + 0.004 * k, 0.016 * k);
    p.z -= 0.012 * k;
    mb.box(p, [0.006 * k * size, 0.006 * k * size, 0.006 * k * size], [0, 0, 1, 1], HEAD);
  }
  return mb;
}

/** Watch (left wrist) or bracelet (right wrist): a ring around the forearm just above the hand. */
export function buildWristwear(layout, { side = 'Left', kind = 'watch' } = {}) {
  const mb = new MeshBuilder(kind);
  const m = layout.measures;
  const s = side === 'Left' ? 1 : -1;
  const dir = m.armDir.clone().setX(m.armDir.x * s);
  const wrist = layout.world[`${side}Hand`].clone().addScaledVector(dir, -0.03);
  const f = frameFor(dir, V(0, 0, 1));
  const r = m.wristRadius * 1.18 + 0.004;
  const w = kind === 'watch' ? 0.016 : 0.008;
  const weights = [[J[`${side}ForeArm`], 0.7], [J[`${side}Hand`], 0.3]];
  const rings = [-1, 1].map((o, i) => ({ c: wrist.clone().addScaledVector(dir, o * w), x: f.x, z: f.z, r, v: i, w: weights }));
  mb.loft(rings, { sides: 8, uv: [0, 0, 1, 0.5] });
  if (kind === 'watch') {
    const face = wrist.clone().addScaledVector(f.z, r + 0.003);
    mb.box(face, [0.026, 0.006, 0.026], [0, 0.5, 1, 1], weights, { frame: { x: dir.clone().cross(f.z).normalize(), y: f.z, z: dir } });
  }
  return mb;
}

/**
 * Cigarette held in the V grip between the right index and middle fingers (src/anim/cigarette.js has
 * the placement shared with the smoking clips), skinned to the finger block so it follows the curl.
 * Returns the mesh plus the lit tip offset in RightHandFingers1 bone space (bones rest at identity,
 * so it is a world delta from the knuckle). UV v runs filter (0..0.3) → paper → ash / ember (≥0.94).
 */
export function buildCigarette(layout) {
  const mb = new MeshBuilder('cigarette');
  const c = cigarettePoints(layout);
  const f = frameFor(c.axis, c.frame.fingers);
  const w = [[J[CIGARETTE.bone], 1]];
  const r = CIGARETTE.radius * c.k;
  const len = c.filter.distanceTo(c.tip);
  const at = (t) => c.filter.clone().addScaledVector(c.axis, t * len);
  const rings = [[0, 0, 1], [0.3, 0.29, 1], [0.31, 0.32, 1], [0.93, 0.9, 0.97], [1, 0.97, 0.9]]
    .map(([t, v, s]) => ({ c: at(t), x: f.x, z: f.z, r: r * s, v, w }));
  mb.loft(rings, { sides: 6, uv: [0, 0, 1, 1], capStart: 0.0005, capEnd: 0.0005 });
  return { mb, tip: c.local.tip.clone(), filter: c.local.filter.clone(), bone: CIGARETTE.bone };
}

/** Stacked chains resting on the collar/chest. chains: [{ drop, thickness, pendant }] */
export function buildChains(layout, chains, { clearance = 0.03, over = null, under = null } = {}) {
  const mb = new MeshBuilder('chains');
  const table = torsoRings(layout);
  const tr = table.find((r) => r.key === 'trapezius');
  const uc = table.find((r) => r.key === 'upperChest');
  const m = layout.measures;
  chains.forEach((chain, ci) => {
    const points = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const front = Math.max(0, Math.cos(a));
      const y = (over ? tr.y + 0.008 : tr.y - 0.004) - (chain.drop + (over ? 0.012 : 0)) * Math.pow(front, over ? 2.2 : 1.4);
      const t = smooth(tr.y, uc.y, y);
      const rx = tr.rx + (uc.rx - tr.rx) * t * 0.55;
      const rzF = tr.rzF + (uc.rzF - tr.rzF) * t;
      const ring = { rx: rx * 0.8, rzF: rzF + 0.006, rzB: tr.rzB, n: 2 };
      let r = ringRadius(ring, a) + clearance * (0.5 + 0.5 * front) + ci * 0.002;
      let cz = tr.cz;
      if (over) {
        const margin = chain.thickness * 0.55 + 0.0015 + ci * 0.0015;
        const s = y <= over.surface.top ? over.surface(y, a) : null;
        if (s && s.r + margin > r) {
          r = s.r + margin;
          cz = s.cz;
        }
        if (over.collar && y <= over.collar.top + 0.005) r = Math.max(r, over.collar.r(a) + margin + (cz - over.collar.cz) * Math.cos(a));
      }
      if (under && y <= under.surface.top) {
        const openFront = Math.cos(a) > Math.cos(Math.PI * 2 * under.gap * 1.6);
        const s = under.surface(y, a);
        if (s && !openFront) r = Math.min(r, s.r - chain.thickness - 0.004);
      }
      const p = V(Math.sin(a) * r, y, cz + Math.cos(a) * r);
      if (over) {
        const margin0 = chain.thickness * 0.55 + 0.0015 + ci * 0.0015;
        const backW = smooth(-0.1, 0.55, Math.cos(a));
        const collarTop = (over.collar ? over.collar.top : tr.y) + 0.002 + ci * 0.002;
        p.y = collarTop + (p.y - collarTop) * backW;
        const neckR = m.neckRadius * 1.0 + margin0;
        const neckCz = table.find((r) => r.key === 'neck').cz;
        const back = V(Math.sin(a) * neckR, p.y, neckCz + Math.cos(a) * neckR);
        p.x = back.x + (p.x - back.x) * backW;
        p.z = back.z + (p.z - back.z) * backW;
        const maxX = m.neckRadius * 1.55 + Math.min(chain.drop, 0.08) * 0.12 + ci * 0.005;
        if (Math.abs(p.x) > maxX) p.x = Math.sign(p.x) * maxX;
        const margin = chain.thickness * 0.55 + 0.0015 + ci * 0.0015;
        const dir = Math.cos(a) >= 0 ? 1 : -1;
        for (let it = 0; it < 12; it++) {
          const s = y <= over.surface.top ? over.surface(y, Math.atan2(p.x, p.z - cz)) : null;
          const cr = over.collar && y <= over.collar.top + 0.005 ? over.collar.r(Math.atan2(p.x, p.z - over.collar.cz)) : 0;
          const need = Math.max(s ? s.r : 0, cr) + margin;
          const have = Math.hypot(p.x, p.z - cz);
          if (Math.abs(have - need) < 0.0005) break;
          if (backW < 0.05 && have >= need) break;
          p.z += dir * (need - have) * backW;
        }
      }
      points.push(p);
    }
    const rings = points.map((p, i) => {
      const prev = points[(i - 1 + n) % n];
      const next = points[(i + 1) % n];
      const f = frameFor(next.clone().sub(prev), V(0, 1, 0));
      const w = torsoWeights(layout, Math.min(p.y, m.neckY - 0.01));
      return { c: p, x: f.x, z: f.z, rx: chain.thickness * 0.6, rzF: chain.thickness * 0.45, rzB: chain.thickness * 0.45, v: i / n, w: w(0, p) };
    });
    mb.newSmoothingGroup();
    mb.loft(rings, { sides: 4, uv: [0, 0, 1, 1] });
    if (chain.pendant) {
      const front = points[0];
      const w = torsoWeights(layout, front.y);
      mb.box(front.clone().add(V(0, -0.02, 0.004)), [0.018, 0.03, 0.006], [0, 0, 1, 1], w(0, front));
    }
  });
  return mb;
}
