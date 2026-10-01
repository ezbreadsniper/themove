import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder, V, frameFor, ringRadius } from '../mesh-builder.js';
import { torsoRings, torsoWeights, armStations, armFrame, legStations, legCenter, SIDES } from './body.js';
import { shoeCollider, SHOE_TYPES } from './shoes.js';
import { legFitClass, LEG_FIT_CLASSES } from '../../garment/fit-classes.js';
import { fabricPhysics, collisionMargin } from '../../garment/fabric-physics.js';
import { draftTrousers } from '../../garment/pattern.js';
import { drapeTube, resampleDrape } from '../../garment/drape.js';
import { legCollider } from '../../garment/colliders.js';

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const X = V(1, 0, 0);
const Z = V(0, 0, 1);

/** UV layout inside each 128px garment texture. */
export const GARMENT_UV = {
  top: { body: [0, 0.3, 1, 1], sleeveL: [0, 0, 0.5, 0.3], sleeveR: [0.5, 0, 1, 0.3], collar: [0, 0.96, 1, 1] },
  bottom: { legL: [0, 0, 0.5, 0.78], legR: [0.5, 0, 1, 0.78], waist: [0, 0.78, 1, 1] },
};

function lerpWeights(a, b, t) {
  const out = new Map();
  for (const [bone, w] of a) out.set(bone, (out.get(bone) || 0) + w * (1 - t));
  for (const [bone, w] of b) out.set(bone, (out.get(bone) || 0) + w * t);
  return [...out.entries()];
}

/** Interpolates station weights at `value` along `key`; stations may be in either order. */
export function weightsAlong(stations, key, value) {
  const sorted = [...stations].sort((a, b) => a[key] - b[key]);
  if (value <= sorted[0][key]) return sorted[0].w;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (value <= b[key]) return lerpWeights(a.w, b.w, (value - a[key]) / (b[key] - a[key] || 1));
  }
  return sorted[sorted.length - 1].w;
}

function sampleTorso(layout, y) {
  const table = torsoRings(layout);
  if (y <= table[0].y) return { ...table[0], y };
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y);
      const l = (k) => (a[k] ?? 2) + ((b[k] ?? 2) - (a[k] ?? 2)) * t;
      return { y, rx: l('rx'), rzF: l('rzF'), rzB: l('rzB'), cz: l('cz'), n: l('n') };
    }
  }
  return { ...table[table.length - 1], y };
}

/**
 * Upper-body garment shell. fit: 0 = fitted .. 1 = very baggy. length: hem drop below hips (m).
 * Rings hang straight below the chest (no waist taper) which gives the boxy oversized tee read.
 */
export function topBodyRings(layout, { fit, hemY, collarGap = 0.012, neckScale = 1.25, over = 0, sleeveless = false }) {
  const m = layout.measures;
  const table = torsoRings(layout);
  const byKey = Object.fromEntries(table.map((r) => [r.key, r]));
  const chest = byKey.chest;
  const infl = 0.005 + fit * 0.037 + over;
  const drop = Math.min(1, fit * 1.2);
  const hang = (r, extra = 0) => ({
    rx: r.rx + (Math.max(r.rx, chest.rx * 0.98) - r.rx) * drop + infl + extra,
    rzF: r.rzF + (Math.max(r.rzF, chest.rzF * 0.95) - r.rzF) * drop + infl * 0.85 + extra,
    rzB: r.rzB + (Math.max(r.rzB, chest.rzB * 0.95) - r.rzB) * drop + infl * 0.85 + extra * 2.2,
    cz: r.cz,
    n: 2.2,
    shape: (r.clothShape ?? r.shape) ? (t, c, s2) => 1 + ((r.clothShape ?? r.shape)(t, c, s2) - 1) * (1 - drop * 0.6) : undefined,
  });
  const rows = [];
  const hemBase = sampleTorso(layout, hemY);
  rows.push({ y: hemY, ...hang(hemBase, 0.003 + fit * 0.022), hem: true });
  rows.push({ y: hemY + 0.018, ...hang(hemBase, 0.002 + fit * 0.016) });
  for (const key of ['hips', 'pelvisTop', 'waist', 'ribs', 'underBust', 'chest']) {
    if (byKey[key].y > hemY + 0.04) rows.push({ key, y: byKey[key].y, ...hang(byKey[key]) });
  }
  const uc = byKey.upperChest;
  const cut = sleeveless ? 0.9 : 1;
  rows.push({ key: 'upperChest', y: uc.y, rx: (uc.rx + infl) * cut, rzF: uc.rzF + infl * 0.8, rzB: uc.rzB + infl * 0.8, cz: uc.cz, n: 2.6, shape: uc.clothShape ?? uc.shape });
  const st = byKey.shoulderTop;
  rows.push({ key: 'shoulderTop', y: st.y + 0.004 + fit * 0.004, rx: st.rx + infl * (sleeveless ? 0.35 : 0.2), rzF: st.rzF + infl * 0.7, rzB: st.rzB + infl * 0.7, cz: st.cz, n: 2.6 });
  const tr = byKey.trapezius;
  rows.push({ y: tr.y + 0.004, rx: m.neckRadius * neckScale * 1.35 + collarGap, rzF: m.neckRadius * neckScale * 1.15 + collarGap, rzB: m.neckRadius * neckScale * 1.2 + collarGap, cz: tr.cz, collar: true, neckBase: true });
  rows.push({ y: tr.y + 0.018, rx: m.neckRadius * neckScale * 0.95 + collarGap, rzF: m.neckRadius * neckScale * 0.95 + collarGap, rzB: m.neckRadius * neckScale * 1.02 + collarGap, cz: tr.cz, collar: true });
  rows.push({ y: tr.y + 0.006, rx: m.neckRadius * neckScale * 0.88, rzF: m.neckRadius * neckScale * 0.88, rzB: m.neckRadius * neckScale * 0.95, cz: tr.cz, collar: true });
  return rows;
}

