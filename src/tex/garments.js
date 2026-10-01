import { Raster } from './raster.js';
import { hexToRgb, mix, scale } from '../core/color.js';
import { GARMENT_UV } from '../geo/parts/garments.js';
import { applyFabric } from './fabric.js';

const SIZE = 128;
export const px = (rect) => ({ x: rect[0] * SIZE, y: rect[1] * SIZE, w: (rect[2] - rect[0]) * SIZE, h: (rect[3] - rect[1]) * SIZE });

export function finish(r, rng, grain = 0.06) {
  r.grain(rng.fork('g'), grain);
  r.blocks(rng.fork('b'), 4, 0.03);
  r.posterize(40);
  return r;
}

export function wrinkles(r, rect, rng, color, count, alpha = 0.35) {
  for (let i = 0; i < count; i++) {
    const x = rect.x + rng.next() * rect.w;
    const y = rect.y + rng.next() * rect.h;
    const len = 4 + rng.next() * 10;
    const tilt = (rng.next() - 0.5) * 3;
    r.line(x, y, x + len, y + tilt, color, 1, alpha * (0.5 + rng.next() * 0.5));
  }
}

export function stitch(r, x0, y0, x1, y1, color, gap = 2, alpha = 0.9) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.floor(len / gap);
  for (let i = 0; i < steps; i += 1) {
    if (i % 2) continue;
    const t = i / steps;
    r.plot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color, alpha);
  }
}

/** Plain or trimmed tee / rugby. style: { color, trim, pattern: 'plain'|'rugby', print } */
export function paintTop(style, rng) {
  const r = new Raster(SIZE, SIZE);
  const base = hexToRgb(style.color);
  const trim = hexToRgb(style.trim ?? style.color);
  r.fill(base);
  const body = px(GARMENT_UV.top.body);
  const striped = style.pattern === 'stripes';
  if (striped) paintStripes(r, style);
  applyFabric(r, style.fabric ?? 'cotton', base, rng.fork('fabric'));
  const dark = striped ? [18, 14, 14] : scale(base, 0.72);
  const light = scale(mix(base, [255, 255, 255], 0.08), 1.08);
  if (!striped) r.verticalGradient(body.y, body.y + body.h * 0.25, base, scale(base, 0.88), 0.7);
  wrinkles(r, { ...body, h: body.h * 0.45 }, rng.fork('w'), dark, 40);
  wrinkles(r, { ...body, y: body.y + body.h * 0.5, h: body.h * 0.3 }, rng.fork('w2'), light, 14, 0.25);
  for (const u of [0.25, 0.75]) r.rect(body.x + body.w * u - 0.5, body.y, 1, body.h, scale(base, 0.8), 0.6);
  r.rect(body.x, body.y, body.w, 3, scale(base, 0.82), 0.8);
  r.rect(body.x, body.y + body.h - 12, body.w, 2, scale(base, 0.75), 0.6);
  const collar = px(GARMENT_UV.top.collar);
  const collarColor = style.collarColor ? hexToRgb(style.collarColor) : style.pattern === 'rugby' ? scale(base, 0.95) : scale(base, 0.85);
  r.rect(collar.x, collar.y - 1, collar.w, collar.h + 1, collarColor);
  for (let x = 0; x < SIZE; x += 2) r.plot(x, collar.y + 1, scale(collarColor, 0.7), 0.5);
  for (const key of ['sleeveL', 'sleeveR']) {
    const s = px(GARMENT_UV.top[key]);
    wrinkles(r, s, rng.fork(key), dark, 16);
    r.rect(s.x, s.y + s.h - 5, s.w, 4, style.cuff ? hexToRgb(style.cuff) : scale(base, 0.82), style.cuff ? 1 : 0.7);
    r.rect(s.x, s.y + s.h * 0.02, s.w, 2, scale(base, 0.8), 0.8);
  }
  if (style.pattern === 'rugby') paintRugbyTrim(r, body, trim, base);
  if (style.print === 'blockPatch') paintBlockPatch(r, body);
  if (striped) paintFootballDetails(r, body, style);
  return finish(r, rng);
}

/** Vertical stripes on body and sleeves (sleeve u runs around the arm, so stripes run along it). */
function paintStripes(r, style) {
  const b = hexToRgb(style.stripe ?? '#141214');
  const period = SIZE / 8;
  for (let x = 0; x < SIZE; x++) {
    const phase = ((x + period * 0.25) % period) / period;
    if (phase < 0.56) r.rect(x, 0, 1, SIZE, b);
  }
}

/** White V under the collar, black shoulder-seam stripes, a squad number on the back. No crests or marks. */
function paintFootballDetails(r, body, style) {
  const white = hexToRgb(style.collarColor ?? '#ecebe6');
  const black = hexToRgb(style.stripe ?? '#141214');
  const top = body.y + body.h;
  const cx = body.x + body.w * 0.5;
  r.polygon([[cx - 9, top], [cx + 9, top], [cx, top - 15]], white);
  r.polyline([[cx - 9, top], [cx, top - 15], [cx + 9, top]], scale(white, 0.7), 1, 0.8);
  for (const key of ['sleeveL', 'sleeveR']) {
    const s = px(GARMENT_UV.top[key]);
    for (const du of [-0.06, 0, 0.06]) r.rect(s.x + s.w * (0.75 + du) - 1, s.y, 2, s.h - 5, black);
  }
  if (style.number) paintNumber(r, String(style.number).slice(0, 2), body.x, body.y + body.h * 0.52, white, black);
}

const SEGMENTS = {
  0: 'abcfed', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd',
};

/** Block numerals centred on u = 0 (the back seam); the raster wraps horizontally. */
function paintNumber(r, text, x0, cy, fill, edge) {
  const w = 9;
  const h = 18;
  const gap = 3;
  const total = text.length * w + (text.length - 1) * gap;
  text.split('').forEach((ch, i) => {
    const x = x0 - total / 2 + i * (w + gap);
    const seg = {
      a: [x, cy + h / 2 - 2.5, w, 2.5], d: [x, cy - h / 2, w, 2.5], g: [x, cy - 1.25, w, 2.5],
      f: [x, cy, 2.5, h / 2], b: [x + w - 2.5, cy, 2.5, h / 2], e: [x, cy - h / 2, 2.5, h / 2], c: [x + w - 2.5, cy - h / 2, 2.5, h / 2],
    };
    for (const k of SEGMENTS[ch] ?? '') {
      const [sx, sy, sw, sh] = seg[k];
      r.rect(sx - 0.5, sy - 0.5, sw + 1, sh + 1, edge);
    }
    for (const k of SEGMENTS[ch] ?? '') r.rect(...seg[k], fill);
  });
}

