import * as presets from '../character/presets/index.js';
import { createRng } from '../core/rng.js';
import { FACE_PRESET_NAMES } from '../character/faces.js';

/**
 * NPC casting: what an NPC looks like. Main (playable) characters are never used for ambient NPCs.
 * Looks come only from NPC_PRESETS (the sheet characters who are ordinary NPCs), used as-is for named
 * NPCs that ask for them, or as bases for deterministic procedural variants (body, skin, face, hair,
 * clothes and colours re-rolled from the NPC id within an archetype wardrobe).
 */
const byId = presets.PRESETS_BY_ID;
/** Presets allowed as NPC looks (falls back to the neutral trial character on older rosters). */
export const NPC_LOOKS = (presets.NPC_PRESETS ?? []).map((p) => p.id);
const MAIN_IDS = new Set((presets.MAIN_PRESETS ?? []).map((p) => p.id));
const FEM_BASE = NPC_LOOKS.find((id) => byId[id]?.body?.feminine >= 0.5) ?? 'trial-default';
const MASC_BASE = 'trial-default';

const SKIN = ['#f1c9a5', '#e0ac85', '#c99068', '#b07d5a', '#9d6a45', '#8a5a3a', '#6b4128', '#4f2f1c', '#3b2416'];
const HAIR_COLOR = ['#120d0a', '#1e1611', '#2e1e15', '#4a3020', '#6b4a2e', '#8c6a42', '#b89a64', '#5a2a18', '#2a2a2a'];
const HAIR_MASC = ['crop', 'fade', 'buzz', 'waves', 'afro', 'curlyMop', 'bald', 'cornrows', 'twists', 'messy', 'flatTop'];
const HAIR_FEM = ['longStraight', 'longWavy', 'locs', 'twists', 'afro', 'curlyMop', 'messy'];
const BEARDS = ['none', 'none', 'none', 'stubble', 'goatee', 'shortBeard', 'fiveOClock', 'mustache', 'fullBeard'];

/** Wardrobes per archetype: palettes and garment choices for procedural variants. */
export const WARDROBES = {
  resident: {
    tops: ['tee', 'longsleeve', 'sweater', 'buttonUp', 'tee'], topColors: ['#7a8a6a', '#c8c2b4', '#3a4a6a', '#8c3a32', '#d8d0bc', '#2a2a2e', '#5a6a7a'],
    bottoms: ['jeans', 'pants', 'jeans'], bottomColors: ['#4c6788', '#2a3448', '#6a5a46', '#3a3a3a', '#7f9cc0'],
    outer: [null, null, 'hoodie', 'zipHoodie', 'denimJacket', 'bomber'], outerColors: ['#4a4a52', '#6a3a2a', '#2a3a2a', '#7e9dbd'],
    shoes: ['canvasLow', 'runner', 'slipOn', 'skate', 'loafer'], age: [22, 66],
    accessories: [[0.25, { type: 'glasses', color: '#2a2a2a' }], [0.15, { type: 'beanie', color: '#3a2a4a' }], [0.2, { type: 'watch', color: '#c9ccd0' }]],
  },
  clerk: {
    tops: ['buttonUp', 'tee', 'longsleeve'], topColors: ['#2a5a3a', '#c8c2b4', '#d8d8d8', '#3a4a6a'],
    bottoms: ['pants', 'jeans'], bottomColors: ['#2a2a2e', '#3a3a3a', '#4c6788'],
    outer: [null, null, 'vest'], outerColors: ['#2a5a3a', '#7a2a2a'],
    shoes: ['runner', 'canvasLow', 'loafer'], age: [19, 58],
    accessories: [[0.3, { type: 'glasses', color: '#4a3322' }], [0.2, { type: 'cap', color: '#2a5a3a' }]],
  },
  thug: {
    tops: ['tee', 'tank', 'longsleeve', 'football'], topColors: ['#161618', '#e8e6e0', '#3a3a3e', '#7a1a1a', '#1a2a4a'],
    bottoms: ['jeans', 'pants'], bottomColors: ['#1c1c20', '#4c6788', '#5a5a3a', '#7f9cc0'],
    outer: ['hoodie', 'puffer', 'track', 'zipHoodie', null], outerColors: ['#1c1c20', '#4c5232', '#2a2a3a', '#6a1a1a', '#3a3a3e'],
    shoes: ['basketball', 'hiTopChunky', 'workBoot', 'runner'], age: [17, 34],
    accessories: [[0.35, { type: 'beanie', color: '#1a1a1c' }], [0.3, { type: 'cap', color: '#1f2635' }], [0.25, { type: 'chains', color: '#d4a93c', count: 1, thickness: 0.006 }], [0.2, { type: 'durag', color: '#1a1a1c' }]],
  },
  pedestrian: {
    tops: ['tee', 'longsleeve', 'sweater', 'rugby', 'tee'], topColors: ['#8c9196', '#c8b48a', '#3a5a7a', '#7a3a5a', '#e8e6e0', '#5a7a4a'],
    bottoms: ['jeans', 'pants', 'shorts'], bottomColors: ['#4c6788', '#c8b48a', '#3a3a3a', '#6a7a8a'],
    outer: [null, null, 'bomber', 'track', 'denimJacket'], outerColors: ['#3a4a3a', '#2a2a3a', '#8a6a4a'],
    shoes: ['canvasLow', 'runner', 'skate', 'slipOn'], age: [18, 72],
    accessories: [[0.2, { type: 'cap', color: '#1f2635' }], [0.2, { type: 'glasses', color: '#2a2a2a' }], [0.15, { type: 'bucket', color: '#d8d2c0' }]],
  },
};

