import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder, frameFor, V } from '../mesh-builder.js';
import { SIDES, legStations, legCenter, FOOT_SCALE } from './body.js';

export const SHOE_UV = { upper: [0, 0.3, 1, 0.82], collar: [0, 0.82, 1, 1], sole: [0, 0, 1, 0.3] };

/**
 * Shoe = sole slab (outline [z, halfWidth] heel→toe, metres at 1.78 m, z from the ankle joint)
 * + foot box (flat-bottomed D sections: heel counter → instep peak → toe)
 * + ankle collar tube that follows the leg (low for sneakers, tall for hi-tops/boots).
 */
const OUTLINE = {
  sneaker: [[-0.08, 0.032], [-0.07, 0.045], [-0.04, 0.05], [0.02, 0.052], [0.09, 0.058], [0.15, 0.06], [0.2, 0.053], [0.235, 0.036], [0.247, 0.016]],
  chunky: [[-0.086, 0.036], [-0.075, 0.05], [-0.04, 0.055], [0.02, 0.058], [0.09, 0.064], [0.15, 0.066], [0.205, 0.058], [0.242, 0.04], [0.256, 0.018]],
  dress: [[-0.076, 0.03], [-0.066, 0.041], [-0.035, 0.045], [0.02, 0.047], [0.09, 0.051], [0.15, 0.05], [0.2, 0.039], [0.237, 0.021], [0.253, 0.006]],
};

const SHOES = {
  canvasLow: {
    outline: OUTLINE.sneaker,
    sole: { h: 0.02, toeSpring: 0.007 },
    box: { heelH: 0.05, instepH: 0.068, toeH: 0.032, ramp: 0.012, toeRound: 0.012 },
    collar: { height: 0.058, pad: 0.008, flare: 0.004 },
    coversFoot: true,
  },
  slipOn: {
    outline: OUTLINE.sneaker,
    sole: { h: 0.022, toeSpring: 0.006 },
    box: { heelH: 0.046, instepH: 0.062, toeH: 0.03 },
    collar: { height: 0.05, pad: 0.006 },
    coversFoot: true,
  },
  hiTopChunky: {
    outline: OUTLINE.chunky,
    sole: { h: 0.032, toeSpring: 0.01 },
    box: { heelH: 0.058, instepH: 0.074, toeH: 0.034 },
    collar: { height: 0.14, pad: 0.013, lip: 0.006 },
    coversFoot: true,
  },
  chunkyBoot: {
    outline: OUTLINE.chunky.map(([z, w]) => [z, w + 0.004]),
    sole: { h: 0.045, toeSpring: 0.012 },
    box: { heelH: 0.072, instepH: 0.084, toeH: 0.044, ramp: 0.05, toeRound: 0.02 },
    collar: { height: 0.165, pad: 0.014, lip: 0.005, flare: 0.008, taper: 0.01, lean: 0.01, instep: 0.07 },
    coversFoot: true,
  },
  dress: {
    outline: OUTLINE.dress,
    sole: { h: 0.011, toeSpring: 0.004, heel: 0.022 },
    box: { heelH: 0.046, instepH: 0.06, toeH: 0.022 },
    collar: { height: 0.05, pad: 0.004 },
    coversFoot: true,
    shiny: true,
  },
  canvasHi: {
    outline: OUTLINE.sneaker,
    sole: { h: 0.022, toeSpring: 0.007 },
    box: { heelH: 0.05, instepH: 0.068, toeH: 0.03 },
    collar: { height: 0.13, pad: 0.006, lip: 0.004 },
    coversFoot: true,
  },
  runner: {
    outline: OUTLINE.sneaker.map(([z, w]) => [z, w - 0.003]),
    sole: { h: 0.032, toeSpring: 0.016 },
    box: { heelH: 0.05, instepH: 0.064, toeH: 0.028 },
    collar: { height: 0.062, pad: 0.011 },
    coversFoot: true,
  },
  skate: {
    outline: OUTLINE.chunky,
    sole: { h: 0.026, toeSpring: 0.006 },
    box: { heelH: 0.056, instepH: 0.078, toeH: 0.034 },
    collar: { height: 0.07, pad: 0.018 },
    coversFoot: true,
  },
  basketball: {
    outline: OUTLINE.chunky,
    sole: { h: 0.03, toeSpring: 0.01 },
    box: { heelH: 0.06, instepH: 0.076, toeH: 0.034 },
    collar: { height: 0.125, pad: 0.017, lip: 0.006 },
    coversFoot: true,
  },
  workBoot: {
    outline: [[-0.088, 0.04], [-0.078, 0.054], [-0.045, 0.058], [0.02, 0.058], [0.09, 0.066], [0.15, 0.07], [0.2, 0.066], [0.238, 0.05], [0.26, 0.024]],
    sole: { h: 0.042, toeSpring: 0.012, heel: 0.01, lugs: true },
    box: { heelH: 0.074, instepH: 0.084, toeH: 0.056, ramp: 0.055, toeRound: 0.026 },
    collar: { height: 0.152, pad: 0.016, lip: 0.012, flare: 0.016, taper: 0.012, lean: 0.014, roll: true, instep: 0.075 },
    coversFoot: true,
  },
  loafer: {
    outline: OUTLINE.dress,
    sole: { h: 0.012, toeSpring: 0.004, heel: 0.012 },
    box: { heelH: 0.04, instepH: 0.058, toeH: 0.024 },
    collar: { height: 0.038, pad: 0.004 },
    coversFoot: true,
    shiny: true,
  },
  slide: {
    sandal: {
      outline: [[-0.07, 0.026], [-0.054, 0.034], [-0.02, 0.036], [0.03, 0.038], [0.08, 0.047], [0.125, 0.052], [0.17, 0.05], [0.2, 0.042], [0.222, 0.026]],
      straps: [[0.07, 0.075]],
    },
    sole: { h: 0.028 },
    coversFoot: false,
    footLift: 0.026,
    doubleSide: true,
  },
  clog: {
    outline: OUTLINE.sneaker,
    sole: { h: 0.03, toeSpring: 0.005 },
    box: { heelH: 0.032, instepH: 0.06, toeH: 0.036, from: 0.0 },
    strap: true,
    coversFoot: false,
  },
  sandal: {
    sandal: {
      outline: [[-0.068, 0.024], [-0.052, 0.032], [-0.02, 0.034], [0.03, 0.036], [0.08, 0.045], [0.125, 0.05], [0.17, 0.048], [0.2, 0.04], [0.218, 0.024]],
      straps: [[0.042, 0.03], [0.108, 0.034]],
    },
    sole: { h: 0.026 },
    coversFoot: false,
    footLift: 0.024,
    doubleSide: true,
  },
};

