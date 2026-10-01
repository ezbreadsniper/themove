import * as THREE from 'three';
import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder, ringRadius, V } from '../mesh-builder.js';
import { SKIN_ATLAS } from '../../tex/atlas.js';

const X = V(1, 0, 0);
const Z = V(0, 0, 1);

/**
 * Head profile in a 0.254 m reference head (chin at 0). Heights are metres, radii metres.
 * `jaw` and `cheek` flags mark rings that face presets widen or narrow.
 */
const BASE_RINGS = [
  { y: -0.045, rx: 0.042, rzF: 0.038, rzB: 0.04, cz: -0.022, neck: true },
  { y: -0.012, rx: 0.0447, rzF: 0.061, rzB: 0.0413, cz: -0.01, underJaw: true },
  { y: 0.004, rx: 0.046, rzF: 0.072, rzB: 0.042, cz: -0.004, jaw: 1 },
  { y: 0.028, rx: 0.058, rzF: 0.088, rzB: 0.062, cz: -0.002, jaw: 1 },
  { y: 0.058, rx: 0.067, rzF: 0.094, rzB: 0.083, cz: 0, jaw: 0.6 },
  { y: 0.088, rx: 0.072, rzF: 0.096, rzB: 0.094, cz: 0, cheek: 0.6 },
  { y: 0.116, rx: 0.076, rzF: 0.093, rzB: 0.1, cz: 0, cheek: 1 },
  { y: 0.142, rx: 0.077, rzF: 0.09, rzB: 0.103, cz: 0 },
  { y: 0.166, rx: 0.078, rzF: 0.093, rzB: 0.105, cz: 0 },
  { y: 0.192, rx: 0.076, rzF: 0.088, rzB: 0.104, cz: -0.002 },
  { y: 0.216, rx: 0.069, rzF: 0.078, rzB: 0.097, cz: -0.006 },
  { y: 0.236, rx: 0.053, rzF: 0.057, rzB: 0.075, cz: -0.01 },
  { y: 0.25, rx: 0.028, rzF: 0.03, rzB: 0.04, cz: -0.012 },
];

export const HEAD_LANDMARKS = {
  mouth: 0.05,
  noseTip: 0.088,
  noseBase: 0.078,
  eye: 0.142,
  brow: 0.166,
  hairlineFront: 0.2,
  earTop: 0.15,
  earBottom: 0.092,
  top: 0.254,
};

export const DEFAULT_FACE = {
  jawWidth: 1,
  chinLength: 1,
  cheekbones: 1,
  noseWidth: 1,
  noseLength: 1,
  noseProjection: 1,
  browRidge: 1,
  headWidth: 1,
  headDepth: 1,
  lipFullness: 1,
  eyeShape: 'almond',
  eyeSize: 1,
  eyeSpacing: 1,
  eyeTilt: 0,
  browThickness: 1,
  browTilt: 0,
  irisColor: '#2a1a12',
  lipTone: 0.82,
  facialHair: 'none',
  facialHairDensity: 0.6,
  jawDefinition: 0,
  foreheadSlope: 0,
  browHeight: 0,
  browGap: 0,
  eyeHeight: 0,
  eyeDepth: 0,
  lidHeaviness: 0,
  lashes: 0,
  noseBridge: 0,
  noseTip: 0,
  noseTilt: 0,
  nostrilFlare: 0,
  cheekFullness: 0,
  mouthWidth: 1,
  mouthHeight: 0,
  mouthCorners: 0,
  upperLip: 1,
  lowerLip: 1,
  chinWidth: 0,
  chinProjection: 0,
  cleftChin: 0,
  earSize: 1,
  earProtrusion: 0,
  earHeight: 0,
  earLobe: 0,
};

