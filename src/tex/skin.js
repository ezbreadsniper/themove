import { Raster } from './raster.js';
import { SKIN_ATLAS, SKIN_SIZE, rectPx } from './atlas.js';
import { hexToRgb, mix, scale } from '../core/color.js';
import { paintTattooSleeve } from './tattoo.js';

const TAU = Math.PI * 2;

/** Maps head-space (θ, y) to skin-atlas pixels. */
function headMapper(shape, size = SKIN_SIZE) {
  const r = rectPx(SKIN_ATLAS.head, size);
  const yMin = shape.rings[0].y;
  const yMax = shape.topY;
  return {
    x: (theta) => r.x + (0.5 + theta / TAU) * r.w,
    y: (y) => r.y + ((y - yMin) / (yMax - yMin)) * r.h,
    pxPerMetre: r.h / (yMax - yMin),
    rect: r,
  };
}

function regionFill(raster, rect, color) {
  const r = rectPx(rect);
  raster.rect(r.x, r.y, r.w, r.h, color);
  return r;
}

/** Baked PS2-style lighting on the face: bright planes, dark sockets. */
function paintFaceShading(raster, map, shape, skin) {
  const { lm, k } = shape;
  const sy = (dy) => dy * k * map.pxPerMetre;
  const hi = scale(skin, 1.1);
  const lo = scale(skin, 0.72);
  raster.ellipse(map.x(0), map.y(lm.brow + 0.02 * k), sy(0.03) * 1.6, sy(0.022), hi, 0.35, 1);
  raster.ellipse(map.x(0), map.y(lm.eye - 0.02 * k), 2.5, sy(0.03), hi, 0.3, 1);
  for (const s of [1, -1]) {
    raster.ellipse(map.x(s * 0.72), map.y(lm.eye - 0.028 * k), 7, 4, hi, 0.28, 1);
    raster.ellipse(map.x(s * 0.36 * shape.face.eyeSpacing), map.y(lm.eye + 0.002 * k), 10, 5.5, lo, 0.35, 1);
    raster.ellipse(map.x(s * 0.14), map.y(lm.noseTip - 0.004 * k), 3.2, sy(0.022), lo, 0.35, 1);
    raster.ellipse(map.x(s * 1.05), map.y(lm.mouth + 0.012 * k), 9, 10, lo, 0.18, 1);
  }
  raster.ellipse(map.x(0), map.y(lm.mouth - 0.022 * k), 9, 3, lo, 0.35, 1);
  raster.ellipse(map.x(0), map.y(shape.chinY - 0.004 * k), 30, 5, lo, 0.45, 1);
  raster.rect(map.rect.x, map.y(shape.rings[0].y), map.rect.w, 3, lo, 0.18);
  paintJawline(raster, map, shape, skin);
}

/** Model-style jaw: shadowed underside, lit jaw bone running up to the ear, hollow cheeks. */
function paintJawline(raster, map, shape, skin) {
  const d = shape.face.jawDefinition ?? 0;
  if (d <= 0) return;
  const { lm, k } = shape;
  const jawY = shape.rings[2].y;
  const under = scale(skin, 0.55);
  for (let py = Math.floor(map.y(shape.rings[0].y)); py < map.y(jawY); py++) {
    raster.rect(map.x(-1.75), py, map.x(1.75) - map.x(-1.75), 1, under, 0.4 * d);
  }
  const bone = scale(skin, 1.16);
  for (const s of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const th = 0.25 + (i / 8) * 1.35;
      const y = jawY + 0.004 * k + Math.pow(i / 8, 2.2) * (lm.earBottom - jawY - 0.004 * k);
      pts.push([map.x(s * th), map.y(y)]);
    }
    raster.polyline(pts, bone, 1.4, 0.45 * d);
    raster.polyline(pts.map(([x, y]) => [x, y - 1.6]), scale(skin, 0.62), 1.2, 0.5 * d);
    raster.ellipse(map.x(s * 0.98), map.y(lm.mouth + 0.016 * k), 5, 7, scale(skin, 0.7), 0.35 * d, 1);
  }
  raster.ellipse(map.x(0), map.y(jawY + 0.006 * k), 6, 2.5, bone, 0.35 * d, 1);
}