export const SHOE_TYPES = [...Object.keys(SHOES), 'barefoot'];

export function shoeFootLift(type) {
  return SHOES[type]?.footLift ?? 0;
}

export function shoeDoubleSided(type) {
  return !!SHOES[type]?.doubleSide;
}

export function shoeIsShiny(type) {
  return !!SHOES[type]?.shiny;
}

export function shoeCoversFoot(type) {
  return SHOES[type]?.coversFoot ?? false;
}

function footWeights(side, z) {
  const Ft = J[`${side}Foot`];
  const Toe = J[`${side}ToeBase`];
  const t = Math.max(0, Math.min(1, (z - 0.09) / 0.07));
  return [[Ft, 1 - t], [Toe, t]];
}

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Interpolated outline half-width at z. */
function widthAt(outline, z) {
  if (z <= outline[0][0]) return outline[0][1];
  for (let i = 0; i < outline.length - 1; i++) {
    const [za, wa] = outline[i];
    const [zb, wb] = outline[i + 1];
    if (z <= zb) return wa + (wb - wa) * ((z - za) / (zb - za));
  }
  return outline[outline.length - 1][1];
}

/** Bare-foot cross-section (matches body.js buildFoot) used to wrap sandal straps over the toes. */
const FOOT_SECTIONS = [[0.03, 0.036, 0.034, 0.042], [0.11, 0.044, 0.018, 0.022], [0.165, 0.042, 0.012, 0.015]];