export function createHeadShape(measures, faceInput = {}) {
  const face = { ...DEFAULT_FACE, ...faceInput };
  const k = measures.headHeight / 0.254;
  const chinY = measures.height - measures.headHeight;
  const rings = BASE_RINGS.map((r) => {
    const older = measures.older ?? 0;
    const young = measures.young ?? 0;
    const fat = ((measures.build ?? 0.5) - 0.5) * 0.12 - (measures.feminine ?? 0) * 0.07;
    const jaw = r.jaw ? (1 + (face.jawWidth - 1) * r.jaw) * (1 + (older * 0.05 - young * 0.03 + fat) * r.jaw) : 1;
    const cheek = r.cheek ? (1 + (face.cheekbones - 1) * 0.5 * r.cheek) * (1 + young * 0.03 - older * 0.015) : 1;
    const chinDrop = r.y < 0.03 && !r.neck ? (face.chinLength - 1) * 0.012 : 0;
    const d = face.jawDefinition;
    const tuck = r.underJaw ? { rx: 0.0447 + d * 0.006, rzF: 0.061 - d * 0.02, rzB: 0.0413 - d * 0.012 } : null;
    const jawFlare = r.jaw === 1 && r.y < 0.01 ? 1 + d * 0.03 : 1;
    return {
      y: chinY + (r.y - chinDrop) * k,
      rx: (tuck?.rx ?? r.rx) * k * jaw * cheek * jawFlare * face.headWidth * 1.1,
      rzF: (tuck?.rzF ?? r.rzF) * k * face.headDepth,
      rzB: (tuck?.rzB ?? r.rzB) * k * face.headDepth,
      cz: r.cz * k,
      neck: !!r.neck,
      n: 2.15 + (r.jaw ? d * 1.05 * r.jaw : 0) + (r.underJaw ? d * 0.8 : 0),
    };
  });
  const at = (local) => chinY + local * k;
  const shift = { eye: face.eyeHeight * 0.008, brow: face.browHeight * 0.008 + face.eyeHeight * 0.004, mouth: face.mouthHeight * 0.007, earTop: face.earHeight * 0.01, earBottom: face.earHeight * 0.01 - (face.earSize - 1) * 0.02 - face.earLobe * 0.006, noseTip: face.noseTilt * 0.003 };
  const lm = Object.fromEntries(Object.entries(HEAD_LANDMARKS).map(([key, v]) => [key, at(v + (shift[key] ?? 0))]));
  lm.earTop += (face.earSize - 1) * 0.02 * k;

  const sampleRing = (y) => {
    if (y <= rings[0].y) return rings[0];
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      if (y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        const lerp = (p) => a[p] + (b[p] - a[p]) * t;
        return { y, rx: lerp('rx'), rzF: lerp('rzF'), rzB: lerp('rzB'), cz: lerp('cz'), n: lerp('n') };
      }
    }
    return rings[rings.length - 1];
  };

  /** Point on the (feature-free) skull surface; `inflate` pushes outward in metres. */
  const point = (theta, y, inflate = 0) => {
    const ring = sampleRing(Math.min(y, rings[rings.length - 1].y));
    const r = ringRadius(ring, theta) + inflate;
    return V(Math.sin(theta) * r, y, ring.cz + Math.cos(theta) * r);
  };

  return { rings, chinY, topY: chinY + 0.254 * k, k, face, lm, point, sampleRing, older: measures.older ?? 0, young: measures.young ?? 0 };
}

const gauss = (x, w) => Math.exp(-((x / w) ** 2));
const ramp = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Feature displacement (metres, along the surface normal) at angle θ and height y. Built like a
 * hand-modelled low-poly face: a nose with flat side planes and a defined tip, nostril wings, eye
 * sockets under a brow ridge, cheekbones, lips split by a mouth crease, philtrum, chin and temples.
 */
