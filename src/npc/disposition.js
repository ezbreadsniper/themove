/**
 * Relationship / disposition model (player ↔ NPCs and factions), in the spirit of Skyrim's
 * relationship ranks and Fallout's faction reputation, with RDR2-style memory of what the player did.
 *
 * Score per NPC (−100..100) = base (archetype) + standing (permanent, from deeds and dialogue)
 *                              + heat (short-term, decays to 0) + faction standing × FACTION_WEIGHT
 * Ranks (thresholds on the score): hostile < −60 ≤ unfriendly < −20 ≤ neutral < 20 ≤ friendly < 60 ≤ ally.
 * Deeds carry a permanent and a heat part; witnesses spread a fraction to the victim's faction.
 */
export const RANKS = ['hostile', 'unfriendly', 'neutral', 'friendly', 'ally'];
export const RANK_THRESHOLDS = { hostile: -Infinity, unfriendly: -60, neutral: -20, friendly: 20, ally: 60 };
export const FACTION_WEIGHT = 0.5;
/** Heat decays toward 0 at this fraction per second (≈ half-life 35 s). */
export const HEAT_DECAY = 0.02;

/**
 * What the player can do to someone. `standing` is permanent, `heat` fades; `faction` scales the
 * spill-over to the victim's faction; `repeat` dampens repeats inside `window` seconds.
 */
export const DEEDS = {
  greeted: { standing: 1, heat: 2, repeat: 0.25, window: 60 },
  chatted: { standing: 2, heat: 0, repeat: 0.5, window: 120 },
  complimented: { standing: 4, heat: 3, repeat: 0.3, window: 120 },
  helped: { standing: 15, heat: 5, faction: 0.4 },
  gift: { standing: 10, heat: 5, faction: 0.2 },
  paid: { standing: 4, heat: 0 },
  insulted: { standing: -6, heat: -12, faction: 0.15, repeat: 0.7, window: 60 },
  lied: { standing: -5, heat: -3 },
  bumped: { standing: -1, heat: -5, repeat: 0.6, window: 10 },
  stared: { standing: 0, heat: -3, repeat: 0.5, window: 20 },
  weaponShown: { standing: -3, heat: -12, faction: 0.1, repeat: 0.5, window: 20 },
  aimedAt: { standing: -12, heat: -35, faction: 0.3, repeat: 0.5, window: 15 },
  gunfireNearby: { standing: -3, heat: -15, faction: 0.1, repeat: 0.4, window: 10 },
  shotAt: { standing: -40, heat: -45, faction: 0.6 },
  assaulted: { standing: -30, heat: -40, faction: 0.5 },
  threatened: { standing: -15, heat: -25, faction: 0.3, repeat: 0.6, window: 30 },
  defused: { standing: 3, heat: 15 },
  apologised: { standing: 2, heat: 10, repeat: 0.3, window: 60 },
};

const clamp = (v, a = -100, b = 100) => Math.max(a, Math.min(b, v));

export function rankOf(score) {
  let rank = RANKS[0];
  for (const r of RANKS) if (score >= RANK_THRESHOLDS[r]) rank = r;
  return rank;
}

/** Index of a rank (hostile 0 … ally 4), for comparisons. */
export const rankIndex = (rank) => RANKS.indexOf(rank);
export const rankAtLeast = (score, rank) => rankIndex(rankOf(score)) >= rankIndex(rank);

export class Relationships {
  constructor({ onRankChange = null } = {}) {
    this.npcs = new Map();
    this.factions = new Map();
    this.time = 0;
    this.onRankChange = onRankChange;
  }

  /** Registers an NPC (idempotent). */
  register(id, { faction = null, base = 0 } = {}) {
    if (!this.npcs.has(id)) this.npcs.set(id, { id, faction, base, standing: 0, heat: 0, deeds: [], rank: null });
    const r = this.npcs.get(id);
    r.rank = rankOf(this.score(id));
    return r;
  }

  faction(id) {
    if (!this.factions.has(id)) this.factions.set(id, { id, standing: 0, deeds: [] });
    return this.factions.get(id);
  }

