import { MeshBuilder, V, frameFor } from '../mesh-builder.js';
import { torsoRings, torsoWeights, SIDES } from './body.js';
import { topBodyRings, loftTop, buildSleeve, armholeFor, buildFoldCollar, clearPants, bodySurface, GARMENT_UV } from './garments.js';

/**
 * Outer layers worn over the top: long-sleeve jackets (track, bomber, denim) and pullover / zip hoodies.
 * Built on the same body-fitted rings as tops with extra ease so they always sit outside the shirt.
 * style: { type, fit, length, open, hood }
 */
export const OUTER_TYPES = ['vest', 'hoodie', 'zipHoodie', 'track', 'bomber', 'denimJacket', 'puffer'];

const LENGTH = { hoodie: 0.06, zipHoodie: 0.06, track: 0.04, bomber: -0.01, denimJacket: 0.0, puffer: 0.02 };
const BAFFLE_PUFF = 0.011;
const BAFFLE_PINCH = 0.004;

export function buildJacket(layout, style, { underFit = 0.3, overPants = null, underHemY = null } = {}) {
  const mb = new MeshBuilder('outer');
  const m = layout.measures;
  const k = m.height / 1.78;
  const fit = style.fit ?? 0.5;
  const wanted = m.hipsY - (style.length ?? LENGTH[style.type] ?? 0.03) * k;
  const hemY = underHemY !== null ? Math.min(wanted, underHemY - 0.012) : wanted;
  const over = 0.016 + fit * 0.02;
  const rows = topBodyRings(layout, { fit: Math.max(underFit, fit * 0.6), hemY, neckScale: style.type === 'bomber' ? 1.25 : 1.45, collarGap: 0.02, over });
  if (overPants !== null) clearPants(layout, rows, typeof overPants === 'object' ? { ...overPants, gap: overPants.gap * 2 } : overPants + 0.15);
  const body = style.type === 'hoodie' ? rows : rows.filter((r) => !r.collar || r.neckBase);
  const open = style.open && style.type !== 'hoodie';
  const gap = open ? 0.06 : 0;
  const legPull = overPants && typeof overPants === 'object' ? 0 : 1;
  if (open) loftTop(mb, layout, body, GARMENT_UV.top.body, { arc: [gap, 1 - gap], uOffset: 0.5, sides: 16, legPull });
  else loftTop(mb, layout, body, GARMENT_UV.top.body, { sides: 14, legPull });
  const endFrac = (m.upperArm + m.foreArm * 0.97) / m.upperArm;
  for (const [side] of SIDES) {
    buildSleeve(mb, layout, side, { endFrac, fit: Math.min(1, Math.max(underFit, fit) + 0.2), armhole: armholeFor(rows, side), bodyRows: rows, cuff: 0.008, uvRect: GARMENT_UV.top[side === 'Left' ? 'sleeveL' : 'sleeveR'] });
  }
  if (style.type === 'denimJacket') buildFoldCollar(mb, layout, { neckScale: 1.4, arc: open ? [gap * 0.8, 1 - gap * 0.8] : [0.06, 0.94], height: 0.022, flare: 0.016, inflate: 0.016, frontDrop: 0.03 });
  if (style.type === 'track' || style.type === 'bomber') buildStandCollar(mb, layout, { open, height: style.type === 'track' ? 0.035 : 0.022 });
  if ((style.type === 'hoodie' || style.type === 'zipHoodie') && style.hood !== false) buildHood(mb, layout, k);
  return { mb, coversArmToS: m.upperArm * endFrac - 0.02, hemY };
}

/**
 * Quilted sleeveless puffer: inflated body whose rows alternate pinched stitch lines and puffed
 * baffles (so the quilting shows in the silhouette, not only the texture), plus a padded funnel collar.
 */
