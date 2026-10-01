import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder, frameFor, V } from '../mesh-builder.js';
import { HEAD_LANDMARKS as L } from './head.js';
import { simulateLoc } from './rope.js';

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Piecewise-linear curve over |θ| in reference-head units. */
function curve(points) {
  return (absTheta) => {
    for (let i = 0; i < points.length - 1; i++) {
      const [a, ya] = points[i];
      const [b, yb] = points[i + 1];
      if (absTheta <= b) return ya + (yb - ya) * ((absTheta - a) / (b - a));
    }
    return points[points.length - 1][1];
  };
}

const HAIRLINES = {
  natural: curve([[0, L.hairlineFront], [0.6, L.hairlineFront - 0.004], [0.95, L.brow + 0.018], [1.3, L.earTop + 0.012], [1.6, L.earTop - 0.004], [2.1, L.noseBase + 0.012], [Math.PI, L.noseBase + 0.004]]),
  high: curve([[0, L.hairlineFront + 0.01], [0.7, L.hairlineFront + 0.004], [1.0, L.brow + 0.026], [1.3, L.earTop + 0.016], [1.6, L.earTop], [2.1, L.noseBase + 0.02], [Math.PI, L.noseBase + 0.012]]),
  mop: curve([[0, L.brow + 0.018], [0.6, L.brow + 0.014], [1.0, L.eye], [1.3, L.earBottom - 0.002], [1.75, L.earBottom], [2.3, L.noseBase + 0.006], [Math.PI, L.noseBase + 0.01]]),
  low: curve([[0, L.brow + 0.02], [0.7, L.brow + 0.018], [1.0, L.brow + 0.008], [1.3, L.earTop + 0.004], [1.6, L.earTop - 0.012], [2.1, L.noseBase + 0.004], [Math.PI, L.noseBase - 0.01]]),
  cap: curve([[0, L.brow + 0.02], [1.2, L.earTop + 0.012], [1.6, L.earTop - 0.006], [2.1, L.noseBase + 0.014], [Math.PI, L.noseBase + 0.006]]),
};

/**
 * Hair style table. thickness(θ, t) in reference metres, t = 0 at hairline → 1 at crown.
 * texture = shell texture, strandTexture = texture for strands/cards, strands = strand builder kind.
 */
export const HAIR_STYLES = {
  bald: { shell: false },
  buzz: { hairline: 'natural', thickness: () => 0.0018, rows: 6, softEdge: true, texture: 'buzz' },
  crop: { hairline: 'natural', thickness: (th, t) => 0.004 + 0.008 * t, lumps: 0.0012, rows: 7, softEdge: true, texture: 'crop' },
  fade: { hairline: 'natural', thickness: (th, t) => 0.0015 + 0.007 * t * t, rows: 7, softEdge: true, texture: 'fade' },
  waves: { hairline: 'natural', thickness: () => 0.0032, rows: 7, softEdge: true, texture: 'waves' },
  cornrows: { hairline: 'natural', thickness: () => 0.0045, rows: 7, softEdge: true, texture: 'cornrows' },
  flatTop: { hairline: 'natural', thickness: (th, t) => 0.003 + 0.03 * smooth(0.15, 0.6, t), rows: 9, sides: 24, softEdge: true, flatTop: 0.022, texture: 'crop' },
  afro: {
    hairline: 'natural',
    thickness: (th, t) => 0.022 + 0.01 * smooth(0.1, 0.8, t) + (Math.abs(th) > 2 ? 0.005 : 0),
    lumps: 0.0035,
    rows: 10,
    sides: 26,
    dome: 0.108,
    domeDrop: 0.025,
    edgeRamp: 0.28,
    softEdge: true,
    texture: 'coils',
  },
  curlyMop: { hairline: 'mop', thickness: (th, t) => 0.016 + 0.012 * t, lumps: 0.004, rows: 9, sides: 24, softEdge: true, dome: 0.104, texture: 'coils', strands: 'curls', strandTexture: 'coils' },
  twists: { hairline: 'natural', thickness: (th, t) => 0.008 + 0.006 * t, rows: 7, softEdge: true, texture: 'coils', strands: 'twists', strandTexture: 'locStrand' },
  locs: { hairline: 'high', thickness: (th, t) => 0.006 + 0.004 * t, rows: 7, softEdge: true, texture: 'locRoots', strands: 'locs', strandTexture: 'locStrand' },
  messy: { hairline: 'natural', thickness: (th, t) => 0.008 + 0.01 * t, lumps: 0.003, rows: 8, softEdge: true, texture: 'comb', strands: 'tufts', strandTexture: 'card' },
  mohawk: { hairline: 'natural', thickness: (th, t) => (Math.min(Math.abs(th), Math.PI - Math.abs(th)) < 0.32 ? 0.004 + 0.01 * t : 0.0015), rows: 8, sides: 24, softEdge: true, texture: 'mohawk', strands: 'fin', strandTexture: 'card' },
  longStraight: { hairline: 'natural', thickness: (th, t) => 0.006 + 0.006 * t, rows: 8, softEdge: true, texture: 'comb', strands: 'cards', strandTexture: 'card' },
  longWavy: {
    hairline: 'natural',
    thickness: (th, t) => 0.008 + 0.008 * t,
    rows: 8,
    softEdge: true,
    texture: 'part',
    dome: 0.1,
    domeDrop: 0.03,
    strands: 'waveCards',
    strandTexture: 'waveCard',
    cards: { drop: 0.2, wave: 0.022, front: 0.82 },
  },
};