export function featureOffset(shape, theta, y) {
  const { face, lm, k } = shape;
  const a = Math.abs(theta);
  const u = (y - shape.chinY) / k;
  const L = Object.fromEntries(Object.entries(lm).map(([key, v]) => [key, (v - shape.chinY) / k]));
  const noseBase = L.noseBase - (face.noseLength - 1) * 0.012;
  const noseTip = noseBase + 0.009 + face.noseTilt * 0.004;
  let f = 0;

  const proj = 0.027 * face.noseProjection;
  let ridge = 0;
  if (u >= noseBase - 0.004 && u <= L.eye + 0.004) {
    if (u < noseBase) ridge = proj * 0.3 * ramp(noseBase - 0.004, noseBase, u);
    else if (u < noseTip) ridge = proj * (0.3 + 0.7 * ramp(noseBase, noseTip, u));
    else ridge = proj * (1 - (0.78 - face.noseBridge * 0.22) * ramp(noseTip, L.eye + 0.004, u) - face.noseBridge * 0.12 * gauss(u - (noseTip + L.eye) / 2, 0.012));
  }
  f += 0.008 * face.noseTip * gauss(theta, 0.11 * face.noseWidth) * gauss(u - noseTip, 0.006);
  const halfW = (0.1 + (0.13 + face.nostrilFlare * 0.03) * ramp(L.eye, noseBase, u)) * face.noseWidth;
  f += ridge * (1 - ramp(halfW * 0.45, halfW, a));
  f += (0.007 + face.nostrilFlare * 0.003) * face.noseWidth * gauss(a - (0.2 + face.nostrilFlare * 0.04) * face.noseWidth, 0.07) * gauss(u - (noseBase + 0.006), 0.007);

  f -= (0.011 + face.eyeDepth * 0.005) * gauss(a - 0.36 * face.eyeSpacing, 0.17) * gauss(u - (L.eye + 0.002), 0.012);
  f -= face.foreheadSlope * 0.008 * ramp(L.brow + 0.01, 0.24, u) * (1 - ramp(0.6, 1.4, a));
  f += face.cheekFullness * 0.007 * gauss(a - 0.72, 0.28) * gauss(u - (L.mouth + 0.018), 0.022);
  f += 0.009 * face.browRidge * (1 - ramp(0.55, 0.85, a)) * gauss(u - (L.brow + 0.002), 0.008);
  f -= 0.004 * gauss(a - 1.12, 0.18) * gauss(u - L.brow, 0.018);
  f += 0.006 * face.cheekbones * gauss(a - 0.78, 0.2) * gauss(u - (L.eye - 0.03), 0.012);
  f -= 0.003 * gauss(a - 0.62, 0.16) * gauss(u - (L.eye - 0.045), 0.012);

  const lipW = 0.42 * (0.85 + face.lipFullness * 0.15) * face.mouthWidth;
  const lips = 1 - ramp(lipW * 0.7, lipW, a);
  f += 0.0052 * face.lipFullness * face.upperLip * lips * gauss(u - (L.mouth + 0.007), 0.006);
  f += 0.0048 * face.lipFullness * face.lowerLip * lips * gauss(u - (L.mouth - 0.007), 0.007);
  f -= 0.004 * lips * gauss(u - L.mouth, 0.0025);
  f -= 0.0022 * gauss(theta, 0.06) * ramp(L.mouth + 0.012, L.mouth + 0.016, u) * (1 - ramp(noseBase - 0.006, noseBase - 0.002, u));
  f += 0.003 * gauss(a - lipW * 1.05, 0.12) * ramp(L.mouth - 0.01, L.mouth, u) * (1 - ramp(noseBase - 0.01, noseBase, u));
  f -= 0.004 * (1 - ramp(0.3, 0.5, a)) * gauss(u - (L.mouth - 0.019), 0.005);
  f += (0.006 + face.chinProjection * 0.006) * (1 - ramp(0.32 + face.chinWidth * 0.12, 0.55 + face.chinWidth * 0.15, a)) * gauss(u - 0.014, 0.011);
  f -= 0.004 * face.cleftChin * gauss(theta, 0.05) * gauss(u - 0.012, 0.01);
  f += 0.003 * (face.jawDefinition ?? 0) * gauss(theta, 0.3) * gauss(u - 0.004, 0.008);
  f -= 0.009 * (face.jawDefinition ?? 0) * gauss(a - 0.95, 0.22) * gauss(u - (L.mouth + 0.014), 0.014);
  return f * k;
}

/** Column angles: dense across the face (where features live), sparse round the back. */
function headColumns(lod) {
  const face = lod ? [0.14, 0.32, 0.55, 0.85, 1.2, 1.55] : [0.07, 0.15, 0.24, 0.34, 0.45, 0.58, 0.74, 0.94, 1.18, 1.45];
  const back = lod ? [2.1, 2.7] : [1.8, 2.2, 2.65];
  const half = [...face, ...back];
  return [-Math.PI, ...[...half].reverse().map((t) => -t), 0, ...half, Math.PI];
}