function footSection(z) {
  let a = FOOT_SECTIONS[0];
  let b = FOOT_SECTIONS[FOOT_SECTIONS.length - 1];
  for (let i = 0; i < FOOT_SECTIONS.length - 1; i++) {
    if (z >= FOOT_SECTIONS[i][0] && z <= FOOT_SECTIONS[i + 1][0]) {
      a = FOOT_SECTIONS[i];
      b = FOOT_SECTIONS[i + 1];
    }
  }
  const t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  return { rx: a[1] + (b[1] - a[1]) * t, top: a[2] + (b[2] - a[2]) * t, y: a[3] + (b[3] - a[3]) * t };
}

/** Two-strap cork footbed sandal: contoured sole, wide leather straps, side buckles. */
function buildSandal(mb, spec, side, ankle, sc, f) {
  const s = side === 'Left' ? 1 : -1;
  const toX = (z) => ankle.x + (z > 0.08 ? s * (z - 0.08) * 0.1 : 0);
  const h = spec.sole.h;
  const outline = spec.sandal.outline;
  const sole = outline.map(([z, w], i) => {
    const edge = i === 0 || i === outline.length - 1;
    return {
      c: V(toX(z), (h / 2) * sc, ankle.z + z * sc),
      x: f.x,
      z: f.z,
      rx: w * sc,
      rzF: (h / 2) * sc * (edge ? 0.85 : 1),
      rzB: (h / 2) * sc * (edge ? 0.85 : 1),
      n: 4.5,
      v: i / (outline.length - 1),
      w: footWeights(side, z),
    };
  });
  mb.newSmoothingGroup();
  mb.loft(sole, { sides: 12, uv: SHOE_UV.sole, capStart: 0.002 * sc, capEnd: 0.002 * sc });
  for (const [z, width] of spec.sandal.straps) {
    const sec = footSection(z);
    const rings = [-0.5, 0.5].map((o, i) => ({
      c: V(toX(z), (sec.y + spec.footLift) * sc, ankle.z + (z + o * width) * sc),
      x: f.x,
      z: f.z,
      rx: (sec.rx + 0.005) * sc,
      rzF: (sec.top + 0.005) * sc,
      rzB: (sec.y - 0.004) * sc,
      n: 2.6,
      v: i,
      w: footWeights(side, z),
    }));
    mb.newSmoothingGroup();
    mb.loft(rings, { sides: 12, uv: SHOE_UV.upper, arc: [0.17, 0.83] });
    const buckle = V(toX(z) + s * (sec.rx + 0.007) * sc, (h + sec.top * 0.9) * sc, ankle.z + z * sc);
    mb.box(buckle, [0.004 * sc, 0.016 * sc, 0.02 * sc], [0.9, 0.92, 1, 1], footWeights(side, z));
  }
}

