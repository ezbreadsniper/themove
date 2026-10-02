import { ringRadius } from '../geo/mesh-builder.js';

/**
 * Layer stack (inside → out). A garment on a higher layer is built outside every lower-layer garment
 * it overlaps, with at least LAYER_GAP between the surfaces (MD's "layer" + collision thickness).
 * Exceptions are explicit: an untucked top sits over the trouser waistband (trousers are clamped
 * under it); trousers sit over socks and over the shoe upper at the hem.
 */
export const LAYER_ORDER = ['skin', 'underwear', 'socks', 'bottom', 'top', 'outer', 'shoes', 'accessories'];
export const LAYER_GAP = 0.009;

export function layerIndex(slot) {
  return LAYER_ORDER.indexOf(slot);
}

/**
 * Pushes the rows of an outer garment (ring rows with y, rx, rzF, rzB, cz) outside `under`, a
 * bodySurface()-style function (y, θ) → { r, cz } with a `.top` and `.bottom` y range.
 */
export function clearUnder(rows, under, gap = LAYER_GAP) {
  for (const r of rows) {
    if (r.collar || r.y > under.top + 0.005 || r.y < under.bottom - 0.005) continue;
    const at = (theta) => under(r.y, theta).r + gap;
    r.rx = Math.max(r.rx, at(Math.PI / 2), at(-Math.PI / 2));
    r.rzF = Math.max(r.rzF, at(0));
    r.rzB = Math.max(r.rzB, at(Math.PI));
  }
}

/** Radius of a ring row at θ (for tests and audits). */
export function rowRadius(row, theta) {
  return ringRadius({ rx: row.rx, rzF: row.rzF, rzB: row.rzB, n: row.n ?? 2.3 }, theta);
}