/** Rows (reference head units, chin = 0) aligned with landmarks so loops run through lips, nose, eyes, brow. */
function headRows(shape, lod) {
  const { lm, k, face } = shape;
  const L = Object.fromEntries(Object.entries(lm).map(([key, v]) => [key, (v - shape.chinY) / k]));
  const noseBase = L.noseBase - (face.noseLength - 1) * 0.012;
  const rows = lod
    ? [-0.045, -0.012, 0.006, 0.03, L.mouth, noseBase, L.eye - 0.02, L.eye, L.brow, 0.2, 0.232]
    : [-0.045, -0.012, 0.004, 0.016, 0.03, L.mouth - 0.013, L.mouth - 0.006, L.mouth, L.mouth + 0.007, L.mouth + 0.015,
      noseBase - 0.004, noseBase + 0.002, noseBase + 0.009, noseBase + 0.022, L.eye - 0.026, L.eye - 0.012, L.eye, L.eye + 0.012,
      L.brow + 0.002, 0.186, 0.206, 0.224, 0.24];
  return [...new Set(rows.map((r) => Math.round(r * 1e4) / 1e4))].sort((x, y) => x - y);
}

/** Reference-unit landmarks plus the mouth opening half-angle (shared by head, mouth interior and jaw weights). */
export function mouthInfo(shape) {
  const { lm, k, face } = shape;
  const L = Object.fromEntries(Object.entries(lm).map(([key, v]) => [key, (v - shape.chinY) / k]));
  const half = 0.42 * (0.85 + face.lipFullness * 0.15) * (face.mouthWidth ?? 1) * 0.82;
  const cols = headColumns(0).filter((c) => c > 0);
  let edge = cols[cols.length - 1];
  for (let i = 0; i < cols.length; i++) {
    const lo = i === 0 ? 0 : cols[i - 1];
    if ((lo + cols[i]) / 2 < half) edge = cols[i];
  }
  return { L, half, edge };
}

/** How much a head vertex follows the jaw: lower lip, chin and jaw underside, fading to the sides and neck. */
function jawWeight(u, theta, L, half) {
  const a = Math.abs(theta);
  if (u > L.mouth) return 0;
  const nearMouth = Math.max(0, Math.min(1, (L.mouth - u) / 0.03));
  const sideFade = 1 - ramp(half + (0.9 - half) * nearMouth, half + 0.35 + (1.55 - half - 0.35) * nearMouth, a);
  const neckFade = u < -0.02 ? 0.25 : u < 0 ? 0.7 : 1;
  return Math.max(0, Math.min(1, sideFade * neckFade));
}

export function buildHead(shape, { lod = 0 } = {}) {
  const mb = new MeshBuilder('head');
  const [u0, v0, u1, v1] = SKIN_ATLAS.head;
  const yMin = shape.rings[0].y;
  const yMax = shape.topY;
  const cols = headColumns(lod);
  const { L, half } = mouthInfo(shape);
  const rowDefs = headRows(shape, lod).flatMap((r) => (Math.abs(r - L.mouth) < 1e-4 ? [{ r: L.mouth, lower: true }, { r: L.mouth, upper: true }] : [{ r }]));
  const rows = rowDefs.map((d) => d.r);
  const lowerLipRow = rowDefs.findIndex((d) => d.lower);
  const starts = [];
  for (const [ri, r] of rows.entries()) {
    const y = shape.chinY + r * shape.k;
    const neck = r < -0.02;
    starts.push(mb.vertexCount);
    for (const theta of cols) {
      const isUpperLip = !!rowDefs[ri].upper;
      const jw = isUpperLip ? 0 : jawWeight(r, theta, L, half);
      const base = neck ? [[J.Neck, 0.6], [J.Head, 0.4]] : r < 0 ? [[J.Neck, 0.15], [J.Head, 0.85]] : [[J.Head, 1]];
      const w = [...base.map(([b, v]) => [b, v * (1 - jw)]), [J.Jaw, jw]];
      const p = shape.point(theta, y, neck ? 0 : featureOffset(shape, theta, y));
      const uv = [u0 + (u1 - u0) * (0.5 + theta / (Math.PI * 2)), v0 + (v1 - v0) * ((y - yMin) / (yMax - yMin))];
      mb.addVertex(p, uv, w);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols.length - 1; c++) {
      const mid = (cols[c] + cols[c + 1]) / 2;
      if (r === lowerLipRow && Math.abs(mid) < half) continue;
      mb.quad(starts[r] + c, starts[r] + c + 1, starts[r + 1] + c + 1, starts[r + 1] + c);
    }
  }
  const lastRing = shape.sampleRing(shape.topY);
  const top = mb.addVertex(V(0, yMax, lastRing.cz), [(u0 + u1) / 2, v1 - 0.002], [[J.Head, 1]]);
  const last = starts[starts.length - 1];
  for (let c = 0; c < cols.length - 1; c++) mb.tri(top, last + c, last + c + 1);
  buildEars(mb, shape);
  return mb;
}

