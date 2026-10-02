import { createRng } from '../core/rng.js';

/**
 * NPC archetypes: personality traits (0..1), faction, perception tuning, ambient preferences and
 * content hooks (dialogue tree, bark voice). An NPC is an archetype + per-instance overrides + a small
 * deterministic jitter so two residents never react identically.
 *
 *   bravery      resists fear; high bravery turns threats into confrontation instead of flight
 *   aggression   how readily annoyance becomes anger / confrontation / combat
 *   sociability  greets, chats, starts conversations, tolerates being bumped
 *   curiosity    investigates noises and stares at strange behaviour
 *   wander       how often idle time becomes a stroll (0 = stays at the scenario point)
 */
export const ARCHETYPES = {
  resident: {
    label: 'Resident',
    faction: 'residents',
    traits: { bravery: 0.4, aggression: 0.15, sociability: 0.7, curiosity: 0.55, wander: 0.35 },
    disposition: 10,
    perception: { fov: 140, sightRange: 22, hearing: 1 },
    idles: ['npc_idle_weight', 'npc_phone', 'npc_idle_armsCrossed', 'npc_idle_pockets'],
    talk: ['npc_talk_gesture_1', 'npc_talk_gesture_2', 'npc_talk_gesture_4'],
    dialogue: 'neighbour',
    voice: 'resident',
    presets: ['sheet-05-curly-denim', 'sheet-06-floral-cutoffs', 'sheet-03-red-rugby'],
  },
  clerk: {
    label: 'Shop clerk',
    faction: 'shopkeepers',
    traits: { bravery: 0.3, aggression: 0.1, sociability: 0.6, curiosity: 0.4, wander: 0.05 },
    disposition: 5,
    perception: { fov: 150, sightRange: 18, hearing: 1 },
    idles: ['npc_idle_weight', 'npc_idle_armsCrossed', 'npc_phone'],
    talk: ['npc_talk_gesture_1', 'npc_talk_gesture_4'],
    dialogue: 'clerk',
    voice: 'clerk',
    presets: ['sheet-01-black-tee'],
  },
  thug: {
    label: 'Corner crew',
    faction: 'crew',
    traits: { bravery: 0.85, aggression: 0.75, sociability: 0.3, curiosity: 0.6, wander: 0.15 },
    disposition: -25,
    perception: { fov: 160, sightRange: 26, hearing: 1.2 },
    idles: ['npc_lean_wall', 'npc_idle_pockets', 'npc_idle_armsCrossed'],
    talk: ['npc_talk_gesture_3', 'npc_talk_gesture_2'],
    dialogue: 'thug',
    voice: 'thug',
    presets: ['sheet-07-puffer-balaclava', 'sheet-04-camo-cargo', 'sheet-02-denim-vest'],
  },
  pedestrian: {
    label: 'Passer-by',
    faction: 'civilians',
    traits: { bravery: 0.3, aggression: 0.2, sociability: 0.4, curiosity: 0.45, wander: 0.8 },
    disposition: 0,
    perception: { fov: 130, sightRange: 20, hearing: 1 },
    idles: ['npc_idle_weight', 'npc_phone', 'npc_idle_pockets'],
    talk: ['npc_talk_gesture_1', 'npc_talk_gesture_2'],
    dialogue: null,
    voice: 'pedestrian',
    presets: ['trial-default', 'sheet-03-red-rugby'],
  },
};

/** Faction table: how factions feel about each other (−100..100), used for witness spill-over. */
export const FACTIONS = {
  residents: { label: 'Foundry St. residents', allies: ['shopkeepers', 'civilians'], enemies: ['crew'] },
  shopkeepers: { label: 'Shopkeepers', allies: ['residents', 'civilians'], enemies: [] },
  civilians: { label: 'Civilians', allies: ['residents', 'shopkeepers'], enemies: [] },
  crew: { label: 'Corner crew', allies: [], enemies: ['residents'] },
};

const TRAITS = ['bravery', 'aggression', 'sociability', 'curiosity', 'wander'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Resolves an NPC definition: archetype defaults, then `overrides`, with ±jitter on each trait
 * seeded by the NPC id (deterministic).
 */
export function makePersonality(archetypeId, { id = archetypeId, traits = {}, jitter = 0.08, ...rest } = {}) {
  const a = ARCHETYPES[archetypeId] ?? ARCHETYPES.pedestrian;
  const rng = createRng(`npc:${id}`);
  const t = {};
  for (const k of TRAITS) t[k] = clamp01((traits[k] ?? a.traits[k]) + (traits[k] === undefined ? (rng.next() * 2 - 1) * jitter : 0));
  return {
    archetype: archetypeId in ARCHETYPES ? archetypeId : 'pedestrian',
    label: a.label,
    faction: rest.faction ?? a.faction,
    traits: t,
    disposition: rest.disposition ?? a.disposition,
    perception: { ...a.perception, ...(rest.perception ?? {}) },
    idles: rest.idles ?? a.idles,
    talk: rest.talk ?? a.talk,
    dialogue: rest.dialogue !== undefined ? rest.dialogue : a.dialogue,
    voice: rest.voice ?? a.voice,
    name: rest.name ?? null,
  };
}