export function loftTop(mb, layout, rows, uvRect, opts = {}) {
  const yMin = rows[0].y;
  const yMax = Math.max(...rows.map((r) => r.y));
  const hipsY = layout.measures.hipsY;
  const rings = rows.map((r, i) => ({
    ...r,
    c: V(0, r.y, r.cz),
    x: X,
    z: Z,
    n: r.n ?? 2.4,
    v: r.collar ? 0.97 + i * 0.001 : ((r.y - yMin) / (yMax - yMin)) * 0.94,
    w: torsoWeights(layout, r.y, r.y < hipsY ? Math.min(0.35, (hipsY - r.y) * 4) : 0),
  }));
  mb.loft(rings, { sides: opts.sides ?? 12, uv: uvRect, arc: opts.arc, uOffset: opts.uOffset });
}

/**
 * Armhole (armscye) of an upper-body garment: a tilted ring on the side of the body running from
 * the shoulder point down to the armpit. The sleeve starts exactly on it so body and sleeve read
 * as one surface instead of a tube stuck onto a box.
 */
export function armholeFor(rows, side) {
  const s = side === 'Left' ? 1 : -1;
  const shoulder = rows.find((r) => r.key === 'shoulderTop');
  const armpit = rows.find((r) => r.key === 'chest');
  const top = V(s * shoulder.rx * 0.98, shoulder.y, shoulder.cz);
  const bottom = V(s * armpit.rx * 0.97, armpit.y, armpit.cz);
  const center = top.clone().add(bottom).multiplyScalar(0.5);
  center.x *= 0.9;
  const along = top.clone().sub(bottom);
  const halfHeight = (along.length() / 2) * 0.92;
  const normal = V(along.y * s, -along.x * s, 0).normalize();
  return { center, normal, halfHeight, depthF: armpit.rzF * 0.66, depthB: armpit.rzB * 0.76 };
}

/** Radius of a garment body (its ring table) at height y and angle θ around the torso axis. */
/** Outermost collar radius at angle θ (collar rings fold back on themselves, so take the max). */
export function collarSurface(rows) {
  const collar = rows.filter((r) => r.collar);
  if (!collar.length) return null;
  const top = Math.max(...collar.map((r) => r.y));
  return {
    top,
    r: (theta) => Math.max(...collar.map((r) => ringRadius({ rx: r.rx, rzF: r.rzF, rzB: r.rzB, n: r.n ?? 2.4 }, theta))),
    cz: collar[0].cz,
  };
}

export function bodySurface(rows) {
  const sorted = rows.filter((r) => !r.collar).sort((a, b) => a.y - b.y);
  const fn = (y, theta) => {
    let a = sorted[0];
    let b = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (y >= sorted[i].y && y <= sorted[i + 1].y) {
        a = sorted[i];
        b = sorted[i + 1];
      }
    }
    const t = b.y === a.y ? 0 : Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
    const l = (k, d) => (a[k] ?? d) + ((b[k] ?? d) - (a[k] ?? d)) * t;
    const ring = { rx: l('rx', 0.1), rzF: l('rzF', 0.1), rzB: l('rzB', 0.1), n: l('n', 2.4) };
    return { r: ringRadius(ring, theta), cz: l('cz', 0) };
  };
  fn.top = sorted[sorted.length - 1].y;
  fn.shoulderY = (sorted.find((r) => r.key === 'upperChest') ?? sorted[sorted.length - 1]).y;
  return fn;
}

/** Moves a point radially (around the torso axis) so it sits `inset` metres under the garment body. */
function snapUnder(surface, p, inset) {
  const theta = Math.atan2(p.x, p.z - surface(p.y, 0).cz);
  const { r, cz } = surface(p.y, theta);
  const cur = Math.hypot(p.x, p.z - cz) || 1e-6;
  const k = (r - inset) / cur;
  return V(p.x * k - p.x, 0, cz + (p.z - cz) * k - p.z);
}

/**
 * Keeps the shirt's lower rows outside the trousers' widest (hip/seat) section so the hem drapes over
 * the waistband instead of the trousers poking through or being pinched in.
 */
export function clearPants(layout, rows, pantsFit) {
  const by = Object.fromEntries(torsoRings(layout).map((r) => [r.key, r]));
  const infl = 0.008 + pantsFit * 0.037;
  const clear = 0.009;
  const riseY = layout.measures.hipsY + 0.03 * (layout.measures.height / 1.78);
  const hip = { rx: by.hips.rx + infl * 0.5 + clear, rzF: by.hips.rzF + infl * 0.3 + clear, rzB: by.hips.rzB * 0.85 + infl * 0.25 + clear };
  const band = { rx: by.pelvisTop.rx + infl * 0.3 + clear, rzF: by.hips.rzF + infl * 0.3 + clear, rzB: by.hips.rzB * 0.85 + infl * 0.25 + clear };
  for (const r of rows) {
    if (r.collar || r.y > riseY + 0.01) continue;
    const t = Math.max(0, Math.min(1, (r.y - by.hips.y) / (riseY - by.hips.y)));
    for (const key of ['rx', 'rzF', 'rzB']) r[key] = Math.max(r[key], hip[key] + (band[key] - hip[key]) * t);
  }
}

