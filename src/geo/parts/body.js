import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder, frameFor, V, ringRadius } from '../mesh-builder.js';
import { SKIN_ATLAS } from '../../tex/atlas.js';

const X = V(1, 0, 0);
const Z = V(0, 0, 1);
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Global foot length factor: shoes and bare feet read oversized at PS2 resolution without it. */
export const FOOT_SCALE = 0.88;

export const SIDES = [
  ['Left', 1],
  ['Right', -1],
];

/** Torso weights: spine blend by height; the upper sides follow the clavicles (not the arms). */
export function torsoWeights(layout, y, extraHem = 0) {
  const { world, measures: m } = layout;
  const spineChain = [
    [J.Hips, world.Hips.y - 0.05],
    [J.Spine, world.Spine.y],
    [J.Spine1, world.Spine1.y],
    [J.Spine2, world.Spine2.y + 0.04],
    [J.Neck, world.Neck.y + 0.03],
  ];
  let base = [[J.Hips, 1]];
  for (let i = 0; i < spineChain.length - 1; i++) {
    const [ba, ya] = spineChain[i];
    const [bb, yb] = spineChain[i + 1];
    if (y >= ya && y <= yb) {
      const t = smooth(ya, yb, y);
      base = [[ba, 1 - t], [bb, t]];
    }
  }
  if (y > spineChain[spineChain.length - 1][1]) base = [[J.Neck, 1]];
  return (theta, p) => {
    const side = p.x >= 0 ? 'Left' : 'Right';
    const reach = smooth(m.chestHalfWidth * 0.45, m.shoulderHalf * 0.95, Math.abs(p.x));
    const high = smooth(m.shoulderY - 0.12, m.shoulderY - 0.02, p.y) * (1 - smooth(m.neckY - 0.01, m.neckY + 0.02, p.y));
    const sh = reach * high * 0.75;
    const out = base.map(([b, w]) => [b, w * (1 - sh)]);
    out.push([J[`${side}Shoulder`], sh * 0.85], [J[`${side}Arm`], sh * 0.15]);
    if (extraHem > 0) {
      const legPull = extraHem * smooth(0.02, m.hipHalfWidth * 0.8, Math.abs(p.x));
      out.forEach((e) => { e[1] *= 1 - legPull; });
      out.push([J[`${side}UpLeg`], legPull]);
    }
    return out;
  };
}

/**
 * Anatomical torso cross-sections (shared by the body and every upper/lower garment, which add ease).
 * Heights hang off the skeleton; widths/depths are adult male averages scaled by height and build.
 * Breasts and glutes are absolute two-lobe offsets (`bustForm` / `gluteForm`): `shape` is bare skin,
 * `clothShape` is the same volume bridged across the cleavage / cleft the way fabric spans it.
 */