/** White piping: two lines from the shoulders down the front, one along each sleeve. */
function paintRugbyTrim(r, body, trim, base) {
  const topY = body.y + body.h - 8;
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const u = 0.5 + s * (0.13 + 0.03 * Math.sin(t * Math.PI * 0.9) - 0.03 * t);
      pts.push([body.x + body.w * u, topY - t * (body.h - 12)]);
    }
    r.polyline(pts, trim, 1.6, 0.95);
    r.polyline(pts.map(([x, y]) => [x + s * 3, y]), trim, 1, 0.75);
    r.line(body.x + body.w * (0.5 + s * 0.13), topY, body.x + body.w * (0.5 + s * 0.24), body.y + body.h - 2, trim, 1.4, 0.9);
    const back = body.x + body.w * (s < 0 ? 0.02 : 0.98);
    r.line(back, body.y + body.h - 3, back + s * -4, body.y + body.h * 0.6, trim, 1.2, 0.6);
  }
  for (const key of ['sleeveL', 'sleeveR']) {
    const sl = px(GARMENT_UV.top[key]);
    r.line(sl.x + sl.w * 0.32, sl.y, sl.x + sl.w * 0.32, sl.y + sl.h, trim, 1.4, 0.9);
    r.line(sl.x + sl.w * 0.68, sl.y, sl.x + sl.w * 0.68, sl.y + sl.h, trim, 1.4, 0.9);
  }
  const cx = body.x + body.w * 0.5;
  r.rect(cx - 3, topY - 16, 6, 16, scale(base, 0.9));
  r.line(cx - 3, topY - 16, cx - 3, topY, trim, 1, 0.9);
  r.line(cx + 3, topY - 16, cx + 3, topY, trim, 1, 0.9);
  r.ellipse(cx, topY - 6, 1, 1, trim, 1);
  r.ellipse(cx, topY - 12, 1, 1, trim, 1);
}

/** Abstract chest panel standing in for a sponsor patch (no text, no marks). */
function paintBlockPatch(r, body) {
  const cx = body.x + body.w * 0.5;
  const cy = body.y + body.h * 0.62;
  r.rect(cx - 11, cy - 6, 22, 12, [226, 226, 222]);
  r.rect(cx - 9, cy - 3, 18, 6, [58, 78, 150]);
  for (let i = 0; i < 3; i++) r.rect(cx - 7 + i * 5.5, cy - 2, 3.5, 4, [226, 226, 222], 0.9);
  r.rect(cx - 10, cy + 3.8, 20, 1, [90, 90, 96], 0.6);
}

/**
 * Denim / twill trousers. style: { color, wash: 0..1, kind: 'denim'|'twill', whiskers, stitch, drawstring }
 */
export function paintBottom(style, rng) {
  const r = new Raster(SIZE, SIZE);
  const base = hexToRgb(style.color);
  const isDenim = (style.kind ?? 'denim') === 'denim';
  const wash = (style.wash ?? 0.5) * (isDenim ? 1 : 0.15);
  const faded = mix(base, [236, 238, 240], 0.35 + wash * 0.2);
  const deep = scale(base, 0.62);
  const thread = hexToRgb(style.stitch ?? (isDenim ? '#c89a52' : '#2a2a2c'));
  r.fill(base);
  if (!isDenim) applyFabric(r, style.kind, base, rng.fork('fabric'));
  if (isDenim) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) if ((x + y) % 3 === 0) r.plot(x, y, scale(base, 0.86), 0.5);
    }
  }
  if (style.selvedge) paintSlub(r, base, rng.fork('slub'));
  if (style.pattern === 'camo') paintCamo(r, rng.fork('camo'));
  const noise = rng.fork('wash');
  const cuffRows = style.cuff > 0 ? 0.1 : 0;
  for (const key of ['legL', 'legR']) {
    const L = px(GARMENT_UV.bottom[key]);
    const outer = key === 'legL' ? 0.25 : 0.75;
    const inner = key === 'legL' ? 0.75 : 0.25;
    r.ellipse(L.x + L.w * 0.5, L.y + L.h * 0.72, L.w * 0.22, L.h * 0.26, faded, 0.55 * wash + 0.1, 1);
    r.ellipse(L.x + L.w * 0.5, L.y + L.h * 0.45, L.w * 0.14, L.h * 0.08, faded, 0.45 * wash, 1);
    r.ellipse(L.x + L.w * 0.0, L.y + L.h * 0.75, L.w * 0.14, L.h * 0.22, faded, 0.35 * wash, 1);
    r.ellipse(L.x + L.w * 1.0, L.y + L.h * 0.75, L.w * 0.14, L.h * 0.22, faded, 0.35 * wash, 1);
    for (let i = 0; i < 150; i++) {
      const x = L.x + noise.next() * L.w;
      const y = L.y + noise.next() * L.h;
      r.ellipse(x, y, 1 + noise.next() * 3, 1 + noise.next() * 4, noise.chance(0.35 + wash * 0.3) ? faded : deep, 0.2 + wash * 0.12, 1);
    }
    if (style.whiskers && isDenim) {
      for (let i = 0; i < 5; i++) {
        const y = L.y + L.h * (0.88 - i * 0.035);
        const cx = L.x + L.w * (key === 'legL' ? 0.62 : 0.38);
        const dir = key === 'legL' ? -1 : 1;
        r.line(cx, y, cx + dir * (6 + i), y - 2, faded, 1, 0.32);
      }
    }
    const stackBands = (style.stack ?? 1) > 0 ? Math.round(2 + style.stack * 4) : 0;
    for (let i = 0; i < stackBands; i++) {
      const y = L.y + L.h * cuffRows + 3 + i * 5 + noise.range(-1, 1);
      r.rect(L.x, y, L.w, 1, deep, 0.28);
      r.rect(L.x, y + 1, L.w, 1, faded, 0.06 * wash);
    }
    const seam = mix(thread, base, 0.45);
    stitch(r, L.x + L.w * outer, L.y, L.x + L.w * outer, L.y + L.h, seam, 2, 0.55);
    stitch(r, L.x + L.w * outer + 2, L.y, L.x + L.w * outer + 2, L.y + L.h, seam, 2, 0.4);
    stitch(r, L.x + L.w * inner, L.y, L.x + L.w * inner, L.y + L.h, seam, 2, 0.4);
    if (style.cinch) {
      // Rib-knit ankle cuff (v 0..0.05 on the leg strip): vertical 1x1 rib, a shade off the leg colour.
      const ribH = Math.max(4, Math.round(L.h * 0.055));
      const rib = scale(base, 0.86);
      r.rect(L.x, L.y, L.w, ribH, rib);
      for (let x = 0; x < L.w; x += 2) r.rect(L.x + x, L.y, 1, ribH, scale(base, 0.7), 0.7);
      r.rect(L.x, L.y + ribH, L.w, 1, deep, 0.8);
    } else {
      // Turned hem: folded edge shadow plus the hem topstitch a hem-depth above it.
      r.rect(L.x, L.y, L.w, 2, deep, 0.7);
      stitch(r, L.x, L.y + 4, L.x + L.w, L.y + 4, mix(thread, base, 0.35), 2, 0.7);
    }
    if (cuffRows) paintSelvedgeCuff(r, L, cuffRows, outer, base, style.selvedge);
    if (style.fray) paintFray(r, L, base, noise);
    if (style.doubleKnee) paintDoubleKnee(r, L, base, thread);
    if (style.pintuck) r.rect(L.x + L.w * 0.5 - 0.5, L.y, 1, L.h, scale(base, 0.7), 0.7);
    if (style.sideStripe) paintSideStripe(r, L, outer, hexToRgb(style.sideStripe));
    if (style.carpenter) paintCarpenter(r, L, outer, base, thread);
    if (style.rips && style.rips !== 'none') paintRips(r, L, style.rips, base, noise);
    paintLegTop(r, L, key === 'legL' ? 1 : -1, { base, faded, deep, thread, isDenim });
  }
  paintWaist(r, style, base, faded, deep, thread, isDenim);
  return finish(r, rng, 0.07);
}