/** Age-driven hairline recession: strongest at the temples, mild at the centre, none at the back. */
export function recede(shape, theta) {
  const amount = shape.recession ?? 0;
  if (amount <= 0) return 0;
  const a = Math.abs(theta);
  return amount * shape.k * (0.026 * Math.exp(-(((a - 0.6) / 0.38) ** 2)) + 0.01 * Math.max(0, Math.cos(a)));
}

export function hairlineFor(shape, styleName) {
  const style = HAIR_STYLES[styleName] ?? HAIR_STYLES.crop;
  if (!style.shell && style.shell !== undefined) return null;
  const fn = HAIRLINES[style.hairline ?? 'natural'];
  return (theta) => shape.chinY + fn(Math.abs(theta)) * shape.k + recede(shape, theta);
}

function buildShell(mb, shape, style, rng, lod) {
  const sides = lod ? 12 : style.sides ?? 20;
  const rows = style.rows ?? 6;
  const k = shape.k;
  const hairline = HAIRLINES[style.hairline ?? 'natural'];
  const lumpSeeds = Array.from({ length: 24 }, () => rng.range(-1, 1));
  const lump = (theta, t) => {
    if (!style.lumps) return 0;
    const a = Math.sin(theta * 3 + lumpSeeds[0] * 3) * Math.cos(t * 5 + lumpSeeds[1] * 2);
    const b = Math.sin(theta * 7 + lumpSeeds[2] * 5 + t * 3);
    return style.lumps * (0.6 * a + 0.4 * b);
  };
  const top = shape.topY;
  const surfaceAt = (theta, t, edgeRow = false) => {
    const base = shape.chinY + hairline(Math.abs(theta)) * k + recede(shape, theta);
    const y = base + (top - base) * (1 - Math.pow(1 - t, 1.6)) * 0.985;
    const ramp = edgeRow ? 0 : 0.12 + 0.88 * smooth(0, style.edgeRamp ?? 0.5, t);
    const thick = Math.max(0.0015 * k, (style.thickness(theta, t) + lump(theta, t)) * k * (style.softEdge ? ramp : (edgeRow ? 0 : 1)));
    const p = shape.point(theta, y, thick);
    if (t > 0.6) p.y += thick * smooth(0.6, 1, t) * 0.9;
    if (style.flatTop) p.y = Math.min(p.y, top + style.flatTop * k);
    if (style.dome && !edgeRow) roundOut(p, shape, style.dome * k + thick, smooth(0.08, 0.45, t), style.domeDrop ?? 0);
    return p;
  };
  const starts = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    starts.push(mb.vertexCount);
    for (let s = 0; s <= sides; s++) {
      const u = s / sides;
      const theta = (u - 0.5) * Math.PI * 2;
      const p = surfaceAt(theta, t, r === 0);
      if (r === 0 && !style.softEdge && s % 2 === 1) p.y += (style.jag ?? 0) * k;
      mb.addVertex(p, [u, t * 0.92], [[J.Head, 1]]);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < sides; s++) mb.quad(starts[r] + s, starts[r] + s + 1, starts[r + 1] + s + 1, starts[r + 1] + s);
  }
  const last = starts[rows];
  const ringPts = [];
  for (let s2 = 0; s2 < sides; s2++) ringPts.push(V(mb.positions[(last + s2) * 3], mb.positions[(last + s2) * 3 + 1], mb.positions[(last + s2) * 3 + 2]));
  const avg = ringPts.reduce((acc, p) => acc.add(p), V()).multiplyScalar(1 / sides);
  const ringR = ringPts.reduce((acc, p) => acc + Math.hypot(p.x - avg.x, p.z - avg.z), 0) / sides;
  const crownPos = avg.clone().add(V(0, style.dome ? ringR * 0.38 : (style.thickness(0, 1) + lump(0, 1)) * k * 1.4 + ringR * 0.15, 0));
  if (style.flatTop) crownPos.y = Math.min(crownPos.y, top + style.flatTop * k);
  const crown = mb.addVertex(crownPos, [0.5, 1], [[J.Head, 1]]);
  for (let s = 0; s < sides; s++) mb.tri(crown, last + s, last + s + 1);
}