export function torsoRings(layout, { skin = false } = {}) {
  const { world, measures: m } = layout;
  const k = m.height / 1.78;
  const b = m.bulk;
  const hipJointY = world.LeftUpLeg.y;
  const g = (m.belly ?? 0) + (m.older ?? 0) * 0.35;
  const gut = (peak) => 0.06 * k * g * peak;
  const fem = m.feminine ?? 0;
  const ribs = { y: world.Spine1.y + 0.01 * k, rx: m.chestHalfWidth * 0.94 + gut(0.3), rzF: 0.122 * k * b * (1 - fem * 0.1) + gut(0.6), rzB: 0.11 * k * (1 - fem * 0.08) };
  const bust = bustForm(layout, ribs.y);
  const glute = gluteForm(layout);
  const chestBack = 0.118 * k * (1 - fem * 0.08);
  const rows = [
    { key: 'crotch', y: glute.foldY, rx: 0.07 * k * (1 + fem * 0.3), rzF: 0.045 * k, rzB: 0.06 * k, cz: -0.008, n: 2 },
    { key: 'seat', y: hipJointY - 0.018 * k, rx: m.hipHalfWidth * 0.74, rzF: 0.08 * k * b, rzB: 0.1 * k * b, cz: -0.012, n: 2.2 },
    { key: 'hips', y: hipJointY + 0.025 * k, rx: m.hipHalfWidth, rzF: 0.095 * k * b, rzB: 0.108 * k * b, cz: -0.012, n: 2.2 },
    { key: 'pelvisTop', y: m.hipsY + 0.045 * k, rx: m.hipHalfWidth * (0.93 - fem * 0.07) + gut(0.35), rzF: 0.1 * k * b * (1 - fem * 0.06) + gut(0.75), rzB: 0.098 * k, cz: -0.01, n: 2.2 },
    { key: 'waist', y: world.Spine.y + 0.035 * k, rx: m.waistHalfWidth + gut(0.55), rzF: 0.108 * k * b * (1 - fem * 0.12) + gut(1), rzB: 0.098 * k * (1 - fem * 0.08), cz: -0.006, n: 2.1 },
    { key: 'ribs', ...ribs, cz: -0.008, n: 2.2 },
    { key: 'underBust', y: bust.foldY, t: 0.55 },
    { key: 'bustLow', y: bust.foldY + (bust.nippleY - bust.foldY) * 0.55, t: 0.8 },
    { key: 'chest', y: bust.nippleY, t: 1 },
    { key: 'upperChest', y: m.shoulderY - 0.055 * k, rx: m.chestHalfWidth * 1.03, rzF: m.chestDepth * 0.92, rzB: 0.12 * k * (1 - fem * 0.08), cz: -0.016, n: 2.35 },
    { key: 'shoulderTop', y: m.shoulderY + 0.045 * k, rx: m.shoulderHalf * 1.0, rzF: 0.078 * k, rzB: 0.088 * k, cz: -0.02, n: 2.4 },
    { key: 'trapezius', y: m.neckY - 0.008 * k, rx: m.neckRadius * 2.1, rzF: m.neckRadius * 1.1, rzB: m.neckRadius * 1.35, cz: -0.02, n: 2.1 },
    { key: 'neck', y: m.neckY + 0.03 * k, rx: m.neckRadius, rzF: m.neckRadius * 1.02, rzB: m.neckRadius, cz: -0.014, n: 2 },
    { key: 'neckTop', y: m.headY + 0.02 * k, rx: m.neckRadius * 0.95, rzF: m.neckRadius * 0.95, rzB: m.neckRadius * 0.95, cz: -0.012, n: 2 },
  ].filter((r) => !skin || r.key !== 'crotch')
    .map((r) => (skin && r.key === 'seat' ? { ...r, rx: m.hipHalfWidth * 0.985, rzF: r.rzF * 1.12, n: 2.3 } : skin && r.key === 'hips' ? { ...r, rx: r.rx * 0.975 } : r))
    .map((r) => (r.t === undefined ? r : {
    key: r.key,
    y: r.y,
    rx: ribs.rx + (m.chestHalfWidth - ribs.rx) * r.t,
    rzF: ribs.rzF + (m.chestDepth - ribs.rzF) * r.t,
    rzB: ribs.rzB + (chestBack - ribs.rzB) * r.t,
    cz: -0.008 - 0.004 * r.t,
    n: 2.2 + 0.1 * r.t,
  }));
  return rows.map((r) => withForms(r, [bust, glute]));
}

/** Wraps a ring so absolute lobe offsets (metres) become the loft's radius multiplier. */
function withForms(ring, forms) {
  const active = forms.filter((f) => f.amount > 0 && ring.y > f.low - 0.001 && ring.y < f.high + 0.001);
  if (!active.length) return ring;
  const base = { rx: ring.rx, rzF: ring.rzF, rzB: ring.rzB, n: ring.n };
  const wrap = (field) => (theta) => 1 + active.reduce((sum, f) => sum + f[field](theta, ring.y), 0) / ringRadius(base, theta);
  return { ...ring, shape: wrap('skin'), clothShape: wrap('cloth') };
}

const gaussA = (x, w) => Math.exp(-((x / w) ** 2));

/** Lobe across θ with separate widths toward the midline (medial) and toward the side (lateral). */
function lobe(a, centre, medial, lateral) {
  const d = a - centre;
  return gaussA(d, d < 0 ? medial : lateral);
}

/**
 * Breasts: two rounded lobes either side of the sternum. The upper pole is a straight / slightly
 * concave slope from the upper chest to the apex; the lower pole is the fuller convex curve (~45:55)
 * ending in the inframammary fold. The apex sits at the pole interface, slightly lateral.
 */