function buildShoe(mb, layout, spec, side, sc, f) {
  const ankle = layout.world[`${side}Foot`];
  const s = side === 'Left' ? 1 : -1;
  const toX = (z) => ankle.x + (z > 0.1 ? s * (z - 0.1) * 0.08 : 0);
  const { outline } = spec;
  const heelLift = (z) => (spec.sole.heel ?? 0) * (1 - smooth(-0.005, 0.03, z));
  const spring = (z) => spec.sole.toeSpring * smooth(0.15, outline[outline.length - 1][0], z);
  const soleTop = (z) => spec.sole.h + heelLift(z) + spring(z);

  const soleRings = outline.map(([z, w], i) => {
    const h = spec.sole.h + heelLift(z);
    return {
      c: V(toX(z), h / 2 + spring(z), ankle.z + z * sc),
      x: f.x,
      z: f.z,
      rx: (w + (spec.sole.lugs && i % 2 ? 0.003 : 0)) * sc,
      rzF: (h / 2) * sc,
      rzB: (h / 2) * sc,
      n: 5,
      v: i / (outline.length - 1),
      w: footWeights(side, z),
    };
  });
  soleRings.forEach((r) => { r.c.y *= sc; });
  mb.newSmoothingGroup();
  mb.loft(soleRings, { sides: 12, uv: SHOE_UV.sole, capStart: 0.001 * sc, capEnd: 0.001 * sc });

  const b = spec.box;
  const zFrom = b.from ?? outline[0][0] + 0.006;
  const zTo = outline[outline.length - 1][0] - 0.008;
  const heightAt = (z) => {
    const ramp = (b.ramp ?? 0) * (1 - smooth(-0.01, 0.11, z)) * smooth(-0.05, 0.0, z);
    const round = (b.toeRound ?? 0) * smooth(zTo - 0.06, zTo - 0.02, z) * (1 - smooth(zTo - 0.02, zTo, z));
    if (z <= 0) return b.heelH + ramp;
    if (z <= 0.045) return b.heelH + (b.instepH - b.heelH) * smooth(0, 0.045, z) + ramp;
    return b.instepH + (b.toeH - b.instepH) * smooth(0.045, zTo, z) + ramp + round;
  };
  const stations = [zFrom, zFrom + 0.012, -0.03, 0.0, 0.045, 0.1, 0.16, 0.2, zTo - 0.012, zTo].filter((z, i, a) => z >= zFrom && (i === 0 || z > a[i - 1]));
  const boxRings = stations.map((z, i) => {
    const edge = i === 0 || i === stations.length - 1;
    const w = widthAt(outline, z) - 0.004;
    return {
      c: V(toX(z), (soleTop(z) - 0.002) * sc, ankle.z + z * sc),
      x: f.x,
      z: f.z,
      rx: w * sc * (edge ? 0.7 : 1),
      rzF: heightAt(z) * sc * (edge ? 0.75 : 1),
      rzB: 0.003 * sc,
      n: 2.3,
      v: (z - zFrom) / (zTo - zFrom),
      w: footWeights(side, z),
    };
  });
  mb.newSmoothingGroup();
  mb.loft(boxRings, { sides: 12, uv: SHOE_UV.upper, capStart: 0.003 * sc, capEnd: 0.004 * sc });

  if (spec.collar) buildCollar(mb, layout, spec, side, sc, soleTop(0));
  if (spec.strap) buildClogStrap(mb, side, ankle, sc, f);
}

/** Ankle collar: a padded tube around the leg from the heel counter to the collar height, open on top. */
function buildCollar(mb, layout, spec, side, sc, baseY) {
  const c = spec.collar;
  const m = layout.measures;
  const stations = legStations(layout, side);
  const sorted = [...stations].sort((a, b) => a.y - b.y);
  const legR = (y) => {
    if (y <= sorted[0].y) return sorted[0].r;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (y <= sorted[i + 1].y) return sorted[i].r + (sorted[i + 1].r - sorted[i].r) * ((y - sorted[i].y) / (sorted[i + 1].y - sorted[i].y));
    }
    return sorted[sorted.length - 1].r;
  };
  const Ft = J[`${side}Foot`];
  const L = J[`${side}Leg`];
  const y0 = (baseY + spec.box.heelH * 0.5) * sc;
  const y1 = (baseY + c.height) * sc;
  const y0Boot = c.instep ? (baseY + 0.01) * sc : y0;
  const ys = c.instep ? [y0Boot, y0Boot + (y1 - y0Boot) * 0.22, y0Boot + (y1 - y0Boot) * 0.5, ...(c.roll ? [y1 - c.lip * sc, y1 - c.lip * sc * 0.35, y1] : [y1 - (c.lip ?? 0.004) * sc, y1])] : c.roll ? [y0, (y0 + y1) / 2, y1 - (c.lip ?? 0.004) * sc, y1 - (c.lip ?? 0.004) * sc * 0.35, y1] : [y0, (y0 + y1) / 2, y1 - (c.lip ?? 0.004) * sc, y1];
  const fr = frameFor(V(0, 1, 0), V(0, 0, 1));
  const rings = ys.map((y, i) => {
    const centre = legCenter(layout, side, Math.max(y, m.ankleY));
    const along = i / (ys.length - 1);
    const lip = i === ys.length - 1;
    const roll = c.roll && i >= ys.length - 3 ? [0.75, 1.15, 0.6][i - (ys.length - 3)] : null;
    const r = roll !== null ? legR(y) + c.pad * sc * roll + (c.flare ?? 0) * sc * 0.5 : legR(y) + c.pad * sc * (lip ? 0.55 : 1) + (c.taper ?? 0) * sc * (1 - along) + (lip ? (c.flare ?? 0) * sc * 0.6 : i === ys.length - 2 ? (c.flare ?? 0) * sc : 0);
    const t = Math.max(0, Math.min(1, (y - m.ankleY) / 0.05));
    return {
      c: V(centre.x, y, centre.z - 0.004 * sc + (c.lean ?? 0) * sc * along),
      x: fr.x,
      z: fr.z,
      rx: r * 0.98,
      rzF: r * 1.05 + (c.instep ?? 0) * sc * Math.max(0, 1 - along * 1.7) ** 1.4,
      rzB: r * 1.08,
      n: 2.2,
      v: i / (ys.length - 1),
      w: [[L, t], [Ft, 1 - t]],
    };
  });
  mb.newSmoothingGroup();
  mb.loft(rings, { sides: 12, uv: SHOE_UV.collar });
}

