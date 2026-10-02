import { rankIndex } from './disposition.js';

/**
 * Reaction selection matrix: (sensed stimulus × temperament × relationship) → reaction.
 *
 * A reaction is immediate and short: it bumps the NPC's drives (fear / anger / alarm / interest /
 * social), may play a one-shot clip, bark a concept and record a deed against the player. The
 * behaviour layer (brain.js) then picks the sustained state (flee, cower, confront ...) from the
 * drives by utility, so one gunshot near a coward and one near a tough guy share all the plumbing
 * and differ only in this table.
 *
 * Temperament bands (from traits): coward (low bravery), tough (brave and aggressive), hothead
 * (aggressive, not brave), normal. Cells are a reaction id or a function (ctx) → id.
 */
export function temperament(traits) {
  if (traits.bravery >= 0.7 && traits.aggression >= 0.55) return 'tough';
  if (traits.bravery < 0.33) return 'coward';
  if (traits.aggression >= 0.6) return 'hothead';
  return 'normal';
}

/**
 * What each reaction does. drives are added (scaled by intensity and traits), clamped to 0..1;
 * `state` is the brain state the reaction leans toward (an intent bonus that fades over seconds).
 */
export const REACTIONS = {
  ignore: { drives: {} },
  glance: { drives: { interest: 0.25 }, look: 2.5 },
  stare: { drives: { interest: 0.5, alarm: 0.2 }, look: 4, bark: 'stare', state: 'alert' },
  greet: { drives: { social: 1 }, look: 3, state: 'greet' },
  startle: { drives: { alarm: 0.55, interest: 0.4 }, anim: 'npc_alert', bark: 'startled', look: 4, state: 'alert' },
  investigate: { drives: { interest: 0.75, alarm: 0.25 }, look: 3, state: 'investigate' },
  wary: { drives: { alarm: 0.5, fear: 0.3 }, anim: 'npc_alert', bark: 'weaponSeen', look: 6, state: 'alert' },
  handsUp: { drives: { fear: 0.85, alarm: 0.6, surrender: 1 }, bark: 'plead', look: 6, state: 'handsUp' },
  cower: { drives: { fear: 1, alarm: 0.7 }, bark: 'scream', panic: true, state: 'cower' },
  flee: { drives: { fear: 1, alarm: 0.8 }, anim: 'npc_flee_start', bark: 'flee', panic: true, state: 'flee' },
  complain: { drives: { anger: 0.25, interest: 0.3, alarm: 0.2 }, bark: 'bumped', look: 3, state: 'alert' },
  confront: { drives: { anger: 0.65, alarm: 0.5 }, bark: 'confront', look: 6, state: 'confront' },
  fight: { drives: { anger: 1, alarm: 0.8 }, bark: 'fight', look: 6, state: 'combat' },
  calm: { drives: { fear: -0.35, anger: -0.2, alarm: -0.2, surrender: -1 }, bark: 'relief' },
  duck: { drives: { fear: 0.95, alarm: 0.8 }, anim: 'npc_duck', bark: 'scream', panic: true, state: 'cower' },
  grief: { drives: { fear: 0.55, alarm: 0.8 }, bark: 'grief', look: 8, panic: true, state: 'cower' },
  avenge: { drives: { anger: 1, alarm: 0.9 }, bark: 'avenge', look: 8, state: 'combat' },
};

const hostile = (c) => rankIndex(c.rank) <= 1;
const friendly = (c) => rankIndex(c.rank) >= 3;
const close = (c, m) => c.distance < m;

