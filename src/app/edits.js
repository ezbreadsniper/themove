/**
 * The creator's persistent per-character edits. The implementation lives in
 * src/character/persistence.js so the game (src/character/saved.js) reads the same store.
 */
export {
  diffDefinition,
  applyDiff,
  createEditStore,
  migrateStore,
  STORE_KEY as EDITS_KEY,
  STORE_KEY,
  LEGACY_KEYS,
  STORE_VERSION,
  STORE_FORMAT,
} from '../character/persistence.js';