function buildClogStrap(mb, side, ankle, sc, f) {
  const strap = [-0.02, -0.055, -0.072].map((z, i) => ({
    c: V(ankle.x, (0.052 - i * 0.004) * sc, ankle.z + z * sc),
    x: f.x,
    z: f.z,
    rx: (0.052 - i * 0.012) * sc,
    rzF: 0.012 * sc,
    rzB: 0.01 * sc,
    n: 3,
    v: 0.95,
    w: footWeights(side, z),
  }));
  mb.newSmoothingGroup();
  mb.loft(strap, { sides: 8, uv: [0, 0.9, 1, 1], arc: [0.1, 0.9] });
}

export function buildShoes(layout, type, { size = 1 } = {}) {
  const spec = SHOES[type];
  if (!spec) return null;
  const mb = new MeshBuilder('shoes');
  const sc = (layout.measures.height / 1.78) * size * FOOT_SCALE * (1 - (layout.measures.feminine ?? 0) * 0.06);
  const f = frameFor(V(0, 0, 1), V(0, 1, 0));
  for (const [side] of SIDES) {
    if (spec.sandal) buildSandal(mb, spec, side, layout.world[`${side}Foot`], sc, f);
    else buildShoe(mb, layout, spec, side, sc, f);
  }
  return { mb, coversFoot: spec.coversFoot };
}

/**
 * Shoe collision volume (bind pose, world space), built from the same spec as the shoe mesh so the two
 * can never disagree. It is a solid union of the sole slab, the foot box (a heightfield over the outline)
 * and the ankle collar tube. Garments collide with it; nothing is parented to it.
 *
 * resolve(p, margin) returns the smallest push that moves p out of the volume (plus margin), with the
 * contact kind ('top' | 'side' | 'collar'), or null when p is already outside.
 * topAt(x, z) is the height of the shoe's upper surface at a point of the footprint (-Infinity outside).
 */
export function shoeCollider(layout, type, { size = 1 } = {}) {
  const spec = SHOES[type];
  const sc = (layout.measures.height / 1.78) * size * FOOT_SCALE * (1 - (layout.measures.feminine ?? 0) * 0.06);
  const out = {};
  for (const [side] of SIDES) out[side] = spec && !spec.sandal ? shoeVolume(layout, spec, side, sc) : footVolume(layout, spec, side, sc);
  return out;
}

/** Superellipse half-dome height at lateral fraction t (0 = centre line, 1 = edge). */
const dome = (t, n) => (t >= 1 ? 0 : (1 - t ** n) ** (1 / n));

