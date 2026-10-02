import { Raster } from '../../tex/raster.js';
import { drawText, drawTextCentered, textWidth } from './font.js';

/**
 * Decal atlas: every small surface mark (wear, stains, debris, flyers, notices, stickers, labels)
 * lives in one 512×512 texture of 64 px cells so the whole detail layer of a bucket costs one
 * material / draw call. `kit.decal(name, ...)` maps a quad onto a cell; the 'decals' material is
 * alpha-blended with a polygon offset (no z-fighting at the 4 mm surface gap), 'decalsCut' uses the
 * same texture with alpha-test for upright cards (weeds, standing papers).
 *
 * Every painter draws into its own transparent raster of span × 64 px (y up) that is copied into
 * the atlas. All text and art is original.
 */
const CELL = 64;
const COLS = 8;
const ROWS = 8;

const ink = '#1d1b19';
const paperTone = '#e9e4d6';

function tornEdge(r, rng, color, alpha = 1) {
  for (let x = 0; x < r.width; x++) {
    const top = r.height - 1 - Math.floor(rng.next() * 3);
    const bot = Math.floor(rng.next() * 3);
    for (let y = bot; y <= top; y++) r.plot(x, y, color, alpha);
  }
}

function sheet(r, rng, color = paperTone, { margin = 3, fold = true } = {}) {
  r.rect(margin, margin, r.width - margin * 2, r.height - margin * 2, color);
  for (let i = 0; i < 4; i++) r.plot(margin + rng.next() * (r.width - margin * 2), r.height - margin - 1 - rng.next() * 2, '#c9c2b0');
  if (fold) r.rect(margin, Math.floor(r.height / 2), r.width - margin * 2, 1, '#cfc8b5', 0.8);
  r.toneEllipse(r.width * 0.7, r.height * 0.3, r.width * 0.3, r.height * 0.25, 0.92);
}

function tape(r, x, y) {
  r.rect(x - 3, y - 2, 7, 4, '#d8d0a4', 0.75);
}

function textLines(r, rng, x0, y0, x1, lines, color = '#7c776c', step = 3) {
  for (let i = 0; i < lines; i++) {
    const len = (x1 - x0) * (0.55 + rng.next() * 0.45);
    r.rect(x0, y0 - i * step, len, 1, color, 0.85);
  }
}

function splat(r, rng, cx, cy, rad, color, alpha, count = 7) {
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = rng.next() * rad * 0.6;
    const rr = rad * (0.35 + rng.next() * 0.45);
    r.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, rr * (0.6 + rng.next() * 0.5), color, alpha, 1);
  }
}