export function buildPuffer(layout, style, { underFit = 0.3, overPants = null, underHemY = null } = {}) {
  const mb = new MeshBuilder('outer');
  const m = layout.measures;
  const k = m.height / 1.78;
  const wanted = m.hipsY - (style.length ?? LENGTH.puffer) * k;
  const hemY = underHemY !== null ? Math.min(wanted, underHemY - 0.012) : wanted;
  const over = 0.03 + (style.fit ?? 0.5) * 0.015;
  const base = topBodyRings(layout, { fit: Math.max(underFit, 0.35), hemY, neckScale: 1.5, collarGap: 0.024, over, sleeveless: true });
  if (overPants !== null) clearPants(layout, base, typeof overPants === 'object' ? { ...overPants, gap: overPants.gap * 2.5 } : overPants + 0.15);
  const body = quilt(base.filter((r) => !r.collar || r.neckBase), m.shoulderY - 0.07 * k);
  loftTop(mb, layout, body, GARMENT_UV.top.body, { sides: 16, legPull: overPants && typeof overPants === 'object' ? 0 : 1 });
  buildStandCollar(mb, layout, { open: false, height: 0.06 * k, base: m.neckRadius * 1.55 + 0.026, puff: 0.006 });
  return { mb, coversArmToS: null, hemY, surface: bodySurface(base) };
}

function quilt(rows, topY) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const quilted = !r.collar && r.y < topY;
    out.push(quilted && !r.hem ? inflateRow(r, -BAFFLE_PINCH) : r);
    const next = rows[i + 1];
    if (!next || next.collar || next.y >= topY + 0.04 || !quilted) continue;
    out.push(inflateRow(lerpRow(r, next, 0.5), BAFFLE_PUFF));
  }
  return out;
}

function lerpRow(a, b, t) {
  const l = (key) => a[key] + (b[key] - a[key]) * t;
  return { ...a, key: undefined, hem: false, y: l('y'), rx: l('rx'), rzF: l('rzF'), rzB: l('rzB'), cz: l('cz') };
}

function inflateRow(r, d) {
  return { ...r, rx: r.rx + d, rzF: r.rzF + d, rzB: r.rzB + d };
}

/** Ribbed stand-up collar (track jacket / bomber), or a padded funnel neck when `puff` is set. */
function buildStandCollar(mb, layout, { open, height, base: baseR = null, puff = 0 }) {
  const m = layout.measures;
  const tr = torsoRings(layout).find((r) => r.key === 'trapezius');
  const base = baseR ?? m.neckRadius * 1.25 + 0.012;
  const rings = [0, 1, 2].map((i) => ({
    c: V(0, tr.y + 0.006 + (i === 2 ? height * 0.92 : (height * i) / 2), tr.cz),
    x: V(1, 0, 0),
    z: V(0, 0, 1),
    rx: base * (i === 2 ? 0.93 : 1) * 1.08 + (i === 1 ? puff : 0),
    rzF: base * (i === 2 ? 0.93 : 1) + (i === 1 ? puff : 0),
    rzB: base * (i === 2 ? 0.95 : 1) * 1.04 + (i === 1 ? puff : 0),
    n: 2.1,
    v: 0.965 + i * 0.015,
    w: torsoWeights(layout, Math.min(tr.y + height, m.neckY)),
  }));
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 14, uv: GARMENT_UV.top.collar, arc: open ? [0.07, 0.93] : [0, 1], uOffset: open ? 0.5 : 0 });
}

/**
 * Lowered hood: a thick fold of fabric draped around the back of the neck and onto the shoulders,
 * built as a loft along an arc behind the neck.
 */
function buildHood(mb, layout, k) {
  const m = layout.measures;
  const tr = torsoRings(layout).find((r) => r.key === 'trapezius');
  const st = torsoRings(layout).find((r) => r.key === 'shoulderTop');
  const steps = 9;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI * (0.38 + (1.24 * i) / steps);
    const back = -Math.cos(a);
    const rx = tr.rx * 1.35;
    const rz = tr.rzB * 1.5;
    pts.push(V(Math.sin(a) * rx, tr.y + 0.012 * k + back * 0.035 * k, tr.cz + Math.cos(a) * rz - back * 0.02 * k));
  }
  const rings = pts.map((p, i) => {
    const next = pts[Math.min(i + 1, pts.length - 1)];
    const prev = pts[Math.max(i - 1, 0)];
    const f = frameFor(next.clone().sub(prev), V(0, 1, 0));
    const t = i / steps;
    const thick = (0.022 + 0.022 * Math.sin(Math.PI * t)) * k;
    return { c: p, x: f.x, z: f.z, rx: thick * 1.5, rzF: thick, rzB: thick, n: 2.2, v: t, w: torsoWeights(layout, Math.min(p.y, st.y))(0, p) };
  });
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 8, uv: [0, 0.94, 1, 1], capStart: 0.004 * k, capEnd: 0.004 * k });

}
