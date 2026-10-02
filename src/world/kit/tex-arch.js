import { hexToRgb } from '../../core/color.js';

/**
 * Architecture and ground textures. Each entry: size, tile (metres one repeat covers, used by
 * box/planar UV projection) and a painter. Painters draw in raster space (y up = v up).
 */
const vary = (rng, hex, amt) => {
  const k = 1 + (rng.next() * 2 - 1) * amt;
  return hexToRgb(hex).map((v) => v * k);
};

function blotches(r, rng, count, rMin, rMax, kMin, kMax) {
  for (let i = 0; i < count; i++) {
    const rad = rMin + rng.next() * (rMax - rMin);
    r.toneEllipse(rng.next() * r.width, rng.next() * r.height, rad, rad * (0.6 + rng.next() * 0.8), kMin + rng.next() * (kMax - kMin));
  }
}

function crackLine(r, rng, x, y, len, color, alpha = 0.7) {
  let px = x;
  let py = y;
  let a = rng.next() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rng.next() - 0.5) * 1.1;
    const nx = px + Math.cos(a) * 2;
    const ny = py + Math.sin(a) * 2;
    r.line(px, py, nx, ny, color, 1, alpha);
    px = nx;
    py = ny;
  }
}

/** Running-bond brick. Courses and units are in pixels; palette picks per-brick colour. */
function brick(r, rng, { mortar, palette, course = 6, unit = 16, repairs = 0 }) {
  r.fill(mortar);
  for (let y = 0, row = 0; y < r.height; y += course, row++) {
    const off = row % 2 ? unit / 2 : 0;
    for (let x = -unit; x < r.width + unit; x += unit) {
      const c = vary(rng, rng.pick(palette), 0.09);
      r.rect(x + off, y + 1, unit - 1, course - 1, c);
      if (rng.chance(0.25)) r.rect(x + off + rng.int(1, unit - 4), y + 1 + rng.int(0, course - 2), 2, 1, c.map((v) => v * 0.82));
      if (rng.chance(0.12)) r.rect(x + off, y + course - 1, unit - 1, 1, c.map((v) => v * 1.12));
    }
  }
  for (let i = 0; i < repairs; i++) {
    const w = rng.int(2, 4) * unit;
    const h = rng.int(2, 4) * course;
    const x0 = rng.int(0, r.width);
    const y0 = rng.int(0, r.height - h);
    const tint = rng.pick(palette);
    for (let y = y0; y < y0 + h; y += course) {
      for (let x = x0; x < x0 + w; x += unit) r.rect(x, y + 1, unit - 1, course - 1, vary(rng, tint, 0.03).map((v) => v * 1.08), 0.75);
    }
  }
}

