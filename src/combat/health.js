/**
 * Damage rules shared by every gun (contracts §6): each round that hits is one hit, a head hit counts
 * double, the fifth hit kills. The NPC manager owns health when it implements `damage`; this ledger is
 * the fallback the game uses until then (and the reference the tests check the rules against).
 */
export const DAMAGE = Object.freeze({ lethal: 5, head: 2, body: 1 });

/** Hit points one round takes off for a body part. */
export const hitValue = (part, amount = 1) => amount * (part === 'head' ? DAMAGE.head : DAMAGE.body);

export class HealthLedger {
  constructor({ lethal = DAMAGE.lethal } = {}) {
    this.lethal = lethal;
    this.records = new Map();
  }

  key(npc) {
    return typeof npc === 'string' ? npc : npc?.id ?? npc;
  }

  get(npc) {
    const k = this.key(npc);
    if (!this.records.has(k)) this.records.set(k, { hits: 0, dead: false, wounds: [] });
    return this.records.get(k);
  }

  isDead(npc) {
    return this.records.get(this.key(npc))?.dead ?? false;
  }

  /** Applies one round. → { hits, dead, killed (this round killed), value } */
  damage(npc, { amount = 1, part = 'torso', point = null, dir = null, source = null } = {}) {
    const r = this.get(npc);
    if (r.dead) return { hits: r.hits, dead: true, killed: false, value: 0 };
    const value = hitValue(part, amount);
    r.hits += value;
    r.wounds.push({ part, point, dir, source });
    const killed = r.hits >= this.lethal;
    if (killed) r.dead = true;
    return { hits: r.hits, dead: r.dead, killed, value };
  }
}
