import { hexToRgb, mix } from '../core/color.js';

/**
 * Traditional-style sleeve painter.
 *
 * The arm region's x runs around the arm (x = 0.5·w is the front) and y runs down the arm
 * (shoulder at the bottom row), so every motif is drawn through `pen`, which flips y to keep
 * pieces upright when the arm hangs.
 */
function pen(raster, cx, cy, s, angle = 0) {
  const c = Math.cos(angle);
  const n = Math.sin(angle);
  const P = (x, y) => [cx + (x * c - y * n) * s, cy - (x * n + y * c) * s];
  const ring = (x, y, rx, ry) => Array.from({ length: 14 }, (_, i) => {
    const t = (i / 14) * Math.PI * 2;
    return P(x + Math.cos(t) * rx, y + Math.sin(t) * ry);
  });
  return {
    fill: (pts, color, a = 1) => raster.polygon(pts.map(([x, y]) => P(x, y)), color, a),
    line: (pts, color, w = 1, a = 1) => raster.polyline(pts.map(([x, y]) => P(x, y)), color, w, a),
    dot: (x, y, r, color, a = 1) => raster.polygon(ring(x, y, r, r), color, a),
    oval: (x, y, rx, ry, color, a = 1) => raster.polygon(ring(x, y, rx, ry), color, a),
  };
}

const circle = (x, y, r, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [x + Math.cos(a) * r, y + Math.sin(a) * r];
});

