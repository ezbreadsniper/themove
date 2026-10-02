import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder, V, frameFor, ringRadius } from '../mesh-builder.js';
import { torsoRings, torsoWeights, legStations, legCenter, SIDES } from './body.js';
import { topBodyRings, loftTop, bodySurface, clearPants, sampleTorsoShaped, GARMENT_UV } from './garments.js';
import { legCollider } from '../../garment/colliders.js';

const X = V(1, 0, 0);
const Z = V(0, 0, 1);

/**
 * Strappy tops. tube: strapless band across the bust; cami: straight neckline above the bust on
 * spaghetti straps; tank: higher scoop neckline on wide straps. All are built from the same
 * body-fitted rings as tees, cut off at the neckline, so they follow the bust and waist.
 */
export const STRAP_TOPS = {
  tube: { neckline: 0.035, strap: 0 },
  cami: { neckline: 0.05, strap: 0.007 },
  tank: { neckline: 0.085, strap: 0.02 },
};

function surfacePoint(ring, x, front, out) {
  const rz = front ? ring.rzF : ring.rzB;
  const t = Math.min(0.98, Math.abs(x) / ring.rx);
  const z = Math.sqrt(1 - t ** 2.2) * rz;
  return V(x, ring.y, ring.cz + (front ? z + out : -z - out));
}

export function buildStrapTop(layout, style, { overPants = null } = {}) {
  const mb = new MeshBuilder('top');
  const m = layout.measures;
  const k = m.height / 1.78;
  const spec = STRAP_TOPS[style.type];
  const fit = style.fit ?? 0.2;
  const hemY = m.hipsY - (style.length ?? 0.04) * k;
  const table = torsoRings(layout);
  const by = Object.fromEntries(table.map((r) => [r.key, r]));
  const necklineY = by.chest.y + spec.neckline * k;
  const all = topBodyRings(layout, { fit, hemY, sleeveless: true }).filter((r) => !r.collar && r.y < necklineY - 0.004);
  const torsoAt = sampleTorsoShaped(table);
  const edge = torsoAt(necklineY);
  const ease = 0.005 + fit * 0.02;
  all.push({ key: 'neckline', y: necklineY, rx: edge.rx * 0.97 + ease, rzF: edge.rzF + ease, rzB: edge.rzB + ease, cz: edge.cz, n: 2.2, shape: edge.shape });
  if (overPants) clearPants(layout, all, overPants);
  loftTop(mb, layout, all, GARMENT_UV.top.body, { sides: 20, legPull: overPants && typeof overPants === 'object' ? 0 : 1 });
  if (spec.strap > 0) {
    for (const [, s] of SIDES) buildStrap(mb, layout, { x: s * by.chest.rx * 0.5, width: spec.strap * k, from: all[all.length - 1], by });
  }
  return { mb, surface: bodySurface(all), hemY, necklineY };
}

/** Strap from the front neckline, over the shoulder and down to the back neckline. */
function buildStrap(mb, layout, { x, width, from, by }) {
  const lift = 0.004;
  const path = [
    surfacePoint(from, x, true, lift),
    surfacePoint(by.upperChest, x * 1.04, true, lift + 0.002),
    surfacePoint({ ...by.shoulderTop, rzF: by.shoulderTop.rzF + 0.012 }, x * 1.08, true, lift),
    V(x * 1.1, by.shoulderTop.y + 0.012, by.shoulderTop.cz),
    surfacePoint({ ...by.shoulderTop, rzB: by.shoulderTop.rzB + 0.012 }, x * 1.08, false, lift),
    surfacePoint(by.upperChest, x * 1.04, false, lift + 0.002),
    surfacePoint(from, x, false, lift),
  ];
  const rings = path.map((p, i) => {
    const next = path[Math.min(i + 1, path.length - 1)];
    const prev = path[Math.max(i - 1, 0)];
    const f = frameFor(next.clone().sub(prev), V(x > 0 ? 1 : -1, 0, 0));
    return { c: p, x: f.x, z: f.z, rx: 0.0016, rzF: width / 2, rzB: width / 2, n: 2, v: 0.97, w: torsoWeights(layout, Math.min(p.y, layout.measures.shoulderY))(0, p) };
  });
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 4, uv: GARMENT_UV.top.collar });
}

