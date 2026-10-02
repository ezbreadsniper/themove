import { drawTextCentered } from './font.js';

/**
 * Decal textures: alpha-blended overlays laid on top of base surfaces (wear, paint, stains), plus
 * small opaque inserts (manholes, grates). Decals carry `decal: true` so their material gets a
 * polygon offset instead of a physical gap, which is what keeps them from z-fighting.
 */
function wornStripe(r, rng, color, wear) {
  r.rect(0, 0, r.width, r.height, color, 0.92);
  for (let i = 0; i < wear; i++) {
    const x = rng.next() * r.width;
    const y = rng.next() * r.height;
    const w = 1 + rng.next() * 4;
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < w; xx++) {
      const idx = r.index(x + xx, y + yy);
      if (idx >= 0) r.data[idx + 3] = Math.round(r.data[idx + 3] * 0.15);
    }
  }
}

export const DECAL_TEXTURES = {
  crack: {
    size: [64, 64], tile: [1, 1], decal: true,
    paint(r, rng) {
      for (let k = 0; k < 3; k++) {
        let x = 32;
        let y = 32;
        let a = rng.next() * Math.PI * 2;
        for (let i = 0; i < 22; i++) {
          a += (rng.next() - 0.5) * 0.9;
          const nx = x + Math.cos(a) * 2.2;
          const ny = y + Math.sin(a) * 2.2;
          r.line(x, y, nx, ny, '#141414', i < 8 ? 1.4 : 1, 0.85);
          x = nx;
          y = ny;
        }
      }
    },
  },
  oilStain: {
    size: [32, 32], tile: [1, 1], decal: true,
    paint(r, rng) {
      for (let i = 0; i < 6; i++) r.ellipse(10 + rng.next() * 12, 10 + rng.next() * 12, 4 + rng.next() * 6, 3 + rng.next() * 5, '#111112', 0.35, 1);
    },
  },
  rainStreak: {
    size: [32, 64], tile: [1, 1], decal: true,
    paint(r, rng) {
      for (let i = 0; i < 22; i++) {
        const x = 2 + rng.next() * 28;
        const len = 20 + rng.next() * 42;
        for (let y = 0; y < len; y++) r.plot(x + Math.sin(y * 0.2) * 0.4, 63 - y, '#1b1712', 0.45 * (1 - y / len));
      }
    },
  },
  grimeBase: {
    size: [16, 32], tile: [1, 1], decal: true,
    paint(r) {
      for (let y = 0; y < 32; y++) r.rect(0, y, 16, 1, '#1c1813', 0.6 * (1 - y / 31) ** 1.6);
    },
  },
  soot: {
    size: [32, 32], tile: [1, 1], decal: true,
    paint(r) {
      for (let y = 0; y < 32; y++) {
        const a = 0.55 * (y / 31) ** 1.4;
        for (let x = 0; x < 32; x++) r.plot(x, y, '#141210', a * (1 - Math.abs(x - 15.5) / 18));
      }
    },
  },
  paintWhite: {
    size: [16, 64], tile: [1, 1], decal: true,
    paint(r, rng) { wornStripe(r, rng, '#e4e2d8', 70); },
  },
  paintYellow: {
    size: [16, 64], tile: [1, 1], decal: true,
    paint(r, rng) { wornStripe(r, rng, '#d6a51e', 80); },
  },
  curbYellow: {
    size: [16, 16], tile: [1, 1], decal: true,
    paint(r, rng) { wornStripe(r, rng, '#d8b021', 18); },
  },
  stencilLoading: {
    size: [64, 16], tile: [1, 1], decal: true,
    paint(r, rng) { drawTextCentered(r, 'LOADING', 32, 4, '#e4e2d8', { scale: 1, wear: 0.25, rng }); },
  },
  leafLitter: {
    size: [64, 64], tile: [1, 1], decal: true,
    paint(r, rng) {
      for (let i = 0; i < 26; i++) r.ellipse(rng.next() * 64, rng.next() * 64, 1.5, 1, rng.pick(['#7a5a24', '#9a6a2a', '#5a4020', '#a8842e']), 0.95);
    },
  },
  floorSheen: {
    size: [32, 64], tile: [1, 1], decal: true,
    paint(r) {
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 32; x++) {
          const a = 0.32 * Math.exp(-(((x - 15.5) / 9) ** 2)) * (y / 63) ** 0.8;
          r.plot(x, y, '#fff1d9', a);
        }
      }
    },
  },
  /** Additive light-shaft card: bright at the source (top), soft sides, fading to nothing below. */
  beamGrad: {
    size: [32, 64], tile: [1, 1], decal: true,
    paint(r) {
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 32; x++) {
          const side = Math.max(0, 1 - Math.abs(x - 15.5) / 16) ** 1.4;
          r.plot(x, y, '#ffffff', side * (y / 63) ** 1.8);
        }
      }
    },
  },
  manhole: {
    size: [32, 32], tile: [1, 1], alpha: true,
    paint(r, rng) {
      r.ellipse(16, 16, 15.5, 15.5, '#2b2a28');
      r.ellipse(16, 16, 14, 14, '#3f3d39');
      for (let y = 4; y < 30; y += 3) r.rect(4, y, 24, 1, '#2a2926', 0.8);
      r.ellipse(16, 16, 5, 5, '#4b4842');
      r.grain(rng, 0.08);
    },
  },
  drainGrate: {
    size: [32, 16], tile: [1, 1],
    paint(r) {
      r.fill('#1a1a1a');
      for (let x = 2; x < 32; x += 4) r.rect(x, 1, 2, 14, '#3d3b37');
      r.rect(0, 0, 32, 1, '#4a4842');
      r.rect(0, 15, 32, 1, '#4a4842');
    },
  },
  gumSpots: {
    size: [64, 64], tile: [1, 1], decal: true,
    paint(r, rng) {
      for (let i = 0; i < 18; i++) r.ellipse(rng.next() * 64, rng.next() * 64, 1, 0.9, '#3a3833', 0.7);
    },
  },
};