/** Ripped denim: slashes across the knee (and thighs for heavier levels) with pale weft threads and skin showing. */
function paintRips(r, L, level, base, rng) {
  const weft = mix(base, [242, 240, 232], 0.75);
  const hole = [176, 128, 92];
  const spots = level === 'knees' ? [[0.5, 0.5]] : level === 'distressed' ? [[0.48, 0.5], [0.42, 0.7], [0.6, 0.78]] : [[0.5, 0.48], [0.45, 0.58], [0.55, 0.68], [0.4, 0.78], [0.62, 0.86], [0.5, 0.3]];
  for (const [u, v] of spots) {
    const cx = L.x + L.w * u;
    const cy = L.y + L.h * v;
    const w = L.w * (0.16 + rng.next() * 0.1);
    r.ellipse(cx, cy, w * 0.6, 3.2, mix(base, [236, 238, 240], 0.5), 0.8);
    for (let i = 0; i < 4; i++) {
      const y = cy - 2 + i * 1.4;
      r.line(cx - w / 2, y, cx + w / 2, y + rng.range(-0.6, 0.6), i % 2 ? weft : hole, 1, i % 2 ? 0.9 : 0.55);
    }
  }
}

/** Work pants: a second layer of fabric over each knee, outlined by double stitching. */
function paintDoubleKnee(r, L, base, thread) {
  const y0 = L.y + L.h * 0.38;
  const y1 = L.y + L.h * 0.62;
  r.rect(L.x, y0, L.w, y1 - y0, scale(base, 0.9), 0.7);
  stitch(r, L.x, y0, L.x + L.w, y0, thread, 2, 0.8);
  stitch(r, L.x, y1, L.x + L.w, y1, thread, 2, 0.8);
}

/** Track-pant side stripes down the outseam. */
function paintSideStripe(r, L, outer, color) {
  const x = L.x + L.w * outer;
  r.rect(x - 3, L.y, 2, L.h, color);
  r.rect(x + 1, L.y, 2, L.h, color);
}

/** Carpenter details: hammer loop and a narrow rule pocket on the outer thigh. */
function paintCarpenter(r, L, outer, base, thread) {
  const x = L.x + L.w * outer;
  const top = L.y + L.h * 0.82;
  r.rect(x - 4, top - 18, 8, 18, scale(base, 0.88));
  stitch(r, x - 4, top - 18, x - 4, top, thread, 2, 0.8);
  stitch(r, x + 4, top - 18, x + 4, top, thread, 2, 0.8);
  r.rect(x + 6, top - 6, 3, 10, scale(base, 0.8));
}

/** Cut-off hem: pale weft threads hanging loose under a lighter worn band. */
function paintFray(r, L, base, rng) {
  const weft = mix(base, [240, 238, 228], 0.7);
  r.rect(L.x, L.y, L.w, 6, mix(base, [236, 238, 240], 0.45), 0.6);
  for (let x = L.x; x < L.x + L.w; x += 1) {
    if (rng.chance(0.55)) r.line(x, L.y, x + rng.range(-0.6, 0.6), L.y + 1 + rng.next() * 5, weft, 1, 0.5 + rng.next() * 0.4);
  }
}

/** Raw Japanese denim: irregular vertical slub yarn streaks over the twill. */
function paintSlub(r, base, rng) {
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rng.next() * SIZE);
    const y = rng.next() * SIZE;
    const len = 3 + rng.next() * 9;
    r.rect(x, y, 1, len, rng.chance(0.55) ? scale(mix(base, [120, 140, 190], 0.35), 1.15) : scale(base, 0.7), 0.35 + rng.next() * 0.3);
  }
}

/** Turn-up: the light inside of the denim with the white/red selvedge ID at the outseam. */
function paintSelvedgeCuff(r, L, rows, outer, base, selvedge) {
  const h = L.h * rows;
  const inside = mix(base, [214, 218, 226], 0.55);
  r.rect(L.x, L.y, L.w, h, inside);
  for (let x = L.x; x < L.x + L.w; x += 2) r.rect(x, L.y, 1, h, scale(inside, 0.9), 0.6);
  r.rect(L.x, L.y + h - 1.5, L.w, 1.5, scale(base, 0.6));
  if (!selvedge) return;
  const sx = L.x + L.w * outer;
  r.rect(sx - 2, L.y, 4, h, [240, 238, 232]);
  r.rect(sx - 0.5, L.y, 1, h, [196, 38, 40]);
}

/** Woodland camo: layered organic blobs in four tones. */
function paintCamo(r, rng) {
  r.fill('#76704a');
  const tones = ['#5a6b36', '#6b4a2c', '#2c3222', '#1d1b16'];
  tones.forEach((tone, layer) => {
    const count = [90, 80, 66, 52][layer];
    for (let i = 0; i < count; i++) {
      const cx = rng.next() * SIZE;
      const cy = rng.next() * SIZE;
      const pts = [];
      const rad = 1.8 + rng.next() * (3.4 - layer * 0.5);
      for (let a = 0; a < 9; a++) {
        const ang = (a / 9) * Math.PI * 2;
        const rr = rad * (0.55 + rng.next() * 0.7);
        pts.push([cx + Math.cos(ang) * rr * 1.5, cy + Math.sin(ang) * rr]);
      }
      r.polygon(pts, tone);
    }
  });
}

/** Front pocket, fly and back pocket on the top of a leg tube (legs start at the waistband). */
function paintLegTop(r, L, s, { base, faded, deep, thread, isDenim }) {
  const top = L.y + L.h;
  const u = (v) => L.x + L.w * v;
  const outer = s > 0 ? 0.25 : 0.75;
  r.polyline([[u(0.5 - s * 0.02), top], [u(0.5 - s * 0.08), top - 7], [u(outer + s * 0.03), top - 10]], deep, 1.4, 0.9);
  if (isDenim) {
    r.polyline([[u(0.5 - s * 0.02), top - 1], [u(0.5 - s * 0.08), top - 8], [u(outer + s * 0.03), top - 11]], thread, 1, 0.7);
    const fly = 0.5 + s * 0.12;
    r.line(u(fly), top, u(fly), top - 9, thread, 1, 0.8);
    r.line(u(fly), top - 9, u(fly + s * 0.08), top - 12, thread, 1, 0.8);
    const back = s > 0 ? 0.1 : 0.9;
    r.rect(u(back) - 6, top - 16, 12, 12, scale(base, 0.93));
    stitch(r, u(back) - 6, top - 16, u(back) - 6, top - 4, thread, 2);
    stitch(r, u(back) + 6, top - 16, u(back) + 6, top - 4, thread, 2);
    stitch(r, u(back) - 6, top - 16, u(back) + 6, top - 16, thread, 2);
    r.polyline([[u(back) - 4, top - 11], [u(back), top - 8], [u(back) + 4, top - 11]], faded, 1, 0.6);
    r.ellipse(u(outer + s * 0.03), top - 10, 1, 1, [210, 180, 110]);
  }
}

