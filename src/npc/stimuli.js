/**
 * Stimulus catalogue: everything an NPC can notice, as data. The NPC manager turns bus events into
 * stimuli; perception decides who senses them (sight cone + line of sight, hearing radius, touch);
 * the reaction matrix (reactions.js) turns a sensed stimulus into drives, an animation and a bark.
 *
 *   sense    'sight' (needs to be seen) | 'sound' (heard within radius × hearing) | 'touch'
 *   radius   audible / noticeable distance in metres (sound)
 *   threat   0..1 how dangerous it is by itself
 *   memory   seconds the NPC keeps thinking about it (intensity half-life)
 */
export const STIMULI = {
  gunshot: { sense: 'sound', radius: 45, threat: 1, memory: 40 },
  gunshotNear: { sense: 'sound', radius: 45, threat: 1, memory: 60 },
  aimedAt: { sense: 'sight', radius: 30, threat: 0.9, memory: 30 },
  weaponDrawn: { sense: 'sight', radius: 20, threat: 0.45, memory: 20 },
  weaponHolstered: { sense: 'sight', radius: 20, threat: 0, memory: 5 },
  sprint: { sense: 'sound', radius: 9, threat: 0.05, memory: 4 },
  crouchSneak: { sense: 'sight', radius: 10, threat: 0.15, memory: 8 },
  bump: { sense: 'touch', radius: 1.2, threat: 0.15, memory: 15 },
  melee: { sense: 'sound', radius: 12, threat: 0.8, memory: 40 },
  assault: { sense: 'touch', radius: 1.6, threat: 0.95, memory: 60 },
  door: { sense: 'sound', radius: 10, threat: 0.03, memory: 6 },
  panic: { sense: 'sound', radius: 14, threat: 0.55, memory: 20 },
  playerNear: { sense: 'sight', radius: 4, threat: 0, memory: 3 },
  // Violence seen or heard: someone shot, someone dying, people screaming / running.
  hitSeen: { sense: 'sight', radius: 22, threat: 0.9, memory: 60 },
  death: { sense: 'sight', radius: 25, threat: 1, memory: 120 },
  scream: { sense: 'sound', radius: 16, threat: 0.5, memory: 20 },
  panicSeen: { sense: 'sight', radius: 15, threat: 0.5, memory: 20 },
  talkRequest: { sense: 'touch', radius: 3, threat: 0, memory: 2 },
};

/** Half-life seconds → per-second decay constant. */
export const decayRate = (halfLife) => Math.LN2 / Math.max(0.1, halfLife);

/** Point–segment distance (XZ) for "did that shot pass near me". */
export function distToSegmentXZ(p, a, b) {
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const len2 = ex * ex + ez * ez || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / len2));
  return Math.hypot(p.x - (a.x + ex * t), p.z - (a.z + ez * t));
}