export function bustForm(layout, ribsY) {
  const { world, measures: m } = layout;
  const k = m.height / 1.78;
  const bust = m.bust ?? 0;
  const fem = m.feminine ?? 0;
  const chestY = world.Spine2.y - 0.015 * k;
  const amount = bust * (0.078 + fem * 0.018) * k;
  const lowerPole = (0.05 + bust * 0.03) * k;
  const nippleY = chestY - bust * 0.012 * k;
  const foldY = Math.max(ribsY + 0.015 * k, nippleY - lowerPole);
  const topY = m.shoulderY - 0.02 * k;
  const vertical = (y, cloth) => {
    if (y >= nippleY) return Math.max(0, 1 - (y - nippleY) / (topY - nippleY)) ** 1.25;
    const t = (nippleY - y) / (nippleY - foldY);
    const round = t >= 1 ? 0 : Math.sqrt(1 - t * t * 0.92) * (1 - t * 0.15);
    return cloth ? Math.max(round, Math.max(0, 1 - (nippleY - y) / (0.17 * k)) ** 1.5) : round;
  };
  const across = (theta, cloth) => {
    const a = Math.abs(theta);
    if (cloth && a < 0.46) return 1 - 0.12 * (1 - a / 0.46);
    return lobe(a, 0.46, 0.2, 0.38);
  };
  return {
    amount,
    nippleY,
    foldY,
    low: ribsY - 0.2,
    high: topY,
    skin: (theta, y) => (Math.cos(theta) > 0 ? amount * vertical(y, false) * across(theta, false) : 0),
    cloth: (theta, y) => (Math.cos(theta) > 0 ? amount * vertical(y, true) * across(theta, true) : 0),
  };
}

/**
 * Glutes: two near-hemispherical lobes either side of the cleft. Flat sacral triangle above, fullest
 * projection low (around the hip joint), and a round under-curve ending in the horizontal gluteal fold.
 */
export function gluteForm(layout) {
  const { world, measures: m } = layout;
  const k = m.height / 1.78;
  const butt = m.butt ?? 0.3;
  const fem = m.feminine ?? 0;
  const hipJointY = world.LeftUpLeg.y;
  const amount = (0.012 + butt * 0.062 + fem * 0.012) * k;
  const peakY = hipJointY - 0.004 * k;
  const foldY = hipJointY - 0.05 * k;
  const topY = m.hipsY + 0.075 * k;
  const vertical = (y) => {
    if (y >= peakY) return Math.cos(Math.min(1, (y - peakY) / (topY - peakY)) * Math.PI * 0.5) ** 1.4;
    const t = Math.min(1, (peakY - y) / (peakY - foldY + 0.004 * k));
    return Math.sqrt(1 - t * t * 0.94);
  };
  const fromSpine = (theta) => Math.PI - Math.abs(theta);
  return {
    amount,
    foldY,
    low: foldY,
    high: topY,
    skin: (theta, y) => amount * vertical(y) * (lobe(fromSpine(theta), 0.52, 0.42, 0.42) - 0.3 * gaussA(fromSpine(theta), 0.13)),
    cloth: (theta, y) => amount * vertical(y) * (fromSpine(theta) < 0.52 ? (y >= peakY ? 0.9 : 0.5) + (y >= peakY ? 0 : 0.4 * (fromSpine(theta) / 0.52) ** 2) : lobe(fromSpine(theta), 0.52, 0.3, 0.42)),
  };
}

/** Pectoral / shoulder-blade / glute shaping on top of the superellipse. */
function torsoShape(key, fem = 0) {
  return (theta) => {
    if (key === 'chest' || key === 'upperChest') return 1 + 0.06 * (1 - fem) * Math.exp(-(((Math.abs(theta) - 0.45) / 0.3) ** 2)) - 0.04 * Math.exp(-((theta / 0.14) ** 2));
    if (key === 'ribs') return 1 + 0.03 * Math.exp(-(((Math.abs(theta) - 2.4) / 0.4) ** 2));
    return 1;
  };
}

/** Torso rings from lowest to highest; clothing hides everything below `from`. */
export const TORSO_KEYS = ['crotch', 'seat', 'hips', 'pelvisTop', 'waist', 'ribs', 'underBust', 'bustLow', 'chest', 'upperChest', 'shoulderTop', 'trapezius', 'neck', 'neckTop'];

function interpRing(a, b, y) {
  const t = (y - a.y) / (b.y - a.y);
  const l = (key) => a[key] + (b[key] - a[key]) * t;
  return { ...a, key: `${a.key}+`, y, rx: l('rx'), rzF: l('rzF'), rzB: l('rzB'), cz: l('cz'), n: (a.n ?? 2) + ((b.n ?? 2) - (a.n ?? 2)) * t, shape: undefined };
}

/**
 * Torso skin. `from` is the first ring above anything worn on the upper body; `lowerFrom` and
 * `gapFrom` describe a visible band below a cropped top (midriff) down to the trousers.
 * Returns the bottom ring when the pelvis is bare, so the legs can be stitched onto it.
 */