export function buildSleeve(mb, layout, side, { endFrac, fit, uvRect, armhole, bodyRows, cuff = 0.006 }) {
  const f = armFrame(layout, side);
  const m = layout.measures;
  const S = side === 'Left' ? 'LeftShoulder' : 'RightShoulder';
  const A = side === 'Left' ? 'LeftArm' : 'RightArm';
  const stations = armStations(layout, side);
  const endS = m.upperArm * endFrac;
  const infl = 0.006 + fit * 0.034;
  const long = endS > m.upperArm * 1.05;
  const R = m.upperArmRadius * (0.86 + 0.14 * Math.min(1, fit));
  const specs = long ? [
    { s: 0, b: 0, r: 0, w: [[J[A], 0.45], [J[S], 0.45], [J.Spine2, 0.1]] },
    { s: 0.03, b: 0.5, r: R * 1.12 + infl * 0.75, w: [[J[A], 0.75], [J[S], 0.25]] },
    { s: 0.07, b: 1, r: R * 1.18 + infl * 0.95 },
    { s: m.upperArm * 0.55, b: 1, r: R * 1.08 + infl },
    { s: m.upperArm, b: 1, r: R * 0.92 + infl },
    { s: m.upperArm + m.foreArm * 0.45, b: 1, r: m.foreArmRadius * 1.05 + infl * 0.9 },
    { s: endS - 0.03, b: 1, r: m.wristRadius * 1.25 + infl * 0.75 },
    { s: endS - 0.004, b: 1, r: m.wristRadius * 1.25 + infl * 0.75 + cuff },
    { s: endS - 0.016, b: 1, r: m.wristRadius * 1.05 + infl * 0.4 },
  ] : [
    { s: 0, b: 0, r: 0, w: [[J[A], 0.45], [J[S], 0.45], [J.Spine2, 0.1]] },
    { s: 0.03, b: 0.5, r: R * 1.12 + infl * 0.75, w: [[J[A], 0.75], [J[S], 0.25]] },
    { s: 0.07, b: 1, r: R * 1.18 + infl * 0.95 },
    { s: endS * 0.7, b: 1, r: R * 1.2 + infl * 1.08 },
    { s: endS - 0.012, b: 1, r: R * 1.16 + infl * 1.15 + fit * 0.008 },
    { s: endS, b: 1, r: R * 1.16 + infl * 1.15 + fit * 0.008 + cuff },
    { s: endS - 0.01, b: 1, r: R * 1.0 + infl * 0.8 },
  ].filter((sp, i) => i < 3 || sp.s > 0.075);
  const surface = bodyRows ? bodySurface(bodyRows) : null;
  const rings = specs.map((sp, i) => {
    const axis = f.origin.clone().addScaledVector(f.d, sp.s);
    const dir = armhole.normal.clone().lerp(f.d, sp.b).normalize();
    const fr = frameFor(dir, Z);
    const ring = {
      c: armhole.center.clone().lerp(axis, sp.b),
      x: fr.x,
      z: fr.z,
      rx: armhole.halfHeight + (sp.r * 0.95 - armhole.halfHeight) * sp.b,
      rzF: armhole.depthF + (sp.r - armhole.depthF) * sp.b,
      rzB: armhole.depthB + (sp.r - armhole.depthB) * sp.b,
      n: 2.2,
      v: Math.min(1, i / (specs.length - 2)),
      w: sp.w ?? weightsAlong(stations, 's', sp.s),
      offset: sp.b === 0 && bodyRows ? (theta, p) => snapUnder(surface, p, 0.01) : undefined,
    };
    return ring;
  });
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 10, uv: uvRect });
}

/** T-shirt / rugby / long-sleeve. style: { fit, length, sleeve: 'short'|'long'|'none', collar } */
export function buildTop(layout, style, { overPants = null, hiddenSleeves = false } = {}) {
  const mb = new MeshBuilder('top');
  const m = layout.measures;
  const fit = style.fit ?? 0.6;
  const hemY = m.hipsY - (style.length ?? 0.07) * (m.height / 1.78);
  const rows = topBodyRings(layout, { fit, hemY, neckScale: style.collar === 'polo' ? 1.35 : 1.25, sleeveless: style.sleeve === 'none' });
  if (overPants) clearPants(layout, rows, overPants);
  loftTop(mb, layout, rows, GARMENT_UV.top.body);
  const sleeveEnd = { short: 0.62 + fit * 0.28, long: (m.upperArm + m.foreArm * 0.94) / m.upperArm, none: 0 }[style.sleeve ?? 'short'];
  if (sleeveEnd > 0 && !hiddenSleeves) {
    for (const [side] of SIDES) {
      buildSleeve(mb, layout, side, { endFrac: sleeveEnd, fit, armhole: armholeFor(rows, side), bodyRows: rows, uvRect: GARMENT_UV.top[side === 'Left' ? 'sleeveL' : 'sleeveR'] });
    }
  }
  if (style.collar === 'polo') buildFoldCollar(mb, layout, { neckScale: 1.3, arc: [0.07, 0.93], height: 0.018, flare: 0.012, frontDrop: 0.02 });
  return { mb, coversArmToS: sleeveEnd > 0 ? m.upperArm * sleeveEnd - 0.03 : null, surface: bodySurface(rows), collar: collarSurface(rows), hemY };
}

/** Folded collar (polo / denim jacket): stands at the back, lies on the shoulders, open at the front. */
export function buildFoldCollar(mb, layout, { neckScale, arc, height, flare, inflate = 0, frontDrop = 0 }) {
  const m = layout.measures;
  const tr = torsoRings(layout).find((r) => r.key === 'trapezius');
  const base = m.neckRadius * neckScale;
  const rows = [
    { y: tr.y + 0.012, r: base * 1.02 + inflate, n: 2.2 },
    { y: tr.y + 0.012 + height, r: base * 1.08 + inflate, n: 2.2 },
    { y: tr.y + 0.004 + height * 0.55, r: base * 1.08 + flare + inflate, n: 2.2 },
    { y: tr.y - 0.01, r: base * 1.1 + flare * 1.9 + inflate, n: 2.4 },
  ];
  const rings = rows.map((row, i) => ({
    c: V(0, row.y, tr.cz),
    x: X,
    z: Z,
    rx: row.r * 1.18,
    rzF: row.r * 1.02,
    rzB: row.r * 1.08,
    n: row.n,
    v: 0.965 + (i / (rows.length - 1)) * 0.03,
    w: torsoWeights(layout, Math.min(row.y, m.neckY)),
    offset: frontDrop && i > 0 ? (theta) => V(0, -frontDrop * Math.max(0, Math.cos(theta)) ** 2, 0) : undefined,
  }));
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 14, uv: GARMENT_UV.top.collar, arc, uOffset: 0.5 });
}

