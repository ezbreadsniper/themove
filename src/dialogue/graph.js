import { createRng } from '../core/rng.js';
import { rankIndex } from '../npc/disposition.js';
import { getPath, setPath, testValue } from './criteria.js';

/**
 * Data-driven dialogue graph runner (Yarn Spinner / ink ideas in plain JSON).
 *
 * Tree: { id, start, speakers: { npc: { name, color }, player: { ... } }, nodes: { id: node } }
 * Nodes:
 *   line       { speaker, text, emotion?, anim?, shot?, duration?, effects?, next }
 *   choice     { prompt?, options: [option], timeout?, default? }
 *              option { text, tone?, next, if? (hidden unless true), requires? { if, label } (shown
 *              greyed with label unless true), check? { skill, dc, fail } (skill roll), effects?, once? }
 *   condition  { if, then, else }  or  { branches: [{ if, next }], else }
 *   action     { effects: [effect], next }
 *   jump       { next } or { tree, node? } (another tree, via the loader)
 *   end        { outcome? }
 * Conditions (composable): { all: [] } { any: [] } { not: c } · { var: 'npc.met', <criterion> } ·
 *   { rank: 'friendly' } (at least) · { rankBelow: 'neutral' } · { disposition: <criterion> } ·
 *   { faction: 'crew', <criterion> } · { stat: 'charm', <criterion> } · { visited: 'node' } ·
 *   { deed: 'threatened' } · { chance: 0.5 }
 *   (criterion = gte / gt / lte / lt / eq / ne / in / exists, see criteria.js)
 * Effects: { set: { path: v } } { add: { path: n } } { disposition: n } { heat: n }
 *   { faction: { id, delta } } { deed: 'type' } and anything else goes to ctx.effect (hooks:
 *   anim, drive, intent, emit, give/take/pay ...).
 * Variables: 'npc.*' persists on the NPC, 'global.*' is game state, 'local.*' (or no prefix) lives
 * for one conversation. Text may interpolate {npc.name} / {global.cash}.
 */
export const NODE_TYPES = ['line', 'choice', 'condition', 'action', 'jump', 'end'];
const MAX_HOPS = 256;

/** Conversation context. Everything optional; missing hooks fall back to neutral answers. */
export function makeContext({ vars = {}, rank = () => 'neutral', score = () => 0, faction = () => 0, stat = () => 0, remembers = () => false, relationships = null, npcId = null, effect = () => {}, check = null, seed = 'dialogue', names = {} } = {}) {
  const rng = createRng(seed);
  const v = { npc: vars.npc ?? {}, global: vars.global ?? {}, local: vars.local ?? {} };
  const ctx = {
    vars: v,
    names,
    rng,
    rank: relationships && npcId ? () => relationships.rank(npcId) : rank,
    score: relationships && npcId ? () => relationships.score(npcId) : score,
    faction: relationships ? (id) => relationships.factionStanding(id) : faction,
    remembers: relationships && npcId ? (d) => relationships.remembers(npcId, d) : remembers,
    stat,
    effect,
    relationships,
    npcId,
    /** Skill check: d20 + stat ≥ dc (deterministic per seed). Override with `check`. */
    check: check ?? ((skill, dc) => rng.int(1, 20) + stat(skill) >= dc),
    /** Success chance (0..1) shown on the option tag. */
    chance: (skill, dc) => Math.max(0, Math.min(1, (21 - (dc - stat(skill))) / 20)),
  };
  return ctx;
}

function scoped(path) {
  if (/^(npc|global|local)\./.test(path)) return path;
  return `local.${path}`;
}

export function getVar(ctx, path) {
  return getPath(ctx.vars, scoped(path));
}

export function setVar(ctx, path, value) {
  setPath(ctx.vars, scoped(path), value);
}

const CRIT_KEYS = ['eq', 'ne', 'in', 'gte', 'gt', 'lte', 'lt', 'exists'];
const critOf = (c) => {
  const out = {};
  for (const k of CRIT_KEYS) if (k in c) out[k] = c[k];
  return out;
};