const EYE_SHAPES = {
  almond: { w: 7.6, h: 3.2, lid: 1, tail: 1.2, iris: 2.6 },
  round: { w: 7.0, h: 3.7, lid: 0.8, tail: 0.6, iris: 2.7 },
  hooded: { w: 7.6, h: 2.7, lid: 1.6, tail: 1.4, iris: 2.6 },
  narrow: { w: 8.0, h: 2.4, lid: 1.3, tail: 1.6, iris: 2.3 },
};

/**
 * Pen that draws in 256-atlas coordinates onto a larger raster (factor f), so painted features get
 * f× the texels: sharper lids, lashes and lip edges without changing any layout numbers.
 */
export function scaledPen(raster, f) {
  const P = ([x, y]) => [x * f, y * f];
  return {
    plot: (x, y, c, a) => raster.rect(x * f, y * f, f, f, c, a),
    rect: (x, y, w, h, c, a) => raster.rect(x * f, y * f, w * f, h * f, c, a),
    ellipse: (cx, cy, rx, ry, c, a, soft) => raster.ellipse(cx * f, cy * f, rx * f, ry * f, c, a, soft),
    line: (x0, y0, x1, y1, c, w = 1, a) => raster.line(x0 * f, y0 * f, x1 * f, y1 * f, c, w * f, a),
    polyline: (pts, c, w = 1, a) => raster.polyline(pts.map(P), c, w * f, a),
    polygon: (pts, c, a) => raster.polygon(pts.map(P), c, a),
  };
}

function paintEyes(raster, map, shape, skin, browColor, rng) {
  const { lm, k, face } = shape;
  const e = EYE_SHAPES[face.eyeShape] ?? EYE_SHAPES.almond;
  const w = e.w * face.eyeSize;
  const h = e.h * face.eyeSize;
  const cy = map.y(lm.eye);
  const white = mix(hexToRgb('#e2dbcf'), skin, 0.16);
  const lid = scale(skin, 0.24);
  const crease = scale(skin, 0.66);
  const iris = hexToRgb(face.irisColor);
  const older = Math.min(1, (shape.older ?? 0) + (face.lidHeaviness ?? 0));
  for (const s of [1, -1]) {
    const cx = map.x(s * 0.35 * face.eyeSpacing);
    const tilt = face.eyeTilt * s;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = Math.cos(a) * w;
      const up = Math.sin(a) > 0;
      const bulge = up ? 1 - 0.25 * Math.max(0, x * s / w) : 0.7 + 0.2 * Math.max(0, -x * s / w);
      pts.push([cx + x, cy + Math.sin(a) * h * bulge + (x * s) * tilt * 0.12]);
    }
    raster.ellipse(cx, cy + 0.6, w * 1.35, h * 2.2, scale(skin, 0.8), 0.35, 1);
    raster.polygon(pts, white);
    raster.polygon(pts.slice(0, 9).map(([x, y]) => [x, y - 0.25]).concat([[cx - w, cy + 0.3], [cx + w, cy + 0.3]]).slice(0, 9), scale(white, 0.85), 0.35);
    const irisX = cx - s * 0.35;
    const ir = e.iris * face.eyeSize;
    raster.ellipse(irisX, cy + 0.25, ir, ir * 1.05, scale(iris, 0.6), 1);
    raster.ellipse(irisX, cy + 0.05, ir * 0.82, ir * 0.85, iris, 1);
    raster.ellipse(irisX, cy - 0.35, ir * 0.55, ir * 0.4, mix(iris, [200, 170, 120], 0.25), 0.6);
    raster.ellipse(irisX, cy + 0.15, ir * 0.42, ir * 0.42, [12, 10, 10], 1);
    raster.ellipse(irisX - s * 0.55, cy + 0.85, 0.42, 0.42, [240, 238, 232], 0.85);
    raster.ellipse(cx - s * (w - 0.6), cy - 0.1, 0.9, 0.7, mix(skin, [200, 110, 110], 0.4), 0.8);
    const upper = pts.slice(0, 9);
    raster.polyline(upper.map(([x, y]) => [x, y + 0.45 - older * 0.5]), lid, 1.3 + e.lid * 0.55 + older * 0.7);
    for (let i = 2; i <= 7; i++) {
      const [x, y] = upper[i];
      const dir = (x - cx) / w;
      raster.line(x, y + 0.7, x + dir * 0.9 + s * 0.15, y + 1.6, lid, 0.6, 0.7);
    }
    raster.line(cx + s * w, cy + tilt, cx + s * (w + e.tail * 1.6), cy - 0.6 + tilt * 1.5, lid, 1.1);
    const lashes = face.lashes ?? 0;
    if (lashes > 0) {
      raster.polyline(upper.map(([x, y]) => [x, y + 0.7]), scale(lid, 0.6), 1.6 + lashes * 0.9);
      for (let i = 1; i <= 8; i++) {
        const [x, y] = upper[i];
        const dir = (x - cx) / w;
        raster.line(x, y + 1, x + dir * (1.4 + lashes) + s * 0.4 * dir, y + 2.2 + lashes * 1.1, scale(lid, 0.5), 0.7, 0.9);
      }
      raster.line(cx + s * w, cy + tilt + 0.4, cx + s * (w + 2.4 + lashes), cy + 1.6 + tilt * 1.5, scale(lid, 0.5), 1.3);
    }
    raster.polyline(pts.slice(9, 16).map(([x, y]) => [x, y - 0.25]), scale(skin, 0.58), 0.8, 0.75);
    raster.polyline(upper.map(([x, y]) => [x, y + 2.6 + e.lid - older * 0.8]), crease, 0.9, 0.6);
    raster.polyline(pts.slice(10, 15).map(([x, y]) => [x, y - 1.4 - older]), scale(skin, 0.78), 0.8, 0.35 + older * 0.3);

    const by = map.y(lm.brow + 0.004 * k);
    const inner = [cx - s * w * (0.95 - (face.browGap ?? 0) * 0.3), by - 1 + face.browTilt * 1.5];
    const peak = [cx + s * w * 0.35, by + 1.3];
    const outer = [cx + s * w * 1.55, by - 0.4 - face.browTilt * 1.5];
    const thick = 2.0 * face.browThickness;
    raster.polyline([inner, peak, outer], scale(browColor, 1.15), thick, 0.55);
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const seg = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45;
      const [a0, a1] = t < 0.55 ? [inner, peak] : [peak, outer];
      const x = a0[0] + (a1[0] - a0[0]) * seg;
      const y = a0[1] + (a1[1] - a0[1]) * seg;
      const spread = thick * (1 - t * 0.55) * 0.5;
      const oy = (rng.next() - 0.5) * spread * 1.6;
      const len = 1.3 + rng.next() * 0.8;
      raster.line(x, y + oy, x + s * len * (0.6 + t * 0.4), y + oy + (t < 0.5 ? 0.5 : -0.2), browColor, 0.55, 0.9);
    }
  }
}