/** Open-front sleeveless vest worn over a top. */
export function buildVest(layout, style, { underFit = 0.3 } = {}) {
  const mb = new MeshBuilder('vest');
  const m = layout.measures;
  const hemY = m.hipsY + (style.rise ?? 0.025) * (m.height / 1.78);
  const rows = topBodyRings(layout, { fit: underFit, hemY, neckScale: 1.4, collarGap: 0.018, over: 0.014 + (style.fit ?? 0.5) * 0.01, sleeveless: true })
    .filter((r) => !r.collar || r.neckBase);
  const gap = style.openFront ?? 0.05;
  loftTop(mb, layout, rows, [0, 0, 1, 0.92], { arc: [gap, 1 - gap], uOffset: 0.5, sides: 16 });
  buildFoldCollar(mb, layout, { neckScale: 1.3, arc: [gap * 0.8, 1 - gap * 0.8], height: 0.012, flare: 0.012, inflate: 0.016, frontDrop: 0.045 });
  return { mb, surface: bodySurface(rows), gap };
}

/**
 * Leg silhouettes on top of the fit: skinny hugs the leg, tapered narrows to the ankle, bootcut opens a
 * little below the knee, flare opens a lot, wide keeps the thigh width to the hem, barrel balloons at
 * the knee and closes at the ankle.
 */
const CUTS = ['straight', 'skinny', 'tapered', 'bootcut', 'flare', 'wide', 'barrel'];
export const PANT_CUTS = CUTS;

function applyCut(cut, r, { y, kneeY, hemY, tight, thighR }) {
  const belowKnee = Math.max(0, Math.min(1, (kneeY - y) / Math.max(0.05, kneeY - hemY)));
  const knee = Math.exp(-(((y - kneeY) / 0.12) ** 2));
  switch (cut) {
    case 'skinny': return tight;
    case 'tapered': return r - (r - tight * 0.96) * Math.min(1, belowKnee * 1.3);
    case 'bootcut': return Math.max(tight, r - 0.004) + 0.016 * belowKnee ** 1.6;
    case 'flare': return Math.max(tight, r - 0.006) + 0.05 * belowKnee ** 1.8;
    case 'wide': return Math.max(r, thighR * (1.02 - 0.08 * belowKnee));
    case 'barrel': return r + 0.04 * knee - (r - tight) * 0.7 * belowKnee ** 2;
    default: return r;
  }
}

/**
 * Free-hanging leg radius at height y (the drafted ease before gravity and collisions): fit blends
 * from near skin-tight to the baggy thigh-to-hem taper, then the cut shapes the lower leg.
 */
function legRadiusFn(layout, side, { hemY, width, fit, topY, cinch, cut }) {
  const m = layout.measures;
  const stations = legStations(layout, side);
  const kneeY = m.kneeY;
  const thighR = m.thighRadius * 1.0 + 0.006 + fit * 0.02;
  const topR = m.thighRadius * 0.84 + 0.004;
  const hemR = m.calfRadius * 1.2 + 0.004 + fit * 0.035 * width;
  return (y) => {
    const t = Math.max(0, Math.min(1, (topY - y) / (topY - 0.02)));
    const kneeBulge = Math.exp(-(((y - kneeY) / 0.08) ** 2)) * 0.006;
    const base = thighR + (hemR - thighR) * Math.pow(t, 0.8) + kneeBulge;
    const nearTop = Math.max(0, 1 - (topY - y) / 0.14);
    const baggy = base + (Math.min(base, topR) - base) * nearTop;
    const tight = legRadiusAt(stations, Math.min(y, stations[0].y)) * 1.1 + 0.009 + Math.exp(-(((y - kneeY) / 0.07) ** 2)) * 0.014;
    const loose = Math.min(1, fit * 1.6);
    const free = applyCut(cut, tight + (Math.max(baggy, tight) - tight) * loose * loose * (3 - 2 * loose), { y, kneeY, hemY, tight, thighR });
    if (!cinch) return free;
    const gathered = m.ankleRadius * 1.35 + 0.012;
    const toHem = (y - hemY) / 0.14;
    if (toHem > 1) return free;
    const blouse = Math.exp(-(((toHem - 0.75) / 0.3) ** 2)) * 0.014;
    return gathered + (free + blouse - gathered) * smoothstep(0, 0.55, toHem);
  };
}

/** Leg-centre drift: baggy legs hang slightly outboard of the leg, and pull in under the crotch. */
function legAxis(layout, side, fit, topY) {
  const s = side === 'Left' ? 1 : -1;
  return (y) => {
    const c = legCenter(layout, side, y);
    c.x += s * (0.01 + fit * 0.012) * Math.min(1, fit * 2) * Math.min(1, (topY - y) / 0.15 + 0.35);
    c.x *= 1 - 0.28 * Math.max(0, 1 - (topY - y) / 0.2);
    return c;
  };
}

/** Back-of-leg depth factor of a trouser ring (room for seat and calf). */
function ringBack(stations, y, t) {
  return Math.max(t > 0.8 ? 1.1 : 1.04, Math.min(1.45, legBackAt(stations, Math.min(y, stations[0].y)) * 0.97));
}

