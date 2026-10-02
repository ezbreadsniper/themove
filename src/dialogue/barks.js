import { createRng } from '../core/rng.js';
import { matchAll, setPath } from './criteria.js';

/**
 * Bark system: short contextual one-liners (greetings, reactions, flee screams, idle chatter),
 * modelled on Valve's dynamic dialogue rule database (Left 4 Dead / Source "response rules"):
 * a query (concept + facts about speaker, listener and world) is fuzzy-matched against every rule;
 * the rule matching the most criteria wins (most specific first, generic rules are fall-backs);
 * ties break by weight. Rules carry cooldowns, can be one-shot, and can write facts back into the
 * speaker's memory ("remember") so running gags and follow-ups need no code.
 *
 * Rule: { id, concept, criteria: { fact: criterion }, lines: [text], weight = 1, cooldown = 0 (s),
 *         once = false, remember: { 'path': value }, emotion?, anim? }
 */
export class BarkSystem {
  constructor(rules = [], { seed = 'barks', speakerGap = 3.5 } = {}) {
    this.rules = [];
    this.byConcept = new Map();
    this.time = 0;
    this.rng = createRng(seed);
    this.speakerGap = speakerGap;
    this.lastUse = new Map();
    this.lastSpeak = new Map();
    this.used = new Set();
    this.lineIndex = new Map();
    this.add(rules);
  }

  add(rules) {
    for (const r of rules) {
      const rule = { weight: 1, cooldown: 0, once: false, criteria: {}, ...r };
      if (!rule.id || !rule.concept || !rule.lines?.length) throw new Error(`Bark rule needs id, concept and lines: ${JSON.stringify(r).slice(0, 80)}`);
      this.rules.push(rule);
      if (!this.byConcept.has(rule.concept)) this.byConcept.set(rule.concept, []);
      this.byConcept.get(rule.concept).push(rule);
    }
    return this;
  }

  update(dt) {
    this.time += dt;
  }

  available(rule, speaker) {
    if (rule.once && this.used.has(`${rule.id}:${speaker ?? ''}`)) return false;
    const last = this.lastUse.get(rule.id);
    return last === undefined || this.time - last >= rule.cooldown;
  }

  /** All rules for `concept` matching `facts`, best first: [{ rule, score }]. */
  candidates(concept, facts = {}, speaker = null) {
    const out = [];
    for (const rule of this.byConcept.get(concept) ?? []) {
      if (!this.available(rule, speaker)) continue;
      if (!matchAll(rule.criteria, facts)) continue;
      out.push({ rule, score: Object.keys(rule.criteria).length });
    }
    return out.sort((a, b) => b.score - a.score || b.rule.weight - a.rule.weight);
  }

  /**
   * Best line for a query, or null. `speaker` (an id) enforces a minimum gap between barks of one
   * speaker unless `force`. `memory` (object) receives the winning rule's `remember` facts.
   */
  query(concept, facts = {}, { speaker = null, memory = null, force = false } = {}) {
    if (speaker && !force) {
      const last = this.lastSpeak.get(speaker);
      if (last !== undefined && this.time - last < this.speakerGap) return null;
    }
    const cands = this.candidates(concept, facts, speaker);
    if (!cands.length) return null;
    // Most specific score wins; among equally specific rules pick by weight.
    const top = cands.filter((c) => c.score === cands[0].score);
    const total = top.reduce((s, c) => s + c.rule.weight, 0);
    let roll = this.rng.next() * total;
    let pick = top[0];
    for (const c of top) {
      roll -= c.rule.weight;
      if (roll <= 0) {
        pick = c;
        break;
      }
    }
    const rule = pick.rule;
    // Lines cycle in order from a random start so repeats are as far apart as possible.
    const start = this.lineIndex.get(rule.id) ?? Math.floor(this.rng.next() * rule.lines.length);
    const text = rule.lines[start % rule.lines.length];
    this.lineIndex.set(rule.id, start + 1);
    this.lastUse.set(rule.id, this.time);
    if (speaker) this.lastSpeak.set(speaker, this.time);
    this.used.add(`${rule.id}:${speaker ?? ''}`);
    if (memory && rule.remember) for (const [k, v] of Object.entries(rule.remember)) setPath(memory, k, v);
    return { rule: rule.id, concept, text, emotion: rule.emotion ?? null, anim: rule.anim ?? null, score: pick.score };
  }
}