/** Pushes a shell point out onto a sphere around the upper skull so bulky styles read round, not helmet-flat. */
function roundOut(p, shape, radius, amount, drop = 0) {
  const c = V(0, shape.topY - (0.11 + drop) * shape.k, shape.rings[6].cz - 0.008 * shape.k);
  const d = p.clone().sub(c);
  if (d.length() >= radius) return;
  p.lerp(c.clone().addScaledVector(d.normalize(), radius), amount);
}

/** Strand cross-sections: tubes are round (6 sides), cards are flat lenses (wide along the head surface). */
const PROFILES = {
  locs: { sides: 5, flat: 1, taper: 0.3, cap: true },
  twists: { sides: 6, flat: 1, taper: 0.45, cap: true },
  curls: { sides: 6, flat: 1, taper: 0.5, cap: true },
  tufts: { sides: 6, flat: 0.22, taper: 0.92, cap: false },
  fin: { sides: 6, flat: 0.25, taper: 0.95, cap: false, hint: 'side' },
  cards: { sides: 6, flat: 0.16, taper: 0.45, cap: false },
  waveCards: { sides: 4, flat: 0.2, taper: 0.55, cap: false },
};

const STRAND_COUNTS = { locs: 46, twists: 80, curls: 110, tufts: 84, fin: 15, cards: 70, waveCards: 64 };

/** Root position, growth direction and length/radius for one strand of the given kind. */
function strandSpec(kind, i, count, shape, layout, style, rng) {
  const k = shape.k;
  const hairline = HAIRLINES[style.hairline ?? 'natural'];
  const golden = i * 2.39996;
  let theta = ((golden % (Math.PI * 2)) - Math.PI) + rng.range(-0.08, 0.08);
  let t;
  if (kind === 'locs') t = 0.08 + 0.85 * Math.sqrt((i + 0.5) / count);
  else if (kind === 'curls') t = i % 5 < 2 ? 0.02 + 0.1 * rng.next() : 0.15 + 0.8 * ((i * 0.618) % 1);
  else if (kind === 'fin') {
    const s = i / (count - 1);
    theta = s < 0.5 ? 0 : Math.PI;
    t = s < 0.5 ? 0.15 + s * 1.7 : 1 - (s - 0.5) * 1.7;
  } else t = 0.1 + 0.85 * ((i * 0.618) % 1);
  if (style.strandMaxT && t > style.strandMaxT) return null;
  const base = shape.chinY + hairline(Math.abs(theta)) * k + recede(shape, theta);
  const y = base + (shape.topY - base) * Math.min(t, 0.98);
  const root = shape.point(theta, Math.min(y, shape.topY - 0.004 * k), style.thickness(theta, t) * k * 0.5);
  return { theta, t, root };
}