function pantsLegRings(layout, side, opts) {
  if (opts.drape) return drapedLegRings(layout, side, opts);
  const { hemY, fit, stack, rng, topY, cuff = 0, fray = false } = opts;
  const stations = legStations(layout, side);
  const radiusAt = legRadiusFn(layout, side, opts);
  const axis = legAxis(layout, side, fit, topY);
  const ys = [];
  const count = 7;
  for (let i = 0; i <= count; i++) ys.push(topY + (hemY - topY) * (i / count));
  const rings = [];
  ys.forEach((y, i) => {
    const r = radiusAt(y);
    const stackZone = stack > 0 && y < hemY + 0.26;
    const wobble = stackZone ? (i % 2 ? 0.01 : -0.004) * stack + rng.range(-0.003, 0.003) : 0;
    rings.push({ y, c: axis(y), r: r + wobble, t: (i / count) * (cuff > 0 ? 0.9 : 1) });
  });
  const last = rings[rings.length - 1];
  const at = (y, r, t, lip = false) => rings.push({ ...last, y, c: last.c.clone().setY(y), r, t, lip });
  if (cuff > 0) {
    // Roll-up: the hem turned outward once; the outer layer is a fabric thickness proud of the leg.
    at(hemY, last.r + 0.008, 0.95, true);
    at(hemY + cuff, last.r + 0.008, 1, true);
    at(hemY + cuff - 0.006, last.r - 0.004, 1, true);
  } else if (fray) {
    at(hemY - 0.004, last.r + 0.004, 1, true);
  } else {
    // Turned hem: the inside of the opening shows the doubled allowance, not a paper edge.
    at(hemY + (opts.hemTurn ?? 0.01), last.r - 0.003 - (opts.thickness ?? 0.0012) * 2, 1, true);
  }
  return rings.map((ring) => ({
    c: ring.c,
    x: X.clone().multiplyScalar(-1),
    z: Z,
    rx: ring.r * 0.92,
    rzF: ring.r * 1.0,
    rzB: ring.r * ringBack(stations, ring.y, ring.t),
    n: 2.3,
    v: 1 - ring.t,
    w: weightsAlong(stations, 'y', ring.y),
    offset: ringOffset(ring, { fray }),
  }));
}

/**
 * Full-length legs that reach the shoe: the upper leg is lofted from the draft as before; the lower
 * leg (from just under the knee) is draped by the cloth solver against the leg and the shoe collider
 * and retopologised to the runtime ring count. Joggers sew the leg onto a rib cuff instead of a hem.
 */
