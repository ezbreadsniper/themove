import { Raster } from './raster.js';
import { hexToRgb, mix, scale } from '../core/color.js';

const SIZE = 128;
const gauss = (x, w) => Math.exp(-((x / w) ** 2));

/**
 * Hair textures, PS2-style: strands painted along the growth direction with lighting baked in
 * (dark roots, brighter crown, a soft sheen band), because the in-game lights are flat.
 *
 * Shell UVs: u wraps round the head (0.5 = face), v runs hairline (0) → crown (≈0.92).
 * Strand/card UVs: u across the strand, v root (0) → tip (1).
 */
function light(u, v, sheen) {
  const back = 0.88 + 0.12 * Math.cos((u - 0.5) * Math.PI * 2) * 0.5 + 0.06;
  return (0.58 + 0.42 * Math.min(1, v * 1.15)) * back + sheen * gauss(v - 0.64, 0.09);
}

function shade(c, k) {
  return scale(c, k);
}

/** Fills each texel with base × baked light, then strokes go on top. */
function baseFill(r, base, sheen) {
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) r.plot(x, y, shade(base, light(x / r.width, y / r.height, sheen)));
  }
}

/** Fine strands flowing along v (slightly curved by u), each lit by the baked lighting at its midpoint. */
function strokes(r, base, rng, { count, len, curve = 0.6, sheen = 0.25, contrast = 0.32, width = 1 }) {
  for (let i = 0; i < count; i++) {
    const x = rng.next() * r.width;
    const y = rng.next() * r.height;
    const l = len * (0.6 + rng.next() * 0.8);
    const bend = (rng.next() - 0.5) * curve;
    const pts = [0, 0.5, 1].map((t) => [x + bend * l * t * t, y + l * t]);
    const k = light(x / r.width, Math.min(1, (y + l * 0.5) / r.height), sheen) * (1 + (rng.next() - 0.5) * contrast * 2);
    r.polyline(pts, shade(base, k), width, 0.55 + rng.next() * 0.35);
  }
}

function finish(r, rng, grain = 0.04) {
  r.grain(rng, grain);
  r.posterize(40);
  return r;
}

/** Combed / cropped hair: dense parallel strands with root darkening and a sheen band. */
function paintComb(r, base, rng, { short = false } = {}) {
  baseFill(r, scale(base, 0.82), 0.18);
  strokes(r, base, rng.fork('a'), { count: short ? 2600 : 1800, len: short ? 5 : 12, sheen: 0.28 });
  strokes(r, mix(base, [255, 245, 225], 0.18), rng.fork('b'), { count: 420, len: short ? 4 : 10, sheen: 0.35, contrast: 0.15 });
  r.verticalGradient(0, r.height * 0.12, base, scale(base, 0.6), 0.45);
}

/** Buzz / fade: stubble dots over the scalp colour; fade grows denser toward the crown. */
function paintBuzz(r, base, skin, rng, { fade = false } = {}) {
  for (let y = 0; y < r.height; y++) {
    const v = y / r.height;
    const density = fade ? 0.25 + 0.7 * Math.min(1, Math.max(0, (v - 0.15) / 0.55)) : 0.72;
    const ground = mix(skin, base, density * 0.75);
    for (let x = 0; x < r.width; x++) r.plot(x, y, shade(ground, light(x / r.width, v, 0.08)));
  }
  for (let i = 0; i < 9000; i++) {
    const x = rng.next() * r.width;
    const y = rng.next() * r.height;
    const v = y / r.height;
    const density = fade ? 0.2 + 0.8 * Math.min(1, Math.max(0, (v - 0.12) / 0.55)) : 0.85;
    if (rng.next() > density) continue;
    r.plot(x, y, shade(base, light(x / r.width, v, 0.1) * (0.8 + rng.next() * 0.4)), 0.85);
  }
}

/** 360 waves: ripples circling the crown (bands of constant v) with lit crests and dark troughs. */
function paintWaves(r, base, rng) {
  baseFill(r, scale(base, 0.9), 0.1);
  const period = 5;
  for (let y = 0; y < r.height; y++) {
    for (let x = 0; x < r.width; x++) {
      const phase = ((y + Math.sin((x / r.width) * Math.PI * 8) * 1.4) % period) / period;
      const crest = Math.sin(phase * Math.PI * 2);
      const lit = mix(base, [190, 178, 165], 0.22 * Math.max(0, crest));
      r.plot(x, y, shade(lit, light(x / r.width, y / r.height, 0.12) * (0.7 + crest * 0.5)), 0.9);
    }
  }
  for (let i = 0; i < 2200; i++) r.plot(rng.next() * r.width, rng.next() * r.height, shade(base, 0.55), 0.4);
}