/**
 * Long wavy card: rope-simulated like straight cards, then an S-wave is laid on along the
 * head's tangent so neighbouring cards ripple out of phase. Front cards frame the face.
 */
function waveCardPoints(spec, shape, layout, style, rng, lod) {
  const k = shape.k;
  const { theta, root } = spec;
  const opts = style.cards;
  if (Math.cos(theta) > opts.front) return null;
  const back = -Math.cos(theta);
  const endY = layout.measures.shoulderY - opts.drop - Math.max(0, back) * 0.06 + rng.range(-0.04, 0.03);
  const radius = rng.range(0.022, 0.028) * k;
  const segments = lod ? 5 : 8;
  const pts = simulateLoc(shape, layout, root, theta, { length: Math.max(0.15, root.y - endY), segments, radius: radius * 0.3, ease: 0.026 });
  const phase = rng.range(0, Math.PI * 2);
  const amp = opts.wave * k * rng.range(0.7, 1.2);
  const tangent = V(Math.cos(theta), 0, -Math.sin(theta));
  return {
    pts: pts.map((p, j) => {
      const along = j / segments;
      const ramp = smooth(0.15, 0.55, along);
      return p.clone().addScaledVector(tangent, Math.sin(phase + along * Math.PI * 3.2) * amp * ramp);
    }),
    radius,
  };
}

function strandPoints(kind, spec, shape, layout, rng, lod, style) {
  if (kind === 'waveCards') return waveCardPoints(spec, shape, layout, style, rng, lod);
  const k = shape.k;
  const { theta, root } = spec;
  const centre = V(0, shape.topY - 0.11 * k, shape.rings[6].cz);
  const out = root.clone().sub(centre).normalize();
  const shoulderY = layout.measures.shoulderY;
  if (kind === 'locs' || kind === 'cards') {
    if (kind === 'cards' && Math.cos(theta) > 0.55) return null;
    const back = -Math.cos(theta);
    const endY = kind === 'locs'
      ? shoulderY - 0.05 - Math.max(0, back) * 0.13 + rng.range(-0.07, 0.05)
      : shoulderY - 0.03 - Math.max(0, back) * 0.1 + rng.range(-0.025, 0.025);
    const radius = (kind === 'locs' ? rng.range(0.0075, 0.011) : rng.range(0.02, 0.026)) * k;
    return { pts: simulateLoc(shape, layout, root, theta, { length: Math.max(0.12, root.y - endY), segments: lod ? 4 : 6, radius, ease: 0.032 }), radius };
  }
  if (kind === 'curls') {
    const len = (Math.cos(theta) > 0.45 ? rng.range(0.028, 0.04) : rng.range(0.04, 0.06)) * k;
    const down = V(0, -1, 0);
    const side = out.clone().cross(down).normalize();
    const p1 = root.clone().addScaledVector(out, len * 0.45).addScaledVector(down, len * 0.1);
    const p2 = p1.clone().addScaledVector(out, len * 0.25).addScaledVector(down, len * 0.45).addScaledVector(side, rng.range(-0.3, 0.3) * len);
    const p3 = p2.clone().addScaledVector(out, -len * 0.2).addScaledVector(down, len * 0.25);
    return { pts: [root, p1, p2, p3], radius: rng.range(0.011, 0.014) * k };
  }
  if (kind === 'twists') {
    const len = rng.range(0.05, 0.08) * k;
    const p1 = root.clone().addScaledVector(out, len * 0.32).add(V(0, -len * 0.05, 0));
    const p2 = p1.clone().addScaledVector(out, len * 0.18).add(V(0, -len * 0.45, 0));
    const p3 = p2.clone().addScaledVector(out, len * 0.05).add(V(0, -len * 0.35, 0));
    return { pts: [root, p1, p2, p3], radius: 0.0085 * k };
  }
  if (kind === 'tufts') {
    const front = Math.cos(theta);
    const flow = V(Math.sin(theta) * 0.3, front > 0.3 ? 0.35 : -0.55, front > 0.3 ? 0.9 : -0.5).normalize();
    const dir = out.clone().multiplyScalar(0.22).add(flow).normalize();
    const len = rng.range(0.05, 0.085) * k;
    const p1 = root.clone().addScaledVector(dir, len * 0.5);
    const p2 = p1.clone().addScaledVector(dir, len * 0.5).add(V(0, -len * 0.18, 0));
    return { pts: [root, p1, p2], radius: 0.02 * k };
  }
  if (kind === 'fin') {
    const backward = Math.cos(theta) > 0 ? -0.35 : -0.15;
    const dir = V(0, 1, backward).normalize();
    const len = rng.range(0.06, 0.08) * k * (spec.t > 0.5 ? 1 : 0.8);
    const p1 = root.clone().addScaledVector(dir, len * 0.55);
    const p2 = p1.clone().addScaledVector(dir, len * 0.45).add(V(0, 0, -len * 0.12));
    return { pts: [root, p1, p2], radius: 0.022 * k };
  }
  return null;
}