/** Rows: stimulus type. Columns: temperament. */
export const REACTION_MATRIX = {
  gunshot: {
    coward: (c) => (close(c, 10) ? 'cower' : 'flee'),
    normal: (c) => (close(c, 6) ? 'duck' : 'flee'),
    hothead: 'flee',
    tough: (c) => (hostile(c) ? 'fight' : c.intensity > 0.6 ? 'flee' : 'wary'),
  },
  gunshotNear: { coward: 'cower', normal: 'cower', hothead: 'flee', tough: (c) => (hostile(c) ? 'fight' : 'flee') },
  aimedAt: {
    coward: 'handsUp',
    normal: (c) => (close(c, 14) ? 'handsUp' : 'flee'),
    hothead: (c) => (close(c, 6) ? 'handsUp' : 'flee'),
    tough: (c) => (hostile(c) || close(c, 4) ? 'confront' : 'handsUp'),
  },
  weaponDrawn: {
    coward: (c) => (friendly(c) ? 'wary' : close(c, 8) ? 'flee' : 'wary'),
    normal: 'wary',
    hothead: (c) => (hostile(c) ? 'confront' : 'wary'),
    tough: (c) => (hostile(c) ? 'confront' : 'stare'),
  },
  weaponHolstered: { coward: 'calm', normal: 'calm', hothead: 'calm', tough: 'calm' },
  melee: { coward: 'flee', normal: (c) => (close(c, 5) ? 'flee' : 'startle'), hothead: 'confront', tough: (c) => (close(c, 6) ? 'confront' : 'stare') },
  assault: { coward: 'cower', normal: 'flee', hothead: 'fight', tough: 'fight' },
  panic: { coward: 'flee', normal: (c) => (c.intensity > 0.45 ? 'flee' : 'startle'), hothead: 'startle', tough: 'stare' },
  panicSeen: { coward: 'flee', normal: (c) => (c.intensity > 0.35 ? 'flee' : 'startle'), hothead: 'startle', tough: 'stare' },
  scream: { coward: 'flee', normal: (c) => (c.intensity > 0.4 ? 'flee' : 'startle'), hothead: 'startle', tough: 'stare' },
  // Someone shot / killed in view. `friend`: the victim is one of theirs.
  hitSeen: {
    coward: (c) => (c.friend && close(c, 10) ? 'grief' : close(c, 7) ? 'duck' : 'flee'),
    normal: (c) => (close(c, 5) ? 'duck' : 'flee'),
    hothead: (c) => (c.friend ? 'avenge' : 'flee'),
    tough: (c) => (c.friend || hostile(c) ? 'avenge' : 'confront'),
  },
  death: {
    coward: (c) => (c.friend && close(c, 12) ? 'grief' : close(c, 6) ? 'cower' : 'flee'),
    normal: (c) => (c.friend && close(c, 8) ? 'grief' : 'flee'),
    hothead: (c) => (c.friend ? 'avenge' : 'flee'),
    tough: (c) => (c.friend ? 'avenge' : hostile(c) ? 'confront' : 'flee'),
  },
  bump: {
    coward: 'complain',
    normal: 'complain',
    hothead: (c) => (c.repeats >= 2 ? 'confront' : 'complain'),
    tough: (c) => (c.repeats >= 2 || hostile(c) ? 'confront' : 'complain'),
  },
  sprint: { coward: 'startle', normal: 'glance', hothead: 'stare', tough: 'glance' },
  crouchSneak: { coward: 'startle', normal: 'stare', hothead: 'stare', tough: 'stare' },
  door: { coward: 'glance', normal: 'glance', hothead: 'glance', tough: 'glance' },
  playerNear: { coward: 'greet', normal: 'greet', hothead: (c) => (hostile(c) ? 'stare' : 'greet'), tough: (c) => (hostile(c) ? 'stare' : 'greet') },
  talkRequest: { coward: 'greet', normal: 'greet', hothead: 'greet', tough: 'greet' },
};

/** Deed recorded against the player when an NPC senses a stimulus (null = none). */
export const STIMULUS_DEEDS = { gunshot: 'gunfireNearby', gunshotNear: 'shotAt', aimedAt: 'aimedAt', weaponDrawn: 'weaponShown', bump: 'bumped', assault: 'assaulted', crouchSneak: 'stared', hitSeen: 'witnessedShooting', death: 'witnessedKilling' };

/** Drive gains by trait: fear is damped by bravery, anger fed by aggression, social by sociability. */
export function driveGain(drive, traits) {
  switch (drive) {
    case 'fear': return 1.25 - traits.bravery * 0.75;
    case 'anger': return 0.35 + traits.aggression;
    case 'interest': return 0.5 + traits.curiosity;
    case 'social': return 0.3 + traits.sociability;
    default: return 1;
  }
}

/**
 * Picks the reaction for a sensed stimulus.
 * ctx = { type, intensity (0..1), traits, rank, distance, repeats, state }
 * Returns { id, ...REACTIONS[id] } or null when the stimulus has no row.
 */
export function selectReaction(ctx) {
  const row = REACTION_MATRIX[ctx.type];
  if (!row) return null;
  const temp = ctx.temperament ?? temperament(ctx.traits);
  let cell = row[temp] ?? row.normal;
  if (typeof cell === 'function') cell = cell({ ...ctx, temperament: temp });
  // Escalation guard: someone already fleeing does not drop back to a glance.
  if (ctx.state === 'flee' && ['glance', 'stare', 'greet', 'complain'].includes(cell)) cell = 'ignore';
  return { id: cell, temperament: temp, ...REACTIONS[cell] };
}