/** Seat panel shares the leg tops' fabric (wash, fades) so the two read as one garment. */
function continueLegFabric(r, W, bandY) {
  const tile = 14;
  for (let y = W.y; y < bandY; y++) {
    const src = W.y - 1 - ((y - W.y) % tile);
    for (let x = W.x; x < W.x + W.w; x++) {
      const [cr, cg, cb] = r.get(x, src);
      r.plot(x, y, [cr, cg, cb]);
    }
  }
}

/** Jeans back yoke: a V seam dipping to the centre back plus the centre seam, double-stitched. */
function paintBackYoke(r, W, bandY, thread, deep) {
  const seam = mix(thread, deep, 0.35);
  for (const u of [0, 1]) {
    const cx = W.x + W.w * u;
    const dir = u === 0 ? 1 : -1;
    const yokeLow = bandY - (bandY - W.y) * 0.55;
    stitch(r, cx, yokeLow, cx + dir * W.w * 0.22, bandY - 2, seam, 2, 0.8);
    r.line(cx, yokeLow - 1, cx + dir * W.w * 0.22, bandY - 3, deep, 1, 0.35);
    stitch(r, cx + dir * 1, W.y, cx + dir * 1, yokeLow, seam, 2, 0.6);
  }
}

function paintWaist(r, style, base, faded, deep, thread, isDenim) {
  const W = px(GARMENT_UV.bottom.waist);
  const band = { y: W.y + W.h - 8, h: 8 };
  continueLegFabric(r, W, band.y);
  if (isDenim) paintBackYoke(r, W, band.y, thread, deep);
  r.rect(W.x, band.y, W.w, band.h, isDenim ? base : scale(base, 1.1));
  r.rect(W.x, band.y, W.w, 1, deep, 0.8);
  if (isDenim) {
    stitch(r, W.x, band.y + 2, W.x + W.w, band.y + 2, thread, 2);
    stitch(r, W.x, band.y + 6, W.x + W.w, band.y + 6, thread, 2);
    for (const u of [0.12, 0.3, 0.42, 0.58, 0.7, 0.88, 0.0]) r.rect(W.x + W.w * u - 1, band.y - 1, 2, band.h + 1, scale(base, 1.05));
    const cx = W.x + W.w * 0.5;
    r.polyline([[cx + 1, band.y], [cx + 1, W.y + 8], [cx - 4, W.y + 5]], thread, 1, 0.8);
    r.ellipse(cx, band.y + 4, 1.4, 1.4, [200, 190, 160]);
    for (const s of [-1, 1]) {
      const px0 = cx + s * W.w * 0.08;
      const px1 = cx + s * W.w * 0.2;
      r.polyline([[px0, band.y], [px0 + s * 3, band.y - 7], [px1, band.y - 9]], deep, 1.4, 0.9);
      r.ellipse(px1, band.y - 1, 1, 1, [210, 180, 110]);
    }
    r.rect(W.x, W.y, W.w, 3, deep, 0.15);
  } else {
    for (let x = 0; x < W.w; x += 3) r.rect(W.x + x, band.y, 1, band.h, scale(base, 0.75), 0.6);
    const cx = W.x + W.w * 0.5;
    if (style.drawstring) {
      const cord = hexToRgb(style.drawstring);
      r.line(cx - 4, band.y + 3, cx - 5, W.y + 4, cord, 1.4);
      r.line(cx + 4, band.y + 3, cx + 6, W.y + 5, cord, 1.4);
      r.ellipse(cx - 5, W.y + 4, 1.2, 1.5, scale(cord, 1.3));
      r.ellipse(cx + 6, W.y + 5, 1.2, 1.5, scale(cord, 1.3));
    }
    for (const s of [-1, 1]) r.line(cx + s * W.w * 0.14, band.y - 1, cx + s * W.w * 0.2, band.y - 12, deep, 1, 0.8);
    r.line(cx, band.y, cx, W.y + 8, deep, 1, 0.5);
  }
}

/** Open denim vest: pockets with flaps, yoke, button placket, studs along collar/yoke. */
export function paintVest(style, rng) {
  const r = new Raster(SIZE, SIZE);
  const base = hexToRgb(style.color);
  const faded = mix(base, [240, 244, 250], 0.25);
  const deep = scale(base, 0.68);
  const thread = hexToRgb(style.stitch ?? '#d8c08a');
  const stud = hexToRgb(style.studs ?? '#c9ccd2');
  r.fill(base);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if ((x + y) % 3 === 0) r.plot(x, y, scale(base, 0.9), 0.5);
  const bodyTop = SIZE * 0.92;
  const yoke = bodyTop - 26;
  stitch(r, 0, yoke, SIZE, yoke, thread, 2);
  stitch(r, 0, yoke - 2, SIZE, yoke - 2, thread, 2);
  for (const u of [0.1, 0.9]) {
    const cx = SIZE * u;
    const flapY = yoke - 4;
    r.rect(cx - 9, flapY - 18, 18, 16, scale(base, 0.95));
    stitch(r, cx - 9, flapY - 18, cx - 9, flapY - 2, thread);
    stitch(r, cx + 9, flapY - 18, cx + 9, flapY - 2, thread);
    stitch(r, cx - 9, flapY - 18, cx + 9, flapY - 18, thread);
    r.polygon([[cx - 10, flapY], [cx + 10, flapY], [cx + 10, flapY - 6], [cx, flapY - 9], [cx - 10, flapY - 6]], scale(base, 1.04));
    r.polyline([[cx - 10, flapY - 6], [cx, flapY - 9], [cx + 10, flapY - 6]], deep, 1, 0.9);
    r.ellipse(cx, flapY - 6, 1.4, 1.4, stud);
    for (const dx of [-5, 5]) {
      stitch(r, cx + dx, yoke - 1, cx + dx, 6, thread, 2, 0.7);
    }
  }
  for (const u of [0.35, 0.65, 0.5]) stitch(r, SIZE * u, 4, SIZE * u, yoke, thread, 2, 0.6);
  r.rect(0, 0, 4, bodyTop, scale(base, 0.92));
  stitch(r, 3, 0, 3, bodyTop, thread);
  r.rect(SIZE - 4, 0, 4, bodyTop, scale(base, 0.92));
  stitch(r, SIZE - 4, 0, SIZE - 4, bodyTop, thread);
  for (let y = 12; y < bodyTop - 10; y += 16) r.ellipse(SIZE - 7, y, 1.5, 1.5, stud);
  r.rect(0, 0, SIZE, 6, scale(base, 0.9));
  stitch(r, 0, 5, SIZE, 5, thread, 2);
  for (let x = 4; x < SIZE; x += 5) r.ellipse(x, yoke + 5, 1, 1, stud, 0.95);
  const collarY = SIZE * 0.96;
  r.rect(0, collarY - 1, SIZE, SIZE - collarY + 1, scale(base, 0.97));
  for (let x = 2; x < SIZE; x += 4) r.plot(x, collarY + 2, stud, 1);
  wrinkles(r, { x: 0, y: 0, w: SIZE, h: bodyTop }, rng.fork('w'), faded, 30, 0.3);
  wrinkles(r, { x: 0, y: 0, w: SIZE, h: bodyTop * 0.4 }, rng.fork('w2'), deep, 20, 0.3);
  return finish(r, rng, 0.06);
}