WARDROBES.friend = WARDROBES.resident;

const clone = (o) => JSON.parse(JSON.stringify(o));
const jitter = (rng, v, amt, lo, hi) => Math.max(lo, Math.min(hi, v + (rng.next() * 2 - 1) * amt));

/**
 * Definition for an NPC. `look` = an NPC_PRESETS id to use exactly; otherwise a procedural variant
 * for `archetype`, seeded by `id`. Never returns a main character.
 */
export function castNpc({ id, archetype = 'pedestrian', look = null, feminine = null } = {}) {
  if (look && NPC_LOOKS.includes(look) && byId[look]) return clone(byId[look]);
  const rng = createRng(`cast:${id}`);
  const fem = feminine ?? rng.chance(0.45);
  const base = clone(byId[fem ? FEM_BASE : MASC_BASE] ?? byId['trial-default']);
  const w = WARDROBES[archetype] ?? WARDROBES.pedestrian;
  const def = { ...base, id: `npc-${id}`, name: `NPC ${id}`, seed: `npc-${id}` };
  const b = def.body;
  b.height = fem ? jitter(rng, 1.66, 0.08, 1.52, 1.8) : jitter(rng, 1.78, 0.1, 1.62, 1.96);
  b.build = jitter(rng, archetype === 'thug' ? 0.58 : 0.48, 0.2, 0.1, 0.95);
  b.muscle = jitter(rng, archetype === 'thug' ? 0.55 : 0.38, 0.2, 0.05, 0.9);
  b.shoulders = jitter(rng, b.shoulders ?? 1, 0.05, 0.88, 1.15);
  b.age = Math.round(w.age[0] + rng.next() * (w.age[1] - w.age[0]));
  def.skin = { tone: rng.pick(SKIN) };
  def.face = { preset: fem ? (FACE_PRESET_NAMES.includes('feminine') ? 'feminine' : rng.pick(FACE_PRESET_NAMES)) : rng.pick(FACE_PRESET_NAMES.filter((n) => n !== 'feminine')), noseWidth: jitter(rng, 1, 0.2, 0.75, 1.5), jawWidth: jitter(rng, 1, 0.12, 0.85, 1.2), eyeSize: jitter(rng, 1, 0.1, 0.85, 1.2), facialHair: fem ? 'none' : rng.pick(BEARDS) };
  const hairColor = rng.pick(HAIR_COLOR);
  def.hair = { style: rng.pick(fem ? HAIR_FEM : HAIR_MASC), color: hairColor };
  const topType = rng.pick(w.tops);
  def.top = { type: topType, fit: jitter(rng, 0.5, 0.25, 0.05, 0.95), length: fem ? jitter(rng, 0, 0.06, -0.13, 0.07) : 0.06, sleeve: topType === 'longsleeve' || topType === 'sweater' || topType === 'buttonUp' ? 'long' : topType === 'tank' ? 'none' : 'short', collar: 'crew', color: rng.pick(w.topColors), pattern: topType === 'rugby' ? 'rugby' : 'plain' };
  const outer = rng.pick(w.outer);
  def.outer = outer ? { type: outer, fit: 0.5, color: rng.pick(w.outerColors), ...(outer === 'puffer' ? { fabric: 'nylon' } : {}) } : null;
  const bottom = rng.pick(w.bottoms);
  def.bottom = { type: bottom, length: bottom === 'shorts' ? 'shorts' : 'full', kind: bottom === 'jeans' || bottom === 'shorts' ? 'denim' : 'twill', fit: jitter(rng, 0.6, 0.25, 0.1, 0.95), color: rng.pick(w.bottomColors), wash: rng.next(), whiskers: bottom === 'jeans', stack: jitter(rng, 0.5, 0.4, 0, 1.2) };
  def.dress = null;
  def.socks = bottom === 'shorts' ? { color: '#e4e2dc', height: 0.18 } : null;
  def.shoes = { type: rng.pick(w.shoes), upper: rng.pick(['#e8e6e0', '#1d1d20', '#6a4a2a', '#2a3a5a', '#8a8a8a']), sole: '#e4e2dc', size: fem ? 0.93 : 1.04 };
  def.tattoos = { left: rng.chance(0.15) ? rng.pick(['sparse', 'half', 'sleeve']) : 'none', right: rng.chance(0.15) ? rng.pick(['sparse', 'half', 'floral']) : 'none', ink: '#2a3038' };
  def.accessories = w.accessories.filter(([p]) => rng.chance(p)).map(([, a]) => ({ ...a }));
  // One head covering at most.
  const heads = ['cap', 'beanie', 'bucket', 'durag'];
  let hat = false;
  def.accessories = def.accessories.filter((a) => !heads.includes(a.type) || (!hat && (hat = true)));
  if (fem && rng.chance(0.4)) def.accessories.push({ type: 'earrings', color: rng.pick(['#d4a93c', '#e8e8ec']), size: 0.8 });
  return def;
}

/** True when a definition id belongs to a main (playable) character. */
export const isMainCharacter = (id) => MAIN_IDS.has(id);
