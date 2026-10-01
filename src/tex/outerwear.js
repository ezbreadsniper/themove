import { Raster } from './raster.js';
import { hexToRgb, scale } from '../core/color.js';
import { GARMENT_UV } from '../geo/parts/garments.js';
import { px, finish, wrinkles, stitch } from './garments.js';
import { applyFabric } from './fabric.js';

const SIZE = 128;
const DEFAULT_FABRIC = { hoodie: 'fleece', zipHoodie: 'fleece', track: 'nylon', bomber: 'nylon', denimJacket: 'denim', puffer: 'nylon' };
export const outerFabric = (style) => style.fabric ?? DEFAULT_FABRIC[style.type] ?? 'cotton';

/** Ribbed band (cuffs, hems, collars): fine vertical ribs. */
function rib(r, x, y, w, h, base) {
  r.rect(x, y, w, h, scale(base, 0.92));
  for (let i = x; i < x + w; i += 2) r.rect(i, y, 1, h, scale(base, 0.78), 0.8);
}

/**
 * Jacket / hoodie texture on the shared top UV layout (body, two sleeves, collar strip).
 * style: { type, color, trim, stripe, open }
 */
export function paintJacket(style, rng) {
  const r = new Raster(SIZE, SIZE);
  const base = hexToRgb(style.color);
  const trim = hexToRgb(style.trim ?? style.color);
  const stripe = hexToRgb(style.stripe ?? '#ecebe6');
  r.fill(base);
  applyFabric(r, style.fabric ?? DEFAULT_FABRIC[style.type] ?? 'cotton', base, rng.fork('fabric'));
  const body = px(GARMENT_UV.top.body);
  const dark = scale(base, 0.7);
  const cx = body.x + body.w * 0.5;
  wrinkles(r, { ...body, h: body.h * 0.5 }, rng.fork('w'), dark, 46);
  for (const u of [0.25, 0.75]) r.rect(body.x + body.w * u - 0.5, body.y, 1, body.h, scale(base, 0.78), 0.6);

  const hemBand = style.type === 'denimJacket' || style.type === 'puffer' ? 0 : style.type === 'track' ? 4 : 8;
  if (hemBand) rib(r, body.x, body.y, body.w, hemBand, style.type === 'bomber' ? trim : base);
  for (const key of ['sleeveL', 'sleeveR']) {
    const s = px(GARMENT_UV.top[key]);
    wrinkles(r, s, rng.fork(key), dark, 22);
    if (style.type !== 'denimJacket') rib(r, s.x, s.y + s.h - 7, s.w, 7, style.type === 'bomber' ? trim : base);
    else r.rect(s.x, s.y + s.h - 7, s.w, 7, scale(base, 0.9));
    if (style.type === 'track') {
      for (const du of [-0.08, 0.08]) r.rect(s.x + s.w * (0.25 + du) - 1.5, s.y, 3, s.h - 7, stripe);
    }
    if (style.type === 'bomber' && key === 'sleeveL') {
      r.rect(s.x + s.w * 0.15, s.y + s.h * 0.25, 10, 12, scale(base, 0.85));
      r.rect(s.x + s.w * 0.15 + 4, s.y + s.h * 0.25 + 1, 1, 10, [200, 200, 205]);
    }
  }

  const zip = style.type === 'zipHoodie' || style.type === 'track' || style.type === 'bomber';
  if (zip && !style.open) {
    r.rect(cx - 1.5, body.y, 3, body.h, scale(base, 0.6));
    for (let y = body.y; y < body.y + body.h; y += 2) r.plot(cx, y, [190, 192, 198]);
    r.rect(cx - 2, body.y + body.h - 14, 4, 5, [205, 207, 212]);
  }
  if (style.type === 'hoodie' || style.type === 'zipHoodie') {
    const py = body.y + hemBand + 4;
    const pts = [[cx - 26, py], [cx + 26, py], [cx + 20, py + 26], [cx - 20, py + 26]];
    r.polygon(pts, scale(base, 0.94));
    r.polyline([...pts, pts[0]], dark, 1.2);
    if (style.type === 'zipHoodie') r.rect(cx - 1.5, py, 3, 26, scale(base, 0.6));
    const cord = hexToRgb(style.trim ?? '#e4e2dc');
    const top = body.y + body.h;
    r.line(cx - 7, top - 4, cx - 8, top - 26, cord, 1.4);
    r.line(cx + 7, top - 4, cx + 8, top - 24, cord, 1.4);
    r.rect(cx - 9, top - 29, 2, 3, scale(cord, 0.8));
    r.rect(cx + 7, top - 27, 2, 3, scale(cord, 0.8));
  }
  if (style.type === 'denimJacket') paintDenimJacketDetails(r, body, base);
  if (style.type === 'puffer') paintPufferDetails(r, body, base);
  const collar = px(GARMENT_UV.top.collar);
  if (style.type === 'bomber' || style.type === 'track') rib(r, 0, collar.y - 1, SIZE, collar.h + 1, style.type === 'bomber' ? trim : base);
  else if (style.type === 'puffer') r.rect(0, collar.y - 1, SIZE, collar.h + 1, scale(base, 0.95));
  else r.rect(0, collar.y - 1, SIZE, collar.h + 1, scale(base, 0.88));
  return finish(r, rng, 0.06);
}