export function paintSocks(style, rng) {
  const r = new Raster(32, 32);
  const base = hexToRgb(style.color ?? '#e4e2dc');
  r.fill(base);
  for (let x = 0; x < 32; x += 2) r.rect(x, 20, 1, 12, scale(base, 0.86), 0.8);
  r.rect(0, 0, 32, 6, scale(base, 0.9), 0.6);
  return finish(r, rng, 0.05);
}

/** Shoes: 64px. UV rows: sole [0..0.3], upper [0.3..1] with u = 0.5 on top (laces). */
/**
 * Collar band (texture rows 0.82–1.0, u = 0.5 is the front): continues the lacing up the front for
 * hi-tops/boots, padded lighter rim on top, round ankle patch on hi-top sides, pull tab at the back.
 */
function paintCollar(r, kind, upper, accent) {
  const y0 = 64 * 0.82;
  const h = 64 - y0;
  r.rect(0, y0, 64, h, upper);
  r.rect(0, 64 - 2, 64, 2, scale(upper, kind === 'boot' ? 1.5 : 1.35));
  if (kind === 'hiTop' || kind === 'boot') {
    r.rect(26, y0, 12, h - 2, scale(upper, 0.75));
    for (let y = y0 + 1; y < 64 - 3; y += 3) {
      r.line(27, y, 37, y + 1.5, kind === 'boot' ? scale(upper, 0.45) : accent, 1.2);
      r.line(37, y, 27, y + 1.5, kind === 'boot' ? scale(upper, 0.45) : scale(accent, 0.85), 1);
    }
    if (kind === 'hiTop') {
      r.ellipse(64 * 0.25, y0 + h * 0.45, 3, 3, scale(accent, 0.9));
      r.ellipse(64 * 0.75, y0 + h * 0.45, 3, 3, scale(accent, 0.9));
    }
    r.rect(0, y0, 3, h, scale(upper, 1.4));
    r.rect(61, y0, 3, h, scale(upper, 1.4));
  }
}

export function paintShoes(style, rng) {
  const r = new Raster(64, 64);
  const upper = hexToRgb(style.upper);
  const sole = hexToRgb(style.sole ?? '#e4e2dc');
  const accent = hexToRgb(style.accent ?? style.sole ?? '#e4e2dc');
  r.fill(upper);
  const soleTop = 64 * 0.3;
  r.rect(0, 0, 64, soleTop, sole);
  r.rect(0, soleTop - 3, 64, 1, scale(sole, 0.7), 0.8);
  for (let x = 0; x < 64; x += 3) r.rect(x, 2, 1, 3, scale(sole, 0.75), 0.6);
  if (style.kind === 'clog') {
    r.rect(0, 0, 64, soleTop, sole);
    for (let i = 0; i < 90; i++) r.plot(rng.next() * 64, rng.next() * soleTop, scale(sole, 0.75), 0.7);
    const rubber = [44, 32, 24];
    r.rect(0, 0, 14, soleTop, rubber);
    r.rect(50, 0, 14, soleTop, rubber);
    r.rect(14, 0, 2, soleTop, scale(sole, 0.6));
    r.rect(48, 0, 2, soleTop, scale(sole, 0.6));
    r.rect(0, soleTop - 5, 64, 3, scale(upper, 0.6));
    stitch(r, 0, soleTop + 3, 64, soleTop + 3, scale(upper, 1.4), 2);
    for (let i = 0; i < 200; i++) r.plot(rng.next() * 64, soleTop + rng.next() * (64 - soleTop), scale(upper, 0.85 + rng.next() * 0.3), 0.5);
    r.ellipse(32, 64 * 0.7, 4, 2, scale(upper, 0.8), 0.6);
    return finish(r, rng, 0.05);
  }
  paintCollar(r, style.kind, upper, accent);
  if (style.kind === 'dress') return paintDressShoe(r, upper, sole, soleTop, rng);
  if (style.kind === 'sandal' || style.kind === 'slide') return paintSandal(r, upper, sole, soleTop, rng);
  if (style.kind === 'loafer') {
    paintDressShoe(r, upper, sole, soleTop, rng);
    const vy = (v) => 64 * (0.3 + 0.52 * v);
    r.rect(24, vy(0.42), 16, 4, scale(upper, 0.65));
    r.rect(29, vy(0.42) + 1, 6, 2, scale(upper, 0.35));
    return finish(r, rng, 0.03);
  }
  if (style.kind === 'runner' || style.kind === 'skate') {
    const vy = (v) => 64 * (0.3 + 0.52 * v);
    r.rect(0, 0, 64, soleTop, sole);
    if (style.kind === 'runner') for (let x = 0; x < 64; x += 4) r.rect(x, 3, 2, soleTop - 8, scale(sole, 0.85));
    for (const s of [1, -1]) {
      const cx = 32 + s * 16;
      r.polygon([[cx - 9 * s, vy(0.05)], [cx + 6 * s, vy(0.05)], [cx + 10 * s, vy(0.55)], [cx - 2 * s, vy(0.55)]], accent, 0.9);
    }
    r.rect(26, vy(0.3), 12, vy(0.66) - vy(0.3), scale(upper, 0.78));
    for (let y = vy(0.32); y < vy(0.64); y += 3.5) r.line(27, y, 37, y + 1.5, accent, 1.2);
    if (style.kind === 'skate') r.rect(0, vy(0.82), 64, 64 - vy(0.82), scale(upper, 1.15));
    paintCollar(r, 'low', upper, accent);
    return finish(r, rng, 0.04);
  }
  if (style.kind === 'checker') return paintCheckerShoe(r, upper, sole, accent, soleTop, rng);
  if (style.kind === 'boot') return paintBoot(r, upper, sole, soleTop, rng);
  if (style.kind === 'nubuckBoot') return paintNubuckBoot(r, upper, sole, rng);
  r.rect(0, soleTop, 64, 4, scale(upper, 0.75));
  const vy = (v) => 64 * (0.3 + 0.52 * v);
  const laceX0 = 32 - 6;
  const laceX1 = 32 + 6;
  const laceFrom = vy(style.kind === 'hiTop' ? 0.2 : 0.3);
  const laceTo = vy(0.64);
  r.rect(laceX0 - 1, laceFrom, laceX1 - laceX0 + 2, laceTo - laceFrom, scale(upper, 0.78));
  for (let y = laceFrom + 2; y < laceTo; y += 4) {
    r.line(laceX0, y, laceX1, y + 2, accent, 1.4);
    r.line(laceX1, y, laceX0, y + 2, scale(accent, 0.85), 1.2);
    r.ellipse(laceX0 - 2, y + 1, 0.8, 0.8, scale(accent, 0.8));
    r.ellipse(laceX1 + 2, y + 1, 0.8, 0.8, scale(accent, 0.8));
  }
  if (style.toeCap) {
    r.rect(0, vy(0.8), 64, vy(1) - vy(0.8), accent);
    r.rect(0, vy(0.8), 64, 1, scale(accent, 0.7));
  }
  if (style.kind === 'hiTop') {
    r.rect(0, vy(0.02), 64, 3, scale(upper, 1.35));
    r.ellipse(64 * 0.25, vy(0.3), 3, 3, scale(accent, 0.9), 0.9);
    r.ellipse(64 * 0.75, vy(0.3), 3, 3, scale(accent, 0.9), 0.9);
  } else {
    r.rect(20, vy(0.0), 24, vy(0.12) - vy(0), scale(upper, 1.25));
    r.line(0, vy(0.72), 64, vy(0.72), scale(accent, 0.9), 1, 0.5);
  }
  stitch(r, 0, vy(0.06), 64, vy(0.06), scale(upper, 1.6), 2, 0.6);
  wrinkles(r, { x: 0, y: vy(0.3), w: 64, h: 20 }, rng.fork('w'), scale(upper, 0.7), 10);
  return finish(r, rng, 0.05);
}

