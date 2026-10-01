import { ringRadius } from '../geo/mesh-builder.js';
import { torsoRings, legStations } from '../geo/parts/body.js';
import { sampleTorsoShaped } from '../geo/parts/garments.js';
import { LEG_FIT_CLASSES } from './fit-classes.js';

/**
 * 2D pattern drafting from body measurements. A draft is the garment's source of truth for girths and
 * lengths. The 3D loft and the drape solver read their target circumferences, inseam and hem allowance
 * from it, and `patternSVG` draws it for review.
 *
 * Units are metres. Piece outlines are 2D polylines (x across the piece, y up from the hem line).
 */

export const SEAM = 0.01; // 1 cm seam allowance (shown on the pattern sheet, not in the 3D girths)
export const HEM_TURN = 0.035; // 3.5 cm hem allowance before it is turned (the visible hem band is the class hemTurn)

/** Perimeter of a superellipse ring (numeric). */
export function ringPerimeter(ring, steps = 48) {
  let sum = 0;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const r = ringRadius(ring, th);
    const p = [Math.sin(th) * r, Math.cos(th) * r];
    if (prev) sum += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return sum;
}

/** Body girths the drafts are measured from. */
export function bodyGirths(layout) {
  const by = Object.fromEntries(torsoRings(layout).map((r) => [r.key, r]));
  const legs = legStations(layout, 'Left');
  const girthOf = (st) => ringPerimeter({ rx: st.r * 0.96, rzF: st.r * (st.front ?? 1), rzB: st.r * st.back, n: 2 });
  const near = (y) => legs.reduce((best, st) => (Math.abs(st.y - y) < Math.abs(best.y - y) ? st : best));
  const m = layout.measures;
  return {
    waist: ringPerimeter(by.waist),
    hip: ringPerimeter(by.hips),
    seat: ringPerimeter({ ...by.seat, n: 2.2 }),
    thigh: girthOf(legs[1]),
    knee: girthOf(near(m.kneeY)),
    calf: girthOf(legs[6]),
    ankle: girthOf(legs[8]),
    crotchY: by.crotch.y,
    waistY: by.waist.y,
    hipsY: m.hipsY,
    kneeY: m.kneeY,
    ankleY: m.ankleY,
  };
}

/**
 * Trouser draft. `leg` = sampled girths of the 3D leg loft (top → knee), so the drafted thigh/knee
 * match the ease the fit setting gives. The hem is set by the fit class.
 * opts: { fitClass, fit, riseY, hemY (null = floor-length, resolved against the shoe), kneeGirth, thighGirth, fabric, stack }
 */