function buildTorso(mb, layout, { from = 'crotch', lowerFrom = 'crotch', gapFrom = null, neckHidden = false }) {
  const table = torsoRings(layout, { skin: true }).filter((r) => !neckHidden || (r.key !== 'neck' && r.key !== 'neckTop'));
  const fem = layout.measures.feminine ?? 0;
  const [u0, v0, u1, v1] = SKIN_ATLAS.torso;
  const yMin = gluteForm(layout).foldY;
  const yMax = table[table.length - 1].y;
  const indexOf = (key) => (key === 'crotch' ? 0 : table.findIndex((r) => r.key === key));
  const sides = fem > 0.3 ? 24 : 16;
  let bottom = null;
  const toRing = (r) => {
    const base = torsoShape(r.key, fem);
    const extra = r.shape;
    return {
      ...r,
      shape: extra ? (t, c, s2) => base(t) * extra(t, c, s2) : base,
      c: V(0, r.y, r.cz),
      x: X,
      z: Z,
      v: (r.y - yMin) / (yMax - yMin),
      w: torsoWeights(layout, r.y),
    };
  };
  const loft = (rows, capStart) => {
    if (rows.length < 2) return;
    const res = mb.loft(rows.map(toRing), { sides, uv: [u0, v0, u1, v1], capStart });
    if (rows[0] === table[0]) bottom = { start: res.starts[0], sides, group: mb.group, ring: toRing(rows[0]), yMin, yMax };
  };
  if (gapFrom !== null && from !== 'crotch') {
    const lower = table.slice(indexOf(lowerFrom)).filter((r) => r.y < gapFrom);
    const above = table.find((r) => r.y >= gapFrom);
    if (lower.length && above) {
      lower.push(interpRing(lower[lower.length - 1], above, gapFrom));
      loft(lower);
    }
  }
  const rows = table.slice(indexOf(from)).map((r, i) => (i === 0 && from !== 'crotch' ? { ...r, rx: r.rx * 0.8, rzF: r.rzF * 0.85, rzB: r.rzB * 0.85 } : r));
  mb.newSmoothingGroup();
  loft(rows, from === 'crotch' ? undefined : 0.001);
  return bottom;
}

function vertexAt(mb, i) {
  const p = V(mb.positions[i * 3], mb.positions[i * 3 + 1], mb.positions[i * 3 + 2]);
  const w = [0, 1, 2, 3].map((j) => [mb.skinIndex[i * 4 + j], mb.skinWeight[i * 4 + j]]).filter(([, x]) => x > 0);
  return { p, w };
}

/**
 * Emits a skin triangle between existing vertices as fresh vertices in the torso UV rect (so the
 * texture never stretches across atlas regions); positions and weights are copied, so normals weld
 * and the surface deforms exactly with its neighbours. Winding faces `outward(centroid)`.
 */
function bridgeTri(mb, ids, uvAt, outward) {
  const vs = ids.map((i) => vertexAt(mb, i));
  const n = vs[1].p.clone().sub(vs[0].p).cross(vs[2].p.clone().sub(vs[0].p));
  if (n.lengthSq() < 1e-12) return;
  const centroid = vs[0].p.clone().add(vs[1].p).add(vs[2].p).divideScalar(3);
  const order = n.dot(outward(centroid)) < 0 ? [0, 2, 1] : [0, 1, 2];
  const us = vs.map((v) => uvAt(v.p));
  const [lo, hi] = [Math.min(...us.map((u) => u[0])), Math.max(...us.map((u) => u[0]))];
  const [tu0, , tu1] = SKIN_ATLAS.torso;
  if (hi - lo > (tu1 - tu0) / 2) us.forEach((u) => { if (u[0] < (tu0 + tu1) / 2) u[0] = tu0 + tu1 - u[0]; });
  const nv = order.map((o) => mb.addVertex(vs[o].p, us[o], vs[o].w));
  mb.tri(nv[0], nv[1], nv[2]);
}

/** Zips two vertex polylines (both ordered front → back, params 0..1) into a triangle band. */
function zip(mb, a, b, uvAt, outward) {
  let i = 0;
  let j = 0;
  while (i < a.length - 1 || j < b.length - 1) {
    const stepA = j === b.length - 1 || (i < a.length - 1 && a[i + 1].t <= b[j + 1].t);
    if (stepA) {
      bridgeTri(mb, [a[i].id, a[i + 1].id, b[j].id], uvAt, outward);
      i += 1;
    } else {
      bridgeTri(mb, [a[i].id, b[j + 1].id, b[j].id], uvAt, outward);
      j += 1;
    }
  }
}