function paintNoseAndMouth(raster, map, shape, skin) {
  const { lm, k, face } = shape;
  const dark = scale(skin, 0.38);
  const ny = map.y(lm.noseBase - (face.noseLength - 1) * 0.012 * k);
  const nw = 3.4 * face.noseWidth;
  const cx = map.x(0);
  for (const s of [-1, 1]) {
    raster.polygon([[cx + s * (nw - 1.6), ny + 1.2], [cx + s * (nw + 1.2), ny + 0.9], [cx + s * (nw + 0.6), ny + 0.1], [cx + s * (nw - 1.4), ny + 0.3]], dark, 0.95);
    raster.polyline([[cx + s * (nw + 1.8), ny + 0.4], [cx + s * (nw + 2.4), ny + 2], [cx + s * (nw + 1.6), ny + 3.6]], scale(skin, 0.62), 0.9, 0.75);
    raster.line(cx + s * 2.2, ny + 4, cx + s * 1.6, map.y(lm.eye) - 2, scale(skin, 0.82), 1.2, 0.35);
  }
  raster.ellipse(cx, ny + 2.4, 2.2, 1.4, scale(skin, 1.14), 0.45);
  raster.rect(cx - 0.6, ny + 4, 1.2, map.y(lm.eye) - ny - 6, scale(skin, 1.1), 0.35);

  const lum = (skin[0] + skin[1] + skin[2]) / 765;
  const lipBase = lum < 0.35 ? mix(skin, [120, 60, 70], 0.32) : mix(skin, [160, 72, 76], 0.38);
  const lip = scale(lipBase, face.lipTone * (lum < 0.35 ? 1.12 : 1));
  const upperK = face.upperLip ?? 1;
  const lowerK = face.lowerLip ?? 1;
  const my = map.y(lm.mouth);
  const mw = 9.6 * (0.9 + face.lipFullness * 0.1) * (face.mouthWidth ?? 1);
  const cn = (face.mouthCorners ?? 0) * 1.8;
  const full = face.lipFullness;
  raster.line(cx - 0.9, my + 3.2 * full, cx - 0.7, ny - 0.5, scale(skin, 0.86), 0.7, 0.45);
  raster.line(cx + 0.9, my + 3.2 * full, cx + 0.7, ny - 0.5, scale(skin, 0.86), 0.7, 0.45);
  raster.polygon([[cx - mw, my + cn], [cx - mw * 0.5, my + 2.4 * full * upperK], [cx - 1.5, my + 2.8 * full * upperK], [cx, my + 2.2 * full * upperK], [cx + 1.5, my + 2.8 * full * upperK], [cx + mw * 0.5, my + 2.4 * full * upperK], [cx + mw, my + cn]], scale(lip, 0.9), 0.95);
  raster.polyline([[cx - mw, my], [cx - mw * 0.5, my + 2.4 * full], [cx - 1.5, my + 2.8 * full], [cx, my + 2.2 * full], [cx + 1.5, my + 2.8 * full], [cx + mw * 0.5, my + 2.4 * full], [cx + mw, my]], scale(lip, 0.75), 0.6, 0.6);
  raster.polygon([[cx - mw + 0.5, my + cn], [cx + mw - 0.5, my + cn], [cx + mw * 0.7, my - 2.8 * full * lowerK], [cx, my - 3.4 * full * lowerK], [cx - mw * 0.7, my - 2.8 * full * lowerK]], scale(lip, 1.1), 0.9);
  raster.ellipse(cx, my - 1.7 * full, mw * 0.4, 0.8, scale(lip, 1.4), 0.55);
  raster.polyline([[cx - mw - 0.6, my + 0.5 + cn], [cx - mw * 0.5, my + 0.1 + cn * 0.35], [cx, my + 0.35], [cx + mw * 0.5, my + 0.1 + cn * 0.35], [cx + mw + 0.6, my + 0.5 + cn]], scale(skin, 0.28), 1.1);
  for (const s of [-1, 1]) raster.ellipse(cx + s * (mw + 0.8), my + 0.3 + cn, 1, 1.2, scale(skin, 0.6), 0.6);
  raster.line(cx - 1.4, my - 4 * full, cx + 1.4, my - 4 * full, scale(skin, 0.72), 1.2, 0.5);
}