export function draftTrousers(layout, opts) {
  const k = layout.measures.height / 1.78;
  const cls = LEG_FIT_CLASSES[opts.fitClass];
  const g = bodyGirths(layout);
  const fit = opts.fit ?? 0.6;
  const ease = 0.02 + fit * 0.1; // seat ease, full girth
  const seat = Math.max(g.hip, g.seat) + ease;
  const seatQ = seat / 4;
  const frontExt = seatQ * 0.4 * 0.42;
  const backExt = seatQ * 0.4 * 0.85;
  const thigh = opts.thighGirth ?? g.thigh + 0.04 + fit * 0.12;
  const knee = opts.kneeGirth ?? g.knee + 0.04 + fit * 0.1;
  let hem;
  if (cls.cuff) hem = g.ankle * 1.12 * cls.cuff.gather; // leg fabric gathered into the rib
  else if (cls.opening) hem = Math.max(cls.opening * k + fit * 0.16 * k, g.ankle * 1.25);
  else hem = knee;
  if (opts.cut === 'skinny') hem = Math.min(hem, g.ankle * 1.4 + 0.02);
  const riseY = opts.riseY;
  const waistAtRise = ringPerimeter(sampleTorsoShaped(torsoRings(layout))(riseY)) + 0.01 + fit * 0.02;
  const waistQ = waistAtRise / 4;
  const floorHem = opts.hemY ?? cls.clearance * k;
  const inseam = g.crotchY - floorHem + (cls.excess ?? 0) * k * (opts.stack ?? 1);
  const outseam = riseY - floorHem + (cls.excess ?? 0) * k * (opts.stack ?? 1);
  const riseFront = riseY - g.crotchY;
  const riseBack = riseFront + 0.03 * k;
  const frontW = (w) => w / 2 - 0.01; // front panels are 2 cm narrower than the back across the leg
  const backW = (w) => w / 2 + 0.01;
  const kneeH = inseam - (g.crotchY - g.kneeY);
  const turn = cls.hemTurn > 0 ? HEM_TURN : 0;
  const front = {
    name: 'front',
    cut: 2,
    outline: [
      [-frontW(hem) / 2, -turn], [frontW(hem) / 2, -turn],
      [frontW(knee) / 2, kneeH],
      [frontW(thigh) / 2 + frontExt * 0.5, inseam - 0.04 * k],
      [seatQ / 2 + frontExt, inseam],
      [seatQ / 2 + frontExt * 0.35, inseam + 0.035 * k],
      [seatQ / 2 + 0.005, inseam + riseFront * 0.55],
      [waistQ - seatQ / 2 - 0.005, outseam],
      [-seatQ / 2, outseam],
      [-seatQ / 2 - 0.008, inseam + riseFront * 0.35],
      [-frontW(thigh) / 2, inseam - 0.02 * k],
      [-frontW(knee) / 2, kneeH],
    ],
    edges: { hem: [0, 1], inseam: [1, 4], cf: [4, 7], waist: [7, 8], outseam: [8, 11, 0] },
  };
  const back = {
    name: 'back',
    cut: 2,
    outline: [
      [-backW(hem) / 2, -turn], [backW(hem) / 2, -turn],
      [backW(knee) / 2, kneeH],
      [backW(thigh) / 2 + backExt * 0.45, inseam - 0.05 * k],
      [seatQ / 2 + 0.01 + backExt, inseam - 0.008],
      [seatQ / 2 + backExt * 0.4, inseam + 0.04 * k],
      [seatQ / 2 + 0.02, inseam + riseBack * 0.6],
      [waistQ - seatQ / 2 + 0.005, outseam + 0.03 * k],
      [-seatQ / 2 - 0.01, outseam],
      [-seatQ / 2 - 0.012, inseam + riseFront * 0.35],
      [-backW(thigh) / 2, inseam - 0.02 * k],
      [-backW(knee) / 2, kneeH],
    ],
    edges: { hem: [0, 1], inseam: [1, 4], cb: [4, 7], waist: [7, 8], outseam: [8, 11, 0] },
  };
  const pieces = [front, back];
  const waistGirth = 2 * (polyLength(front.outline, front.edges.waist) + polyLength(back.outline, back.edges.waist));
  pieces.push({ name: 'waistband', cut: 1, outline: [[0, 0], [waistGirth + 0.04, 0], [waistGirth + 0.04, 0.08 * k], [0, 0.08 * k]], edges: { waist: [0, 1], fold: [2, 3] } });
  const seams = [
    { a: ['front', 'outseam'], b: ['back', 'outseam'], kind: opts.fabric === 'denim' ? 'topstitched' : 'plain' },
    { a: ['front', 'inseam'], b: ['back', 'inseam'], kind: opts.fabric === 'denim' ? 'flatFelled' : 'plain', ease: 0.02 },
    { a: ['front', 'cf'], b: ['front', 'cf'], kind: 'plain', note: 'centre front with fly' },
    { a: ['back', 'cb'], b: ['back', 'cb'], kind: 'plain' },
    { a: ['waistband', 'waist'], b: ['front', 'waist', 'back', 'waist'], kind: 'plain', both: true, ease: 0.045, note: '4 cm button overlap' },
  ];
  if (cls.cuff) {
    const rib = hem / cls.cuff.gather;
    pieces.push({ name: 'cuff', cut: 2, rib: true, outline: [[0, 0], [rib, 0], [rib, cls.cuff.height * k * 2], [0, cls.cuff.height * k * 2]], edges: { join: [0, 1], fold: [2, 3] } });
    seams.push({ a: ['cuff', 'join'], b: ['front', 'hem', 'back', 'hem'], kind: 'elastic', gather: cls.cuff.gather });
  } else if (turn) {
    seams.push({ a: ['front', 'hem'], b: ['front', 'hem'], kind: 'fold', note: `turned ${(cls.hemTurn * 100).toFixed(1)} cm` });
  }
  if (opts.fabric === 'denim') {
    pieces.push({ name: 'yoke', cut: 2, outline: [[0, 0], [seatQ * 0.9, 0.035 * k], [seatQ * 0.95, 0.075 * k], [0, 0.05 * k]], edges: { back: [0, 1], waist: [2, 3] } });
    pieces.push({ name: 'backPocket', cut: 2, outline: [[0, 0.03], [0.07, 0], [0.14, 0.03], [0.14, 0.16], [0, 0.16]], edges: {} });
  }
  return {
    kind: 'trousers',
    fitClass: opts.fitClass,
    girths: { waist: waistGirth, seat, thigh, knee, hem },
    lengths: { inseam, outseam, riseFront, riseBack, floorHem },
    hemTurn: cls.hemTurn * k,
    cuff: cls.cuff ? { height: cls.cuff.height * k, gather: cls.cuff.gather, rib: hem / cls.cuff.gather } : null,
    pieces,
    seams,
  };
}