const ringArc = (start, from, to) => Array.from({ length: Math.abs(to - from) + 1 }, (_, n) => ({
  id: start + from + Math.sign(to - from) * n,
  t: n / Math.max(1, Math.abs(to - from)),
}));

/**
 * Bare legs grown out of the pelvis as one surface (classic trouser topology). Each thigh's top loop
 * is half of the torso's seat ring (outer half, a little below it) plus the crotch seam: a U-curve
 * on the midline from the pubic front, down through the crotch, up into the gluteal cleft. Torso
 * halves are zipped to the outer halves, and the two seams (8 mm apart) are bridged.
 */
function buildConnectedLegs(mb, layout, bottom) {
  const m = layout.measures;
  const k = m.height / 1.78;
  const fem = m.feminine ?? 0;
  const seat = bottom.ring;
  const glute = gluteForm(layout);
  const crotchY = glute.foldY;
  const halfW = seat.rx * 0.5;
  const L = bottom.sides / 2 + 4;
  const yTop = seat.y - 0.016 * k;
  const zFront = seat.cz + ringRadius(seat, 0) * 0.985;
  const zBack = seat.cz - ringRadius(seat, Math.PI) * 0.985;
  const saved = mb.group;
  mb.group = bottom.group;
  const junction = {};
  for (const [side, s] of SIDES) {
    const U = J[`${side}UpLeg`];
    const all = legStations(layout, side);
    const top = all[0].y;
    const low = all[all.length - 1].y;
    const inner = (theta) => s * Math.sin(theta) > 1e-6;
    const seamPoint = (theta) => {
      if (!inner(theta)) {
        const phi = -theta;
        const r = ringRadius(seat, phi) * 0.985;
        return V(Math.abs(Math.sin(phi)) < 1e-6 ? 0 : Math.sin(phi) * r, yTop, seat.cz + Math.cos(phi) * r);
      }
      const u = Math.abs(theta) / Math.PI;
      const dip = Math.sin(Math.PI * u ** 1.35) ** 0.8;
      return V(s * 0.004 * k * Math.sin(Math.PI * u) ** 0.5, yTop - (yTop - crotchY) * dip, zFront + (zBack - zFront) * u);
    };
    const keepInside = (limit) => (theta, p) => V(s * p.x < limit ? s * limit - p.x : 0, 0, 0);
    const legRing = (c, rx, rzF, rzB, y, w, extra = {}) => ({ c, x: X.clone().multiplyScalar(-1), z: Z, rx, rzF, rzB, v: 1 - (top - y) / (top - low), w, ...extra });
    const upY = crotchY - 0.05 * k;
    const upR = m.thighRadius * (1.02 + fem * 0.05);
    const rings = [
      legRing(V(0, 0, 0), 1e-6, 1e-6, 1e-6, yTop, (theta) => (inner(theta) ? [[J.Hips, 0.55], [U, 0.45]] : [[J.Hips, 0.75], [U, 0.25]]), { offset: (theta, p) => seamPoint(theta).sub(p) }),
      legRing(V(s * (halfW + 0.002 * k), upY, seat.cz), upR * 0.86, upR * 0.76, upR * (0.9 + (m.butt ?? 0.3) * 0.15) + glute.amount * 0.45, upY, [[J.Hips, 0.15], [U, 0.85]], { offset: keepInside(0.004 * k) }),
      ...all.filter((st) => st.y < upY - 0.06 * k).map((st) => legRing(legCenter(layout, side, st.y), st.r * 0.96, st.r * (st.front ?? 1), st.r * st.back, st.y, st.w)),
    ];
    junction[side] = mb.loft(rings, { sides: L, uv: SKIN_ATLAS[side === 'Left' ? 'legL' : 'legR'] }).starts[0];
  }
  const [u0, v0, u1, v1] = SKIN_ATLAS.torso;
  const uvAt = (p) => [
    u0 + (u1 - u0) * (Math.atan2(p.x, p.z - seat.cz) / (Math.PI * 2) + 0.5),
    v0 + (v1 - v0) * Math.max(0, (p.y - bottom.yMin) / (bottom.yMax - bottom.yMin)),
  ];
  const radial = (c) => V(c.x, 0, c.z - seat.cz);
  const N = bottom.sides;
  const T = bottom.start;
  zip(mb, ringArc(T, N / 2, N), ringArc(junction.Left, L / 2, 0), uvAt, radial);
  zip(mb, ringArc(T, N / 2, 0), ringArc(junction.Right, L / 2, L), uvAt, radial);
  zip(mb, ringArc(junction.Left, L / 2, L), ringArc(junction.Right, L / 2, 0), uvAt, () => V(0, -1, 0));
  bridgeTri(mb, [T + N / 2, junction.Left + L / 2, junction.Right + L / 2], uvAt, radial);
  bridgeTri(mb, [T, junction.Left, junction.Right], uvAt, radial);
  mb.group = saved;
}