/**
 * Skirts. pencil hugs the hips and legs; aLine flares evenly; flared swings out more; pleated is an
 * A-line with knife pleats in the silhouette. Lower rings follow the legs through hip weights so
 * the hem moves when she walks.
 */
export const SKIRT_STYLES = { pencil: 0.022, aLine: 0.09, flared: 0.17, pleated: 0.1 };

export function buildSkirt(layout, style, { riseY, ease, overHemY = null }) {
  const mb = new MeshBuilder('bottom');
  const m = layout.measures;
  const k = m.height / 1.78;
  const table = torsoRings(layout);
  const by = Object.fromEntries(table.map((r) => [r.key, r]));
  const torsoAt = sampleTorsoShaped(table);
  const hipJointY = layout.world.LeftUpLeg.y;
  // Fit rule: a pencil skirt is a narrow straight tube, so it stops at mid-calf (0.85). Anything longer
  // is a column that cannot be walked in without a thigh-high slit.
  const maxLength = style.skirtStyle === 'pencil' ? 0.85 : 0.95;
  const hemY = Math.max(m.ankleY + 0.06, hipJointY - Math.min(maxLength, style.skirtLength ?? 0.32) * (hipJointY - m.ankleY));
  const flare = SKIRT_STYLES[style.skirtStyle ?? 'aLine'] ?? 0.09;
  const pleats = style.skirtStyle === 'pleated';
  const legOuter = (y) => {
    const st = legStations(layout, 'Left');
    const c = legCenter(layout, 'Left', Math.min(y, st[0].y));
    const r = st.reduce((best, s) => (Math.abs(s.y - y) < Math.abs(best.y - y) ? s : best)).r;
    return { x: c.x + r * 1.02, z: r * 1.15 };
  };
  const seat = torsoAt(by.seat.y);
  const ys = [riseY - 0.016, riseY];
  const steps = 6;
  for (let i = 0; i <= steps; i++) ys.push(Math.min(riseY - 0.03, by.hips.y + 0.01) + (hemY - Math.min(riseY - 0.03, by.hips.y + 0.01)) * (i / steps));
  const rows = ys.map((y, i) => {
    if (y > by.hips.y) {
      const t = torsoAt(y);
      const add = i === 0 ? 0.002 : ease * 0.5;
      return { y, rx: t.rx + add, rzF: t.rzF + add, rzB: t.rzB + add, cz: t.cz, shape: t.shape, lip: i === 0 };
    }
    const drop = (by.hips.y - y) / Math.max(0.05, by.hips.y - hemY);
    const leg = legOuter(y);
    const minRx = Math.max(leg.x + 0.008, seat.rx * 0.9);
    const rx = Math.max(minRx, by.hips.rx + ease * 0.5 - 0.004 * drop) + flare * drop * k;
    const rzF = Math.max(by.hips.rzF, leg.z) + ease * 0.5 + flare * 0.7 * drop * k;
    const rzB = Math.max(by.hips.rzB * 1.05, leg.z) + ease * 0.5 + flare * 0.7 * drop * k;
    const fade = Math.max(0, 1 - drop * 0.9) ** 1.5;
    return { y, rx, rzF, rzB, cz: by.hips.cz, shape: (th, c, s2) => 1 + (seat.shape(th, c, s2) - 1) * fade, drop };
  });
  const legs = SIDES.map(([side]) => legCollider(layout, side, { maxY: layout.world[`${side}UpLeg`].y - 0.03 }));
  const clearLegs = (theta, p) => {
    const q = p.clone();
    for (let pass = 0; pass < 2; pass++) {
      for (const leg of legs) {
        const res = leg.resolve(q, 0.012);
        if (res) q.add(res.push);
      }
    }
    return q.sub(p);
  };
  const rings = rows.map((r, i) => ({
    c: V(0, r.y, r.cz),
    x: X,
    z: Z,
    rx: r.rx,
    rzF: r.rzF,
    rzB: r.rzB,
    n: 2.2,
    shape: pleats && r.drop > 0.1 ? (theta, c, s2) => r.shape(theta, c, s2) + 0.035 * r.drop * Math.abs(Math.sin(theta * 9)) : r.shape,
    v: i < 2 ? 0.99 - i * 0.01 : 0.04 + 0.72 * (1 - (i - 2) / (rows.length - 3)),
    w: skirtWeights(layout, r.y, r.drop ?? 0, hemY, overHemY),
    // Construction-time collision: the panel is pushed clear of the legs (knee caps, calves), the
    // same leg volume the corrective shapes use, so a narrow skirt never starts inside the body.
    offset: r.drop > 0 ? clearLegs : undefined,
  }));
  rings.reverse();
  const sides = pleats ? 36 : 22;
  // Long pencil skirts get a centre-back vent from the hem to just above the knee, as real ones do
  // (you cannot walk or sit in a closed tube that narrow): the lower panel is lofted open at the back.
  const ventTop = style.skirtStyle === 'pencil' && hemY < m.kneeY - 0.02 ? m.kneeY + 0.06 * k : null;
  if (ventTop === null) mb.loft(rings, { sides, uv: [0, 0, 1, 1] });
  else {
    const upper = rings.filter((r) => r.c.y >= ventTop);
    const lower = rings.filter((r) => r.c.y < ventTop);
    const split = { ...lower[lower.length - 1], c: lower[lower.length - 1].c.clone().setY(ventTop), v: upper[0].v };
    mb.loft([split, ...upper], { sides, uv: [0, 0, 1, 1] });
    mb.loft([...lower, split], { sides, uv: [0, 0, 1, 1], arc: [0.035, 0.965] });
  }
  return { mb, hemY, riseY, ease, surface: bodySurface(rows.map((r) => ({ ...r, n: 2.2 }))) };
}