export function evalCondition(cond, ctx, runner = null) {
  if (cond === undefined || cond === null) return true;
  if (typeof cond === 'boolean') return cond;
  if (Array.isArray(cond)) return cond.every((c) => evalCondition(c, ctx, runner));
  if (cond.all) return cond.all.every((c) => evalCondition(c, ctx, runner));
  if (cond.any) return cond.any.some((c) => evalCondition(c, ctx, runner));
  if (cond.not) return !evalCondition(cond.not, ctx, runner);
  const crit = critOf(cond);
  const has = Object.keys(crit).length > 0;
  if ('var' in cond) {
    const v = getVar(ctx, cond.var);
    return has ? testValue(v, crit) : !!v;
  }
  if ('rank' in cond) return rankIndex(ctx.rank()) >= rankIndex(cond.rank);
  if ('rankBelow' in cond) return rankIndex(ctx.rank()) < rankIndex(cond.rankBelow);
  if ('rankIs' in cond) return [].concat(cond.rankIs).includes(ctx.rank());
  if ('disposition' in cond) return testValue(ctx.score(), cond.disposition);
  if ('faction' in cond) return testValue(ctx.faction(cond.faction), crit);
  if ('stat' in cond) return testValue(ctx.stat(cond.stat), crit);
  if ('visited' in cond) return !!runner?.visited.has(cond.visited);
  if ('deed' in cond) return ctx.remembers(cond.deed);
  if ('chance' in cond) return ctx.rng.next() < cond.chance;
  throw new Error(`Unknown condition ${JSON.stringify(cond)}`);
}

/** Applies effects; returns descriptors of what happened (for logs / tests). */
export function applyEffects(effects = [], ctx) {
  const done = [];
  for (const e of [].concat(effects)) {
    if (e.set) for (const [k, v] of Object.entries(e.set)) setVar(ctx, k, v);
    if (e.add) for (const [k, v] of Object.entries(e.add)) setVar(ctx, k, (getVar(ctx, k) ?? 0) + v);
    if (ctx.relationships && ctx.npcId) {
      if (e.disposition !== undefined || e.heat !== undefined) ctx.relationships.adjust(ctx.npcId, { standing: e.disposition ?? 0, heat: e.heat ?? 0 });
      if (e.deed) ctx.relationships.deed(ctx.npcId, e.deed);
      if (e.faction) ctx.relationships.adjustFaction(e.faction.id, e.faction.delta);
    }
    const core = ['set', 'add', 'disposition', 'heat', 'deed', 'faction'];
    if (Object.keys(e).some((k) => !core.includes(k))) ctx.effect(e);
    done.push(e);
  }
  return done;
}

export function interpolate(text, ctx) {
  return String(text ?? '').replace(/\{([\w.]+)\}/g, (m, path) => {
    const v = path in ctx.names ? ctx.names[path] : getVar(ctx, path);
    return v === undefined ? m : String(v);
  });
}

/**
 * Walks a tree. Presentable steps are returned from start / advance / choose:
 *   { kind: 'line', node, speaker, text, emotion, anim, shot, duration }
 *   { kind: 'choice', node, prompt, options: [{ index, text, tone, locked, reason, check, chance }], timeout, default }
 *   { kind: 'end', outcome }
 */
export class DialogueRunner {
  constructor(tree, ctx = makeContext(), { resolveTree = () => null } = {}) {
    this.tree = tree;
    this.ctx = ctx;
    this.resolveTree = resolveTree;
    this.visited = new Set();
    this.taken = new Set();
    this.history = [];
    this.current = null;
    this.nodeId = null;
  }

  start(nodeId = this.tree.start) {
    return this.goto(nodeId);
  }

  node(id) {
    const n = this.tree.nodes[id];
    if (!n) throw new Error(`Dialogue ${this.tree.id}: missing node ${id}`);
    return n;
  }