/** Arm cross-sections along the bone (s in metres from the shoulder joint). */
export function armStations(layout, side) {
  const m = layout.measures;
  const up = m.upperArm;
  const fore = m.foreArm;
  const R = m.upperArmRadius;
  const Fr = m.foreArmRadius;
  const Sh = J[`${side}Shoulder`];
  const A = J[`${side}Arm`];
  const F = J[`${side}ForeArm`];
  const Hd = J[`${side}Hand`];
  return [
    { s: -0.035, r: R * 0.75, w: [[Sh, 0.7], [A, 0.3]] },
    { s: 0.0, r: R * 1.2, w: [[Sh, 0.35], [A, 0.65]] },
    { s: up * 0.18, r: R * 1.22, w: [[Sh, 0.08], [A, 0.92]] },
    { s: up * 0.36, r: R * 1.04, w: [[A, 1]] },
    { s: up * 0.6, r: R * 1.0, front: 1.08, w: [[A, 1]] },
    { s: up * 0.86, r: R * 0.86, w: [[A, 0.85], [F, 0.15]] },
    { s: up * 1.0, r: R * 0.8, w: [[A, 0.5], [F, 0.5]] },
    { s: up + fore * 0.14, r: Fr * 1.1, w: [[A, 0.12], [F, 0.88]] },
    { s: up + fore * 0.38, r: Fr * 0.98, w: [[F, 1]] },
    { s: up + fore * 0.7, r: m.wristRadius * 1.25, w: [[F, 1]] },
    { s: up + fore * 1.0, r: m.wristRadius, w: [[F, 0.5], [Hd, 0.5]] },
  ];
}

export function armFrame(layout, side) {
  const s = side === 'Left' ? 1 : -1;
  const dir = layout.measures.armDir.clone().setX(layout.measures.armDir.x * s);
  return { origin: layout.world[`${side}Arm`].clone(), ...frameFor(dir, Z) };
}

function interpolateStation(a, b, s) {
  const t = (s - a.s) / (b.s - a.s);
  const w = new Map();
  for (const [bone, v] of a.w) w.set(bone, (w.get(bone) ?? 0) + v * (1 - t));
  for (const [bone, v] of b.w) w.set(bone, (w.get(bone) ?? 0) + v * t);
  return { s, r: a.r + (b.r - a.r) * t, w: [...w.entries()] };
}

function buildArm(mb, layout, side, fromS) {
  const f = armFrame(layout, side);
  const all = armStations(layout, side);
  const next = all.findIndex((st) => st.s > fromS);
  const cut = next > 0;
  const stations = cut ? [interpolateStation(all[next - 1], all[next], fromS), ...all.slice(next)] : all;
  const total = layout.measures.upperArm + layout.measures.foreArm + 0.035;
  const rect = SKIN_ATLAS[side === 'Left' ? 'armL' : 'armR'];
  const rings = stations.map((st) => ({
    c: f.origin.clone().addScaledVector(f.d, st.s).addScaledVector(V(0, -1, 0), st.s < 0.02 ? 0.01 : 0),
    x: f.x,
    z: f.z,
    rx: st.r * 0.86,
    rzF: st.r * (st.front ?? 1.1),
    rzB: st.r * 1.05,
    v: (st.s + 0.035) / total,
    w: st.w,
  }));
  mb.loft(rings, { sides: 8, uv: rect, capStart: cut ? 0.004 : undefined });
}

