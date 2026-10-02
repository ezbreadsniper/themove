import { Raster } from './raster.js';
import { hexToRgb, scale, mix } from '../core/color.js';
import { GARMENT_UV } from '../geo/parts/garments.js';
import { applyFabric } from './fabric.js';
import { finish, px, stitch, wrinkles, GARMENT_TEX_SIZE } from './garments.js';

/** Fabric prints shared by tops, dresses and skirts. */
export const PRINTS = ['floral', 'gingham', 'polka'];

/**
 * Paints a print over a rect. accent: motif colour; secondary: leaf / second colour. Motifs are a few
 * texels wide so they survive the PS2 resolution.
 */
export function paintPrint(r, rect, pattern, base, accent, rng, secondary = null) {
  const { x, y, w, h } = rect;
  if (pattern === 'polka') {
    const step = 7;
    for (let j = 0; j * step < h + step; j++) {
      for (let i = 0; i * step < w + step; i++) {
        r.ellipse(x + i * step + (j % 2) * step * 0.5, y + j * step, 1.4, 1.4, accent, 0.95, 1);
      }
    }
  } else if (pattern === 'gingham') {
    const step = 6;
    const band = mix(base, accent, 0.45);
    for (let i = 0; i * step < w; i += 2) r.rect(x + i * step, y, step, h, band, 0.55);
    for (let j = 0; j * step < h; j += 2) r.rect(x, y + j * step, w, step, band, 0.55);
    for (let j = 0; j * step < h; j += 2) for (let i = 0; i * step < w; i += 2) r.rect(x + i * step, y + j * step, step, step, accent, 0.75);
  } else if (pattern === 'floral') {
    const leaf = secondary ?? mix(accent, [60, 110, 60], 0.65);
    const count = Math.round((w * h) / 70);
    for (let n = 0; n < count; n++) {
      const cx = x + rng.next() * w;
      const cy = y + rng.next() * h;
      const s = 1.1 + rng.next() * 0.9;
      r.ellipse(cx + s * 1.6, cy + s * 0.9, s * 1.1, s * 0.6, leaf, 0.85, 1);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + n;
        r.ellipse(cx + Math.cos(a) * s, cy + Math.sin(a) * s, s * 0.75, s * 0.75, accent, 0.95, 1);
      }
      r.ellipse(cx, cy, s * 0.45, s * 0.45, mix(accent, [250, 220, 90], 0.7), 1, 1);
    }
  }
}

/**
 * Tops beyond the basic tee: knit sweaters (rib hem, cuffs and neck) and button-up shirts (placket,
 * buttons, cuffs), plus prints. Paints on the same UV layout as paintTop, so the geometry is shared.
 */