/**
 * Facial hair as soft-edged coverage zones sampled per texel on the hi-res atlas: single-pixel
 * hairs, density falling off at the cheek line, neckline and sideburns (no hard boxes).
 */
function paintFacialHair(raster, map, shape, rng, hairColor) {
  const { lm, k, face } = shape;
  if (face.facialHair === 'none') return;
  const soft = (v, edge, width) => Math.max(0, Math.min(1, (edge - v) / width + 0.5));
  const zones = (theta, y) => {
    const a = Math.abs(theta);
    const side = soft(a, 1.5, 0.18);
    const neck = soft(-y, -(shape.chinY - 0.022 * k), 0.014 * k);
    const cheekTop = lm.noseBase - 0.014 * k - Math.max(0, a - 0.55) * 0.012;
    const jaw = soft(y, a < 0.6 ? lm.mouth - 0.008 * k : cheekTop, 0.01 * k) * side * neck;
    const mustache = soft(y, lm.noseBase - 0.005 * k, 0.004 * k) * soft(-y, -(lm.mouth + 0.005 * k), 0.003 * k) * soft(a, 0.4, 0.08);
    const chin = soft(y, lm.mouth - 0.012 * k, 0.006 * k) * soft(a, 0.45, 0.12) * neck;
    const soul = soft(y, lm.mouth - 0.007 * k, 0.003 * k) * soft(-y, -(lm.mouth - 0.02 * k), 0.003 * k) * soft(a, 0.1, 0.05);
    const cheeks = soft(y, lm.noseBase - 0.002 * k, 0.012 * k) * soft(-a, -0.5, 0.15) * side * neck;
    const strap = soft(Math.abs(y - (shape.chinY + 0.004 * k + Math.max(0, a - 0.4) * 0.03 * k)), 0.007 * k, 0.003 * k) * side * soft(-y, -(shape.chinY - 0.02 * k), 0.01 * k);
    const corners = soft(Math.abs(a - 0.36), 0.05, 0.03) * soft(y, lm.mouth + 0.004 * k, 0.003 * k) * soft(-y, -(lm.mouth - 0.016 * k), 0.003 * k);
    const drops = soft(Math.abs(a - 0.38), 0.05, 0.03) * soft(y, lm.mouth + 0.004 * k, 0.003 * k) * soft(-y, -(shape.chinY - 0.004 * k), 0.004 * k);
    const bars = soft(Math.abs(a - 0.5), 0.07, 0.03) * soft(Math.abs(y - (lm.mouth + 0.012 * k)), 0.004 * k, 0.002 * k);
    const pencil = soft(Math.abs(y - (lm.mouth + 0.008 * k)), 0.0032 * k, 0.001 * k) * soft(a, 0.34, 0.04) * 1.4;
    const chops = soft(y, lm.earTop - 0.01 * k, 0.006 * k) * soft(-y, -(lm.mouth - 0.012 * k), 0.006 * k) * soft(Math.abs(a - 1.15), 0.32, 0.08);
    switch (face.facialHair) {
      case 'stubble': return Math.max(jaw, mustache * 0.8);
      case 'goatee': return Math.max(mustache, chin, soul);
      case 'lightBeard': return Math.max(jaw, mustache, chin);
      case 'mustache': return mustache;
      case 'shortBeard': return Math.max(jaw, mustache, chin, soul);
      case 'fullBeard': return Math.max(jaw, mustache, chin, soul, cheeks);
      case 'chinStrap': return strap;
      case 'vanDyke': return Math.max(mustache * soft(a, 0.34, 0.06), soul, chin * soft(a, 0.2, 0.06));
      case 'circle': return Math.max(mustache, chin, soul, corners);
      case 'soulPatch': return soul;
      case 'handlebar': return Math.max(mustache, bars);
      case 'horseshoe': return Math.max(mustache, corners, drops);
      case 'pencil': return pencil;
      case 'muttonChops': return chops;
      case 'fiveOClock': return Math.max(jaw, mustache, chin, cheeks * 0.7) * 0.55;
      case 'patchy': return Math.max(jaw, mustache, chin) * (0.35 + 0.65 * Math.abs(Math.sin(theta * 9 + y * 400)));
      case 'balbo': return Math.max(mustache * soft(a, 0.36, 0.05), chin * soft(a, 0.38, 0.08), soul);
      case 'anchor': return Math.max(pencil, soul, chin * soft(a, 0.3, 0.06), strap * soft(a, 0.5, 0.1));
      case 'chevron': return soft(y, lm.noseBase - 0.002 * k, 0.004 * k) * soft(-y, -(lm.mouth + 0.002 * k), 0.003 * k) * soft(a, 0.44, 0.06);
      case 'walrus': return soft(y, lm.noseBase - 0.001 * k, 0.004 * k) * soft(-y, -(lm.mouth - 0.006 * k), 0.003 * k) * soft(a, 0.5, 0.08);
      case 'longGoatee': return Math.max(mustache, chin, soul);
      case 'boxed':
      case 'bushy':
      case 'longBeard':
      case 'ducktail':
      case 'garibaldi':
      case 'verdi': return Math.max(jaw, mustache, chin, soul, cheeks);
      default: return 0;
    }
  };
  const density = face.facialHairDensity;
  for (let py = Math.floor(map.y(shape.chinY - 0.045 * k)); py < map.y(lm.earTop); py++) {
    for (let px = Math.floor(map.x(-1.75)); px < map.x(1.75); px++) {
      const theta = ((px - map.rect.x) / map.rect.w - 0.5) * TAU;
      const y = shape.rings[0].y + (py - map.rect.y) / map.pxPerMetre;
      const c = zones(theta, y);
      if (c > 0 && rng.next() < density * c) raster.plot(px, py, hairColor, 0.35 + c * 0.5 * rng.next());
    }
  }
}

