import { hashString } from '../../core/rng.js';

/**
 * Deterministic light flicker: a pure function of (spec, time), so every client, replay and test
 * sees the same stutter. spec = { rate, depth, seed, dropout, dim, hum }:
 *  - rate     event windows per second (each window rolls once for an event)
 *  - depth    0..1, how far the light may drop
 *  - dropout  chance per window of a stutter (fast on/off strobing, like a tired starter)
 *  - dim      chance per window of a slow buzz-dim (smooth dip)
 *  - hum      constant mains ripple amplitude (fraction of depth), always on
 * Returns the light level multiplier (0..1).
 */
function hash01(seed, i) {
  let h = (seed ^ Math.imul(i | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function flickerSeed(seed) {
  return typeof seed === 'string' ? hashString(seed) : (seed >>> 0);
}

export function flickerLevel(spec, t) {
  if (!spec) return 1;
  const rate = spec.rate ?? 0.5;
  const depth = spec.depth ?? 0.6;
  const seed = flickerSeed(spec.seed ?? 1);
  const dropout = spec.dropout ?? 0.1;
  const dim = spec.dim ?? 0.15;
  const hum = spec.hum ?? 0.04;
  let v = 1 - depth * hum * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 7.3 + (seed % 97)));
  const x = t * rate;
  const w = Math.floor(x);
  const u = x - w;
  const r = hash01(seed, w);
  if (r < dropout) {
    // stutter occupies the first ~40% of the window, strobing in 1/14-window steps
    if (u < 0.4) {
      const step = Math.floor(u * 35);
      const on = hash01(seed + 1, w * 64 + step) > 0.5;
      v *= on ? 1 - depth * 0.25 : 1 - depth;
    }
  } else if (r < dropout + dim) {
    v *= 1 - depth * 0.4 * Math.sin(Math.PI * u) ** 2;
  }
  return Math.max(0, Math.min(1, v));
}