/**
 * Mouth interior seen when the jaw opens: dark cavity wall, upper teeth (head), lower teeth and tongue
 * (jaw). UV quadrants of the 32px mouth texture: v<0.5 cavity, u<0.5 & v≥0.5 teeth, u≥0.5 & v≥0.5 tongue.
 */
export function buildMouth(shape) {
  const mb = new MeshBuilder('mouth');
  const k = shape.k;
  const { L, edge } = mouthInfo(shape);
  const half = edge;
  const at = (theta, u, inset) => {
    const y = shape.chinY + u * k;
    const p = shape.point(theta, y, featureOffset(shape, theta, shape.chinY + L.mouth * k) - inset * k);
    return p;
  };
  const strip = (thetaHalf, uTop, uBot, insetTop, insetBot, uv, weight, cols = 8) => {
    const top = [];
    const bot = [];
    for (let i = 0; i <= cols; i++) {
      const th = -thetaHalf + (2 * thetaHalf * i) / cols;
      const curl = 1 - (th / thetaHalf) ** 2;
      const uu = uv[0] + (uv[2] - uv[0]) * (i / cols);
      top.push(mb.addVertex(at(th, uTop, insetTop + (1 - curl) * 0.004), [uu, uv[3]], weight));
      bot.push(mb.addVertex(at(th, uBot, insetBot + (1 - curl) * 0.004), [uu, uv[1]], weight));
    }
    for (let i = 0; i < cols; i++) mb.quad(bot[i], bot[i + 1], top[i + 1], top[i]);
  };
  const HEAD = [[J.Head, 1]];
  const JAW = [[J.Jaw, 1]];
  mb.newSmoothingGroup();
  strip(half * 1.45, L.mouth + 0.014, L.mouth, 0.022, 0.022, [0, 0, 1, 0.25], HEAD, 12);
  strip(half * 1.45, L.mouth, L.mouth - 0.03, 0.022, 0.02, [0, 0.25, 1, 0.5], JAW, 12);
  for (const side of [-1, 1]) {
    for (const [uTop, uBot, w] of [[L.mouth + 0.014, L.mouth, HEAD], [L.mouth, L.mouth - 0.03, JAW]]) {
      const th = side * edge * 1.02;
      const ids = [[uTop, 0.001], [uTop, 0.024], [uBot, 0.024], [uBot, 0.001]].map(([uu, inset], i) => mb.addVertex(at(th, uu, inset), [i < 2 ? 0 : 1, 0.1], w));
      mb.newSmoothingGroup();
      mb.quad(ids[0], ids[1], ids[2], ids[3]);
    }
  }
  mb.newSmoothingGroup();
  strip(half * 0.92, L.mouth + 0.008, L.mouth - 0.0015, 0.009, 0.0085, [0, 0.5, 0.5, 1], HEAD, 10);
  mb.newSmoothingGroup();
  strip(half * 0.86, L.mouth - 0.0005, L.mouth - 0.01, 0.0095, 0.009, [0, 0.5, 0.5, 1], JAW, 10);
  mb.newSmoothingGroup();
  strip(half * 0.7, L.mouth - 0.009, L.mouth - 0.012, 0.014, 0.024, [0.5, 0.5, 1, 1], JAW, 6);
  return mb;
}

/**
 * Ear outline in ear-plane units (x: 0 at the attached front edge → back, y: lobe bottom −0.5 → top 0.5),
 * traced round the helix, down the back, round the lobe and up the attached front (tragus).
 */
const EAR_OUTLINE = [
  [0.06, 0.36], [0.17, 0.49], [0.33, 0.5], [0.47, 0.4], [0.55, 0.2], [0.53, 0.0], [0.45, -0.17],
  [0.33, -0.3], [0.27, -0.44], [0.15, -0.5], [0.06, -0.42], [0.02, -0.2], [0.03, 0.12],
];
const CONCHA = [0.2, -0.04];