/**
 * Age detail on the hi-res atlas: forehead lines, crow's feet, smile lines, under-eye bags,
 * neck creases and a few age spots. Everything scales with shape.older so young faces stay clean.
 */
function paintAging(raster, map, shape, skin, rng) {
  const t = shape.older ?? 0;
  if (t <= 0.02) return;
  const { lm, k } = shape;
  const line = scale(skin, 0.7);
  const s = map.pxPerMetre * k;
  for (let i = 0; i < 3; i++) {
    const y = map.y(lm.brow + (0.018 + i * 0.011) * k);
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const th = -0.55 + (j / 8) * 1.1;
      pts.push([map.x(th), y + Math.sin(j * 1.3 + i) * 0.6]);
    }
    raster.polyline(pts, line, 1, t * (0.55 - i * 0.12));
  }
  for (const side of [1, -1]) {
    const cx = map.x(side * 0.62);
    const cy = map.y(lm.eye);
    for (let i = -1; i <= 1; i++) raster.line(cx, cy + i * 2.2, cx + side * 0.012 * s, cy + i * 3.6, line, 1, t * 0.5);
    raster.polyline([[map.x(side * 0.18), map.y(lm.eye - 0.012 * k)], [map.x(side * 0.36), map.y(lm.eye - 0.016 * k)], [map.x(side * 0.5), map.y(lm.eye - 0.011 * k)]], line, 1.4, t * 0.5);
    raster.polyline([[map.x(side * 0.2), map.y(lm.noseBase + 0.004 * k)], [map.x(side * 0.3), map.y(lm.mouth + 0.012 * k)], [map.x(side * 0.36), map.y(lm.mouth - 0.008 * k)]], line, 1.6, t * 0.6);
    raster.line(map.x(side * 0.3), map.y(lm.mouth - 0.01 * k), map.x(side * 0.26), map.y(shape.chinY + 0.008 * k), line, 1, t * 0.4);
  }
  for (let i = 0; i < 2; i++) {
    const y = map.y(shape.rings[0].y + (0.012 + i * 0.012) * k);
    raster.line(map.x(-0.9), y, map.x(0.9), y + 0.5, line, 1, t * 0.35);
  }
  const spots = Math.round(t * 14);
  for (let i = 0; i < spots; i++) {
    raster.ellipse(map.x(rng.range(-0.9, 0.9)), map.y(rng.range(lm.eye, lm.hairlineFront)), 1.2, 1, scale(skin, 0.82), 0.5, 1);
  }
}