/** Trucker-jacket details: twill diagonal, button placket, chest pockets with flaps, yoke stitching. */
function paintDenimJacketDetails(r, body, base) {
  const thread = [212, 170, 92];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if ((x + y) % 3 === 0) r.plot(x, y, scale(base, 0.88), 0.5);
  const cx = body.x + body.w * 0.5;
  const yoke = body.y + body.h - 22;
  stitch(r, body.x, yoke, body.x + body.w, yoke, thread, 2);
  for (const s of [-1, 1]) {
    const px0 = cx + s * body.w * 0.14;
    r.rect(px0 - 8, yoke - 16, 16, 13, scale(base, 0.95));
    r.polygon([[px0 - 9, yoke - 2], [px0 + 9, yoke - 2], [px0 + 9, yoke - 8], [px0, yoke - 10], [px0 - 9, yoke - 8]], scale(base, 1.05));
    r.ellipse(px0, yoke - 7, 1.4, 1.4, [190, 160, 110]);
    stitch(r, px0 - 8, yoke - 16, px0 - 8, yoke - 3, thread, 2);
    stitch(r, px0 + 8, yoke - 16, px0 + 8, yoke - 3, thread, 2);
  }
  for (let y = body.y + 10; y < yoke; y += 14) r.ellipse(cx + 4, y, 1.4, 1.4, [190, 160, 110]);
  stitch(r, cx + 6, body.y, cx + 6, body.y + body.h, thread, 2);

}

/** Puffer: rounded baffle shading between stitch lines, a zip with a storm flap, side seams. */
function paintPufferDetails(r, body, base) {
  const baffles = 7;
  const step = body.h / baffles;
  for (let i = 0; i < baffles; i++) {
    const y0 = body.y + i * step;
    for (let dy = 0; dy < step; dy++) {
      const t = dy / step;
      const tone = 0.74 + 0.36 * Math.sin(Math.PI * t) + 0.08 * (t - 0.5);
      r.rect(body.x, y0 + dy, body.w, 1, scale(base, tone), 0.55);
    }
    r.rect(body.x, y0, body.w, 1, scale(base, 0.5), 0.85);
  }
  const cx = body.x + body.w * 0.5;
  r.rect(cx - 2.5, body.y, 5, body.h, scale(base, 0.82));
  r.rect(cx - 0.5, body.y, 1, body.h, scale(base, 0.45));
  for (let y = body.y; y < body.y + body.h; y += 2) r.plot(cx, y, [150, 150, 152], 0.6);
  r.rect(cx - 1.5, body.y + body.h - 10, 3, 6, [190, 190, 194]);
  for (const s of [-1, 1]) {
    const px0 = cx + s * body.w * 0.17;
    r.line(px0 - 6 * s, body.y + 8, px0 + 2 * s, body.y + 26, scale(base, 0.5), 1, 0.8);
  }
}