/** Checkerboard slip-on: checks on the quarters, plain vamp, white elastic gores, foxing stripe. */
function paintCheckerShoe(r, upper, sole, accent, soleTop, rng) {
  const vy = (v) => 64 * (0.3 + 0.52 * v);
  const light = accent;
  r.rect(0, 0, 64, soleTop, sole);
  r.rect(0, soleTop - 4, 64, 1.5, scale(upper, 1), 0.9);
  for (let y = Math.floor(vy(0)); y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const check = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      r.plot(x, y, check ? upper : light);
    }
  }
  r.rect(24, vy(0.45), 16, vy(1) - vy(0.45), upper);
  r.rect(22, vy(0.4), 20, 2, light);
  r.rect(0, vy(0), 64, 2, scale(light, 0.85));
  return finish(r, rng, 0.03);
}

/** Chunky black boot: lug sole, black laces, pull tab, stitched toe. */
function paintBoot(r, upper, sole, soleTop, rng) {
  const vy = (v) => 64 * (0.3 + 0.52 * v);
  r.rect(0, 0, 64, soleTop, sole);
  for (let x = 0; x < 64; x += 5) r.rect(x, 1, 3, soleTop - 5, scale(sole, 0.6));
  r.rect(0, soleTop - 3, 64, 2, scale(sole, 1.5), 0.5);
  for (let y = vy(0.18); y < vy(0.66); y += 4) {
    r.line(27, y, 37, y + 2, scale(upper, 0.45), 1.4);
    r.line(37, y, 27, y + 2, scale(upper, 0.45), 1.2);
    r.ellipse(25, y + 1, 1, 1, scale(upper, 1.8));
    r.ellipse(39, y + 1, 1, 1, scale(upper, 1.8));
  }
  r.rect(0, vy(0), 64, 3, scale(upper, 1.4));
  stitch(r, 0, vy(0.78), 64, vy(0.78), scale(upper, 1.8), 2, 0.6);
  stitch(r, 0, vy(0.08), 64, vy(0.08), scale(upper, 1.8), 2, 0.6);
  wrinkles(r, { x: 0, y: vy(0.6), w: 64, h: 12 }, rng.fork('w'), scale(upper, 1.6), 8, 0.3);
  return finish(r, rng, 0.04);
}

/**
 * Six-inch nubuck work boot: mottled brushed nubuck, rubber lug sole with a lighter midsole band,
 * double-stitched vamp and toe seams, eyelets low then speed hooks up the shaft, tan laces, and a
 * padded dark leather collar. UV: sole v<0.3, foot box v 0.3..0.82 (heel→toe, u=0.5 on top), shaft v>0.82.
 */
function paintNubuckBoot(r, upper, sole, rng) {
  const S = 64;
  const soleTop = S * 0.3;
  const shaftFrom = S * 0.82;
  const thread = mix(upper, [236, 214, 160], 0.6);
  const lace = mix(upper, [214, 176, 112], 0.55);
  const collarLeather = mix(scale(upper, 0.42), [40, 26, 18], 0.5);
  for (let y = soleTop; y < S; y++) {
    for (let x = 0; x < S; x++) r.plot(x, y, scale(upper, 0.95 + rng.next() * 0.07));
  }
  for (let i = 0; i < 160; i++) r.ellipse(rng.next() * S, soleTop + rng.next() * (S - soleTop), 1 + rng.next() * 2.5, 1 + rng.next() * 2, scale(upper, rng.chance(0.5) ? 1.05 : 0.93), 0.25, 1);
  const outsole = mix(sole, [30, 22, 16], 0.35);
  r.rect(0, 0, S, soleTop, outsole);
  for (let x = 0; x < S; x += 4) {
    r.rect(x, 1, 2, soleTop * 0.55, scale(outsole, 0.55));
    r.rect(x + 2, soleTop * 0.3, 2, soleTop * 0.3, scale(outsole, 0.7));
  }
  r.rect(0, soleTop - 6, S, 4, mix(sole, [210, 170, 110], 0.55));
  stitch(r, 0, soleTop - 4, S, soleTop - 4, scale(thread, 0.9), 2, 0.9);
  r.rect(0, soleTop - 1, S, 1, scale(upper, 0.55));
  const toeCap = S * (0.3 + 0.52 * 0.72);
  for (const dy of [0, 2]) {
    for (let x = 0; x < S; x += 2) r.plot(x, toeCap + dy, thread, 0.9);
  }

  const vampTop = S * (0.3 + 0.52 * 0.4);
  const vampEnd = S * (0.3 + 0.52 * 0.66);
  r.rect(S * 0.42, vampTop, S * 0.16, vampEnd - vampTop, scale(upper, 0.86));
  stitch(r, S * 0.4, vampTop, S * 0.4, vampEnd, thread, 2, 0.85);
  stitch(r, S * 0.6, vampTop, S * 0.6, vampEnd, thread, 2, 0.85);
  for (let y = vampTop + 2, i = 0; y < vampEnd - 2; y += 5, i++) {
    r.ellipse(S * 0.4 - 1, y, 1.3, 1.3, [196, 170, 112]);
    r.ellipse(S * 0.6 + 1, y, 1.3, 1.3, [196, 170, 112]);
    r.line(S * 0.4, y, S * 0.6, y + 2.5, lace, 1.4);
    r.line(S * 0.6, y, S * 0.4, y + 2.5, scale(lace, 0.85), 1.2);
  }
  r.rect(0, shaftFrom, S, S - shaftFrom, scale(upper, 0.97));
  r.rect(S * 0.44, shaftFrom, S * 0.12, S - shaftFrom - 5, scale(upper, 0.82));
  for (let y = shaftFrom + 1; y < S - 5; y += 3) {
    r.rect(S * 0.42, y, 2, 1, [180, 160, 116]);
    r.rect(S * 0.56, y, 2, 1, [180, 160, 116]);
    r.line(S * 0.44, y, S * 0.56, y + 1.5, lace, 1);
  }
  r.rect(0, S - 5, S, 5, collarLeather);
  r.rect(0, S - 5, S, 1, scale(collarLeather, 1.5), 0.7);
  stitch(r, 0, S - 6, S, S - 6, thread, 2, 0.7);
  for (const x of [1, S - 3]) {
    r.rect(x, shaftFrom, 2, S - shaftFrom - 5, scale(upper, 0.78));
    stitch(r, x === 1 ? 4 : S - 5, shaftFrom, x === 1 ? 4 : S - 5, S - 6, thread, 2, 0.7);
  }
  return finish(r, rng, 0.03);
}