/** Mitten hand with a separate thumb, relaxed curl. Sizes are real hand measurements. */
function buildHand(mb, layout, side) {
  const m = layout.measures;
  const f = armFrame(layout, side);
  const k = m.height / 1.78;
  const Hd = J[`${side}Hand`];
  const F = J[`${side}ForeArm`];
  const wrist = layout.world[`${side}Hand`].clone();
  const palmDir = f.x.clone().multiplyScalar(side === 'Left' ? 1 : -1);
  const len = m.handLength;
  const stations = [
    { t: -0.04, w: 0.026, th: 0.017, curl: 0, wt: [[F, 0.5], [Hd, 0.5]] },
    { t: 0.12, w: 0.038, th: 0.018, curl: 0, wt: [[Hd, 1]] },
    { t: 0.4, w: 0.043, th: 0.016, curl: 0.002, wt: [[Hd, 1]] },
    { t: 0.55, w: 0.043, th: 0.014, curl: 0.006, wt: [[Hd, 1]] },
    { t: 0.78, w: 0.039, th: 0.012, curl: 0.016, wt: [[Hd, 1]] },
    { t: 0.95, w: 0.033, th: 0.01, curl: 0.028, wt: [[Hd, 1]] },
  ];
  const rings = stations.map((st) => ({
    c: wrist.clone().addScaledVector(f.d, st.t * len).addScaledVector(palmDir, st.curl * k),
    x: f.x,
    z: f.z,
    rx: st.th * k,
    rzF: st.w * k,
    rzB: st.w * k,
    n: 2.6,
    v: st.t + 0.04,
    w: st.wt,
  }));
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 8, uv: SKIN_ATLAS.hand, capEnd: 0.004 * k });

  const thumbBase = wrist.clone()
    .addScaledVector(f.d, len * 0.14)
    .addScaledVector(f.z, 0.028 * k)
    .addScaledVector(palmDir, 0.008 * k);
  const thumbDir = f.d.clone().multiplyScalar(0.8).addScaledVector(f.z, 0.4).addScaledVector(palmDir, 0.4).normalize();
  const tf = frameFor(thumbDir, palmDir);
  const thumb = [0, 0.5, 1].map((t, i) => ({
    c: thumbBase.clone().addScaledVector(thumbDir, t * 0.055 * k),
    x: tf.x,
    z: tf.z,
    r: [0.012, 0.0105, 0.009][i] * k,
    v: t,
    w: [[Hd, 1]],
  }));
  mb.newSmoothingGroup();
  const [hu0, hv0, hu1, hv1] = SKIN_ATLAS.hand;
  mb.loft(thumb, { sides: 5, uv: [hu0, hv0, hu0 + (hu1 - hu0) * 0.3, hv0 + (hv1 - hv0) * 0.3], capEnd: 0.004 * k });
  mb.newSmoothingGroup();
}

/**
 * Leg cross-sections by height; shared with trousers and socks. `inset` pulls the thigh top in
 * toward the pelvis so the leg grows out of the hip instead of sitting beside it.
 */
export function legStations(layout, side) {
  const m = layout.measures;
  const k = m.height / 1.78;
  const Hp = J.Hips;
  const U = J[`${side}UpLeg`];
  const L = J[`${side}Leg`];
  const Ft = J[`${side}Foot`];
  const hipY = layout.world[`${side}UpLeg`].y;
  const kneeY = m.kneeY;
  const ankleY = m.ankleY;
  const shin = kneeY - ankleY;
  const T = m.thighRadius;
  const C = m.calfRadius;
  const fem = m.feminine ?? 0;
  return [
    { y: hipY + 0.05 * k, r: T * 0.8 * (1.1 + fem * 0.1), back: 1.05 + (m.butt ?? 0.3) * 0.5, inset: 0.8, w: [[Hp, 0.6], [U, 0.4]] },
    { y: hipY - 0.03 * k, r: T * 1.0 * (1.05 + fem * 0.07), back: 1.08 + fem * 0.04 + (m.butt ?? 0.3) * 0.38, inset: 0.92, w: [[Hp, 0.2], [U, 0.8]] },
    { y: hipY - (hipY - kneeY) * 0.4, r: T * 0.88 * (1 + fem * 0.06), back: 1.02 + (m.butt ?? 0.3) * 0.12, w: [[U, 1]] },
    { y: kneeY + 0.075 * k, r: T * 0.7, back: 0.98, w: [[U, 0.9], [L, 0.1]] },
    { y: kneeY + 0.01 * k, r: C * 1.02, front: 1.08, back: 0.95, w: [[U, 0.5], [L, 0.5]] },
    { y: kneeY - shin * 0.1, r: C * 1.0, back: 1.05, w: [[U, 0.12], [L, 0.88]] },
    { y: kneeY - shin * 0.3, r: C * 1.04, back: 1.25, w: [[L, 1]] },
    { y: kneeY - shin * 0.6, r: C * 0.8, back: 1.08, w: [[L, 1]] },
    { y: ankleY + 0.03 * k, r: m.ankleRadius * 1.05, back: 1, w: [[L, 0.9], [Ft, 0.1]] },
    { y: ankleY - 0.01 * k, r: m.ankleRadius * 1.12, back: 1.05, w: [[L, 0.3], [Ft, 0.7]] },
  ];
}