function shoeVolume(layout, spec, side, sc) {
  const ankle = layout.world[`${side}Foot`];
  const s = side === 'Left' ? 1 : -1;
  const m = layout.measures;
  const { outline } = spec;
  const toX = (z) => ankle.x + (z > 0.1 ? s * (z - 0.1) * 0.08 : 0);
  const heelLift = (z) => (spec.sole.heel ?? 0) * (1 - smooth(-0.005, 0.03, z));
  const spring = (z) => spec.sole.toeSpring * smooth(0.15, outline[outline.length - 1][0], z);
  const soleTop = (z) => spec.sole.h + heelLift(z) + spring(z);
  const b = spec.box;
  const zFrom = b.from ?? outline[0][0] + 0.006;
  const zTo = outline[outline.length - 1][0] - 0.008;
  const heightAt = (z) => {
    const ramp = (b.ramp ?? 0) * (1 - smooth(-0.01, 0.11, z)) * smooth(-0.05, 0.0, z);
    const round = (b.toeRound ?? 0) * smooth(zTo - 0.06, zTo - 0.02, z) * (1 - smooth(zTo - 0.02, zTo, z));
    if (z <= 0) return b.heelH + ramp;
    if (z <= 0.045) return b.heelH + (b.instepH - b.heelH) * smooth(0, 0.045, z) + ramp;
    return b.instepH + (b.toeH - b.instepH) * smooth(0.045, zTo, z) + ramp + round;
  };
  const endScale = (z, edge) => 1 - (1 - edge) * Math.max(smooth(zFrom + 0.012, zFrom, z), smooth(zTo - 0.012, zTo, z));
  const zMin = outline[0][0];
  const zMax = outline[outline.length - 1][0];
  const topAtLocal = (dx, zl) => {
    if (zl < zMin || zl > zMax) return -Infinity;
    let top = -Infinity;
    const ws = widthAt(outline, zl) * sc;
    if (dx < ws) top = soleTop(zl) * sc;
    if (zl >= zFrom && zl <= zTo) {
      const w = (widthAt(outline, zl) - 0.004) * sc * endScale(zl, 0.7);
      const h = heightAt(zl) * sc * endScale(zl, 0.75);
      if (dx < w) top = Math.max(top, (soleTop(zl) - 0.002) * sc + h * dome(dx / w, 2.3));
    }
    return top;
  };
  const halfWidth = (zl) => (zl < zMin || zl > zMax ? 0 : widthAt(outline, zl) * sc);

  // Collar tube (same stations as buildCollar).
  const c = spec.collar;
  let collar = null;
  if (c) {
    const stations = [...legStations(layout, side)].sort((a, bb) => a.y - bb.y);
    const legR = (y) => {
      if (y <= stations[0].y) return stations[0].r;
      for (let i = 0; i < stations.length - 1; i++) {
        if (y <= stations[i + 1].y) return stations[i].r + (stations[i + 1].r - stations[i].r) * ((y - stations[i].y) / (stations[i + 1].y - stations[i].y));
      }
      return stations[stations.length - 1].r;
    };
    const baseY = soleTop(0);
    const y0 = (c.instep ? baseY + 0.01 : baseY + spec.box.heelH * 0.5) * sc;
    const y1 = (baseY + c.height) * sc;
    collar = {
      y0,
      y1,
      ring: (y) => {
        const along = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
        const centre = legCenter(layout, side, Math.max(y, m.ankleY));
        const r = legR(y) + c.pad * sc + (c.taper ?? 0) * sc * (1 - along) + (c.flare ?? 0) * sc * along;
        return {
          cx: centre.x,
          cz: centre.z - 0.004 * sc + (c.lean ?? 0) * sc * along,
          rx: r * 0.98,
          rzF: r * 1.05 + (c.instep ?? 0) * sc * Math.max(0, 1 - along * 1.7) ** 1.4,
          rzB: r * 1.08,
        };
      },
    };
  }

  const topAt = (x, z) => {
    const zl = (z - ankle.z) / sc;
    return topAtLocal(Math.abs(x - toX(zl)), zl);
  };
  let maxTop = collar ? collar.y1 : 0;
  for (let z = zMin; z <= zMax; z += 0.005) maxTop = Math.max(maxTop, topAtLocal(0, z));
  const maxW = Math.max(...outline.map(([, w]) => w)) * sc + 0.08;
  return {
    side,
    collarTop: collar ? collar.y1 : -Infinity,
    footprint: { zMin: ankle.z + zMin * sc, zMax: ankle.z + zMax * sc },
    topAt,
    resolve(p, margin = 0) {
      if (p.y > maxTop + margin || p.z < ankle.z + zMin * sc - margin - 0.01 || p.z > ankle.z + zMax * sc + margin + 0.01 || Math.abs(p.x - ankle.x) > maxW + margin + 0.03) return null;
      const zl = (p.z - ankle.z) / sc;
      let best = null;
      const offer = (dx, dy, dz, kind) => {
        const len = Math.hypot(dx, dy, dz);
        if (!best || len < best.len) best = { len, push: V(dx, dy, dz), contact: kind };
      };
      const cx = toX(zl);
      const dx = Math.abs(p.x - cx);
      const top = topAtLocal(dx, zl);
      const mz = margin / sc;
      if (top > -Infinity || (dx < halfWidth(zl) + margin && zl > zMin - mz && zl < zMax + mz)) {
        const t = top > -Infinity ? top : topAtLocal(0, Math.max(zMin, Math.min(zMax, zl)));
        if (p.y < t + margin && p.y > -0.05) {
          offer(0, t + margin - p.y, 0, 'top');
          const hw = halfWidth(Math.max(zMin, Math.min(zMax, zl)));
          offer(Math.sign(p.x - cx || s) * (hw + margin - dx), 0, 0, 'side');
          offer(0, 0, ankle.z + zMax * sc + margin - p.z, 'side');
          offer(0, 0, ankle.z + zMin * sc - margin - p.z, 'side');
        }
      }
      if (collar && p.y < collar.y1 + margin && p.y > collar.y0 - margin) {
        const ring = collar.ring(Math.max(collar.y0, Math.min(collar.y1, p.y)));
        const ox = p.x - ring.cx;
        const oz = p.z - ring.cz;
        const theta = Math.atan2(ox, oz);
        const R = 1 / Math.pow(Math.pow(Math.abs(Math.cos(theta)) / (Math.cos(theta) >= 0 ? ring.rzF : ring.rzB), 2.2) + Math.pow(Math.abs(Math.sin(theta)) / ring.rx, 2.2), 1 / 2.2);
        const d = Math.hypot(ox, oz);
        if (d < R + margin) {
          const k = (R + margin - d) / (d || 1e-6);
          offer(ox * k, 0, oz * k, 'collar');
          offer(0, collar.y1 + margin - p.y, 0, 'collar');
        }
      }
      return best && best.len > 0 ? best : null;
    },
  };
}