/** Cornrows: braids running hairline → crown, chevron plaits, scalp showing in the parts. */
function paintCornrows(r, base, skin, rng) {
  const part = mix(skin, base, 0.25);
  r.fill(part);
  const rows = 14;
  const w = r.width / rows;
  for (let c = 0; c < rows; c++) {
    const cx = (c + 0.5) * w;
    for (let y = 0; y < r.height; y += 4) {
      const k = light(cx / r.width, y / r.height, 0.15);
      r.ellipse(cx - 1.3, y + 2, w * 0.27, 2.2, shade(base, k * 0.95));
      r.ellipse(cx + 1.3, y + 4, w * 0.27, 2.2, shade(base, k * 1.05));
      r.line(cx - w * 0.25, y + 1, cx, y + 3, shade(base, k * 1.35), 1, 0.6);
      r.line(cx, y + 3, cx + w * 0.25, y + 5, shade(base, k * 0.6), 1, 0.6);
    }
  }
  for (let i = 0; i < 600; i++) r.plot(rng.next() * r.width, rng.next() * r.height, shade(base, 0.5), 0.3);
}

/** Coily / afro texture: tight overlapping curl loops, darker in the gaps, lit on top. */
function paintCoils(r, base, rng) {
  baseFill(r, scale(base, 0.55), 0.05);
  for (let i = 0; i < 2600; i++) {
    const x = rng.next() * r.width;
    const y = rng.next() * r.height;
    const rad = 1 + rng.next() * 1.6;
    const k = light(x / r.width, y / r.height, 0.08) * (0.85 + rng.next() * 0.35);
    const loop = mix(base, [120, 98, 82], 0.18 + rng.next() * 0.2);
    const a0 = rng.next() * Math.PI * 2;
    const pts = Array.from({ length: 6 }, (_, j) => {
      const a = a0 + (j / 5) * Math.PI * 1.6;
      return [x + Math.cos(a) * rad, y + Math.sin(a) * rad];
    });
    r.polyline(pts, shade(loop, k), 1, 0.75);
  }
  for (let i = 0; i < 700; i++) {
    const x = rng.next() * r.width;
    const y = r.height * (0.45 + rng.next() * 0.55);
    r.plot(x, y, shade(mix(base, [255, 240, 220], 0.2), light(x / r.width, y / r.height, 0.1) * 1.25), 0.6);
  }
}

/** Loc / twist strand: wrapped segments with a diagonal twist, darker roots, per-column tone variation. */
function paintLocStrand(r, base, root, rng) {
  const cols = 4;
  const cw = r.width / cols;
  for (let c = 0; c < cols; c++) {
    const tone = scale(base, 0.82 + c * 0.09);
    for (let y = 0; y < r.height; y++) {
      const v = y / r.height;
      const col = mix(root, tone, Math.min(1, v * 3.2));
      for (let x = 0; x < cw; x++) {
        const across = x / cw;
        const roundness = 0.62 + 0.45 * Math.sin(across * Math.PI);
        const twist = Math.sin(((y + across * 6) / 6) * Math.PI * 2) * 0.12;
        r.plot(c * cw + x, y, shade(col, roundness + twist));
      }
    }
    for (let i = 0; i < 260; i++) {
      const x = c * cw + rng.next() * cw;
      const y = rng.next() * r.height;
      r.plot(x, y, shade(tone, 0.6 + rng.next() * 0.6), 0.5);
    }
  }
}

/** Loc roots on the scalp: square parts with tight hair inside each section. */
function paintLocRoots(r, base, root, skin, rng) {
  r.fill(mix(skin, root, 0.4));
  const cell = 9;
  for (let y = 0; y < r.height; y += cell) {
    const off = ((y / cell) % 2) * (cell / 2);
    for (let x = -cell; x < r.width; x += cell) {
      const k = light((x + off) / r.width, y / r.height, 0.05);
      r.ellipse(x + off + cell / 2, y + cell / 2, cell * 0.42, cell * 0.42, shade(mix(root, base, 0.3), k));
      r.ellipse(x + off + cell / 2 - 1, y + cell / 2 + 1, cell * 0.18, cell * 0.18, shade(mix(root, base, 0.5), k * 1.2), 0.7);
    }
  }
  for (let i = 0; i < 1500; i++) r.plot(rng.next() * r.width, rng.next() * r.height, shade(root, 0.6), 0.35);
}

/** Long-hair card: strands lengthwise, darker at the card edges so overlapping cards separate. */
function paintCard(r, base, root, rng) {
  for (let y = 0; y < r.height; y++) {
    const v = y / r.height;
    for (let x = 0; x < r.width; x++) {
      const across = (x % 32) / 32;
      const edge = 0.7 + 0.3 * Math.sin(across * Math.PI);
      const sheenBand = 0.22 * gauss(v - 0.3, 0.1);
      r.plot(x, y, shade(mix(root, base, Math.min(1, v * 4 + 0.3)), edge * (0.72 + sheenBand + v * 0.15)));
    }
  }
  for (let i = 0; i < 1600; i++) {
    const x = rng.next() * r.width;
    const y = rng.next() * r.height;
    r.line(x, y, x + (rng.next() - 0.5) * 1.5, y + 6 + rng.next() * 14, shade(base, 0.6 + rng.next() * 0.7), 1, 0.5);
  }
}