function drapedLegRings(layout, side, opts) {
  const { fit, topY, rng, draft, shoe, physics, margin, sockExtra, cls } = opts;
  const m = layout.measures;
  const k = m.height / 1.78;
  const stations = legStations(layout, side);
  const s = side === 'Left' ? 1 : -1;
  const Ft = J[`${side}Foot`];
  const ankle = layout.world[`${side}Foot`];
  const radiusAt = legRadiusFn(layout, side, { ...opts, hemY: draft.lengths.floorHem });
  const axis = legAxis(layout, side, fit, topY);
  const simTopY = m.kneeY - 0.1 * k;
  const ringPoint = (c, r, y, t, theta) => {
    const ring = { rx: r * 0.92, rzF: r, rzB: r * ringBack(stations, y, t), n: 2.3 };
    const rr = ringRadius(ring, theta);
    return V(c.x - Math.sin(theta) * rr, y, c.z + Math.cos(theta) * rr);
  };
  // Upper rings (analytic, from the draft's thigh/knee ease) down to the sim top.
  const upper = [];
  const count = 3;
  for (let i = 0; i < count; i++) {
    const y = topY + (simTopY + 0.11 * k - topY) * (i / (count - 1));
    upper.push({ y, c: axis(y), r: radiusAt(y), t: ((topY - y) / (topY - draft.lengths.floorHem)) });
  }
  // Drafted lower leg: straight pattern lines from the knee girth to the hem girth.
  const topR = radiusAt(simTopY);
  const cuff = draft.cuff;
  const cuffBottomY = cuff ? Math.max(m.ankleY - 0.01 * k, shoe.collarTop + 0.012) : null;
  const cuffTopY = cuff ? cuffBottomY + cuff.height : null;
  const hemGirthR = draft.girths.hem / (2 * Math.PI * 0.99);
  const restHemY = cuff ? cuffTopY : draft.lengths.floorHem - (cls.excess ?? 0) * k * (opts.stack ?? 1);
  const length = cuff ? simTopY - cuffTopY + cls.excess * k : simTopY - restHemY;
  const pinR = cuff ? legRadiusAt(stations, cuffTopY) + 0.009 + sockExtra : 0;
  const restR = (sm) => {
    const r = topR + (hemGirthR - topR) * Math.min(1, sm / (simTopY - draft.lengths.floorHem));
    if (!cuff) return r;
    // The rib pulls the last few centimetres of the leg in to the seam (gathered, not shelved).
    const toSeam = Math.max(0, Math.min(1, (length - sm) / (0.06 * k)));
    return pinR + (r - pinR) * smoothstep(0, 1, toSeam);
  };
  const tAt = (y) => (topY - y) / (topY - draft.lengths.floorHem);
  const rest = (sm, theta) => {
    const y = simTopY - sm;
    return ringPoint(axis(Math.max(y, m.ankleY - 0.03)), restR(sm), y, tAt(y), theta);
  };
  // Arrangement: the leg starts lifted (compressed) so the hem begins above the shoe, then falls on it.
  const obstacle = Math.max(shoe.collarTop, ...[-0.06, 0, 0.06, 0.1].map((dz) => shoe.topAt(ankle.x, ankle.z + dz))) + margin + 0.01;
  const startHem = cuff ? cuffTopY : Math.max(restHemY, obstacle);
  const squash = Math.min(1, (simTopY - startHem) / length);
  const start = (sm, theta) => {
    const y = simTopY - sm * squash;
    return ringPoint(axis(Math.max(y, m.ankleY - 0.03)), restR(sm), y, tAt(y), theta);
  };
  const leg = legCollider(layout, side, { extra: sockExtra });
  const colliders = [leg, shoe];
  const pinBottom = cuff ? (theta) => {
    const c = legCenter(layout, side, cuffTopY);
    const base = pinR;
    // Elastic gathers: uneven lobes instead of a perfect ring.
    const r = base + 0.003 * Math.sin(theta * 5 + 0.7) + 0.0015 * Math.sin(theta * 3);
    return V(c.x - Math.sin(theta) * r * 0.96, cuffTopY, c.z + Math.cos(theta) * r);
  } : null;
  const sim = drapeTube({ rest, start, length, sides: 20, spacing: 0.016, colliders, margin, hemBand: cls.hemBand, floorY: cuff ? 0 : Math.max(0.006, draft.lengths.floorHem - 0.004 * k), physics, rng, pinBottom });
  const rows = resampleDrape(sim, { sides: 10, axisAt: (y) => axis(Math.max(y, m.ankleY - 0.03)), maxRows: cuff ? 5 : 6 });
  // Chord compensation: the runtime ring has half the sim's columns, so a straight edge between two
  // resampled points can cut through a curved collider the sim points cleared. Re-collide the runtime
  // points with the chord sag (r · (1 − cos(π / sides))) added to the margin.
  for (const row of rows.slice(1)) {
    for (const p of row.points) {
      const c = axis(Math.max(p.y, m.ankleY - 0.03));
      const sag = Math.hypot(p.x - c.x, p.z - c.z) * (1 - Math.cos(Math.PI / 10));
      for (let pass = 0; pass < 2; pass++) {
        for (const col of colliders) {
          const res = col.resolve(p, margin + sag + 0.001);
          if (res) p.add(res.push);
        }
      }
    }
  }
  // Edge midpoints (within a ring and between consecutive rings) must clear the colliders too; a
  // penetrating midpoint pushes both of its end points.
  const pushPair = (a, b) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    for (const col of colliders) {
      const res = col.resolve(mid, margin * 0.5);
      if (res) {
        a.add(res.push);
        b.add(res.push);
        mid.add(res.push);
      }
    }
  };
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 1; r < rows.length; r++) {
      const cur = rows[r].points;
      const up = rows[r - 1].points;
      for (let q = 0; q < cur.length - 1; q++) {
        pushPair(cur[q], cur[q + 1]);
        if (r > 1) {
          pushPair(cur[q], up[q]);
          pushPair(cur[q + 1], up[q]);
          pushPair(cur[q], up[q + 1]);
        }
        else {
          const mid = cur[q].clone().add(up[q]).multiplyScalar(0.5);
          for (const col of colliders) {
            const res = col.resolve(mid, margin * 0.5);
            if (res) cur[q].add(res.push.multiplyScalar(2));
          }
        }
      }
      cur[cur.length - 1].copy(cur[0]);
    }
  }
  // Debug hook for scripts that inspect the raw simulation (set globalThis.__drapeLog = [] first).
  if (globalThis.__drapeLog) globalThis.__drapeLog.push({ side, sim, rows, length });
  // Fabric lying on the shoe rides with the foot: the share of Foot weight grows toward the toe and
  // fades out above the instep. Everything else stays on the shin, so the leg is not parented to the shoe.
  const instepTop = shoe.topAt(ankle.x, ankle.z + 0.05 * k);
  const footShare = (p, contact) => {
    const zRel = (p.z - ankle.z) / k;
    const front = smoothstep(-0.01, 0.06, zRel);
    const heel = smoothstep(-0.03, -0.075, zRel);
    const low = 1 - smoothstep(instepTop + 0.01, instepTop + 0.075 * k, p.y);
    const heelLow = 1 - smoothstep(shoe.collarTop - 0.01, shoe.collarTop + 0.03 * k, p.y);
    const touching = contact === 'top' || contact === 'collar' ? 1 : 0.75;
    return Math.min(0.9, Math.max((0.1 + 0.8 * front) * low * touching, 0.9 * heel * heelLow));
  };
  const simWeights = (row) => (theta) => {
    const kk = Math.round(((theta / (Math.PI * 2)) + 0.5) * 10);
    const p = row.points[Math.max(0, Math.min(10, kk))];
    const base = weightsAlong(stations, 'y', Math.max(p.y, m.ankleY + 0.03 * k));
    const f = footShare(p, row.contact[Math.max(0, Math.min(10, kk))]);
    return [...base.map(([b, w]) => [b, w * (1 - f)]), [Ft, f]];
  };
  const out = upper.map((ring) => ({
    c: ring.c, x: X.clone().multiplyScalar(-1), z: Z, rx: ring.r * 0.92, rzF: ring.r, rzB: ring.r * ringBack(stations, ring.y, ring.t), n: 2.3, v: 1 - Math.min(1, ring.t), w: weightsAlong(stations, 'y', ring.y),
  }));
  const vTop = 1 - Math.min(1, upper[upper.length - 1].t);
  rows.forEach((row) => out.push({ points: row.points, v: vTop - (vTop - 0.06) * (row.s / length), w: simWeights(row), strain: row.strain, contact: row.contact }));
  const hem = rows[rows.length - 1];
  const thick = physics.thickness;
  if (cuff) {
    // Rib cuff: snug on the sock/ankle, skinned like the skin it grips; a fold line at the bottom.
    const cuffRing = (y, extra, v) => {
      const c = legCenter(layout, side, y);
      const r = legRadiusAt(stations, y) + sockExtra + extra;
      return { c, x: X.clone().multiplyScalar(-1), z: Z, rx: r * 0.96, rzF: r, rzB: r * 1.04, n: 2.1, v, w: weightsAlong(stations, 'y', y) };
    };
    out.push(cuffRing(cuffTopY - 0.006, 0.008, 0.05));
    out.push(cuffRing(cuffBottomY + 0.003, 0.0068, 0.01));
    out.push(cuffRing(cuffBottomY, 0.0055, 0));
    out.push(cuffRing(cuffBottomY + 0.008, 0.0015, 0));
  } else {
    // Turned hem: the lip ring sits a fabric thickness inside the fold, hemTurn up.
    const inner = hem.points.map((p) => {
      const c = axis(Math.max(p.y, m.ankleY - 0.03));
      const d = Math.hypot(p.x - c.x, p.z - c.z) || 1;
      const kIn = Math.max(0.6, (d - thick * 2 - 0.003) / d);
      const q = V(c.x + (p.x - c.x) * kIn, p.y + draft.hemTurn, c.z + (p.z - c.z) * kIn);
      for (const col of colliders) {
        const res = col.resolve(q, 0.002);
        if (res) q.add(res.push);
      }
      return q;
    });
    for (let pass = 0; pass < 3; pass++) {
      for (let q = 0; q < inner.length; q++) {
        for (const other of [hem.points[q], hem.points[Math.min(q + 1, inner.length - 1)], inner[Math.min(q + 1, inner.length - 1)]]) {
          const mid = inner[q].clone().add(other).multiplyScalar(0.5);
          for (const col of colliders) {
            const res = col.resolve(mid, 0.0015);
            if (res) inner[q].add(res.push.multiplyScalar(2));
          }
        }
      }
      inner[inner.length - 1].copy(inner[0]);
    }
    out.push({ points: inner, v: 0, w: simWeights({ points: inner, contact: hem.contact }) });
  }
  return out;
}