/** Bare foot / sandal: the foot itself (body.js stations) plus an optional footbed slab. */
function footVolume(layout, spec, side, sc) {
  const ankle = layout.world[`${side}Foot`];
  const s = side === 'Left' ? 1 : -1;
  const lift = spec?.footLift ?? 0;
  const soleH = spec?.sole?.h ?? 0;
  const st = [[-0.07, 0.024, 0.02], [-0.055, 0.026, 0.06], [-0.035, 0.032, 0.08], [0.03, 0.036, 0.076], [0.11, 0.044, 0.04], [0.165, 0.042, 0.027], [0.205, 0.03, 0.02]];
  const at = (zl, i) => {
    if (zl <= st[0][0]) return st[0][i];
    for (let j = 0; j < st.length - 1; j++) if (zl <= st[j + 1][0]) return st[j][i] + (st[j + 1][i] - st[j][i]) * ((zl - st[j][0]) / (st[j + 1][0] - st[j][0]));
    return st[st.length - 1][i];
  };
  const zMin = st[0][0];
  const zMax = st[st.length - 1][0];
  const toX = (zl) => ankle.x + (zl > 0.08 ? s * (zl - 0.08) * 0.1 : 0);
  const topAtLocal = (dx, zl) => {
    if (zl < zMin || zl > zMax) return -Infinity;
    const w = at(zl, 1) * sc;
    if (dx >= w) return -Infinity;
    return Math.max(soleH * sc, (at(zl, 2) + lift) * sc * dome(dx / w, 2.4));
  };
  return {
    side,
    collarTop: (0.08 + lift) * sc,
    footprint: { zMin: ankle.z + zMin * sc, zMax: ankle.z + zMax * sc },
    topAt: (x, z) => {
      const zl = (z - ankle.z) / sc;
      return topAtLocal(Math.abs(x - toX(zl)), zl);
    },
    resolve(p, margin = 0) {
      const zl = (p.z - ankle.z) / sc;
      const dx = Math.abs(p.x - toX(zl));
      const top = topAtLocal(dx, zl);
      if (top === -Infinity || p.y >= top + margin || p.y < -0.05) return null;
      const up = top + margin - p.y;
      const sideways = at(zl, 1) * sc + margin - dx;
      return up <= sideways
        ? { len: up, push: V(0, up, 0), contact: 'top' }
        : { len: sideways, push: V(Math.sign(p.x - toX(zl) || s) * sideways, 0, 0), contact: 'side' };
    },
  };
}