/** Scalp paint under hair so gaps between hair shell and skull read as hair, not skin. */
function paintScalp(raster, map, shape, hair) {
  if (!hair || hair.scalp === false) return;
  const color = hexToRgb(hair.color);
  const { lm, k } = shape;
  for (let px = map.rect.x; px < map.rect.x + map.rect.w; px++) {
    const theta = ((px - map.rect.x) / map.rect.w - 0.5) * TAU;
    const hl = hair.hairline(theta);
    const top = map.rect.y + map.rect.h;
    const from = map.y(hl);
    for (let py = Math.floor(from) - 2; py < top; py++) {
      const d = py - from;
      const hash = Math.abs(Math.sin(px * 12.9898 + py * 78.233) * 43758.5453) % 1;
      if (d < 3 && hash > (d + 2) / 5) continue;
      raster.plot(px, py, scale(color, 0.85), d < 3 ? 0.7 : 1);
    }
    const off = Math.abs(Math.abs(theta) - 1.3);
    if (hair.sideburns && off < 0.12) {
      const bottom = map.y(lm.earTop - 0.026 * k + (off / 0.12) * 0.02 * k);
      for (let py = Math.floor(bottom); py < from; py++) raster.plot(px, py, scale(color, 0.85), 0.55 + 0.4 * (1 - off / 0.12));
    }
  }
}

function paintEars(raster, skin) {
  const r = regionFill(raster, SKIN_ATLAS.ear, skin);
  const band = (v0, v1, color) => raster.rect(r.x, r.y + r.h * v0, r.w, r.h * (v1 - v0) + 1, color);
  band(0, 0.25, scale(skin, 0.86));
  band(0.25, 0.5, scale(skin, 1.06));
  band(0.5, 0.62, mix(scale(skin, 1.12), [220, 140, 130], 0.08));
  band(0.62, 0.8, scale(skin, 0.72));
  band(0.8, 1.0, scale(skin, 0.48));
}