/** Cork footbed (suede top, cork sides, dark outsole) + oiled leather straps with a silver buckle patch. */
function paintSandal(r, upper, sole, soleTop, rng) {
  const cork = hexToRgb('#b98c5a');
  const bed = mix(sole, [220, 196, 160], 0.3);
  const rubber = [46, 34, 26];
  r.rect(0, 0, 64, soleTop, cork);
  for (let i = 0; i < 160; i++) r.plot(rng.next() * 64, rng.next() * soleTop, scale(cork, 0.7 + rng.next() * 0.5), 0.8);
  r.rect(0, 0, 11, soleTop, rubber);
  r.rect(53, 0, 11, soleTop, rubber);
  r.rect(22, 0, 20, soleTop, bed);
  r.rect(21, 0, 1, soleTop, scale(bed, 0.7));
  r.rect(42, 0, 1, soleTop, scale(bed, 0.7));
  r.ellipse(32, soleTop * 0.2, 6, 3, scale(bed, 0.85), 0.6, 1);
  r.ellipse(32, soleTop * 0.75, 7, 3, scale(bed, 0.85), 0.6, 1);
  r.rect(0, soleTop, 64, 64 - soleTop, upper);
  for (let y = soleTop; y < 64; y++) r.plot((y * 7) % 64, y, scale(upper, 1.2), 0.4);
  stitch(r, 0, soleTop + 3, 64, soleTop + 3, scale(upper, 1.6), 2, 0.7);
  stitch(r, 0, 60, 64, 60, scale(upper, 1.6), 2, 0.7);
  wrinkles(r, { x: 0, y: soleTop, w: 64, h: 64 - soleTop }, rng.fork('w'), scale(upper, 0.75), 10);
  r.rect(58, 59, 6, 5, [196, 198, 204]);
  r.rect(59, 60, 4, 3, [120, 122, 128]);
  return finish(r, rng, 0.04);
}

/** Polished derby: welt stitch, cap-toe seam, thin laces, a painted gloss band along the top. */
function paintDressShoe(r, upper, sole, soleTop, rng) {
  const vy = (v) => 64 * (0.3 + 0.52 * v);
  r.rect(0, 0, 64, soleTop, sole);
  r.rect(0, 0, 64 * 0.3, soleTop, scale(sole, 0.8));
  stitch(r, 0, soleTop - 4, 64, soleTop - 4, scale(sole, 1.8), 2, 0.7);
  r.rect(0, vy(0), 64, 2, scale(upper, 0.6));
  r.line(0, vy(0.78), 64, vy(0.78), scale(upper, 0.55), 1, 0.9);
  for (let y = vy(0.34); y < vy(0.52); y += 3) r.line(28, y, 36, y + 1, scale(upper, 1.9), 1, 0.8);
  r.rect(26, vy(0.3), 1, vy(0.54) - vy(0.3), scale(upper, 0.5));
  r.rect(37, vy(0.3), 1, vy(0.54) - vy(0.3), scale(upper, 0.5));
  for (let x = 0; x < 64; x++) {
    const d = Math.abs(x - 32) / 32;
    r.rect(x, vy(0.55), 1, vy(0.98) - vy(0.55), [210, 214, 222], Math.max(0, 0.32 - d * 0.9));
  }
  r.line(10, vy(0.2), 54, vy(0.2), [200, 204, 212], 1, 0.25);
  return finish(r, rng, 0.03);
}

/** Original patch: white-bordered black panel with two floral crosses and ornament bars (no lettering). */
function paintGothicPatch(raster, cx, cy, k = 1) {
  const r = {
    rect: (x, y, w, h, c, a) => raster.rect(cx + (x - cx) * k, cy + (y - cy) * k, w * k, h * k, c, a),
    polygon: (pts, c) => raster.polygon(pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]), c),
    plot: (x, y, c) => raster.rect(cx + (x - cx) * k, cy + (y - cy) * k, k, k, c),
  };
  const white = [232, 232, 228];
  const black = [16, 16, 18];
  r.rect(cx - 9, cy - 7, 18, 14, white);
  r.rect(cx - 8, cy - 6, 16, 12, black);
  const flower = (x, y) => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      r.polygon([[x, y], [x + dx * 2.4 - dy * 0.9, y + dy * 2.4 - dx * 0.9], [x + dx * 2.9, y + dy * 2.9], [x + dx * 2.4 + dy * 0.9, y + dy * 2.4 + dx * 0.9]], white);
    }
  };
  flower(cx - 4.5, cy);
  flower(cx + 4.5, cy);
  r.rect(cx - 0.5, cy - 2.5, 1, 5, white);
  for (let x = cx - 6; x <= cx + 6; x += 2) {
    r.plot(x, cy + 4, white);
    r.plot(x, cy - 4, white);
  }
}

function paintStar(r, cx, cy, size, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? size : size * 0.42;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  r.polygon(pts, color);
}

/** Black leather strap (edge stitching) + oval openwork silver buckle: cross in an oval frame. */
export function paintBelt(style, rng) {
  const r = new Raster(128, 64);
  const leather = hexToRgb(style.color ?? '#141414');
  const silver = hexToRgb(style.buckle ?? '#c9ccd2');
  r.fill(leather);
  for (let i = 0; i < 200; i++) r.plot(rng.next() * 128, rng.next() * 32, scale(leather, 1.6), 0.4);
  stitch(r, 0, 4, 128, 4, scale(leather, 2.4), 2, 0.8);
  stitch(r, 0, 28, 128, 28, scale(leather, 2.4), 2, 0.8);
  r.rect(0, 14, 128, 3, scale(leather, 1.5), 0.5);
  const cx = 32;
  const cy = 48;
  r.rect(0, 32, 64, 32, scale(silver, 0.35));
  r.ellipse(cx, cy, 30, 15, scale(silver, 0.75));
  r.ellipse(cx, cy, 27, 13, scale(silver, 1.1));
  r.ellipse(cx, cy, 22, 10, scale(silver, 0.3));
  const cross = (x, y, s, c) => {
    r.polygon([[x - s * 0.3, y + s], [x + s * 0.3, y + s], [x + s * 0.12, y + s * 0.2], [x + s, y + s * 0.3], [x + s, y - s * 0.3], [x + s * 0.12, y - s * 0.2], [x + s * 0.3, y - s], [x - s * 0.3, y - s], [x - s * 0.12, y - s * 0.2], [x - s, y - s * 0.3], [x - s, y + s * 0.3], [x - s * 0.12, y + s * 0.2]], c);
  };
  cross(cx, cy, 9, scale(silver, 1.15));
  cross(cx, cy, 5, scale(silver, 0.8));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cross(cx + Math.cos(a) * 24.5, cy + Math.sin(a) * 11.5, 2.2, scale(silver, 1.25));
  }
  r.verticalGradient(32, 64, [255, 255, 255], [60, 60, 70], 0.12);
  r.rect(64, 32, 64, 32, scale(silver, 0.8));
  for (let x = 64; x < 128; x += 3) r.rect(x, 32, 1, 32, scale(silver, 1.2), 0.6);
  return finish(r, rng, 0.03);
}

export function paintKnit(style, rng) {
  const r = new Raster(64, 64);
  const base = hexToRgb(style.color);
  r.fill(base);
  for (let x = 0; x < 64; x += 3) {
    r.rect(x, 0, 1, 64, scale(base, 0.72));
    r.rect(x + 1, 0, 1, 64, scale(base, 1.1), 0.5);
  }
  if (style.cuff !== false) r.rect(0, 0, 64, 12, scale(base, 0.9), 0.6);
  return finish(r, rng, 0.05);
}