/** Each motif draws in a unit box (-0.5..0.5) with ink outline, shade fill and solid blacks. */
const MOTIFS = {
  rose(p, ink, shade) {
    p.oval(0, 0.05, 0.36, 0.3, shade);
    p.line(circle(0, 0.05, 0.36), ink, 2);
    p.line([[-0.2, 0.05], [-0.05, 0.2], [0.18, 0.12], [0.1, -0.08], [-0.1, -0.1], [-0.12, 0.05], [0.02, 0.08]], ink, 1.6);
    p.fill([[-0.1, -0.22], [-0.46, -0.4], [-0.2, -0.12]], ink);
    p.fill([[0.1, -0.22], [0.44, -0.44], [0.24, -0.1]], ink);
  },
  skull(p, ink, shade, skin) {
    p.oval(0, 0.08, 0.3, 0.3, shade);
    p.fill([[-0.18, -0.12], [0.18, -0.12], [0.14, -0.34], [-0.14, -0.34]], shade);
    p.line(circle(0, 0.08, 0.3, 14), ink, 2);
    p.line([[-0.2, -0.1], [-0.16, -0.34], [0.16, -0.34], [0.2, -0.1]], ink, 2);
    p.oval(-0.12, 0.02, 0.09, 0.1, ink);
    p.oval(0.12, 0.02, 0.09, 0.1, ink);
    p.fill([[0, -0.06], [-0.04, -0.14], [0.04, -0.14]], ink);
    p.line([[-0.1, -0.25], [-0.1, -0.33]], skin, 1);
    p.line([[0.1, -0.25], [0.1, -0.33]], skin, 1);
  },
  dagger(p, ink, shade) {
    p.fill([[-0.06, 0.18], [0.06, 0.18], [0, -0.5]], shade);
    p.line([[-0.06, 0.18], [0, -0.5], [0.06, 0.18]], ink, 1.6);
    p.line([[-0.24, 0.2], [0.24, 0.2]], ink, 3);
    p.line([[0, 0.2], [0, 0.44]], ink, 3);
    p.dot(0, 0.48, 0.05, ink);
  },
  swallow(p, ink, shade) {
    const body = [[-0.5, 0.18], [-0.1, 0.05], [0.05, 0.18], [0.3, 0.12], [0.5, 0.3], [0.2, -0.05], [0.28, -0.32], [0.05, -0.12], [-0.2, -0.08]];
    p.fill(body, shade);
    p.line([...body, body[0]], ink, 1.6);
    p.fill([[0.05, -0.12], [0.28, -0.32], [0.12, -0.05]], ink);
  },
  heart(p, ink, shade) {
    const h = [[0, -0.36], [-0.34, 0.02], [-0.3, 0.2], [-0.15, 0.26], [0, 0.14], [0.15, 0.26], [0.3, 0.2], [0.34, 0.02]];
    p.fill(h, shade);
    p.line([...h, h[0]], ink, 2);
    p.fill([[-0.5, -0.02], [0.5, 0.06], [0.46, -0.1], [-0.46, -0.16]], ink);
    p.line([[-0.36, -0.07], [0.36, -0.02]], shade, 1);
  },
  panther(p, ink, shade) {
    p.oval(0, 0, 0.34, 0.3, ink);
    p.fill([[-0.3, 0.12], [-0.24, 0.42], [-0.08, 0.24]], ink);
    p.fill([[0.3, 0.12], [0.24, 0.42], [0.08, 0.24]], ink);
    p.oval(-0.13, 0.04, 0.07, 0.04, shade);
    p.oval(0.13, 0.04, 0.07, 0.04, shade);
    p.fill([[-0.12, -0.14], [0.12, -0.14], [0, -0.32]], shade);
  },
  star(p, ink, shade) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 === 0 ? 0.45 : 0.19;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    p.fill(pts, shade);
    p.fill(pts.filter((_, i) => i % 2 === 0).map(([x, y]) => [x * 0.4, y * 0.4]), ink);
    p.line([...pts, pts[0]], ink, 1.6);
  },
  clock(p, ink, shade) {
    p.oval(0, 0, 0.36, 0.36, shade);
    p.line(circle(0, 0, 0.36, 14), ink, 2.2);
    p.line([[0, 0], [0, 0.26]], ink, 1.6);
    p.line([[0, 0], [0.18, -0.08]], ink, 1.6);
    for (let i = 0; i < 12; i += 3) {
      const a = (i / 12) * Math.PI * 2;
      p.dot(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.03, ink);
    }
  },
  portrait(p, ink, shade, skin) {
    p.oval(0, 0.05, 0.26, 0.32, mix(skin, shade, 0.35));
    p.line(circle(0, 0.05, 0.27, 14).map(([x, y]) => [x * 0.96, y * 1.18 - 0.01]), ink, 1.8);
    p.fill([[-0.34, 0.2], [-0.2, 0.44], [0.2, 0.46], [0.36, 0.2], [0.3, -0.3], [0.2, 0.2], [-0.2, 0.22], [-0.3, -0.3]], ink);
    p.oval(-0.1, 0.08, 0.05, 0.03, ink);
    p.oval(0.1, 0.08, 0.05, 0.03, ink);
    p.line([[-0.08, -0.14], [0, -0.17], [0.08, -0.14]], ink, 1.6);
    p.dot(0, -0.02, 0.02, ink);
  },
  script(p, ink) {
    for (let row = 0; row < 2; row++) {
      const y = 0.1 - row * 0.24;
      const pts = [];
      for (let i = 0; i <= 14; i++) pts.push([-0.46 + i * 0.066, y + (i % 2 ? 0.08 : -0.04) + (i % 3 === 0 ? 0.05 : 0)]);
      p.line(pts, ink, 1.5);
    }
  },
  butterfly(p, ink, shade) {
    for (const s of [-1, 1]) {
      const wing = [[0, 0.02], [s * 0.42, 0.32], [s * 0.46, 0.04], [s * 0.3, -0.06], [s * 0.38, -0.3], [0, -0.08]];
      p.fill(wing, shade);
      p.line([...wing, wing[0]], ink, 1.6);
      p.dot(s * 0.28, 0.14, 0.05, ink);
    }
    p.line([[0, 0.14], [0, -0.26]], ink, 2.4);
  },
  web(p, ink) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI - Math.PI;
      p.line([[0, 0.4], [Math.cos(a) * 0.5, 0.4 + Math.sin(a) * 0.8]], ink, 1);
    }
    for (const r of [0.2, 0.35, 0.5]) {
      const arc = Array.from({ length: 7 }, (_, i) => {
        const a = (i / 6) * Math.PI - Math.PI;
        return [Math.cos(a) * r, 0.4 + Math.sin(a) * r * 1.6];
      });
      p.line(arc, ink, 1);
    }
  },
  eye(p, ink, shade) {
    const lid = [[-0.46, 0], [-0.2, 0.2], [0.2, 0.2], [0.46, 0], [0.2, -0.16], [-0.2, -0.16]];
    p.fill(lid, shade);
    p.line([...lid, lid[0]], ink, 2);
    p.oval(0, 0.02, 0.14, 0.14, ink);
    for (let i = 0; i < 5; i++) p.line([[-0.3 + i * 0.15, 0.2], [-0.34 + i * 0.17, 0.34]], ink, 1.2);
  },
  cross(p, ink, shade) {
    const c = [[-0.08, 0.42], [0.08, 0.42], [0.08, 0.18], [0.26, 0.18], [0.26, 0.04], [0.08, 0.04], [0.08, -0.46], [-0.08, -0.46], [-0.08, 0.04], [-0.26, 0.04], [-0.26, 0.18], [-0.08, 0.18]];
    p.fill(c, shade);
    p.line([...c, c[0]], ink, 1.8);
  },
  anchor(p, ink, shade) {
    p.line([[0, 0.42], [0, -0.36]], ink, 3);
    p.line([[-0.22, 0.26], [0.22, 0.26]], ink, 2.4);
    p.line([[-0.34, -0.1], [-0.24, -0.34], [0, -0.42], [0.24, -0.34], [0.34, -0.1]], ink, 2.4);
    p.line(circle(0, 0.46, 0.07, 8), ink, 1.6);
    p.fill([[-0.36, -0.1], [-0.26, 0.0], [-0.28, -0.14]], shade);
  },
};

