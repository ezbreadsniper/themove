/**
 * "Randomise outfit" for the creator: a new, plausible set of clothes and accessories from a seed,
 * keeping the person (body, skin, face, hair, tattoos). Pure and deterministic, the result is an
 * ordinary definition, so it saves and reverts like any other edit.
 */
import { createRng } from '../core/rng.js';
import { SCHEMA, normalizeDefinition } from './definition.js';

const NEUTRALS = ['#141416', '#1d1d20', '#e8e6e0', '#d8d2c0', '#5b5f66', '#8e9196', '#2a2f3a', '#3b3226'];
const COLOURS = ['#7a2232', '#c42a2a', '#2a4aa8', '#2f5d3a', '#4f5a2e', '#c98a2b', '#6b4a8a', '#7e9dbd', '#b85a3c', '#d4c49a'];
const DENIM = ['#4c6788', '#7e9dbd', '#2c3a52', '#1c1f26', '#a9bdd3'];
const METALS = ['#d4a93c', '#c9ccd2', '#e8e8ec'];

const enumOf = (slot, field) => SCHEMA.fields[slot].fields[field].values;

export function randomizeOutfit(def, seed = 'outfit') {
  const rng = createRng(`outfit:${seed}`);
  const colour = () => (rng.chance(0.55) ? rng.pick(NEUTRALS) : rng.pick(COLOURS));
  const out = { ...def, dress: null };
  const topType = rng.pick(enumOf('top', 'type'));
  out.top = {
    type: topType,
    fit: Math.round(rng.range(0.1, 0.9) * 100) / 100,
    sleeve: rng.pick(['short', 'short', 'long']),
    color: colour(),
    pattern: rng.chance(0.65) ? 'plain' : rng.pick(['stripes', 'floral', 'gingham', 'polka']),
    accent: colour(),
    fabric: rng.pick(enumOf('top', 'fabric')),
  };
  const bottomType = rng.pick(['jeans', 'jeans', 'pants', 'shorts', 'skirt', 'leggings']);
  out.bottom = {
    type: bottomType,
    length: bottomType === 'shorts' ? rng.pick(['shorts', 'cutoff']) : rng.pick(['full', 'full', 'ankle', 'cropped']),
    cut: rng.pick(enumOf('bottom', 'cut')),
    kind: bottomType === 'jeans' ? 'denim' : rng.pick(enumOf('bottom', 'kind')),
    color: bottomType === 'jeans' ? rng.pick(DENIM) : colour(),
    fit: Math.round(rng.range(0.2, 1) * 100) / 100,
    skirtStyle: rng.pick(enumOf('bottom', 'skirtStyle')),
    skirtLength: Math.round(rng.range(0.2, 0.8) * 100) / 100,
    rips: rng.chance(0.75) ? 'none' : rng.pick(['knees', 'distressed']),
    cargo: rng.chance(0.2),
    belt: rng.chance(0.4) ? { color: rng.pick(NEUTRALS), buckle: rng.pick(METALS) } : null,
  };
  out.outer = rng.chance(0.4) ? { type: rng.pick(enumOf('outer', 'type')), color: colour(), open: rng.chance(0.5) } : null;
  out.socks = rng.chance(0.6) ? { color: rng.pick(NEUTRALS), height: Math.round(rng.range(0.12, 0.3) * 100) / 100 } : null;
  out.shoes = { ...def.shoes, type: rng.pick(enumOf('shoes', 'type').filter((t) => t !== 'barefoot')), upper: colour(), sole: rng.pick(NEUTRALS), accent: undefined };
  const accessories = [];
  const head = rng.pick([null, null, 'cap', 'beanie', 'bucket']);
  if (head) accessories.push({ type: head, color: colour() });
  if (rng.chance(0.35)) accessories.push({ type: rng.pick(['glasses', 'shades']) });
  if (rng.chance(0.3)) accessories.push({ type: 'chains', color: rng.pick(METALS), count: rng.int(1, 3) });
  if (rng.chance(0.25)) accessories.push({ type: 'earrings', color: rng.pick(METALS) });
  if (rng.chance(0.25)) accessories.push({ type: rng.pick(['watch', 'bracelet']), color: rng.pick(METALS) });
  out.accessories = accessories;
  return normalizeDefinition(out).value;
}
