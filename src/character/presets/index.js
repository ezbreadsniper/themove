import sheet01 from './sheet-01-black-tee.json';
import sheet02 from './sheet-02-denim-vest.json';
import sheet03 from './sheet-03-red-rugby.json';
import sheet04 from './sheet-04-camo-cargo.json';
import sheet05 from './sheet-05-curly-denim.json';
import sheet06 from './sheet-06-floral-cutoffs.json';
import sheet07 from './sheet-07-puffer-balaclava.json';
import trial from './trial-default.json';
import meta from './meta.json';

/** The five main (playable) characters, from the user's sheets. */
export const MAIN_PRESETS = [sheet01, sheet02, sheet03, sheet04, sheet05];
/** Characters from the sheets who appear in the world as ordinary NPCs. */
export const NPC_PRESETS = [sheet06, sheet07];
/** Everything the validation suite runs on: main characters, NPC characters and the neutral trial character. */
export const PRESETS = [...MAIN_PRESETS, ...NPC_PRESETS, trial];
export const PRESETS_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const PRESET_META = meta;
/** Roster role from meta.json: 'main' (playable), 'npc' (appears as an ordinary NPC) or 'test'. */
export const roleOf = (id) => meta[id]?.role ?? 'npc';