function paintLimbs(raster, skin, rng, def) {
  for (const key of ['armL', 'armR']) {
    const r = regionFill(raster, SKIN_ATLAS[key], skin);
    const elbowY = r.y + r.h * 0.55;
    raster.ellipse(r.x + r.w * 0.0, elbowY, r.w * 0.16, 4, scale(skin, 0.8), 0.6, 1);
    raster.ellipse(r.x + r.w * 1.0, elbowY, r.w * 0.16, 4, scale(skin, 0.8), 0.6, 1);
  }
  const fem = def.body?.feminine ?? 0;
  const legHairs = Math.round(120 * Math.max(0, 1 - fem * 1.6));
  for (const key of ['legL', 'legR']) {
    const r = regionFill(raster, SKIN_ATLAS[key], skin);
    raster.ellipse(r.x + r.w * 0.5, r.y + r.h * 0.55, 6, 4, scale(skin, 1.08), 0.5, 1);
    for (let i = 0; i < legHairs; i++) raster.plot(r.x + rng.next() * r.w, r.y + rng.next() * r.h * 0.5, scale(skin, 0.75), 0.4);
  }
  const t = regionFill(raster, SKIN_ATLAS.torso, skin);
  raster.ellipse(t.x + t.w * 0.5, t.y + t.h * 0.34, 1.5, 1.5, scale(skin, 0.6), 0.9);
  const pecShade = 0.5 * (1 - fem * 0.7);
  raster.ellipse(t.x + t.w * 0.42, t.y + t.h * 0.62, 8, 5, scale(skin, 0.86), pecShade, 1);
  raster.ellipse(t.x + t.w * 0.58, t.y + t.h * 0.62, 8, 5, scale(skin, 0.86), pecShade, 1);
}

function paintHands(raster, skin) {
  const r = regionFill(raster, SKIN_ATLAS.hand, skin);
  const line = scale(skin, 0.6);
  for (const center of [0.25, 0.75]) {
    for (const off of [-0.075, 0, 0.075]) {
      const x = r.x + r.w * (center + off);
      raster.line(x, r.y + r.h * 0.62, x, r.y + r.h, line, 1, 0.8);
    }
    raster.line(r.x + r.w * (center - 0.13), r.y + r.h * 0.56, r.x + r.w * (center + 0.13), r.y + r.h * 0.56, scale(skin, 0.75), 1, 0.6);
  }
  raster.rect(r.x, r.y + r.h * 0.92, r.w, r.h * 0.08, scale(mix(skin, [230, 200, 190], 0.3), 1.05), 0.6);
  const f = regionFill(raster, SKIN_ATLAS.foot, scale(skin, 0.97));
  for (const off of [-0.06, 0, 0.06]) raster.line(f.x + f.w * (0.5 + off), f.y + f.h * 0.78, f.x + f.w * (0.5 + off), f.y + f.h, scale(skin, 0.65), 1, 0.7);
}

/**
 * Paints the whole skin atlas for one character.
 * hair: { color, hairline(θ) -> y, sideburns } describes scalp paint under the hair mesh.
 */
export function paintSkin({ def, shape, hair, rng }) {
  const raster = new Raster(SKIN_SIZE, SKIN_SIZE);
  const skin = hexToRgb(def.skin.tone);
  raster.fill(skin);
  paintLimbs(raster, skin, rng.fork('limbs'), def);
  paintHands(raster, skin);
  paintEars(raster, skin);
  const map = headMapper(shape);
  regionFill(raster, SKIN_ATLAS.head, skin);
  paintScalp(raster, map, shape, hair);
  const hi = new Raster(SKIN_SIZE * 2, SKIN_SIZE * 2).blit(raster, 0, 0, SKIN_SIZE * 2, SKIN_SIZE * 2);
  const pen = scaledPen(hi, 2);
  paintFaceShading(pen, map, shape, skin);
  const browColor = scale(hexToRgb(def.hair.color), def.hair.color === '#161210' ? 1 : 0.55);
  paintEyes(pen, map, shape, skin, browColor, rng.fork('brows'));
  paintNoseAndMouth(pen, map, shape, skin);
  paintFacialHair(hi, headMapper(shape, SKIN_SIZE * 2), shape, rng.fork('beard'), scale(hexToRgb(def.face.facialHairColor ?? def.hair.color), 0.7));
  for (const key of ['armL', 'armR']) {
    const tattoo = def.tattoos?.[key === 'armL' ? 'left' : 'right'];
    if (tattoo && tattoo !== 'none') paintTattooSleeve(hi, rectPx(SKIN_ATLAS[key], SKIN_SIZE * 2), rng.fork(key), tattoo, skin, def.tattoos.ink);
  }
  paintAging(hi, headMapper(shape, SKIN_SIZE * 2), shape, skin, rng.fork('age'));
  hi.grain(rng.fork('grain'), 0.05 + (shape.older ?? 0) * 0.035);
  hi.blocks(rng.fork('blocks'), 4, 0.02);
  hi.posterize(48);
  return hi;
}