/** The ragged fringe of a cut-off hem. */
function ringOffset(ring, { fray }) {
  if (fray && ring.lip) return (theta) => V(0, -Math.abs(Math.sin(theta * 7 + 0.6)) * 0.009 - Math.abs(Math.sin(theta * 3)) * 0.004, 0);
  return undefined;
}

/** Bellows pocket on the outer thigh: a flat box so the silhouette gets the cargo bump. */
function buildCargoPocket(mb, layout, side, fit) {
  const m = layout.measures;
  const s = side === 'Left' ? 1 : -1;
  const y = m.kneeY + (layout.world[`${side}UpLeg`].y - m.kneeY) * 0.42;
  const c = legCenter(layout, side, y);
  const r = m.thighRadius + 0.006 + fit * 0.02;
  c.x += s * (r * 0.92 + 0.01 + fit * 0.012);
  const w = weightsAlong(legStations(layout, side), 'y', y);
  mb.newSmoothingGroup();
  mb.box(c, [0.022, 0.16, 0.12], [0, 0.3, 0.5, 0.5], w, { frame: { x: V(s, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) } });
}

/** Trousers / shorts. style: { length: 'full'|'cropped'|'shorts', fit, stack, drape, cuff, cargo } */
/**
 * Layering: keeps an inner garment's vertices at least `gap` under an outer garment's surface
 * wherever the outer one reaches (above its hem), so nothing pokes through.
 */
export function underLayer(outer, gap = 0.017) {
  if (!outer) return null;
  return (p) => {
    if (p.y < outer.hemY + 0.006) return V();
    const cz0 = outer.surface(p.y, 0).cz;
    const theta = Math.atan2(p.x, p.z - cz0);
    const { r, cz } = outer.surface(p.y, theta);
    const d = Math.hypot(p.x, p.z - cz);
    if (d <= r - gap) return V();
    const k = (r - gap) / d;
    return V(p.x * k - p.x, 0, cz + (p.z - cz) * k - p.z);
  };
}

function withLayer(rings, layer) {
  if (!layer) return rings;
  return rings.map((ring) => {
    const base = ring.offset;
    return {
      ...ring,
      offset: (theta, p) => {
        const first = base ? base(theta, p) : V();
        const moved = p.clone().add(first);
        return first.add(layer(moved));
      },
    };
  });
}

/** Body cross-section at any height, interpolating ring sizes and the clothed (bridged) shape. */
export function sampleTorsoShaped(table) {
  const shapeOf = (r) => r.clothShape ?? r.shape ?? (() => 1);
  return (y) => {
    if (y <= table[0].y) return { ...table[0], shape: shapeOf(table[0]) };
    for (let i = 0; i < table.length - 1; i++) {
      const a = table[i];
      const b = table[i + 1];
      if (y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        const l = (key) => (a[key] ?? 2) + ((b[key] ?? 2) - (a[key] ?? 2)) * t;
        const sa = shapeOf(a);
        const sb = shapeOf(b);
        return { y, rx: l('rx'), rzF: l('rzF'), rzB: l('rzB'), cz: l('cz'), n: l('n'), shape: (th, c, s2) => sa(th, c, s2) * (1 - t) + sb(th, c, s2) * t };
      }
    }
    const last = table[table.length - 1];
    return { ...last, shape: shapeOf(last) };
  };
}