export function paintStyledTop(style, rng) {
  const r = new Raster(GARMENT_TEX_SIZE, GARMENT_TEX_SIZE);
  const base = hexToRgb(style.color);
  const accent = hexToRgb(style.accent ?? style.trim ?? '#f4f0e6');
  r.fill(base);
  applyFabric(r, style.fabric ?? (style.type === 'sweater' ? 'knit' : 'cotton'), base, rng.fork('fabric'));
  const body = px(GARMENT_UV.top.body);
  const dark = scale(base, 0.72);
  if (PRINTS.includes(style.pattern)) {
    paintPrint(r, body, style.pattern, base, accent, rng.fork('print'));
    for (const key of ['sleeveL', 'sleeveR']) paintPrint(r, px(GARMENT_UV.top[key]), style.pattern, base, accent, rng.fork(key));
  }
  wrinkles(r, { ...body, h: body.h * 0.45 }, rng.fork('w'), dark, 30);
  const collar = px(GARMENT_UV.top.collar);
  if (style.type === 'sweater') {
    const rib = scale(base, 0.86);
    const ribBand = (rect, rows) => {
      r.rect(rect.x, rect.y, rect.w, rows, rib);
      for (let xx = 0; xx < rect.w; xx += 2) r.rect(rect.x + xx, rect.y, 1, rows, scale(base, 0.7), 0.7);
    };
    ribBand(body, 12);
    ribBand({ ...collar, y: collar.y - 4 }, collar.h + 4);
    for (const key of ['sleeveL', 'sleeveR']) {
      const s = px(GARMENT_UV.top[key]);
      ribBand({ ...s, y: s.y + s.h - 10 }, 10);
      for (let yy = s.y; yy < s.y + s.h - 10; yy += 4) r.rect(s.x, yy, s.w, 1, scale(base, 0.9), 0.4);
    }
    for (let yy = body.y + 12; yy < body.y + body.h; yy += 4) r.rect(body.x, yy, body.w, 1, scale(base, 0.9), 0.35);
  }
  if (style.type === 'buttonUp') {
    const cx = body.x + body.w * 0.5;
    r.rect(cx - 3, body.y, 6, body.h, scale(base, 0.94));
    r.rect(cx - 3, body.y, 1, body.h, dark, 0.7);
    r.rect(cx + 2, body.y, 1, body.h, dark, 0.5);
    const button = mix(base, [245, 242, 235], 0.75);
    for (let yy = body.y + 14; yy < body.y + body.h - 8; yy += 18) {
      r.ellipse(cx, yy, 1.6, 1.6, button, 1, 1);
      r.plot(cx, yy, scale(button, 0.6), 0.8);
    }
    r.rect(collar.x, collar.y - 2, collar.w, collar.h + 2, scale(base, 0.9));
    for (const key of ['sleeveL', 'sleeveR']) {
      const s = px(GARMENT_UV.top[key]);
      r.rect(s.x, s.y + s.h - 9, s.w, 8, scale(base, 0.92));
      stitch(r, s.x, s.y + s.h - 9, s.x + s.w, s.y + s.h - 9, dark, 2, 0.7);
    }
    r.rect(body.x, body.y, body.w, 3, dark, 0.7);
  }
  return finish(r, rng);
}

/**
 * Leggings and bike shorts: smooth stretch jersey with flatlock side and inseam seams, a wide
 * waistband and soft knee / seat shading (no fly, pockets or hem turn-up).
 */
export function paintLeggings(style, rng) {
  const r = new Raster(GARMENT_TEX_SIZE, GARMENT_TEX_SIZE);
  const base = hexToRgb(style.color);
  r.fill(base);
  applyFabric(r, style.kind ?? 'jersey', base, rng.fork('fabric'));
  const seam = scale(base, 0.75);
  const sheen = scale(mix(base, [255, 255, 255], 0.12), 1.05);
  for (const key of ['legL', 'legR']) {
    const L = px(GARMENT_UV.bottom[key]);
    const outer = key === 'legL' ? 0.25 : 0.75;
    const inner = key === 'legL' ? 0.75 : 0.25;
    r.ellipse(L.x + L.w * 0.5, L.y + L.h * 0.5, L.w * 0.12, L.h * 0.06, sheen, 0.5, 1);
    r.ellipse(L.x + L.w * 0.5, L.y + L.h * 0.82, L.w * 0.2, L.h * 0.12, sheen, 0.35, 1);
    for (const u of [outer, inner]) {
      r.rect(L.x + L.w * u - 1, L.y, 2, L.h, seam, 0.8);
      stitch(r, L.x + L.w * u + 2, L.y, L.x + L.w * u + 2, L.y + L.h, scale(base, 0.85), 2, 0.6);
    }
    if (style.sideStripe) r.rect(L.x + L.w * outer - 3, L.y, 6, L.h, hexToRgb(style.sideStripe));
    r.rect(L.x, L.y, L.w, 3, seam, 0.6);
  }
  const W = px(GARMENT_UV.bottom.waist);
  r.rect(W.x, W.y + W.h * 0.45, W.w, W.h * 0.55, scale(base, 0.9));
  stitch(r, W.x, W.y + W.h * 0.45, W.x + W.w, W.y + W.h * 0.45, seam, 2, 0.8);
  return finish(r, rng, 0.04);
}
