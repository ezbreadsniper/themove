import { hexToRgb } from '../../core/color.js';
import { drawText, drawTextCentered } from './font.js';

/** Furniture, plant, art and signage textures. `alpha: true` means a cut-out (alphaTest) texture. */
const vary = (rng, hex, amt) => {
  const k = 1 + (rng.next() * 2 - 1) * amt;
  return hexToRgb(hex).map((v) => v * k);
};

function frame(r, color = '#151515', w = 3) {
  r.rect(0, 0, r.width, w, color);
  r.rect(0, r.height - w, r.width, w, color);
  r.rect(0, 0, w, r.height, color);
  r.rect(r.width - w, 0, w, r.height, color);
}

function leafSpray(r, rng, { count, base, colors, len, spread, width = 1.5, droop = 0 }) {
  for (let i = 0; i < count; i++) {
    const a = -spread / 2 + rng.next() * spread + Math.PI / 2;
    const l = len * (0.6 + rng.next() * 0.4);
    const pts = [];
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      pts.push([base[0] + Math.cos(a) * l * t, base[1] + Math.sin(a) * l * t - droop * t * t * l]);
    }
    r.polyline(pts, rng.pick(colors), width, 1);
  }
}

export const PROP_TEXTURES = {
  leatherBlack: {
    size: [32, 32], tile: [0.36, 0.36],
    // button-tufted leather: a square grid of buttons, the puffs between them catch light, short
    // pleats run from each button toward its neighbours
    paint(r, rng) {
      r.fill('#1f1f23');
      for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16], [32, 0], [0, 32], [32, 32], [16, 32], [32, 16]]) r.toneEllipse(x, y, 7, 7, 1.55);
      for (const [x, y] of [[8, 8], [24, 24], [24, 8], [8, 24]]) {
        r.toneEllipse(x, y, 5, 5, 0.72);
        for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) r.line(x + dx, y + dy, x + dx * 4, y + dy * 4, '#101012', 1, 0.7);
        r.ellipse(x, y, 1.3, 1.3, '#08080a');
        r.plot(x - 1, y + 1, '#3a3a40', 0.8);
      }
      for (let i = 0; i < 20; i++) r.plot(rng.next() * 32, rng.next() * 32, '#2c2c31', 0.6);
    },
  },
  woodMaple: {
    size: [64, 64], tile: [0.7, 0.7],
    paint(r, rng) {
      r.fill('#c08840');
      for (let i = 0; i < 26; i++) {
        const y = rng.next() * 64;
        r.line(0, y, 64, y + (rng.next() - 0.5) * 6, vary(rng, '#a26c2c', 0.1), 1, 0.55);
      }
      r.verticalGradient(0, 64, '#d79f52', '#a7712f', 0.25);
    },
  },
  laminateWhite: {
    size: [32, 32], tile: [1, 1], grain: 0.012, blocks: 0.008,
    paint(r, rng) {
      r.fill('#e3e1da');
      for (let i = 0; i < 20; i++) r.plot(rng.next() * 32, rng.next() * 32, '#c9c6bd', 0.6);
    },
  },
  cabinetDark: {
    size: [32, 64], tile: [0.6, 1.2],
    paint(r, rng) {
      r.fill('#2f2219');
      for (let i = 0; i < 14; i++) {
        const x = rng.next() * 32;
        r.line(x, 0, x, 64, vary(rng, '#3d2c20', 0.1), 1, 0.7);
      }
    },
  },
  stainless: {
    size: [32, 32], tile: [0.8, 0.8],
    paint(r, rng) {
      r.fill('#aab0b3');
      for (let y = 0; y < 32; y++) r.rect(0, y, 32, 1, vary(rng, '#aab0b3', 0.05));
      r.verticalGradient(0, 32, '#d0d5d8', '#7f8487', 0.3);
    },
  },
  fabricKnit: {
    size: [32, 32], tile: [0.3, 0.3],
    paint(r, rng) {
      r.fill('#e8e2d2');
      for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x += 4) r.rect(x + (y % 8 ? 2 : 0), y, 2, 3, '#cfc8b6', 0.8);
    },
  },
  fabricSage: {
    size: [16, 16], tile: [0.3, 0.3],
    paint(r, rng) {
      r.fill('#9cb59f');
      for (let i = 0; i < 30; i++) r.plot(rng.next() * 16, rng.next() * 16, '#7f9a83', 0.8);
    },
  },
  fabricMustard: {
    size: [16, 16], tile: [0.3, 0.3],
    paint(r, rng) {
      r.fill('#c9a22a');
      for (let i = 0; i < 30; i++) r.plot(rng.next() * 16, rng.next() * 16, '#a5841c', 0.8);
    },
  },
  marbleBlack: {
    size: [64, 64], tile: [0.9, 0.9],
    paint(r, rng) {
      r.fill('#121214');
      for (let i = 0; i < 9; i++) {
        let x = rng.next() * 64;
        let y = rng.next() * 64;
        let a = rng.next() * Math.PI * 2;
        for (let s = 0; s < 40; s++) {
          a += (rng.next() - 0.5) * 0.5;
          const nx = x + Math.cos(a) * 1.6;
          const ny = y + Math.sin(a) * 1.6;
          r.line(x, y, nx, ny, i % 3 ? '#3a3a3e' : '#6a6a70', 1, 0.55);
          x = nx;
          y = ny;
        }
      }
      for (let i = 0; i < 6; i++) r.toneEllipse(rng.next() * 64, rng.next() * 64, 10, 6, 1.25, 0.6);
    },
  },
  cardboard: {
    size: [32, 32], tile: [0.5, 0.5],
    paint(r, rng) {
      r.fill('#a37a4a');
      for (let x = 0; x < 32; x += 2) r.rect(x, 0, 1, 32, '#97703f', 0.5);
      r.rect(0, 15, 32, 2, '#c9a46a', 0.7);
      for (let i = 0; i < 5; i++) r.toneEllipse(rng.next() * 32, rng.next() * 32, 5, 3, 0.86);
    },
  },
  doormat: {
    size: [32, 16], tile: [1, 1],
    paint(r, rng) {
      r.fill('#3a2f26');
      for (let y = 0; y < 16; y += 2) r.rect(0, y, 32, 1, '#2c231c');
      r.rect(1, 1, 30, 1, '#5a4a3a');
      r.rect(1, 14, 30, 1, '#5a4a3a');
      for (let i = 0; i < 40; i++) r.plot(rng.next() * 32, rng.next() * 16, '#6a5a48', 0.5);
    },
  },
  /**
   * Worn Persian rug (portrait, maps 'fit' onto the rug top): madder field with an all-over floral
   * lattice, lobed navy medallion with pendants, navy corner spandrels, a rosette-and-vine main
   * border between ivory guard stripes, abrash bands and walked-in wear.
   */
  rugPersian: {
    size: [128, 168], tile: [1, 1],
    paint(r, rng) {
      const W = 128;
      const H = 168;
      const ivory = '#e4d4ae';
      const navy = '#1e2a58';
      const gold = '#d2a446';
      const sky = '#6e8fc2';
      const rose = '#d06a74';
      r.fill('#8a1e24');
      for (let y = 0; y < H; y += 9) r.rect(0, y, W, 4 + rng.int(0, 4), '#7c1a20', 0.35);
      for (let y = 22; y < H - 22; y += 7) {
        for (let x = 22 + ((y / 7) % 2) * 3.5; x < W - 22; x += 7) {
          r.plot(x, y, rng.pick([navy, ivory, gold, sky, rose]), 0.9);
          r.plot(x + 1, y, rng.pick([navy, '#5a1418']), 0.7);
          r.plot(x, y + 1, rng.pick([gold, navy]), 0.6);
        }
      }
      const cx = W / 2;
      const cy = H / 2;
      const lobed = (rx, ry, color) => {
        const pts = [];
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          const k = 1 + 0.12 * Math.cos(a * 8);
          pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
        }
        r.polygon(pts, color);
      };
      lobed(30, 40, ivory);
      lobed(28, 38, navy);
      lobed(20, 28, '#a52a2c');
      lobed(13, 18, sky);
      lobed(8, 11, ivory);
      r.ellipse(cx, cy, 4, 5, rose);
      for (const s of [-1, 1]) {
        r.polygon([[cx - 7, cy + s * 40], [cx + 7, cy + s * 40], [cx, cy + s * 52]], navy);
        r.ellipse(cx, cy + s * 47, 3, 3, gold);
      }
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x0 = sx ? W - 20 : 20;
        const y0 = sy ? H - 20 : 20;
        const dx = sx ? -1 : 1;
        const dy = sy ? -1 : 1;
        r.polygon([[x0, y0], [x0 + dx * 26, y0], [x0, y0 + dy * 32]], navy);
        r.polygon([[x0 + dx * 2, y0 + dy * 2], [x0 + dx * 16, y0 + dy * 2], [x0 + dx * 2, y0 + dy * 20]], sky, 0.7);
      }
      const band = (inset, w, c) => {
        r.rect(inset, inset, W - inset * 2, w, c);
        r.rect(inset, H - inset - w, W - inset * 2, w, c);
        r.rect(inset, inset, w, H - inset * 2, c);
        r.rect(W - inset - w, inset, w, H - inset * 2, c);
      };
      band(3, 15, navy);
      band(3, 1, ivory);
      band(5, 1, '#a52a2c');
      band(17, 1, ivory);
      band(19, 1, gold);
      const rosette = (x, y) => {
        r.ellipse(x, y, 2.6, 2.6, rose);
        r.ellipse(x, y, 1.2, 1.2, ivory);
        for (const [ox, oy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) r.plot(x + ox, y + oy, gold);
      };
      for (let x = 10; x < W - 6; x += 9) {
        rosette(x, 11);
        rosette(x, H - 11);
        r.line(x + 2, 13, x + 7, 9, sky, 1, 0.8);
        r.line(x + 2, H - 13, x + 7, H - 9, sky, 1, 0.8);
      }
      for (let y = 20; y < H - 14; y += 9) {
        rosette(11, y);
        rosette(W - 11, y);
      }
      for (let i = 0; i < 10; i++) r.toneEllipse(rng.next() * W, rng.next() * H, 16, 11, 0.84 + rng.next() * 0.22);
      r.toneEllipse(cx + 10, cy + 30, 30, 22, 1.12, 0.6);
      for (let i = 0; i < 90; i++) r.plot(rng.next() * W, rng.next() * H, '#c9b48e', 0.35);
    },
  },
  terracotta: {
    size: [32, 32], tile: [0.6, 0.4],
    paint(r, rng) {
      r.fill('#a35a3a');
      for (let i = 0; i < 8; i++) r.toneEllipse(rng.next() * 32, rng.next() * 32, 8, 5, 0.8 + rng.next() * 0.35);
      r.verticalGradient(20, 32, '#c8b8a0', '#a35a3a', 0.45);
    },
  },
  ceramicWhite: {
    size: [16, 16], tile: [0.5, 0.5],
    paint(r, rng) {
      r.fill('#e9e6df');
      r.verticalGradient(0, 16, '#f5f3ee', '#c9c5bc', 0.4);
    },
  },
  redPaint: {
    size: [16, 16], tile: [0.4, 0.4],
    paint(r, rng) {
      r.fill('#b0262a');
      for (let i = 0; i < 10; i++) r.plot(rng.next() * 16, rng.next() * 16, '#6c1a1b', 0.8);
    },
  },
  leafPalm: {
    size: [64, 64], tile: [1, 1], alpha: true,
    paint(r, rng) {
      for (let i = 0; i < 18; i++) {
        const t = i / 18;
        const x = 4 + t * 56;
        const y = 32 + Math.sin(t * Math.PI) * 6;
        r.line(x, y, x - 6 + rng.next() * 4, y + 22 * (1 - t * 0.5), rng.pick(['#5f8f2a', '#7cad3a', '#4a7a22']), 2, 1);
        r.line(x, y, x - 6 + rng.next() * 4, y - 22 * (1 - t * 0.5), rng.pick(['#5f8f2a', '#7cad3a', '#4a7a22']), 2, 1);
      }
      r.line(2, 32, 62, 34, '#5c6a2a', 1.5, 1);
    },
  },
  leafSpider: {
    size: [64, 64], tile: [1, 1], alpha: true,
    paint(r, rng) {
      leafSpray(r, rng, { count: 40, base: [32, 2], colors: ['#7fae4a', '#c9dca0', '#5f8f34', '#e5edc8'], len: 46, spread: 2.9, width: 1.5, droop: 0.9 });
    },
  },
  leafPothos: {
    size: [64, 64], tile: [1, 1], alpha: true,
    paint(r, rng) {
      for (let i = 0; i < 60; i++) {
        const x = rng.next() * 64;
        const y = rng.next() * 64;
        r.ellipse(x, y, 3 + rng.next() * 2, 2.2 + rng.next(), rng.pick(['#2f6b2a', '#4c8a34', '#6aa84a', '#24521f']), 1);
      }
    },
  },
  leafSnake: {
    size: [32, 64], tile: [1, 1], alpha: true,
    paint(r, rng) {
      for (let i = 0; i < 9; i++) {
        const x = 3 + i * 3.2;
        const h = 40 + rng.next() * 22;
        r.polygon([[x - 1.8, 0], [x + 1.8, 0], [x + 0.6, h], [x - 0.4, h]], rng.pick(['#3d6b35', '#4f7d40']));
        r.line(x - 1.6, 0, x - 0.3, h, '#c9c25a', 1, 0.8);
      }
    },
  },
  treeLeaves: {
    size: [64, 64], tile: [1.6, 1.6], alpha: true,
    paint(r, rng) {
      for (let i = 0; i < 280; i++) {
        r.ellipse(rng.next() * 64, rng.next() * 64, 1.4 + rng.next() * 1.8, 1 + rng.next() * 1.2, rng.pick(['#3f5f22', '#557a2c', '#6c8f38', '#2f4a1a', '#7e9a3e']), 1);
      }
    },
  },
  tvScreen: {
    size: [64, 36], tile: [1, 1],
    paint(r, rng) {
      for (let x = 0; x < 64; x++) {
        const t = x / 63;
        r.rect(x, 0, 1, 36, [90 + 120 * t, 50 + 30 * (1 - t), 140 - 40 * t]);
      }
      r.verticalGradient(0, 36, '#3a1c55', '#150a24', 0.35);
      r.rect(26, 12, 12, 13, '#c9c3d6');
      r.rect(27, 13, 10, 11, '#6f6a80');
      r.rect(29, 15, 6, 6, '#e8d7f0');
      r.rect(28, 9, 8, 1, '#e8e2ea');
    },
  },
  /** Original pop-art screenprint: a cassette tape, flat red field, white mat (frame is geometry). */
  artPop: {
    size: [64, 48], tile: [1, 1],
    paint(r) {
      r.fill('#f3efe6');
      r.rect(5, 6, 54, 36, '#c2242c');
      r.rect(5, 6, 54, 9, '#b01d26');
      r.rect(17, 14, 30, 19, '#efe9e0');
      r.polyline([[17, 14], [47, 14], [47, 33], [17, 33], [17, 14]], '#121212', 1);
      r.rect(21, 23, 22, 7, '#121212');
      r.ellipse(26, 26.5, 2.5, 2.5, '#efe9e0');
      r.ellipse(38, 26.5, 2.5, 2.5, '#efe9e0');
      r.polygon([[22, 14], [42, 14], [40, 18], [24, 18]], '#d9d2c4');
      r.rect(20, 30, 24, 1, '#c2242c');
      r.rect(5, 4, 54, 1, '#9a948a');
    },
  },
  /** Original photographic print: a wet street corner at night, one lit window. */
  artPhoto: {
    size: [48, 64], tile: [1, 1],
    paint(r, rng) {
      r.fill('#ece8de');
      r.verticalGradient(6, 58, '#1a2236', '#0b0d12');
      r.rect(5, 6, 38, 52, '#0e1018', 0.5);
      r.rect(8, 22, 14, 30, '#231d1a');
      r.rect(26, 18, 16, 34, '#1d1916');
      r.rect(30, 40, 4, 5, '#e2a44e');
      for (let y = 26; y < 50; y += 6) for (let x = 10; x < 20; x += 5) r.rect(x, y, 3, 3, '#2e2a2a');
      r.rect(5, 6, 38, 12, '#14161c');
      for (let i = 0; i < 18; i++) r.line(31 + rng.next() * 2, 16 - rng.next() * 8, 31 + rng.next() * 2, 16, '#c08a44', 1, 0.4);
      r.grain(rng, 0.06);
      r.rect(4, 4, 40, 1, '#9a948a');
    },
  },
  artAbstract: {
    size: [48, 48], tile: [1, 1],
    paint(r, rng) {
      r.fill('#eeeadc');
      for (let i = 0; i < 40; i++) {
        const x = rng.next() * 48;
        const y = rng.next() * 48;
        r.line(x, y, x + (rng.next() - 0.5) * 20, y + (rng.next() - 0.5) * 20, rng.pick(['#4d8a3a', '#9cbb4a', '#d8c13a', '#2f5a2a', '#c45a3a']), 1, 0.9);
      }
      frame(r, '#d9d4c6', 1);
    },
  },
  artPrint: {
    size: [32, 40], tile: [1, 1],
    paint(r, rng) {
      r.fill('#ece8de');
      r.rect(5, 6, 22, 28, '#2b2b2b');
      for (let i = 0; i < 12; i++) r.rect(7 + rng.next() * 16, 8 + rng.next() * 22, 3, 2, rng.pick(['#e8e4dc', '#9a9a9a']));
      frame(r, '#151515', 2);
    },
  },
  worldIsYours: {
    size: [64, 24], tile: [1, 1], alpha: true,
    paint(r) {
      r.ellipse(30, 12, 28, 10, '#cfd6dc');
      r.ellipse(30, 12, 26, 8.5, '#3a4048');
      r.polygon([[54, 12], [63, 20], [63, 4]], '#cfd6dc');
      drawTextCentered(r, 'THE WORLD', 30, 13, '#f2f6f8');
      drawTextCentered(r, 'IS YOURS', 30, 4, '#f2f6f8');
    },
  },
  case48: {
    size: [32, 32], tile: [1, 1],
    paint(r, rng) {
      r.fill('#161616');
      frame(r, '#3a3a3a', 1);
      drawText(r, '48F', 6, 10, '#dcd8cc', { scale: 1, wear: 0.15, rng });
      r.rect(13, 26, 6, 2, '#5a5a5a');
    },
  },
  mirror: {
    size: [16, 64], tile: [1, 1],
    paint(r, rng) {
      r.verticalGradient(0, 64, '#6f6c66', '#2b2a28');
      for (let i = 0; i < 6; i++) r.line(rng.next() * 16, 0, rng.next() * 16, 64, '#9a968e', 1, 0.25);
      r.line(2, 10, 12, 60, '#c9c5bc', 1, 0.35);
    },
  },
  bedding: {
    size: [32, 32], tile: [0.6, 0.6],
    paint(r, rng) {
      r.fill('#7d7f84');
      for (let i = 0; i < 8; i++) r.toneEllipse(rng.next() * 32, rng.next() * 32, 8, 3, 0.85 + rng.next() * 0.25);
    },
  },
  books: {
    size: [32, 16], tile: [0.4, 0.2],
    paint(r, rng) {
      for (let x = 0; x < 32;) {
        const w = rng.int(2, 4);
        r.rect(x, 0, w, rng.int(11, 16), rng.pick(['#7a1e1e', '#1f3c6b', '#e6dccb', '#2b2b2b', '#c28a2a', '#3f6b3a']));
        x += w;
      }
    },
  },
  magazines: {
    size: [32, 32], tile: [1, 1],
    paint(r, rng) {
      r.fill('#e9e4da');
      r.rect(2, 16, 14, 14, '#c62b2b');
      r.rect(17, 2, 13, 16, '#2a2a2a');
      r.rect(4, 3, 12, 11, '#e45a8a');
      drawText(r, 'S', 19, 9, '#e9e4da');
    },
  },
  signStop: {
    size: [32, 32], tile: [1, 1], alpha: true,
    paint(r, rng) {
      const oct = (rad, c) => r.polygon(Array.from({ length: 8 }, (_, i) => [16 + Math.cos((i + 0.5) * Math.PI / 4) * rad, 16 + Math.sin((i + 0.5) * Math.PI / 4) * rad]), c);
      oct(15.5, '#efefea');
      oct(14, '#b5181d');
      drawTextCentered(r, 'STOP', 16, 13, '#f4f2ec');
      r.grain(rng, 0.05);
    },
  },
  signNoParking: {
    size: [24, 32], tile: [1, 1],
    paint(r) {
      r.fill('#ecebe4');
      r.rect(0, 0, 24, 1, '#b01c22');
      r.rect(0, 31, 24, 1, '#b01c22');
      drawTextCentered(r, 'NO', 12, 22, '#b01c22');
      drawTextCentered(r, 'PARK', 12, 13, '#b01c22');
      drawTextCentered(r, 'ING', 12, 4, '#b01c22');
    },
  },
  signLoading: {
    size: [24, 32], tile: [1, 1],
    paint(r) {
      r.fill('#ecebe4');
      drawTextCentered(r, 'LOAD', 12, 21, '#1d4f9a');
      drawTextCentered(r, 'ZONE', 12, 12, '#1d4f9a');
      drawTextCentered(r, '7-6', 12, 3, '#1a1a1a');
    },
  },
  signStreetName: {
    size: [64, 12], tile: [1, 1],
    paint(r) {
      r.fill('#1d6b3a');
      r.rect(1, 1, 62, 10, '#21763f');
      drawTextCentered(r, 'FOUNDRY ST', 32, 3, '#f2f2ec');
    },
  },
  signStreetName2: {
    size: [64, 12], tile: [1, 1],
    paint(r) {
      r.fill('#1d6b3a');
      r.rect(1, 1, 62, 10, '#21763f');
      drawTextCentered(r, 'MILL AVE', 32, 3, '#f2f2ec');
    },
  },
  signOneWay: {
    size: [48, 16], tile: [1, 1],
    paint(r) {
      r.fill('#121212');
      r.polygon([[3, 5], [34, 5], [34, 2], [45, 8], [34, 14], [34, 11], [3, 11]], '#efefea');
      drawText(r, 'ONE', 7, 5, '#121212');
    },
  },
  signExit: {
    size: [32, 12], tile: [1, 1],
    paint(r) {
      r.fill('#e9e6dc');
      drawTextCentered(r, 'EXIT', 16, 3, '#d4262b');
    },
  },
  signBuilding: {
    size: [128, 16], tile: [1, 1],
    paint(r, rng) {
      r.fill('#1a1a1a');
      drawTextCentered(r, 'FOUNDRY LOFTS', 64, 4, '#d9cfa8', { wear: 0.04, rng });
    },
  },
  ghostSign: {
    size: [128, 48], tile: [1, 1], alpha: true,
    paint(r, rng) {
      r.rect(4, 4, 120, 40, '#d9d0b4', 0.38);
      drawTextCentered(r, 'KESSLER', 64, 27, '#7a2a1c', { scale: 2, wear: 0.3, rng, alpha: 0.7 });
      drawTextCentered(r, 'TOOL & DIE CO.', 64, 10, '#2b2a28', { wear: 0.35, rng, alpha: 0.6 });
    },
  },
  houseNumber: {
    size: [32, 12], tile: [1, 1],
    paint(r) {
      r.fill('#20201f');
      drawTextCentered(r, '1210', 16, 3, '#e3dcc6');
    },
  },
  graffiti: {
    size: [64, 32], tile: [1, 1], alpha: true,
    paint(r, rng) {
      const cols = ['#e6e6e6', '#d63b8a', '#2a2a2a', '#3aa0d6'];
      for (let s = 0; s < 3; s++) {
        const c = cols[s];
        let x = 6 + rng.next() * 6;
        let y = 10 + rng.next() * 12;
        for (let i = 0; i < 9; i++) {
          const nx = x + 3 + rng.next() * 5;
          const ny = 6 + rng.next() * 20;
          r.line(x, y, nx, ny, c, s === 2 ? 1 : 2.5, 0.95);
          x = nx;
          y = ny;
        }
      }
    },
  },
  fakeInterior: {
    size: [32, 32], tile: [1, 1],
    paint(r, rng) {
      r.verticalGradient(0, 32, '#2a2320', '#120f0d');
      r.rect(4, 0, 10, 9, '#3a2c22');
      r.ellipse(22, 22, 6, 6, '#e6b36a', 0.35, 1);
      for (let y = 18; y < 32; y += 2) r.rect(0, y, 32, 1, '#8a7a62', 0.35);
    },
  },
  archWindow: {
    size: [32, 64], tile: [1, 1], alpha: true,
    paint(r) {
      const arc = (rx, ry) => Array.from({ length: 13 }, (_, i) => [16 + Math.cos((i / 12) * Math.PI) * rx, 40 + Math.sin((i / 12) * Math.PI) * ry]);
      r.polygon([[3, 2], [29, 2], ...arc(13, 22)], '#e7e2d4');
      r.polygon([[5.5, 4], [26.5, 4], ...arc(10.5, 19)], '#3b4650');
      r.rect(15, 4, 2, 52, '#e7e2d4');
      r.rect(5, 30, 22, 2, '#e7e2d4');
      r.verticalGradient(32, 58, '#7d8c96', '#3b4650', 0.35);
    },
  },
  mailboxes: {
    size: [32, 32], tile: [1, 1],
    paint(r) {
      r.fill('#8a8f93');
      for (let y = 2; y < 30; y += 7) for (let x = 2; x < 30; x += 7) {
        r.rect(x, y, 6, 6, '#a7acb0');
        r.rect(x + 1, y + 4, 4, 1, '#3a3d40');
      }
    },
  },
  dumpsterSide: {
    size: [64, 32], tile: [1, 1],
    paint(r, rng) {
      r.fill('#2f5a3a');
      for (let x = 4; x < 64; x += 10) r.rect(x, 0, 2, 32, '#264a30');
      for (let i = 0; i < 12; i++) r.toneEllipse(rng.next() * 64, rng.next() * 32, 6, 3, 0.7);
      drawText(r, 'NO DUMPING', 6, 22, '#e8e2cf', { wear: 0.2, rng });
      for (let i = 0; i < 30; i++) r.plot(rng.next() * 64, rng.next() * 12, '#7a4a22', 0.8);
    },
  },
  trashBag: {
    size: [16, 16], tile: [0.6, 0.6],
    paint(r, rng) {
      r.fill('#151617');
      for (let i = 0; i < 5; i++) r.line(rng.next() * 16, 0, rng.next() * 16, 16, '#3a3c3f', 1, 0.7);
    },
  },
  perfHex: {
    size: [32, 32], tile: [0.25, 0.25], alpha: true,
    paint(r) {
      r.fill('#2a2b2d');
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 5; col++) {
          const cx = col * 6.4 + (row % 2 ? 3.2 : 0) + 1.6;
          const cy = row * 5.33 + 2.6;
          for (let y = Math.floor(cy - 2); y <= Math.ceil(cy + 2); y++) {
            for (let x = Math.floor(cx - 2.4); x <= Math.ceil(cx + 2.4); x++) {
              if (Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy) * 0.6 > 2.3) continue;
              const i = r.index(x, y);
              if (i >= 0) r.data[i + 3] = 0;
            }
          }
        }
      }
    },
  },
  electricPanel: {
    size: [16, 32], tile: [1, 1],
    paint(r, rng) {
      r.fill('#8d918a');
      r.rect(1, 1, 14, 30, '#9da19a');
      r.rect(6, 14, 4, 2, '#3a3a3a');
      r.rect(2, 26, 12, 3, '#d9c22a');
      drawText(r, '!', 6, 25, '#121212');
    },
  },
};