/**
 * Skirt skinning. The waistband and hip yoke ride the pelvis. Below the seat the front panel is carried
 * by the thighs (it lies on them when she sits or crouches), while the back panel mostly hangs from
 * the pelvis. Fabric between the legs splits its thigh share between both legs so the centre front
 * stretches across a stride instead of tearing to one side.
 */
function skirtWeights(layout, y, drop, hemY, overHemY) {
  const torso = torsoWeights(layout, Math.max(y, layout.world.LeftUpLeg.y));
  const kneeY = layout.measures.kneeY;
  const hipJointY = layout.world.LeftUpLeg.y;
  // Below the knee the fabric drapes off the knee and follows the shin.
  // Only skirts that reach well past the knee drape off it; a hem near the knee rides up with the thigh.
  const reach = Math.max(0, Math.min(1, (kneeY - hemY - 0.08) / 0.12));
  const shin = reach * Math.min(0.8, Math.max(0, (kneeY + 0.02 - y) / 0.17)) ** 1.2;
  return (theta, p) => {
    const base = torso(theta, p);
    const front = Math.max(0, Math.cos(theta));
    // Under the hip joint the panel lies on the thigh almost at once (front fully, sides and back less).
    // An untucked top's hem lies over the skirt; the skirt only starts following the thighs under it.
    const startY = overHemY !== null ? Math.min(hipJointY + 0.03, overHemY - 0.03) : hipJointY + 0.03;
    const below = Math.max(0, Math.min(1, (startY - y) / 0.12));
    const ramp = below * below * (3 - 2 * below);
    const share = Math.min(0.96, ramp * (0.25 + 0.71 * Math.sqrt(front)));
    const toLeft = Math.max(0, Math.min(1, 0.5 + p.x / 0.12));
    const legs = [];
    for (const [side, w] of [['Left', toLeft], ['Right', 1 - toLeft]]) {
      legs.push([J[`${side}UpLeg`], share * w * (1 - shin)], [J[`${side}Leg`], share * w * shin]);
    }
    return [...base.map(([b, w]) => [b, w * (1 - share)]), ...legs];
  };
}