/** Ear: tilted plate with a raised helix rim, a hollow concha bowl and a lobe; back edge stands off the head. */
function buildEars(mb, shape) {
  const { lm, k, face } = shape;
  const [eu0, ev0, eu1, ev1] = SKIN_ATLAS.ear;
  const H = (lm.earTop - lm.earBottom) * 1.25 * (face.earSize ?? 1);
  const W = H * 0.62;
  const thick = 0.006 * k;
  const lobe = 1 + (face.earLobe ?? 0) * 0.35;
  const stand = 0.55 + (face.earProtrusion ?? 0) * 0.35;
  const W8 = [[J.Head, 1]];
  for (const s of [1, -1]) {
    const yMid = (lm.earTop + lm.earBottom) / 2;
    const root = shape.point(s * Math.PI * 0.5, yMid, -0.002 * k);
    root.z -= 0.006 * k;
    const side = V(s, 0, 0);
    const back = V(0, 0, -1).applyAxisAngle(V(1, 0, 0), -0.12).normalize();
    const up = V(0, 1, 0).applyAxisAngle(V(1, 0, 0), -0.12).normalize();
    const plane = (x, y, lift) => {
      const yy = y < -0.15 ? y * lobe : y;
      return root.clone()
        .addScaledVector(back, x * W)
        .addScaledVector(up, yy * H)
        .addScaledVector(side, x * W * stand + lift);
    };
    const lerpTo = ([x, y], [cx, cy], t) => [x + (cx - x) * t, y + (cy - y) * t];
    const layers = [
      { pts: EAR_OUTLINE, lift: -thick * 0.5 },
      { pts: EAR_OUTLINE, lift: thick * 0.5 },
      { pts: EAR_OUTLINE.map((p) => lerpTo(p, CONCHA, 0.2)), lift: thick * 0.9 },
      { pts: EAR_OUTLINE.map((p) => lerpTo(p, CONCHA, 0.5)), lift: -thick * 0.1 },
    ];
    const n = EAR_OUTLINE.length;
    mb.newSmoothingGroup();
    const ids = layers.map((layer, li) => layer.pts.map(([x, y], i) => mb.addVertex(plane(x, y, layer.lift), [eu0 + (eu1 - eu0) * (i / n), ev0 + (ev1 - ev0) * (li / 4)], W8)));
    const pos = (id) => V(mb.positions[id * 3], mb.positions[id * 3 + 1], mb.positions[id * 3 + 2]);
    const oriented = (a, b, c, d, want) => {
      const nrm = pos(b).sub(pos(a)).cross(pos(c).sub(pos(a)));
      if (nrm.dot(want) >= 0) mb.quad(a, b, c, d);
      else mb.quad(a, d, c, b);
    };
    const outward = side.clone();
    for (let li = 0; li < layers.length - 1; li++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const centre = plane(CONCHA[0], CONCHA[1], 0);
        const mid = pos(ids[li][i]).add(pos(ids[li + 1][j])).multiplyScalar(0.5);
        const want = li === 0 ? mid.clone().sub(centre).setX(0).add(outward.clone().multiplyScalar(0.0001)) : outward;
        oriented(ids[li][i], ids[li][j], ids[li + 1][j], ids[li + 1][i], want);
      }
    }
    const bowl = mb.addVertex(plane(CONCHA[0], CONCHA[1], -thick * 0.6), [(eu0 + eu1) / 2, ev1 - 0.001], W8);
    const backC = mb.addVertex(plane(CONCHA[0], CONCHA[1], -thick * 0.5), [(eu0 + eu1) / 2, ev0 + 0.001], W8);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const inner = ids[3];
      const t1 = pos(inner[j]).sub(pos(bowl)).cross(pos(inner[i]).sub(pos(bowl)));
      if (t1.dot(outward) >= 0) mb.tri(bowl, inner[j], inner[i]);
      else mb.tri(bowl, inner[i], inner[j]);
      const b0 = ids[0];
      const t2 = pos(b0[j]).sub(pos(backC)).cross(pos(b0[i]).sub(pos(backC)));
      if (t2.dot(outward) <= 0) mb.tri(backC, b0[j], b0[i]);
      else mb.tri(backC, b0[i], b0[j]);
    }
  }
  mb.newSmoothingGroup();
}

export { THREE };