function buildStrands(mb, shape, layout, style, rng, lod) {
  const kind = style.strands;
  const prof = PROFILES[kind];
  const count = lod ? Math.round(STRAND_COUNTS[kind] * 0.4) : STRAND_COUNTS[kind];
  for (let i = 0; i < count; i++) {
    const spec = strandSpec(kind, i, count, shape, layout, style, rng);
    if (!spec) continue;
    const res = strandPoints(kind, spec, shape, layout, rng, lod, style);
    if (!res) continue;
    const { pts, radius } = res;
    const n = pts.length;
    const radial = V(spec.root.x, 0, spec.root.z).normalize();
    const rings = pts.map((p, j) => {
      const dir = (j < n - 1 ? pts[j + 1].clone().sub(p) : p.clone().sub(pts[j - 1])).normalize();
      const f = frameFor(dir, prof.hint === 'side' ? V(1, 0, 0) : radial);
      const drop = smooth(shape.chinY, shape.chinY - 0.25, p.y);
      const t = j / (n - 1);
      const r = radius * Math.max(0.06, 1 - t * prof.taper);
      return {
        c: p,
        x: f.x,
        z: f.z,
        rx: r,
        rzF: r * prof.flat,
        rzB: r * prof.flat,
        v: t,
        w: drop > 0 ? [[J.Head, 1 - drop * 0.5], [J.Neck, drop * 0.25], [J.Spine2, drop * 0.25]] : [[J.Head, 1]],
      };
    });
    mb.newSmoothingGroup();
    const u0 = (i % 4) * 0.25;
    mb.loft(rings, { sides: lod ? 4 : prof.sides, uv: [u0, 0, u0 + 0.25, 1], capEnd: prof.cap ? radius * 0.5 : undefined });
  }
}

/**
 * Under a cap the crown is flattened against the scalp (no dome, clumps or top strands); only hair below
 * the cap band (sides, back, edge curls) keeps its volume so it sticks out from under the hat.
 */
function cappedStyle(style) {
  return {
    ...style,
    thickness: (th, t) => Math.min(style.thickness(th, t), 0.006),
    dome: 0,
    lumps: 0,
    strandMaxT: 0.18,
  };
}

export function buildHair(shape, layout, styleName, rng, { lod = 0, capped = false } = {}) {
  const base = HAIR_STYLES[styleName];
  if (!base || base.shell === false) return null;
  const style = capped ? cappedStyle(base) : base;
  const shell = new MeshBuilder('hair');
  buildShell(shell, shape, style, rng.fork('shell'), lod);
  const strands = style.strands ? new MeshBuilder('hairStrands') : null;
  if (strands) buildStrands(strands, shape, layout, style, rng.fork('strands'), lod);
  return { shell, strands, texture: style.texture, strandTexture: style.strandTexture };
}