const NAMES = Object.keys(MOTIFS);

/** Wind bars / smoke: curved grey strokes that tie separate pieces into one sleeve. */
function filler(raster, rect, yFrom, yTo, rng, shade, ink) {
  for (let i = 0; i < 22; i++) {
    const x = rect.x + rng.next() * rect.w;
    const y = yFrom + rng.next() * (yTo - yFrom);
    const len = rect.w * (0.12 + rng.next() * 0.2);
    const bend = (rng.next() - 0.5) * 10;
    const pts = Array.from({ length: 6 }, (_, k) => [x + (k / 5) * len, y + Math.sin((k / 5) * Math.PI) * bend]);
    raster.polyline(pts, shade, 3 + rng.next() * 4, 0.7);
    raster.polyline(pts.map(([px, py]) => [px, py + 2]), ink, 1, 0.5);
  }
  for (let i = 0; i < 260; i++) raster.plot(rect.x + rng.next() * rect.w, yFrom + rng.next() * (yTo - yFrom), shade, 0.5);
}

/** Deterministic Fisher-Yates shuffle driven by the character RNG. */
function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Patchwork: many separate small pieces with skin between them, each a different motif at its own
 * size and tilt (the "sticker sleeve" look), never a repeating grid.
 */
function patchwork(raster, rect, rng, ink, shade, skin, from = 0.08) {
  const names = shuffled(NAMES, rng);
  let pick = 0;
  const rows = 6;
  for (let row = 0; row < rows; row++) {
    const v = from + ((0.95 - from) * (row + 0.5)) / rows;
    const cols = 4;
    for (let col = 0; col < cols; col++) {
      if (rng.next() < 0.18) continue;
      const u = (col + (row % 2) * 0.5 + (rng.next() - 0.5) * 0.35) / cols;
      const size = rect.w * (0.15 + rng.next() * 0.07);
      const cx = rect.x + rect.w * (((u % 1) + 1) % 1);
      const cy = rect.y + rect.h * v + (rng.next() - 0.5) * rect.h * 0.04;
      const angle = (rng.next() - 0.5) * 0.7;
      MOTIFS[names[pick++ % names.length]](pen(raster, cx, cy, size, angle), ink, shade, skin);
      if (pick % names.length === 0) names.push(...shuffled(NAMES, rng).splice(0, NAMES.length));
    }
  }
}

/** Fine-line petal flower: outlined petals around a stippled centre. */
function blossom(p, ink, shade, petals, rng) {
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + rng.next() * 0.2;
    const tip = [Math.cos(a) * 0.5, Math.sin(a) * 0.5];
    const l = [Math.cos(a - 0.38) * 0.28, Math.sin(a - 0.38) * 0.28];
    const r = [Math.cos(a + 0.38) * 0.28, Math.sin(a + 0.38) * 0.28];
    p.fill([[0, 0], l, tip, r], shade, 0.35);
    p.line([[0, 0], l, tip, r, [0, 0]], ink, 1);
  }
  p.dot(0, 0, 0.1, ink);
}

/** Peony / rose bloom: nested arcs for layered petals. */
function peony(p, ink, shade) {
  p.oval(0, 0, 0.48, 0.4, shade, 0.4);
  for (const [r, n] of [[0.48, 7], [0.32, 6], [0.18, 5]]) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const arc = Array.from({ length: 5 }, (_, j) => {
        const a = a0 + (j / 4) * ((Math.PI * 2) / n);
        const bulge = r * (1 + 0.18 * Math.sin((j / 4) * Math.PI));
        return [Math.cos(a) * bulge, Math.sin(a) * bulge * 0.85];
      });
      p.line(arc, ink, 1);
    }
  }
  p.line([[-0.06, -0.02], [0.02, 0.06], [0.08, -0.03]], ink, 1);
}