export function paintCap(style, rng) {
  const r = new Raster(64, 64);
  const base = hexToRgb(style.color);
  r.fill(base);
  const crownFrom = 64 * 0.35;
  for (const u of [0.0, 0.1667, 0.3333, 0.5, 0.6667, 0.8333]) {
    r.line(64 * u, crownFrom, 64 * u, 64, scale(base, 0.6), 1, 0.8);
  }
  if (style.front) {
    const front = hexToRgb(style.front);
    r.rect(64 * 0.3334, crownFrom, 64 * 0.3333, 64 - crownFrom, front);
    r.line(32, crownFrom, 32, 64, scale(front, 0.6), 1, 0.8);
    if (style.stars) {
      for (let i = 0; i < 9; i++) paintStar(r, 24 + (i % 3) * 8 + (Math.floor(i / 3) % 2) * 4, crownFrom + 8 + Math.floor(i / 3) * 9, 2.4, [236, 236, 232]);
    }
  }
  if (style.style === 'trucker') {
    const mesh = hexToRgb(style.mesh ?? style.color);
    for (const [x0, x1] of [[0, 18], [46, 64]]) {
      r.rect(x0, crownFrom, x1 - x0, 64 - crownFrom, scale(mesh, 0.85));
      for (let y = crownFrom; y < 64; y += 2) for (let x = x0; x < x1; x += 2) r.plot(x + ((y / 2) % 2), y, scale(mesh, 1.6), 0.8);
    }
  }
  r.rect(0, crownFrom, 64, 3, scale(base, 0.7));
  r.rect(0, 60, 64, 4, scale(base, 0.8));
  const bill = style.billColor ? hexToRgb(style.billColor) : scale(base, 0.92);
  r.rect(0, 0, 64, crownFrom, bill);
  for (let i = 1; i < 5; i++) r.rect(0, crownFrom * (i / 5), 64, 1, scale(bill, 0.75), 0.7);
  wrinkles(r, { x: 0, y: crownFrom, w: 64, h: 20 }, rng.fork('w'), scale(base, 0.75), 8);
  if (style.patch === 'gothicCross') {
    const hi = new Raster(128, 128).blit(r, 0, 0, 128, 128);
    paintGothicPatch(hi, 64, (crownFrom + 13) * 2, 2);
    return finish(hi, rng, 0.04);
  }
  return finish(r, rng, 0.05);
}

export function paintHair(kind, color, rootColor, rng) {
  const r = new Raster(64, 64);
  const base = hexToRgb(color);
  const root = hexToRgb(rootColor ?? color);
  r.fill(base);
  const hi = mix(base, [255, 250, 235], 0.22);
  const lo = scale(base, 0.55);
  if (kind === 'fade') {
    r.verticalGradient(0, 64, base, mix(base, [150, 110, 90], 0.45));
    for (let i = 0; i < 900; i++) r.plot(rng.next() * 64, rng.next() * 64, lo, 0.5);
    return finish(r, rng, 0.05);
  }
  if (kind === 'waves') {
    for (let y = 0; y < 64; y += 3) {
      for (let x = 0; x < 64; x++) r.plot(x, y + Math.round(Math.sin(x * 0.4) * 1.2), hi, 0.55);
      for (let x = 0; x < 64; x++) r.plot(x, y + 1 + Math.round(Math.sin(x * 0.4) * 1.2), lo, 0.6);
    }
    return finish(r, rng, 0.05);
  }
  if (kind === 'cornrows') {
    r.fill(mix(base, [150, 110, 90], 0.35));
    for (let x = 0; x < 64; x += 5) {
      for (let y = 0; y < 64; y += 3) {
        r.ellipse(x + 2.5, y + 1.5, 2, 1.6, base);
        r.line(x + 1, y + 2.5, x + 4, y + 0.5, hi, 1, 0.4);
      }
    }
    return finish(r, rng, 0.05);
  }
  if (kind === 'coils') {
    for (let i = 0; i < 2600; i++) {
      const x = rng.next() * 64;
      const y = rng.next() * 64;
      r.plot(x, y, rng.chance(0.35) ? hi : lo, 0.45 + rng.next() * 0.4);
    }
    for (let i = 0; i < 160; i++) r.rect(rng.next() * 64, rng.next() * 64, 2, 1, lo, 0.5);
    r.verticalGradient(0, 8, base, lo, 0.6);
  } else if (kind === 'locRoots' || kind === 'locs') {
    if (kind === 'locRoots') {
      for (let y = 0; y < 64; y += 8) {
        const off = (y / 8) % 2 ? 4 : 0;
        for (let x = -8; x < 64; x += 8) {
          r.rect(x + off + 1, y + 1, 6, 6, scale(base, 0.85 + rng.next() * 0.3));
          r.ellipse(x + off + 4, y + 4, 2, 2, scale(base, 1.1), 0.6, 1);
        }
        r.rect(0, y, 64, 1, scale(root, 0.6));
      }
      for (let x = 0; x < 64; x += 8) r.rect(x, 0, 1, 64, scale(root, 0.7), 0.6);
    } else {
      for (let x = 0; x < 64; x += 16) {
        for (let y = 0; y < 64; y += 5) {
          r.rect(x + 1, y, 14, 4, scale(base, 0.9 + rng.next() * 0.25));
          r.rect(x + 1, y + 4, 14, 1, lo, 0.7);
          r.rect(x + 3 + rng.next() * 8, y + 1, 2, 2, hi, 0.6);
        }
      }
      r.verticalGradient(0, 64 * 0.3, base, root, 1);
    }
  } else {
    for (let i = 0; i < 180; i++) {
      const x = rng.next() * 64;
      const y = rng.next() * 64;
      r.line(x, y, x + rng.range(-1, 1), y + 3 + rng.next() * 5, rng.chance(0.5) ? hi : lo, 1, 0.55);
    }
    r.verticalGradient(0, 8, base, lo, 0.5);
  }
  return finish(r, rng, 0.08);
}

export function paintMetal(color, rng, { links = false } = {}) {
  const r = new Raster(32, 32);
  const base = hexToRgb(color);
  r.fill(base);
  r.verticalGradient(0, 32, mix(base, [255, 255, 240], 0.35), scale(base, 0.6));
  if (links) for (let x = 0; x < 32; x += 4) r.rect(x, 0, 2, 32, scale(base, 0.55), 0.7);
  return finish(r, rng, 0.04);
}

/** Mirrored shield lens: sky gradient top, dark horizon band, bright streaks. */
export function paintShieldLens(style, rng) {
  const r = new Raster(64, 32);
  const tint = hexToRgb(style.color ?? '#b8c4d4');
  r.verticalGradient(0, 32, mix(tint, [255, 255, 255], 0.5), scale(tint, 0.35));
  r.rect(0, 13, 64, 5, scale(tint, 0.5), 0.8);
  for (let i = 0; i < 5; i++) {
    const x = 6 + i * 13 + rng.range(-2, 2);
    r.line(x, 28, x + 6, 4, [250, 252, 255], 1.5, 0.55);
  }
  r.rect(0, 30, 64, 2, scale(tint, 0.3));
  return finish(r, rng, 0.03);
}

export function paintSolid(color, rng) {
  const r = new Raster(16, 16);
  r.fill(color);
  return finish(r, rng, 0.05);
}