export const DECALS = {
  // --- debris (floor, top-down) ---
  paper1: { at: [0, 0], paint(r, rng) {
    r.polygon([[8, 10], [52, 6], [58, 50], [14, 56]], paperTone);
    textLines(r, rng, 16, 46, 50, 9, '#8c877b', 4);
    r.line(10, 30, 56, 28, '#c4bda9', 1, 0.8);
    r.toneEllipse(40, 20, 14, 10, 0.85);
  } },
  paper2: { at: [1, 0], paint(r, rng) {
    r.polygon([[4, 14], [60, 8], [58, 54], [6, 58]], '#cfcbc0');
    r.rect(10, 44, 44, 6, '#3c3a36', 0.9);
    for (let c = 0; c < 3; c++) textLines(r, rng, 10 + c * 15, 38, 22 + c * 15, 8, '#6a665e', 3);
    r.toneEllipse(20, 20, 16, 8, 0.8);
  } },
  butts: { at: [2, 0], paint(r, rng) {
    for (let i = 0; i < 9; i++) {
      const x = 8 + rng.next() * 48;
      const y = 8 + rng.next() * 48;
      const a = rng.next() * Math.PI;
      const dx = Math.cos(a) * 5;
      const dy = Math.sin(a) * 5;
      r.line(x, y, x + dx, y + dy, '#e8e3d6', 2, 1);
      r.line(x + dx, y + dy, x + dx * 1.5, y + dy * 1.5, '#c8873c', 2, 1);
      r.plot(x - 1, y, '#3a3632', 0.8);
    }
    for (let i = 0; i < 12; i++) r.plot(rng.next() * 64, rng.next() * 64, '#6d6a63', 0.6);
  } },
  leaves: { at: [3, 0], paint(r, rng) {
    for (let i = 0; i < 22; i++) {
      const x = 6 + rng.next() * 52;
      const y = 6 + rng.next() * 52;
      const a = rng.next() * Math.PI;
      const c = rng.pick(['#7a5a24', '#9a6a2a', '#5a4020', '#a8842e', '#6b3a1c']);
      r.ellipse(x, y, 3 + rng.next() * 2, 1.6, c, 0.95);
      r.line(x - Math.cos(a) * 3, y - Math.sin(a) * 3, x + Math.cos(a) * 4, y + Math.sin(a) * 4, '#3e2a14', 1, 0.6);
    }
  } },
  wrapper: { at: [4, 0], paint(r, rng) {
    r.polygon([[14, 18], [50, 14], [54, 40], [20, 48]], '#b8222a');
    r.rect(24, 26, 20, 8, '#f0d23a');
    r.line(14, 18, 54, 40, '#7d151b', 1, 0.6);
    r.ellipse(44, 46, 6, 4, '#c9cdd0', 0.9);
  } },
  can: { at: [5, 0], paint(r) {
    r.rect(14, 26, 36, 14, '#2f6e9c');
    r.rect(14, 26, 4, 14, '#c9cdd0');
    r.rect(46, 26, 4, 14, '#c9cdd0');
    r.rect(24, 30, 14, 5, '#e6e2d8');
  } },
  dustCorner: { at: [6, 0], paint(r, rng) {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const a = Math.max(0, 1 - Math.hypot(x, y) / 60) ** 1.6 * 0.75;
      r.plot(x, y, '#4a4237', a * (0.8 + rng.next() * 0.4));
    }
    for (let i = 0; i < 8; i++) r.line(rng.next() * 20, rng.next() * 20, rng.next() * 30, rng.next() * 30, '#6a6052', 1, 0.6);
  } },
  footprints: { at: [7, 0], paint(r, rng) {
    for (let i = 0; i < 4; i++) {
      const x = 18 + (i % 2) * 20;
      const y = 6 + i * 15;
      r.ellipse(x, y + 4, 5, 7, '#2e2822', 0.35);
      r.ellipse(x, y - 5, 4, 3, '#2e2822', 0.35);
    }
    for (let i = 0; i < 30; i++) r.plot(rng.next() * 64, rng.next() * 64, '#2e2822', 0.2);
  } },

  // --- wall wear ---
  waterStain: { at: [0, 1], paint(r, rng) {
    for (let k = 0; k < 3; k++) {
      const rad = 26 - k * 7;
      for (let a = 0; a < Math.PI * 2; a += 0.02) {
        const rr = rad + Math.sin(a * 5 + k) * 3 + rng.next();
        r.plot(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr, '#7a5a30', 0.55);
      }
      r.ellipse(32, 32, rad - 1, rad - 1, '#a0804a', 0.12, 1);
    }
  } },
  scuff: { at: [1, 1], paint(r, rng) {
    for (let i = 0; i < 14; i++) {
      const x = rng.next() * 56;
      const y = 4 + rng.next() * 24;
      r.line(x, y, x + 6 + rng.next() * 10, y + (rng.next() - 0.5) * 3, '#2a2622', 1 + rng.next(), 0.45);
    }
    for (let y = 0; y < 18; y++) r.rect(0, y, 64, 1, '#3a342c', 0.3 * (1 - y / 18));
  } },
  peel: { at: [2, 1], paint(r, rng) {
    splat(r, rng, 32, 32, 24, '#8d887f', 0.95, 9);
    for (let i = 0; i < 18; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 14 + rng.next() * 12;
      r.ellipse(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 2.5, 1.5, '#f2ede0', 1);
      r.plot(32 + Math.cos(a) * (d + 2), 32 + Math.sin(a) * (d + 2), '#4a463f', 0.8);
    }
  } },
  plasterCrack: { at: [3, 1], paint(r, rng) {
    let x = 6;
    let y = 58;
    for (let i = 0; i < 30; i++) {
      const nx = x + 1.6 + rng.next() * 1.2;
      const ny = y - 1.2 - rng.next() * 1.6;
      r.line(x, y, nx, ny, '#2c2823', 1, 0.85);
      if (rng.chance(0.15)) r.line(nx, ny, nx + 6 * rng.next(), ny + 4 * (rng.next() - 0.5), '#3a352f', 1, 0.6);
      x = nx;
      y = ny;
    }
    r.ellipse(40, 22, 5, 3, '#8b857b', 0.9);
  } },
  grime: { at: [4, 1], paint(r, rng) {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot((x - 32) / 30, (y - 32) / 30);
      r.plot(x, y, '#2a241d', Math.max(0, 1 - d) ** 1.5 * (0.45 + rng.next() * 0.25));
    }
  } },
  sootUp: { at: [5, 1], paint(r) {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) r.plot(x, y, '#15120f', 0.6 * (y / 63) ** 1.3 * Math.max(0, 1 - Math.abs(x - 31.5) / 32));
  } },
  handprint: { at: [6, 1], paint(r) {
    r.ellipse(32, 26, 9, 10, '#2c261f', 0.35);
    for (let f = 0; f < 4; f++) r.line(25 + f * 4.5, 34, 23 + f * 5.5, 46 + (f === 1 || f === 2 ? 4 : 0), '#2c261f', 3, 0.3);
    r.line(41, 26, 48, 32, '#2c261f', 3, 0.3);
  } },
  drip: { at: [7, 1], paint(r, rng) {
    for (let i = 0; i < 8; i++) {
      const x = 8 + rng.next() * 48;
      const len = 20 + rng.next() * 40;
      for (let y = 0; y < len; y++) r.plot(x, 63 - y, '#3d3427', 0.5 * (1 - y / len));
    }
  } },

  // --- notices, flyers, posters (opaque paper) ---
  flyerRent: { at: [0, 2], paint(r, rng) {
    sheet(r, rng, '#f0ecdf', { margin: 4 });
    drawTextCentered(r, 'ROOM', 32, 46, ink, { scale: 1 });
    drawTextCentered(r, 'FOR RENT', 32, 37, ink);
    textLines(r, rng, 10, 30, 54, 3, '#6f6a60');
    for (let x = 6; x < 58; x += 6) {
      r.rect(x, 4, 4, 12, '#f0ecdf');
      r.rect(x + 4, 4, 1, 12, '#b7b0a0');
      r.rect(x + 1, 6, 1, 8, '#4d4a45', 0.6);
    }
    tape(r, 32, 58);
  } },
  flyerCat: { at: [1, 2], paint(r, rng) {
    sheet(r, rng, '#f2efe4', { margin: 4 });
    drawTextCentered(r, 'LOST CAT', 32, 50, '#b02020');
    r.rect(14, 18, 36, 26, '#9b9488');
    r.ellipse(32, 28, 9, 7, '#2a2724');
    r.ellipse(32, 38, 6, 5, '#2a2724');
    r.polygon([[27, 41], [29, 46], [31, 42]], '#2a2724');
    r.polygon([[33, 42], [35, 46], [37, 41]], '#2a2724');
    drawTextCentered(r, '555-0193', 32, 8, ink);
    tape(r, 10, 58);
    tape(r, 54, 58);
  } },
  noticeMeeting: { at: [2, 2], paint(r, rng) {
    sheet(r, rng, '#f4e9a8', { margin: 3, fold: false });
    drawTextCentered(r, 'TENANT', 32, 50, ink);
    drawTextCentered(r, 'MEETING', 32, 41, ink);
    drawTextCentered(r, 'THU 7PM', 32, 28, '#8a1d1d');
    textLines(r, rng, 10, 18, 54, 4, '#6f6a50');
    tape(r, 32, 60);
  } },
  noticeSmoking: { at: [3, 2], paint(r) {
    r.rect(4, 4, 56, 56, '#f2f0ea');
    r.ellipse(32, 38, 15, 15, '#c22424');
    r.ellipse(32, 38, 11, 11, '#f2f0ea');
    r.rect(20, 36, 24, 4, '#2a2826');
    r.line(22, 28, 42, 48, '#c22424', 3);
    drawTextCentered(r, 'NO SMOKING', 32, 10, ink);
  } },
  noticeDoor: { at: [4, 2], paint(r, rng) {
    sheet(r, rng, '#ffffff', { margin: 4, fold: false });
    drawTextCentered(r, 'PLEASE', 32, 48, ink);
    drawTextCentered(r, 'KEEP DOOR', 32, 38, ink);
    drawTextCentered(r, 'CLOSED', 32, 28, ink);
    drawTextCentered(r, '- MGMT', 32, 12, '#555');
  } },
  noticeRecycle: { at: [5, 2], paint(r, rng) {
    sheet(r, rng, '#cfe3c4', { margin: 4, fold: false });
    drawTextCentered(r, 'RECYCLE', 32, 48, '#1d4a22');
    drawTextCentered(r, 'MONDAYS', 32, 38, '#1d4a22');
    r.polygon([[32, 30], [40, 16], [24, 16]], '#2f7a38');
    r.polygon([[32, 26], [36, 19], [28, 19]], '#cfe3c4');
  } },
  warnVoltage: { at: [6, 2], paint(r) {
    r.rect(2, 2, 60, 60, '#e2c11c');
    r.rect(5, 5, 54, 54, '#141414');
    r.rect(7, 7, 50, 50, '#e2c11c');
    r.polygon([[34, 52], [24, 32], [32, 32], [28, 14], [40, 36], [32, 36]], '#141414');
    drawTextCentered(r, 'DANGER', 32, 2 + 7, '#141414');
  } },
  meterLabel: { at: [7, 2], paint(r) {
    r.rect(2, 16, 60, 32, '#d9d6cc');
    r.rect(2, 16, 60, 2, '#8a877f');
    drawTextCentered(r, 'GAS', 32, 36, ink);
    drawTextCentered(r, 'UNIT 1B', 32, 24, ink);
  } },

  // --- stickers, tags ---
  stickerEye: { at: [0, 3], paint(r) {
    r.ellipse(32, 32, 26, 26, '#f0ece2');
    r.ellipse(32, 32, 22, 14, '#1a1a1a');
    r.ellipse(32, 32, 9, 9, '#2fa7c4');
    r.ellipse(32, 32, 4, 4, '#101010');
  } },
  stickerBand: { at: [1, 3], paint(r) {
    r.rect(4, 18, 56, 28, '#e33a2c');
    drawTextCentered(r, 'NITE', 32, 34, '#fff6dc');
    drawTextCentered(r, 'SHIFT', 32, 24, '#fff6dc');
  } },
  stickerSkate: { at: [2, 3], paint(r) {
    r.rect(6, 8, 52, 48, '#1b1b1b');
    r.ellipse(32, 34, 14, 14, '#f2d230');
    r.ellipse(27, 37, 2, 3, '#1b1b1b');
    r.ellipse(37, 37, 2, 3, '#1b1b1b');
    r.line(25, 28, 39, 28, '#1b1b1b', 2);
    drawTextCentered(r, 'OK', 32, 11, '#f2d230');
  } },
  tag: { at: [3, 3], paint(r, rng) {
    let x = 4;
    let y = 30;
    for (let i = 0; i < 60; i++) {
      const nx = x + 1 + rng.next();
      const ny = 30 + Math.sin(i * 0.8 + rng.next()) * 14;
      r.line(x, y, nx, ny, '#1f1f22', 2, 0.9);
      x = nx;
      y = ny;
    }
    r.line(4, 12, 60, 14, '#1f1f22', 2, 0.9);
  } },
  tagRed: { at: [4, 3], paint(r, rng) {
    const w = textWidth('ZERO', 2);
    drawText(r, 'ZERO', 32 - w / 2, 24, '#b5262a', { scale: 2 });
    drawText(r, 'ZERO', 32 - w / 2 + 1, 25, '#f2e8e0', { scale: 2, alpha: 0.35 });
    for (let i = 0; i < 10; i++) r.line(10 + rng.next() * 44, 22, 10 + rng.next() * 44, 22 - 6 - rng.next() * 10, '#b5262a', 1, 0.7);
  } },
  outlet: { at: [5, 3], paint(r) {
    r.rect(18, 8, 28, 48, '#e8e5dc');
    r.rect(18, 8, 28, 1, '#a9a69d');
    for (const y of [18, 40]) {
      r.rect(25, y, 2, 6, '#2a2a2a');
      r.rect(37, y, 2, 6, '#2a2a2a');
      r.ellipse(32, y - 3, 1.5, 1.5, '#2a2a2a');
    }
    r.ellipse(32, 31, 1.2, 1.2, '#8a877f');
  } },
  aptNumber: { at: [6, 3], paint(r) {
    r.rect(8, 16, 48, 32, '#2a2622');
    drawTextCentered(r, 'APT', 32, 34, '#d9c58c');
    drawTextCentered(r, '1B', 32, 22, '#d9c58c');
  } },
  wetPatch: { at: [7, 3], paint(r, rng) {
    splat(r, rng, 32, 32, 28, '#0d0e12', 0.5, 10);
    for (let i = 0; i < 6; i++) r.ellipse(20 + rng.next() * 24, 20 + rng.next() * 24, 4, 2, '#5a6278', 0.3, 1);
  } },

  // --- posters (1 × 2 cells, tall) ---
  posterBand: { at: [0, 4], span: [1, 2], paint(r, rng) {
    r.rect(2, 2, 60, 124, '#1d1a2c');
    r.verticalGradient(40, 124, '#3a2a6a', '#d0462e');
    r.ellipse(32, 78, 18, 18, '#f2c14a');
    r.rect(2, 60, 60, 4, '#1d1a2c');
    drawTextCentered(r, 'THE MOVE', 32, 26, '#f4efe4');
    drawTextCentered(r, 'LIVE FRI', 32, 14, '#f2c14a');
    for (let i = 0; i < 40; i++) r.plot(rng.next() * 64, rng.next() * 128, '#f4efe4', 0.3);
  } },
  posterFlea: { at: [1, 4], span: [1, 2], paint(r, rng) {
    r.rect(2, 2, 60, 124, '#e9dfc4');
    drawTextCentered(r, 'FOUNDRY', 32, 108, '#21456b', { scale: 1 });
    drawTextCentered(r, 'FLEA', 32, 92, '#21456b', { scale: 2 });
    for (let i = 0; i < 6; i++) r.rect(10 + (i % 3) * 16, 44 + Math.floor(i / 3) * 18, 12, 14, rng.pick(['#c0472c', '#d9a527', '#3f7a54', '#2a5d8f']));
    drawTextCentered(r, 'SAT 9AM', 32, 22, '#21456b');
    tornEdge(r, rng, '#e9dfc4', 0);
  } },
  posterTorn: { at: [2, 4], span: [1, 2], paint(r, rng) {
    r.rect(2, 2, 60, 124, '#c9c3b3');
    r.rect(6, 50, 52, 70, '#5c7a8c');
    drawTextCentered(r, 'OPEN MIC', 32, 34, '#2a2724');
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * 64;
      const y = rng.next() * 50;
      r.ellipse(x, y, 4 + rng.next() * 6, 3 + rng.next() * 5, '#8e8a80', 1);
    }
  } },
  posterAd: { at: [3, 4], span: [1, 2], paint(r, rng) {
    r.rect(2, 2, 60, 124, '#d8c49a');
    r.ellipse(32, 80, 22, 26, '#b9432e');
    r.rect(26, 40, 12, 20, '#7a3a20');
    drawTextCentered(r, 'FIZZ', 32, 108, '#7a1f16', { scale: 2 });
    drawTextCentered(r, 'COLD 5C', 32, 22, '#2a2420');
    for (let i = 0; i < 60; i++) r.plot(rng.next() * 64, rng.next() * 128, '#8c7a58', 0.4);
  } },

  // --- weeds and edge trims (used upright with the cut-out variant) ---
  weeds: { at: [4, 4], paint(r, rng) {
    for (let i = 0; i < 16; i++) {
      const x = 8 + rng.next() * 48;
      const h = 14 + rng.next() * 40;
      const lean = (rng.next() - 0.5) * 18;
      r.line(x, 0, x + lean, h, rng.pick(['#4d6b2a', '#5f7d32', '#3c5520', '#6f8a3a']), 2, 1);
    }
  } },
  weedTuft: { at: [5, 4], paint(r, rng) {
    for (let i = 0; i < 24; i++) {
      const a = rng.next() * Math.PI * 2;
      const l = 6 + rng.next() * 20;
      r.line(32, 32, 32 + Math.cos(a) * l, 32 + Math.sin(a) * l, rng.pick(['#4d6b2a', '#5f7d32', '#3c5520']), 2, 1);
    }
  } },
  chain: { at: [6, 4], paint(r) {
    for (let y = 0; y < 64; y += 6) {
      if ((y / 6) % 2) r.rect(31, y, 2, 6, '#2a2724');
      else {
        r.rect(30, y, 1, 6, '#2a2724');
        r.rect(33, y, 1, 6, '#2a2724');
      }
    }
  } },
  doorGap: { at: [7, 4], paint(r) {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) r.plot(x, y, '#ffcf8a', Math.max(0, 1 - y / 64) ** 2 * 0.9 * Math.min(1, Math.min(x, 63 - x) / 10));
  } },

  // --- labels and small signage ---
  mailLabel: { at: [4, 5], paint(r) {
    for (let i = 0; i < 4; i++) {
      r.rect(4, 6 + i * 14, 56, 10, '#efece2');
      drawText(r, ['1A REYES', '1B', '1C OKAFOR', '1D'][i], 7, 8 + i * 14, ink);
    }
  } },
  fireExt: { at: [5, 5], paint(r) {
    r.rect(8, 4, 48, 56, '#b8231f');
    r.rect(12, 8, 40, 48, '#f2eee4');
    drawTextCentered(r, 'FIRE', 32, 40, '#b8231f');
    drawTextCentered(r, 'EXT.', 32, 28, '#b8231f');
    r.polygon([[32, 22], [36, 12], [28, 12]], '#b8231f');
  } },
  exitArrow: { at: [6, 5], paint(r) {
    r.rect(4, 20, 56, 24, '#1e6b33');
    r.polygon([[50, 32], [40, 40], [40, 24]], '#f2f2ea');
    r.rect(14, 29, 26, 6, '#f2f2ea');
  } },
  sawcut: { at: [7, 5], paint(r) {
    r.rect(0, 30, 64, 2, '#2f2b26', 0.75);
    r.rect(0, 32, 64, 1, '#a69d8e', 0.4);
  } },

  // --- ground marks ---
  puddle: { at: [0, 6], span: [2, 2], paint(r, rng) {
    splat(r, rng, 64, 64, 54, '#090b10', 0.55, 14);
    for (let i = 0; i < 10; i++) r.ellipse(30 + rng.next() * 68, 30 + rng.next() * 68, 10 + rng.next() * 8, 3, '#6a7590', 0.18, 1);
  } },
  stainBig: { at: [2, 6], span: [2, 2], paint(r, rng) {
    splat(r, rng, 64, 64, 50, '#241d14', 0.4, 12);
    for (let i = 0; i < 40; i++) r.plot(rng.next() * 128, rng.next() * 128, '#3a3024', 0.4);
  } },
  cracksBig: { at: [4, 6], span: [2, 2], paint(r, rng) {
    for (let k = 0; k < 4; k++) {
      let x = 64;
      let y = 64;
      let a = rng.next() * Math.PI * 2;
      for (let i = 0; i < 34; i++) {
        a += (rng.next() - 0.5) * 0.8;
        const nx = x + Math.cos(a) * 2.4;
        const ny = y + Math.sin(a) * 2.4;
        r.line(x, y, nx, ny, '#141414', i < 10 ? 1.6 : 1, 0.85);
        x = nx;
        y = ny;
      }
    }
  } },
  leafDrift: { at: [6, 6], span: [2, 1], paint(r, rng) {
    for (let i = 0; i < 70; i++) {
      const x = rng.next() * 128;
      const y = Math.abs(rng.next() - rng.next()) * 60;
      r.ellipse(x, y, 2.5, 1.3, rng.pick(['#7a5a24', '#9a6a2a', '#5a4020', '#a8842e', '#6b3a1c']), 0.95);
    }
  } },
  gum: { at: [6, 7], paint(r, rng) {
    for (let i = 0; i < 18; i++) r.ellipse(rng.next() * 64, rng.next() * 64, 1.2, 1, '#3a3833', 0.7);
  } },
  ring: { at: [7, 7], paint(r) {
    for (let a = 0; a < Math.PI * 2; a += 0.03) r.plot(32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, '#3a2a1a', 0.5);
  } },
};