function leaf(p, ink, shade) {
  const outline = [[0, 0], [0.18, 0.22], [0.1, 0.55], [0, 0.7], [-0.1, 0.55], [-0.18, 0.22], [0, 0]];
  p.fill(outline, shade, 0.5);
  p.line(outline, ink, 1);
  p.line([[0, 0], [0, 0.66]], ink, 1);
}

/**
 * Fine-line floral sleeve: vines spiral down the arm with alternating leaves, peonies at the
 * big spots and small five/six-petal blossoms between, plus stipple shading. No solid blacks.
 */
function floral(raster, rect, rng, ink, shade) {
  const vines = 3;
  for (let v = 0; v < vines; v++) {
    const phase = (v / vines) + rng.next() * 0.1;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const u = phase + t * 0.55 + Math.sin(t * Math.PI * 3 + v) * 0.06;
      pts.push([rect.x + rect.w * (((u % 1) + 1) % 1), rect.y + rect.h * (0.08 + t * 0.88)]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (Math.abs(pts[i + 1][0] - pts[i][0]) < rect.w * 0.5) raster.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ink, 1, 0.85);
    }
    for (let i = 2; i < pts.length - 1; i += 3) {
      const side = i % 2 ? 1 : -1;
      leaf(pen(raster, pts[i][0], pts[i][1], rect.w * (0.07 + rng.next() * 0.03), side * (1.1 + rng.next() * 0.5)), ink, shade);
    }
  }
  const blooms = [[0.5, 0.22, 'peony'], [0.18, 0.4, 'blossom'], [0.78, 0.48, 'peony'], [0.42, 0.62, 'blossom'], [0.62, 0.78, 'blossom'], [0.1, 0.86, 'peony'], [0.9, 0.18, 'blossom'], [0.3, 0.12, 'blossom']];
  for (const [u, v, kind] of blooms) {
    const cx = rect.x + rect.w * (u + (rng.next() - 0.5) * 0.06);
    const cy = rect.y + rect.h * (v + (rng.next() - 0.5) * 0.04);
    const size = rect.w * (kind === 'peony' ? 0.22 + rng.next() * 0.05 : 0.11 + rng.next() * 0.04);
    const p = pen(raster, cx, cy, size, rng.next() * Math.PI);
    if (kind === 'peony') peony(p, ink, shade);
    else blossom(p, ink, shade, 5 + Math.floor(rng.next() * 2), rng);
    for (let i = 0; i < 30; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = size * (0.55 + rng.next() * 0.35);
      raster.plot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, shade, 0.6);
    }
  }
}

/**
 * coverage: 'sleeve' (dense connected), 'patchwork' (separate pieces, skin gaps), 'half' (forearm),
 * 'sparse' (a few small pieces).
 */
export function paintTattooSleeve(raster, rect, rng, coverage, skin, inkHex = '#2a3038') {
  const ink = mix(hexToRgb(inkHex), skin, 0.12);
  const shade = mix(ink, skin, 0.55);
  if (coverage === 'patchwork') {
    patchwork(raster, rect, rng, ink, shade, skin);
    return;
  }
  if (coverage === 'floral') {
    floral(raster, rect, rng, ink, shade);
    return;
  }
  const zones = coverage === 'half' ? [[0.56, 0.95]] : coverage === 'sparse' ? [[0.6, 0.9]] : [[0.1, 0.5], [0.56, 0.95]];
  const perZone = coverage === 'sparse' ? 2 : 5;
  const names = shuffled(NAMES, rng);
  let pick = 0;
  for (const [a, b] of zones) {
    const yFrom = rect.y + rect.h * a;
    const yTo = rect.y + rect.h * b;
    if (coverage !== 'sparse') filler(raster, rect, yFrom, yTo, rng, shade, ink);
    const spots = [0.5, 0.25, 0.75, 0.0, 0.62].slice(0, perZone);
    spots.forEach((u, i) => {
      const size = rect.w * (coverage === 'sparse' ? 0.22 : i === 4 ? 0.18 : 0.27 + rng.next() * 0.08);
      const cx = rect.x + rect.w * u + (rng.next() - 0.5) * rect.w * 0.05;
      const cy = yFrom + (yTo - yFrom) * (i === 4 ? 0.9 : i % 2 === 0 ? 0.33 : 0.66) + (rng.next() - 0.5) * 4;
      MOTIFS[names[pick++ % names.length]](pen(raster, cx, cy, size), ink, shade, skin);
    });
  }
  if (coverage === 'sleeve') raster.rect(rect.x, rect.y + rect.h * 0.955, rect.w, 2, ink, 0.6);
}
