/**
 * Read-only access to the characters as the user saved them in the creator, for the game pages.
 *
 *   import { loadSavedDefinition } from '../character/saved.js';
 *   const character = buildCharacter(loadSavedDefinition(params.get('id')));
 *
 * `id` null/undefined means "the player character picked in the creator" (one of the main
 * characters, sheet-01 by default). Unknown ids, blocked storage or corrupt saves fall back to the
 * shipped preset (then to the trial character), so this never throws and never writes.
 */
import { MAIN_PRESETS, NPC_PRESETS, PRESETS_BY_ID } from './presets/index.js';
import { createEditStore } from './persistence.js';
import { normalizeDefinition } from './definition.js';

export const MAIN_IDS = MAIN_PRESETS.map((p) => p.id);
export const NPC_IDS = NPC_PRESETS.map((p) => p.id);
export const DEFAULT_PLAYER_ID = MAIN_IDS[0];
const FALLBACK_ID = 'trial-default';

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function openStore(storage) {
  try {
    return createEditStore(storage === undefined ? browserStorage() : storage, PRESETS_BY_ID, { debounceMs: 0 });
  } catch {
    return null;
  }
}

/** The main character the creator marked as the player (falls back to the first main character). */
export function savedPlayerId({ storage } = {}) {
  const id = openStore(storage)?.playerId;
  return MAIN_IDS.includes(id) ? id : DEFAULT_PLAYER_ID;
}

/**
 * Normalized definition for `id` with the creator's saved edits applied (custom characters made in
 * the creator work too). Options: { storage } to read from something other than localStorage.
 */
export function loadSavedDefinition(id = null, { storage } = {}) {
  const store = openStore(storage);
  const want = id ?? (MAIN_IDS.includes(store?.playerId) ? store.playerId : DEFAULT_PLAYER_ID);
  let def = null;
  try {
    def = store?.get(want) ?? null;
  } catch {
    def = null;
  }
  if (def) return def;
  return normalizeDefinition(PRESETS_BY_ID[want] ?? PRESETS_BY_ID[FALLBACK_ID]).value;
}
