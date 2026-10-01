import { mix, scale } from '../core/color.js';

/**
 * Fabric surface treatments painted over a garment's base colour, plus the material response the
 * renderer should use. Weave scale is in texels of the 128px garment texture.
 */
export const FABRICS = {
  cotton: { shininess: 0 },
  jersey: { shininess: 0 },
  denim: { shininess: 0 },
  twill: { shininess: 0 },
  canvas: { shininess: 0 },
  corduroy: { shininess: 0 },
  fleece: { shininess: 0 },
  knit: { shininess: 0 },
  mesh: { shininess: 0 },
  nylon: { shininess: 40, specular: '#4a4a52' },
  satin: { shininess: 60, specular: '#6a6a72' },
  leather: { shininess: 28, specular: '#3a3634' },
  suede: { shininess: 0 },
  spandex: { shininess: 22, specular: '#34343a' },
};

export const FABRIC_NAMES = Object.keys(FABRICS);

/** Paints the fabric texture over the whole raster (call before seams/prints so details stay on top). */
export function applyFabric(r, fabric, base, rng) {
  const W = r.width;
  const H = r.height;
  const dark = scale(base, 0.82);
  const light = scale(mix(base, [255, 255, 255], 0.1), 1.08);
  switch (fabric) {
    case 'spandex':
      for (let x = 0; x < W; x++) {
        const band = Math.sin((x / W) * Math.PI * 8);
        if (band > 0.55) r.rect(x, 0, 1, H, light, (band - 0.55) * 0.9);
      }
      break;
    case 'twill':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 4 === 0) r.plot(x, y, dark, 0.55);
      break;
    case 'denim':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 3 === 0) r.plot(x, y, dark, 0.5);
      break;
    case 'canvas':
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { r.plot(x, y, dark, 0.35); r.plot(x + 1, y + 1, light, 0.25); }
      break;
    case 'corduroy':
      for (let x = 0; x < W; x += 3) { r.rect(x, 0, 1, H, dark, 0.7); r.rect(x + 1, 0, 1, H, light, 0.35); }
      break;
    case 'fleece':
      for (let i = 0; i < W * H * 0.35; i++) r.plot(rng.next() * W, rng.next() * H, rng.chance(0.5) ? light : dark, 0.35);
      break;
    case 'knit':
      for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 4) {
        r.line(x, y, x + 2, y + 2, dark, 1, 0.5);
        r.line(x + 2, y + 2, x + 4, y, dark, 1, 0.5);
      }
      break;
    case 'mesh':
      for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 2; x < W; x += 2) r.plot(x, y, scale(base, 0.55), 0.85);
      break;
    case 'nylon':
      for (let y = 0; y < H; y += 6) r.rect(0, y, W, 1, light, 0.25);
      for (let i = 0; i < 40; i++) {
        const x = rng.next() * W;
        const y = rng.next() * H;
        r.line(x, y, x + 6 + rng.next() * 8, y + rng.range(-2, 2), light, 1, 0.35);
      }
      break;
    case 'satin':
      for (let x = 0; x < W; x++) r.rect(x, 0, 1, H, light, 0.12 + 0.12 * Math.sin(x * 0.2));
      break;
    case 'leather':
      for (let i = 0; i < W * H * 0.12; i++) r.plot(rng.next() * W, rng.next() * H, rng.chance(0.6) ? dark : light, 0.4);
      for (let i = 0; i < 30; i++) {
        const x = rng.next() * W;
        const y = rng.next() * H;
        r.line(x, y, x + rng.range(-5, 5), y + rng.range(2, 6), dark, 1, 0.35);
      }
      break;
    case 'suede':
      for (let i = 0; i < W * H * 0.5; i++) r.plot(rng.next() * W, rng.next() * H, rng.chance(0.5) ? scale(base, 1.06) : scale(base, 0.92), 0.5);
      break;
    case 'jersey':
      for (let x = 0; x < W; x += 2) r.rect(x, 0, 1, H, scale(base, 0.93), 0.4);
      break;
    default:
      break;
  }
}