/** Center of a leg at height y, following hip → knee → ankle. */
export function legCenter(layout, side, y) {
  const w = layout.world;
  const a = w[`${side}UpLeg`];
  const k = w[`${side}Leg`];
  const f = w[`${side}Foot`];
  if (y >= k.y) {
    const t = Math.min(1, (a.y - y) / (a.y - k.y));
    return a.clone().lerp(k, Math.max(0, t)).setY(y);
  }
  const t = Math.min(1.2, (k.y - y) / (k.y - f.y));
  return k.clone().lerp(f, t).setY(y);
}

function buildLeg(mb, layout, side, belowY) {
  const rect = SKIN_ATLAS[side === 'Left' ? 'legL' : 'legR'];
  const stations = legStations(layout, side);
  const top = stations[0].y;
  const bottom = stations[stations.length - 1].y;
  const kept = stations.filter((st) => st.y <= belowY + 1e-6);
  if (kept.length < 2) return;
  const rings = kept.map((st) => {
    const c = legCenter(layout, side, st.y);
    if (st.inset) c.x *= st.inset;
    return {
      c,
      x: X.clone().multiplyScalar(-1),
      z: Z,
      rx: st.r * 0.96,
      rzF: st.r * (st.front ?? 1),
      rzB: st.r * st.back,
      v: 1 - (top - st.y) / (top - bottom),
      w: st.w,
    };
  });
  mb.loft(rings, { sides: 8, uv: rect });
}

/** Bare foot: heel, arch, ball, toes (half-widths and heights in metres at 1.78 m). */
function buildFoot(mb, layout, side, lift = 0) {
  const k = (layout.measures.height / 1.78) * FOOT_SCALE * (1 - (layout.measures.feminine ?? 0) * 0.06);
  const ankle = layout.world[`${side}Foot`];
  const Ft = J[`${side}Foot`];
  const Toe = J[`${side}ToeBase`];
  const stations = [
    { z: -0.055, rx: 0.026, top: 0.028, bot: 0.03, y: 0.032, w: [[Ft, 1]] },
    { z: -0.035, rx: 0.032, top: 0.04, bot: 0.034, y: 0.04, w: [[Ft, 1]] },
    { z: 0.03, rx: 0.036, top: 0.034, bot: 0.022, y: 0.042, w: [[Ft, 1]] },
    { z: 0.11, rx: 0.044, top: 0.018, bot: 0.014, y: 0.022, w: [[Ft, 0.5], [Toe, 0.5]] },
    { z: 0.165, rx: 0.042, top: 0.012, bot: 0.01, y: 0.015, w: [[Toe, 1]] },
    { z: 0.195, rx: 0.03, top: 0.009, bot: 0.008, y: 0.012, w: [[Toe, 1]] },
  ];
  const f = frameFor(V(0, 0, 1), V(0, 1, 0));
  const rings = stations.map((st, i) => ({
    c: V(ankle.x + (st.z > 0.08 ? Math.sign(ankle.x) * (st.z - 0.08) * 0.1 : 0), st.y * k + lift * Math.min(1, 0.4 + st.z * 6) * k, ankle.z + st.z * k),
    x: f.x,
    z: f.z,
    rx: st.rx * k,
    rzF: st.top * k,
    rzB: st.bot * k,
    n: 2.4,
    v: i / (stations.length - 1),
    w: st.w,
  }));
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 8, uv: SKIN_ATLAS.foot, capStart: 0.006 * k, capEnd: 0.005 * k });
  mb.newSmoothingGroup();
}

/**
 * cover: { torso: bool, legsBelowY: number | null (null = legs hidden), feet: bool, armFromS: metres, neckHidden: bool }
 */
export function buildBody(layout, cover = {}) {
  const mb = new MeshBuilder('body');
  const pelvis = buildTorso(mb, layout, { from: cover.torsoFrom ?? 'crotch', lowerFrom: cover.lowerFrom ?? 'crotch', gapFrom: cover.topHemY != null ? cover.topHemY + 0.025 : null, neckHidden: !!cover.neckHidden });
  const legsBelowY = cover.legsBelowY === undefined ? Infinity : cover.legsBelowY;
  const connected = !!pelvis && legsBelowY === Infinity;
  if (connected) buildConnectedLegs(mb, layout, pelvis);
  for (const [side] of SIDES) {
    mb.newSmoothingGroup();
    buildArm(mb, layout, side, cover.armFromS ?? -1);
    buildHand(mb, layout, side);
    if (legsBelowY !== null && !connected) {
      mb.newSmoothingGroup();
      buildLeg(mb, layout, side, legsBelowY);
    }
    if (cover.feet !== false) buildFoot(mb, layout, side, cover.footLift ?? 0);
  }
  return mb;
}