export function buildBottom(layout, style, rng, { under = null, shoes = null, socks = null } = {}) {
  const mb = new MeshBuilder('bottom');
  const m = layout.measures;
  const H = m.height;
  const k = H / 1.78;
  const fit = style.fit ?? 0.7;
  const length = style.length ?? 'full';
  const cls = legFitClass(style);
  const physics = fabricPhysics(style.kind ?? 'denim');
  const collider = shoes && SHOE_TYPES.includes(shoes.type) ? shoeCollider(layout, shoes.type, { size: shoes.size ?? 1 }) : null;
  const rolled = length === 'full' && (style.cuff ?? 0) > 0;
  const drape = length === 'full' && !rolled && LEG_FIT_CLASSES[cls].simulate && !!collider;
  const hemY = {
    full: rolled && collider ? Math.max(0.052 * k, collider.Left.collarTop + 0.012) : 0.052 * k + (style.cinch ? 0.07 * k : 0),
    ankle: m.ankleY + 0.05 * k,
    cropped: m.kneeY - (m.kneeY - m.ankleY) * 0.55,
    shorts: m.kneeY - (m.kneeY - m.ankleY) * 0.2,
    cutoff: m.kneeY + (layout.world.LeftUpLeg.y - m.kneeY) * 0.62,
  }[length];
  const infl = 0.008 + fit * 0.037;
  const table = torsoRings(layout);
  const by = Object.fromEntries(table.map((r) => [r.key, r]));
  const riseY = m.hipsY + (style.rise ?? 0.03) * (H / 1.78);
  const draft = draftTrousers(layout, {
    fitClass: cls, fit, riseY, cut: style.cut, fabric: style.kind ?? 'denim', stack: style.stack ?? 1,
    hemY: drape ? null : hemY,
  });
  const torsoAt = sampleTorsoShaped(table);
  const waistRow = (y, ease, extra = {}) => {
    const t = torsoAt(y);
    return { y, rx: t.rx + ease, rzF: t.rzF + ease, rzB: t.rzB + ease * 0.8, cz: t.cz, n: Math.min(2.3, t.n), shape: t.shape, ...extra };
  };
  const seatRows = table.filter((r) => r.y < riseY - 0.045 && r.y > by.crotch.y + 0.02).map((r) => {
    const row = waistRow(r.y, infl * 0.5);
    return r.y < by.hips.y - 0.005 ? { ...row, rzB: row.rzB * 0.86 } : row;
  });
  const crotchY = by.crotch.y + 0.012;
  const crotch = torsoAt(crotchY);
  const waist = [
    waistRow(riseY - 0.02, 0.003, { lip: true }),
    waistRow(riseY, infl * 0.3),
    waistRow(riseY - 0.035, infl * 0.4),
    ...seatRows.sort((a, b) => b.y - a.y),
    { y: crotchY, rx: by.hips.rx * 0.36, rzF: crotch.rzF - 0.03, rzB: crotch.rzB * 0.7, cz: crotch.cz, n: 2.2, shape: crotch.shape },
  ].map((r, i, all) => ({
    c: V(0, r.y, r.cz),
    x: X,
    z: Z,
    rx: r.rx,
    rzF: r.rzF,
    rzB: r.rzB,
    n: r.n,
    shape: r.shape,
    v: 1 - (i / (all.length - 1)) * 0.9,
    w: torsoWeights(layout, Math.max(r.y, by.hips.y - 0.02)),
  }));
  waist.reverse();
  const layer = underLayer(under);
  mb.loft(withLayer(waist, layer), { sides: 14, uv: GARMENT_UV.bottom.waist, capStart: 0.02, capUv: [0.25, 0.79] });
  for (const [side] of SIDES) {
    mb.newSmoothingGroup();
    const rings = pantsLegRings(layout, side, {
      hemY,
      width: style.width ?? 1,
      fit,
      stack: length === 'full' ? style.stack ?? 1 : 0,
      cuff: style.cuff ?? 0,
      fray: !!style.fray,
      cut: style.cut ?? 'straight',
      cinch: !!style.cinch && length === 'full',
      rng: rng.fork(side),
      topY: riseY - 0.025,
      hemTurn: LEG_FIT_CLASSES[cls].hemTurn * k,
      thickness: physics.thickness,
      drape,
      draft,
      cls: LEG_FIT_CLASSES[cls],
      shoe: collider?.[side],
      physics,
      margin: collisionMargin(style.kind ?? 'denim'),
      sockExtra: socks ? 0.004 : 0,
    });
    mb.loft(withLayer(rings, layer), { sides: 10, uv: GARMENT_UV.bottom[side === 'Left' ? 'legL' : 'legR'] });
    if (style.cargo) buildCargoPocket(mb, layout, side, fit);
  }
  return { mb, hemY, riseY, ease: infl, draft, fitClass: cls };
}

/** Leg radius (and back bulge) at height y, interpolated from the body's leg stations. */
function stationValueAt(stations, y, read) {
  const sorted = [...stations].sort((a, b) => a.y - b.y);
  if (y <= sorted[0].y) return read(sorted[0]);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (y <= b.y) return read(a) + (read(b) - read(a)) * ((y - a.y) / (b.y - a.y));
  }
  return read(sorted[sorted.length - 1]);
}

function legRadiusAt(stations, y) {
  return stationValueAt(stations, y, (s) => s.r);
}

/** How far the bare leg reaches behind its centre at y (glutes / hamstrings), as a radius factor. */
function legBackAt(stations, y) {
  return stationValueAt(stations, y, (s) => s.back ?? 1);
}

/** Crew socks: a leg sleeve between the shoe collar and `top` height. */
export function buildSocks(layout, { top }) {
  const mb = new MeshBuilder('socks');
  for (const [side] of SIDES) {
    const stations = legStations(layout, side);
    const m = layout.measures;
    const ys = [top, top - 0.012, (top + m.ankleY) / 2, m.ankleY + 0.01, m.ankleY - 0.025];
    const rings = ys.map((y, i) => {
      const base = legRadiusAt(stations, y);
      return {
        c: legCenter(layout, side, y),
        x: X.clone().multiplyScalar(-1),
        z: Z,
        r: base + (i === 0 ? 0.004 : 0.003),
        v: 1 - i / (ys.length - 1),
        w: weightsAlong(stations, 'y', y),
      };
    });
    mb.newSmoothingGroup();
    mb.loft(rings, { sides: 8, uv: [0, 0, 1, 1] });
  }
  return { mb };
}

export { J };