  factionStanding(id) {
    return id ? this.faction(id).standing : 0;
  }

  /** Current score toward the player (−100..100). */
  score(id) {
    const r = this.npcs.get(id);
    if (!r) return 0;
    return clamp(r.base + r.standing + r.heat + this.factionStanding(r.faction) * FACTION_WEIGHT);
  }

  rank(id) {
    return rankOf(this.score(id));
  }

  /** Direct change (dialogue effects): permanent `standing` and/or short-term `heat`. */
  adjust(id, { standing = 0, heat = 0 } = {}) {
    const r = this.npcs.get(id) ?? this.register(id);
    r.standing = clamp(r.standing + standing, -200, 200);
    r.heat = clamp(r.heat + heat);
    this.checkRank(r);
    return this.score(id);
  }

  adjustFaction(fid, delta) {
    const f = this.faction(fid);
    f.standing = clamp(f.standing + delta);
    for (const r of this.npcs.values()) if (r.faction === fid) this.checkRank(r);
    return f.standing;
  }

  /**
   * Records a player deed against NPC `id`. `witnessed` spreads the faction share; `scale` multiplies
   * the deed (e.g. closeness of a gunshot). Returns the applied { standing, heat }.
   */
  deed(id, type, { scale = 1, witnessed = true } = {}) {
    const d = DEEDS[type];
    if (!d) throw new Error(`Unknown deed ${type}`);
    const r = this.npcs.get(id) ?? this.register(id);
    let damp = 1;
    if (d.repeat !== undefined) {
      const recent = r.deeds.filter((x) => x.type === type && this.time - x.time < (d.window ?? 60)).length;
      damp = d.repeat ** recent;
    }
    const applied = { standing: d.standing * scale * damp, heat: d.heat * scale * damp };
    r.standing = clamp(r.standing + applied.standing, -200, 200);
    r.heat = clamp(r.heat + applied.heat);
    r.deeds.push({ type, time: this.time, scale });
    if (r.deeds.length > 64) r.deeds.shift();
    if (witnessed && d.faction && r.faction) {
      const f = this.faction(r.faction);
      f.standing = clamp(f.standing + d.standing * d.faction * scale * damp);
      f.deeds.push({ type, time: this.time, npc: id });
      if (f.deeds.length > 64) f.deeds.shift();
      for (const o of this.npcs.values()) if (o.faction === r.faction && o !== r) this.checkRank(o);
    }
    this.checkRank(r);
    return applied;
  }

  /** True if the NPC remembers a deed of `type` (within `seconds`, default forever). */
  remembers(id, type, seconds = Infinity) {
    const r = this.npcs.get(id);
    return !!r && r.deeds.some((d) => d.type === type && this.time - d.time <= seconds);
  }

  deedCount(id, type) {
    return this.npcs.get(id)?.deeds.filter((d) => d.type === type).length ?? 0;
  }

  checkRank(r) {
    const next = rankOf(this.score(r.id));
    if (next !== r.rank) {
      const prev = r.rank;
      r.rank = next;
      if (prev) this.onRankChange?.(r.id, prev, next);
    }
  }

  /** Heat cools toward 0; ranks recomputed. */
  update(dt) {
    this.time += dt;
    const k = Math.exp(-HEAT_DECAY * dt);
    for (const r of this.npcs.values()) {
      if (!r.heat) continue;
      r.heat *= k;
      if (Math.abs(r.heat) < 0.05) r.heat = 0;
      this.checkRank(r);
    }
  }

  /** Plain-data snapshot for saves. */
  toJSON() {
    return { time: this.time, npcs: [...this.npcs.values()].map(({ id, faction, base, standing, heat, deeds }) => ({ id, faction, base, standing, heat, deeds })), factions: [...this.factions.values()] };
  }

  load(data) {
    this.time = data.time ?? 0;
    this.npcs = new Map((data.npcs ?? []).map((r) => [r.id, { ...r, rank: rankOf(0) }]));
    this.factions = new Map((data.factions ?? []).map((f) => [f.id, f]));
    for (const r of this.npcs.values()) r.rank = rankOf(this.score(r.id));
    return this;
  }
}