/** Decals carrying text or a directional symbol: never mirrored (kit.decal ignores `flip`). */
export const TEXT_DECALS = new Set([
  'flyerRent', 'flyerCat', 'noticeMeeting', 'noticeSmoking', 'noticeDoor', 'noticeRecycle', 'warnVoltage', 'meterLabel',
  'stickerBand', 'stickerSkate', 'tagRed', 'aptNumber', 'posterBand', 'posterFlea', 'posterTorn', 'posterAd', 'mailLabel', 'fireExt', 'exitArrow',
]);

/** UV rectangle [u0, v0, u1, v1] of a named decal. */
export function decalUV(name) {
  const d = DECALS[name];
  if (!d) throw new Error(`Unknown decal ${name}`);
  const [c, r] = d.at;
  const [w, h] = d.span ?? [1, 1];
  const e = 0.5 / (CELL * COLS);
  return [c / COLS + e, r / ROWS + e, (c + w) / COLS - e, (r + h) / ROWS - e];
}

/** Paints the atlas (raw RGBA copy of each cell, straight alpha is restored by the loader). */
function paintAtlas(r, rng) {
  for (const [name, d] of Object.entries(DECALS)) {
    const [w, h] = d.span ?? [1, 1];
    const cell = new Raster(w * CELL, h * CELL);
    d.paint(cell, rng.fork(name));
    const [cx, cy] = d.at;
    for (let y = 0; y < cell.height; y++) {
      const src = y * cell.width * 4;
      const dst = ((cy * CELL + y) * r.width + cx * CELL) * 4;
      r.data.set(cell.data.subarray(src, src + cell.width * 4), dst);
    }
  }
}

export const ATLAS_TEXTURES = {
  decalAtlas: { size: [CELL * COLS, CELL * ROWS], tile: [1, 1], decal: true, paint: paintAtlas },
};