/** Long hair shell with a centre part: combed strands sweep away from a scalp line at the face (u≈0.5). */
function paintPart(r, base, root, skin, rng) {
  paintComb(r, base, rng);
  const part = mix(skin, root, 0.45);
  for (let y = 0; y < r.height * 0.62; y++) {
    const fade = 1 - y / (r.height * 0.62);
    r.line(r.width * 0.5, y, r.width * 0.5, y + 1, part, 1.4, 0.55 * fade + 0.25);
  }
  for (let i = 0; i < 260; i++) {
    const side = i % 2 ? 1 : -1;
    const y = rng.next() * r.height * 0.6;
    const x = r.width * 0.5 + side * (1 + rng.next() * 2);
    r.line(x, y, x + side * (4 + rng.next() * 7), y + 3 + rng.next() * 6, shade(base, 0.8 + rng.next() * 0.5), 1, 0.6);
  }
}

/** Wavy card: card strands plus soft light/dark bands that follow the wave period. */
function paintWaveCard(r, base, root, rng) {
  paintCard(r, base, root, rng);
  for (let y = 0; y < r.height; y++) {
    const band = Math.sin((y / r.height) * Math.PI * 6.4);
    if (Math.abs(band) < 0.35) continue;
    const tone = band > 0 ? mix(base, [255, 236, 210], 0.14) : scale(base, 0.62);
    for (let x = 0; x < r.width; x++) {
      const across = (x % 32) / 32;
      r.plot(x, y, tone, 0.22 * Math.sin(across * Math.PI));
    }
  }
}

/** Beard volume: short coarse strands growing downward, darker toward the skin (v=1 is the cheek line). */
function paintBeard(r, base, rng) {
  for (let y = 0; y < r.height; y++) {
    const v = y / r.height;
    for (let x = 0; x < r.width; x++) r.plot(x, y, shade(base, 0.78 + 0.32 * (1 - v) + (rng.next() - 0.5) * 0.12));
  }
  for (let i = 0; i < 2400; i++) {
    const x = rng.next() * r.width;
    const y = rng.next() * r.height;
    const len = 2 + rng.next() * 4;
    const k = 0.7 + rng.next() * 0.6;
    r.line(x, y, x + (rng.next() - 0.5) * 2, y - len, shade(base, k), 1, 0.6);
  }
  for (let i = 0; i < 500; i++) r.plot(rng.next() * r.width, rng.next() * r.height, mix(base, [230, 220, 205], 0.25), 0.5);
}

/** Mohawk shell: shaved sides (buzz) with a full strip along the midline (front u≈0.5, back u≈0/1). */
function paintMohawk(r, base, skin, rng) {
  paintBuzz(r, base, skin, rng.fork('buzz'), { fade: true });
  for (let y = 0; y < r.height; y++) {
    const v = y / r.height;
    const half = 0.035 + 0.06 * v;
    for (let x = 0; x < r.width; x++) {
      const u = x / r.width;
      const d = Math.min(Math.abs(u - 0.5), u, 1 - u);
      if (d < half) r.plot(x, y, shade(base, light(u, v, 0.15) * (0.85 + rng.next() * 0.3)));
    }
  }
}

/**
 * kind: comb | crop | buzz | fade | waves | cornrows | coils | locStrand | locRoots | card | mohawk | part | waveCard
 */
export function paintHairTexture(kind, { color, rootColor, skin }, rng) {
  const r = new Raster(SIZE, SIZE);
  const base = hexToRgb(color);
  const root = hexToRgb(rootColor ?? color);
  const skinRgb = hexToRgb(skin ?? '#9d6a45');
  switch (kind) {
    case 'crop': paintComb(r, base, rng, { short: true }); break;
    case 'comb': paintComb(r, base, rng); break;
    case 'buzz': paintBuzz(r, base, skinRgb, rng); break;
    case 'fade': paintBuzz(r, base, skinRgb, rng, { fade: true }); break;
    case 'waves': paintWaves(r, base, rng); break;
    case 'cornrows': paintCornrows(r, base, skinRgb, rng); break;
    case 'coils': paintCoils(r, base, rng); break;
    case 'locStrand': paintLocStrand(r, base, root, rng); break;
    case 'locRoots': paintLocRoots(r, base, root, skinRgb, rng); break;
    case 'card': paintCard(r, base, root, rng); break;
    case 'mohawk': paintMohawk(r, base, skinRgb, rng); break;
    case 'part': paintPart(r, base, root, skinRgb, rng); break;
    case 'waveCard': paintWaveCard(r, base, root, rng); break;
    case 'beard': paintBeard(r, base, rng); break;
    default: paintComb(r, base, rng);
  }
  return finish(r, rng.fork('grain'));
}
