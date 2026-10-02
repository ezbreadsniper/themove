/** NPC behaviour layer: see docs/npc/ARCHITECTURE.md. */
export { NpcManager, FALLBACK_SPAWNS, LOD, NPC_BASE_CLIPS, defaultClipsFor } from './manager.js';
export { Npc, CLIP_FALLBACKS } from './npc.js';
export { Brain, STATES, GROUPS } from './brain.js';
export { Perception, makeLineOfSight, AWARENESS } from './perception.js';
export { Relationships, RANKS, RANK_THRESHOLDS, DEEDS, rankOf } from './disposition.js';
export { ARCHETYPES, FACTIONS, makePersonality } from './archetypes.js';
export { REACTIONS, REACTION_MATRIX, selectReaction, temperament } from './reactions.js';
export { STIMULI } from './stimuli.js';
export { EventBus, connectBus, PLAYER_EVENTS } from './events.js';