export const ARCH_TEXTURES = {
  brickRed: {
    size: [128, 128], tile: [1.6, 1.6],
    paint(r, rng) {
      brick(r, rng, { mortar: '#8d8272', palette: ['#8a4428', '#7a3b24', '#9a5230', '#6e3420', '#a3603a', '#5f2e1e'], repairs: 2 });
      blotches(r, rng, 10, 8, 22, 0.86, 1.08);
    },
  },
  brickTan: {
    size: [128, 128], tile: [1.6, 1.6],
    paint(r, rng) {
      brick(r, rng, { mortar: '#b7ad98', palette: ['#d6c08e', '#cbb27e', '#e0cc9c', '#c4a974', '#d9c595'] });
      blotches(r, rng, 8, 10, 24, 0.9, 1.05);
    },
  },
  cmuPainted: {
    size: [128, 128], tile: [1.6, 1.6],
    paint(r, rng) {
      r.fill('#5d625d');
      for (let y = 0, row = 0; y < 128; y += 16, row++) {
        for (let x = row % 2 ? -16 : 0; x < 128; x += 32) r.rect(x + 1, y + 1, 30, 14, vary(rng, '#80857f', 0.025));
      }
      blotches(r, rng, 14, 6, 18, 0.93, 1.05);
      for (let i = 0; i < 40; i++) r.plot(rng.next() * 128, rng.next() * 128, '#4a4e4a', 0.6);
    },
  },
  /** 600 mm acoustic drop-ceiling tiles in a T-bar grid, fissured, a few aged/yellowed. */
  ceilingTile: {
    size: [64, 64], tile: [1.2, 1.2],
    paint(r, rng) {
      r.fill('#d4cfc2');
      for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) {
        const tint = rng.chance(0.35) ? '#c7bc9f' : '#d4cfc2';
        r.rect(x + 1, y + 1, 30, 30, vary(rng, tint, 0.03));
        for (let i = 0; i < 26; i++) r.rect(x + 2 + rng.next() * 27, y + 2 + rng.next() * 27, 1 + rng.int(0, 2), 1, '#aaa494', 0.7);
      }
      r.rect(0, 0, 64, 1, '#efece4');
      r.rect(0, 32, 64, 1, '#efece4');
      r.rect(0, 0, 1, 64, '#efece4');
      r.rect(32, 0, 1, 64, '#efece4');
      r.rect(0, 31, 64, 1, '#8f8a7e', 0.6);
      r.rect(31, 0, 1, 64, '#8f8a7e', 0.6);
    },
  },
  /** Smooth painted plaster (loft walls): warm off-white with faint roller marks. */
  plasterWhite: {
    size: [64, 64], tile: [2.4, 2.4],
    paint(r, rng) {
      r.fill('#e2ded3');
      blotches(r, rng, 12, 8, 22, 0.97, 1.02);
      for (let i = 0; i < 10; i++) r.rect(rng.next() * 64, 0, 4, 64, '#dad5c9', 0.25);
    },
  },
  drywall: {
    size: [64, 64], tile: [2.4, 2.4],
    paint(r, rng) {
      r.fill('#d6cfbd');
      blotches(r, rng, 10, 8, 20, 0.97, 1.02);
    },
  },
  concretePolished: {
    size: [128, 128], tile: [3.0, 3.0],
    paint(r, rng) {
      r.fill('#8f877a');
      blotches(r, rng, 26, 6, 30, 0.84, 1.12);
      for (let i = 0; i < 160; i++) r.plot(rng.next() * 128, rng.next() * 128, rng.chance(0.5) ? '#a69d8e' : '#6f685d', 0.7);
      for (let i = 0; i < 3; i++) crackLine(r, rng, rng.next() * 128, rng.next() * 128, 14, '#5f584e', 0.5);
      r.rect(0, 0, 128, 1, '#5d564c');
      r.rect(0, 0, 1, 128, '#5d564c');
    },
  },
  concreteRough: {
    size: [64, 64], tile: [1.6, 1.6],
    paint(r, rng) {
      r.fill('#9a958a');
      blotches(r, rng, 12, 4, 14, 0.85, 1.08);
      for (let i = 0; i < 260; i++) r.plot(rng.next() * 64, rng.next() * 64, rng.chance(0.6) ? '#76716a' : '#b3aea2', 0.8);
    },
  },
  stoneTrim: {
    size: [64, 32], tile: [1.2, 0.6],
    paint(r, rng) {
      r.fill('#b4aa96');
      blotches(r, rng, 6, 4, 10, 0.86, 1.06);
      r.rect(0, 0, 64, 1, '#7d7464');
      for (let x = 0; x < 64; x += 32) r.rect(x, 0, 1, 32, '#857c6c');
      for (let i = 0; i < 90; i++) r.plot(rng.next() * 64, rng.next() * 32, '#8f8676', 0.6);
    },
  },
  deckBlack: {
    size: [64, 64], tile: [1.2, 1.2],
    paint(r, rng) {
      r.fill('#1d1e20');
      for (let x = 0; x < 64; x += 8) {
        r.rect(x, 0, 2, 64, '#2b2c2f');
        r.rect(x + 5, 0, 1, 64, '#141516');
      }
      blotches(r, rng, 6, 6, 16, 0.85, 1.15);
    },
  },
  steelBlack: {
    size: [32, 32], tile: [0.8, 0.8],
    paint(r, rng) {
      r.fill('#262626');
      blotches(r, rng, 5, 3, 8, 0.8, 1.25);
      for (let i = 0; i < 12; i++) r.plot(rng.next() * 32, rng.next() * 32, '#3d3a36', 0.8);
    },
  },
  steelGray: {
    size: [32, 32], tile: [0.8, 0.8],
    paint(r, rng) {
      r.fill('#5e6266');
      blotches(r, rng, 6, 3, 8, 0.85, 1.15);
      for (let i = 0; i < 14; i++) r.plot(rng.next() * 32, rng.next() * 32, '#7a5a3c', 0.6);
    },
  },
  galvanized: {
    size: [64, 64], tile: [1.0, 1.0],
    paint(r, rng) {
      r.fill('#9da3a6');
      for (let i = 0; i < 70; i++) {
        const x = rng.next() * 64;
        const y = rng.next() * 64;
        r.rect(x, y, 2 + rng.next() * 5, 2 + rng.next() * 4, vary(rng, '#a9afb2', 0.08), 0.8);
      }
      for (let x = 0; x < 64; x += 16) r.line(x, 0, x + 8, 64, '#5f6467', 1, 0.9);
      r.verticalGradient(0, 64, '#c6ccd0', '#7d8285', 0.25);
    },
  },
  asphalt: {
    size: [128, 128], tile: [4.0, 4.0],
    paint(r, rng) {
      r.fill('#3c3d3e');
      blotches(r, rng, 22, 8, 28, 0.86, 1.12);
      for (let i = 0; i < 1600; i++) r.plot(rng.next() * 128, rng.next() * 128, rng.chance(0.55) ? '#5c5b58' : '#2a2a2b', 0.75);
      for (let i = 0; i < 2; i++) crackLine(r, rng, rng.next() * 128, rng.next() * 128, 22, '#1d1d1e', 0.8);
    },
  },
  asphaltPatch: {
    size: [64, 64], tile: [2.0, 2.0],
    paint(r, rng) {
      r.fill('#2c2d2f');
      blotches(r, rng, 8, 6, 16, 0.9, 1.1);
      for (let i = 0; i < 300; i++) r.plot(rng.next() * 64, rng.next() * 64, '#3e3f40', 0.6);
    },
  },
  sidewalk: {
    size: [128, 128], tile: [1.8, 1.8],
    paint(r, rng) {
      r.fill('#a6a194');
      blotches(r, rng, 18, 6, 22, 0.86, 1.08);
      for (let i = 0; i < 500; i++) r.plot(rng.next() * 128, rng.next() * 128, rng.chance(0.5) ? '#b8b3a6' : '#8a857a', 0.7);
      for (let i = 0; i < 7; i++) r.ellipse(rng.next() * 128, rng.next() * 128, 1.2, 1, '#55524c', 0.8);
      r.rect(0, 0, 128, 2, '#6f6b62');
      r.rect(0, 0, 2, 128, '#6f6b62');
      r.rect(2, 2, 124, 1, '#bcb7aa', 0.6);
      if (rng.chance(0.8)) crackLine(r, rng, rng.next() * 128, rng.next() * 128, 18, '#5f5b53', 0.8);
    },
  },
  curb: {
    size: [64, 32], tile: [1.5, 0.75],
    paint(r, rng) {
      r.fill('#9f9a8e');
      blotches(r, rng, 8, 4, 10, 0.8, 1.06);
      r.verticalGradient(0, 10, '#6e6a62', '#4c4944', 0.6);
      r.rect(0, 0, 1, 32, '#6a665e');
    },
  },
  roofMembrane: {
    size: [64, 64], tile: [3.0, 3.0],
    paint(r, rng) {
      r.fill('#7d7a73');
      blotches(r, rng, 14, 6, 20, 0.85, 1.12);
      for (let y = 0; y < 64; y += 21) r.rect(0, y, 64, 1, '#5d5b55');
      for (let i = 0; i < 6; i++) r.toneEllipse(rng.next() * 64, rng.next() * 64, 5, 3, 0.75);
    },
  },
  dirt: {
    size: [32, 32], tile: [1.0, 1.0],
    paint(r, rng) {
      r.fill('#3f3122');
      for (let i = 0; i < 220; i++) r.plot(rng.next() * 32, rng.next() * 32, rng.pick(['#5a4430', '#2b2117', '#6b5a3a', '#3b4a26']), 0.9);
    },
  },
  hedge: {
    size: [64, 64], tile: [1.2, 1.2],
    paint(r, rng) {
      r.fill('#1f3318');
      for (let i = 0; i < 420; i++) {
        r.ellipse(rng.next() * 64, rng.next() * 64, 1 + rng.next() * 2, 1 + rng.next(), rng.pick(['#2f4a22', '#3d5c2a', '#264019', '#4c6b33', '#182812']), 0.95);
      }
    },
  },
  bark: {
    size: [32, 64], tile: [0.5, 1.0],
    paint(r, rng) {
      r.fill('#3d3127');
      for (let i = 0; i < 40; i++) {
        const x = rng.next() * 32;
        r.line(x, 0, x + (rng.next() - 0.5) * 4, 64, rng.pick(['#2a211a', '#54463a', '#4a3c30']), 1, 0.8);
      }
    },
  },
  tileWhite: {
    size: [32, 32], tile: [0.6, 0.6],
    paint(r, rng) {
      r.fill('#9c9a94');
      for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) r.rect(x + 1, y + 1, 7, 7, vary(rng, '#e0ddd5', 0.03));
    },
  },
  floorTileLobby: {
    size: [64, 64], tile: [1.2, 1.2],
    paint(r, rng) {
      for (let y = 0; y < 64; y += 16) {
        for (let x = 0; x < 64; x += 16) r.rect(x, y, 16, 16, vary(rng, ((x + y) / 16) % 2 ? '#2c2c2e' : '#b9b3a4', 0.04));
      }
      blotches(r, rng, 6, 6, 14, 0.88, 1.04);
    },
  },
  woodFloor: {
    size: [64, 64], tile: [1.6, 1.6],
    paint(r, rng) {
      for (let x = 0; x < 64; x += 8) {
        const c = vary(rng, '#6b4a2f', 0.12);
        r.rect(x, 0, 8, 64, c);
        r.rect(x, 0, 1, 64, '#3a2818');
        r.rect(x, rng.int(0, 63), 8, 1, '#3a2818');
        for (let i = 0; i < 6; i++) r.line(x + rng.next() * 8, 0, x + rng.next() * 8, 64, c.map((v) => v * 0.85), 1, 0.5);
      }
    },
  },
  windowShade: {
    size: [32, 64], tile: [1, 1],
    paint(r, rng) {
      r.fill('#3a3632');
      for (let y = 0; y < 64; y += 3) r.rect(0, y, 32, 2, vary(rng, '#8a8172', 0.05));
      r.verticalGradient(0, 64, '#c79a5a', '#3a2a1c', 0.35);
    },
  },
};