  /** Resolves logic nodes until something presentable. */
  goto(id) {
    for (let hops = 0; hops < MAX_HOPS; hops++) {
      if (!id) return this.present({ kind: 'end', outcome: null });
      const n = this.node(id);
      this.nodeId = id;
      this.visited.add(id);
      switch (n.type) {
        case 'line':
          applyEffects(n.effects, this.ctx);
          return this.present({
            kind: 'line', node: id, speaker: n.speaker ?? 'npc', text: interpolate(n.text, this.ctx), emotion: n.emotion ?? 'neutral',
            anim: n.anim ?? null, shot: n.shot ?? 'auto', duration: n.duration ?? null,
          });
        case 'choice':
          return this.present({ kind: 'choice', node: id, prompt: n.prompt ? interpolate(n.prompt, this.ctx) : null, options: this.options(n), timeout: n.timeout ?? null, default: n.default ?? null });
        case 'condition':
          if (n.branches) {
            const hit = n.branches.find((b) => evalCondition(b.if, this.ctx, this));
            id = hit ? hit.next : n.else;
          } else id = evalCondition(n.if, this.ctx, this) ? n.then : n.else;
          break;
        case 'action':
          applyEffects(n.effects, this.ctx);
          id = n.next;
          break;
        case 'jump':
          if (n.tree) {
            const t = this.resolveTree(n.tree);
            if (!t) throw new Error(`Dialogue ${this.tree.id}: jump to unknown tree ${n.tree}`);
            this.tree = t;
            id = n.node ?? t.start;
          } else id = n.next;
          break;
        case 'end':
          applyEffects(n.effects, this.ctx);
          return this.present({ kind: 'end', outcome: n.outcome ?? null, node: id });
        default:
          throw new Error(`Dialogue ${this.tree.id}: node ${id} has unknown type ${n.type}`);
      }
    }
    throw new Error(`Dialogue ${this.tree.id}: more than ${MAX_HOPS} logic hops (loop?)`);
  }

  present(step) {
    this.current = step;
    if (step.kind === 'line') this.history.push({ kind: 'line', speaker: step.speaker, text: step.text, emotion: step.emotion });
    if (step.kind === 'end') this.history.push({ kind: 'end', outcome: step.outcome });
    return step;
  }

  /** Visible options with lock state for the UI. */
  options(n) {
    const out = [];
    n.options.forEach((o, index) => {
      const key = `${this.nodeId}#${index}`;
      if (o.once && this.taken.has(key)) return;
      if (!evalCondition(o.if, this.ctx, this)) return;
      const locked = o.requires ? !evalCondition(o.requires.if ?? o.requires, this.ctx, this) : false;
      const check = o.check ? { skill: o.check.skill, dc: o.check.dc, chance: this.ctx.chance(o.check.skill, o.check.dc) } : null;
      out.push({ index, text: interpolate(o.text, this.ctx), tone: o.tone ?? null, locked, reason: locked ? o.requires.label ?? 'Locked' : null, check });
    });
    return out;
  }

  /** Advances past a line. */
  advance() {
    if (this.current?.kind !== 'line') return this.current;
    return this.goto(this.node(this.current.node).next);
  }

  /** Picks an option by its original index (as listed in `options[i].index`). */
  choose(index) {
    if (this.current?.kind !== 'choice') return this.current;
    const n = this.node(this.current.node);
    const shown = this.current.options.find((o) => o.index === index);
    if (!shown || shown.locked) return this.current;
    const o = n.options[index];
    this.taken.add(`${this.current.node}#${index}`);
    this.history.push({ kind: 'choice', speaker: 'player', text: shown.text, tone: shown.tone });
    let next = o.next;
    if (o.check) {
      const ok = this.ctx.check(o.check.skill, o.check.dc);
      this.lastCheck = { ...o.check, success: ok };
      this.history.push({ kind: 'check', skill: o.check.skill, dc: o.check.dc, success: ok });
      if (!ok) next = o.check.fail ?? o.next;
    }
    applyEffects(o.effects, this.ctx);
    return this.goto(next);
  }

  get done() {
    return this.current?.kind === 'end';
  }
}