function polyLength(pts, ids) {
  let sum = 0;
  const idx = ids.length === 3 ? [...range(ids[0], ids[1]), ids[2]] : range(ids[0], ids[1]);
  for (let i = 0; i < idx.length - 1; i++) sum += Math.hypot(pts[idx[i + 1]][0] - pts[idx[i]][0], pts[idx[i + 1]][1] - pts[idx[i]][1]);
  return sum;
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export function edgeLength(draft, piece, edge) {
  const p = draft.pieces.find((x) => x.name === piece);
  return polyLength(p.outline, p.edges[edge]);
}

/**
 * Sewing check: paired edges must match within the seam's allowed ease (default 1.2 cm); elastic seams
 * must match after gathering. Returns a list of problems (empty = sews cleanly).
 */
export function validatePattern(draft) {
  const problems = [];
  for (const seam of draft.seams) {
    if (seam.kind === 'fold') continue;
    const [pa, ea] = seam.a;
    const la = edgeLength(draft, pa, ea);
    let lb = 0;
    for (let i = 0; i < seam.b.length; i += 2) lb += edgeLength(draft, seam.b[i], seam.b[i + 1]);
    if (seam.both) lb *= 2;
    if (seam.a[0] === seam.b[0] && seam.a[1] === seam.b[1]) continue; // a piece sewn to its mirror
    const target = seam.kind === 'elastic' ? la * seam.gather : la;
    const tol = seam.ease ?? 0.012;
    if (Math.abs(target - lb) > tol * Math.max(1, lb / 0.5)) problems.push(`${pa}.${ea} (${(target * 100).toFixed(1)} cm) vs ${seam.b.join('.')} (${(lb * 100).toFixed(1)} cm)`);
  }
  return problems;
}

/** Pattern sheet: every piece laid out flat with seam allowance, grain line and edge labels. */
export function patternSVG(draft, { scale = 600, title = '' } = {}) {
  let x0 = 20;
  const parts = [];
  let maxH = 0;
  for (const piece of draft.pieces) {
    const xs = piece.outline.map((p) => p[0]);
    const ys = piece.outline.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = (maxX - minX) * scale;
    const h = (maxY - minY) * scale;
    maxH = Math.max(maxH, h);
    const pt = (p) => `${(x0 + (p[0] - minX) * scale).toFixed(1)},${(40 + (maxY - p[1]) * scale).toFixed(1)}`;
    parts.push(`<polygon points="${piece.outline.map(pt).join(' ')}" fill="#f4efe2" stroke="#222" stroke-width="1.5"/>`);
    parts.push(`<polygon points="${piece.outline.map(pt).join(' ')}" fill="none" stroke="#999" stroke-width="${SEAM * scale * 2}" stroke-opacity="0.18" stroke-linejoin="round"/>`);
    const cx = x0 + (0 - minX) * scale;
    if (minX < 0) parts.push(`<line x1="${cx}" y1="${40 + h * 0.15}" x2="${cx}" y2="${40 + h * 0.85}" stroke="#a33" stroke-dasharray="6 4"/>`);
    for (const [edge, ids] of Object.entries(piece.edges)) {
      const a = piece.outline[ids[0]];
      const b = piece.outline[ids.length === 3 ? ids[1] : ids[1]];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const [mx, my] = pt(mid).split(',');
      parts.push(`<text x="${mx}" y="${my}" font-size="10" fill="#335">${edge} ${(edgeLength(draft, piece.name, edge) * 100).toFixed(0)}</text>`);
    }
    parts.push(`<text x="${x0}" y="30" font-size="13" font-weight="bold">${piece.name} ×${piece.cut}${piece.rib ? ' (rib)' : ''}</text>`);
    x0 += w + 40;
  }
  const W = x0;
  const H = maxH + 110;
  const g = draft.girths;
  const info = `${title} ${draft.fitClass}: waist ${(g.waist * 100).toFixed(0)} seat ${(g.seat * 100).toFixed(0)} thigh ${(g.thigh * 100).toFixed(0)} knee ${(g.knee * 100).toFixed(0)} hem ${(g.hem * 100).toFixed(0)} cm · inseam ${(draft.lengths.inseam * 100).toFixed(0)} cm`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}<text x="20" y="${H - 14}" font-size="12">${info}</text></svg>`;
}
