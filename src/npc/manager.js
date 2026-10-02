import * as THREE from 'three';
import * as clipRegistry from '../anim/clips.js';
import { bakeSocialClips, registerSocialClips } from '../anim/social-clips.js';
import { buildCharacter } from '../character/build.js';
import { PRESETS_BY_ID } from '../character/presets/index.js';
import { hashString } from '../core/rng.js';
import { BarkSystem } from '../dialogue/barks.js';
import BARK_RULES from '../dialogue/data/barks.json';
import { ARCHETYPES, makePersonality } from './archetypes.js';
import { Relationships } from './disposition.js';
import { connectBus } from './events.js';
import { Npc } from './npc.js';
import { makeLineOfSight } from './perception.js';
import { REACTION_MATRIX, STIMULUS_DEEDS, driveGain, selectReaction } from './reactions.js';
import { STIMULI, distToSegmentXZ } from './stimuli.js';
import { GROUPS } from './brain.js';

// Social clips join the shared registry when workstream A's clips.js offers registerSamplers;
// NPCs bake them directly either way (see defaultClipsFor).
registerSocialClips(clipRegistry.registerSamplers);

/** Shared clips an NPC needs (social clips are added on top). Missing names are skipped. */
export const NPC_BASE_CLIPS = ['idle', 'walk', 'run', 'sprint', 'lookAround', 'wave', 'shrug', 'talk', 'point', 'angry', 'confused', 'laugh', 'hitReact', 'stepInPlace', 'crouchIdle', 'smoke', 'melee_jab'];

const clipCache = new Map();
/** Default clip baker: shared base clips + social clips, cached per body definition. */
export function defaultClipsFor(character) {
  const layout = character.userData.layout;
  const key = JSON.stringify(character.userData.definition?.body ?? character.userData.definition?.id ?? character.name);
  if (!clipCache.has(key)) {
    const names = NPC_BASE_CLIPS.filter((n) => clipRegistry.CLIP_NAMES.includes(n));
    const base = Object.fromEntries(names.map((n) => [n, clipRegistry.bakeClip(layout, n)]));
    clipCache.set(key, { ...base, ...bakeSocialClips(layout) });
  }
  return clipCache.get(key);
}

/**
 * Fallback cast when the location has no `npc_*` markers: around the Foundry St. spawn (north
 * sidewalk, building face at z = 0, street door at x ≈ 4.6). Placeholder until D places markers.
 */
export const FALLBACK_SPAWNS = [
  { id: 'dana', name: 'Dana', archetype: 'resident', preset: 'sheet-06-floral-cutoffs', pos: [8.4, 0, -0.5], yaw: Math.PI, scenario: 'lean' },
  { id: 'marcus', name: 'Marcus', archetype: 'resident', preset: 'sheet-03-red-rugby', pos: [11.2, 0, -1.7], yaw: -Math.PI / 2, traits: { sociability: 0.9, wander: 0 } },
  { id: 'jo', name: 'Jo', archetype: 'resident', preset: 'sheet-05-curly-denim', pos: [10.2, 0, -1.7], yaw: Math.PI / 2, traits: { sociability: 0.85, wander: 0 } },
  { id: 'priya', name: 'Priya', archetype: 'clerk', preset: 'sheet-01-black-tee', pos: [3.2, 0, -1.2], yaw: Math.PI * 0.85, scenario: 'counter' },
  { id: 'vince', name: 'Vince', archetype: 'thug', preset: 'sheet-07-puffer-balaclava', pos: [15.6, 0, -0.5], yaw: Math.PI, scenario: 'lean' },
  { id: 'rook', name: 'Rook', archetype: 'thug', preset: 'sheet-04-camo-cargo', pos: [16.6, 0, -1.6], yaw: Math.PI * 1.2 },
  { id: 'walker', name: 'Passer-by', archetype: 'pedestrian', preset: 'trial-default', pos: [1.5, 0, -2.2], yaw: Math.PI / 2 },
];

/** LOD tiers: think / step rates (Hz) by distance to the player (m). Beyond `hide` NPCs are culled. */
export const LOD = { near: { dist: 20, think: 10, step: 60 }, mid: { dist: 45, think: 4, step: 20 }, far: { dist: Infinity, think: 1, step: 6 }, hide: 90 };

const REACT_COOLDOWN = { weaponDrawn: 8, aimedAt: 3, crouchSneak: 25, playerNear: 40, sprint: 12, bump: 1.2, door: 10, panic: 6, weaponHolstered: 6 };
const v3 = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] ?? 0, z: p[2] } : p ? { x: p.x, y: p.y ?? 0, z: p.z } : null);

/**
 * Owns every NPC in a location: spawning, the per-frame update with LOD, translating game events
 * into stimuli, the reaction pipeline, panic propagation, social pairing, barks and relationships.
 *
 * Contract (docs/INTEGRATION_CONTRACTS.md §4):
 *   new NpcManager({ world, scene, player, clipsFor })  · spawnFromMarkers() · update(dt, ctx)
 * Extras: events (a bus with on/emit, e.g. window.game.events), relationships, barks, dialogue
 *   (a DialogueDirector to start on talk), build: false (headless NPCs for tests).
 */
export class NpcManager {
  constructor({ world = null, scene = null, player = null, clipsFor = defaultClipsFor, events = null, relationships = null, barks = null, dialogue = null, build = true, lod = LOD } = {}) {
    this.world = world;
    this.scene = scene;
    this.player = player;
    this.clipsFor = clipsFor;
    this.events = connectBus(events);
    this.relationships = relationships ?? new Relationships({ onRankChange: (id, from, to) => this.events.emit('npc:rank', { npc: id, from, to }) });
    this.barks = barks ?? new BarkSystem(BARK_RULES);
    this.dialogue = dialogue;
    this.build = build;
    this.lodTable = lod;
    this.npcs = [];
    this.byId = new Map();
    this.time = 0;
    this.panics = [];
    this.playerState = { weapon: null, aiming: false, aimUntil: 0, sprint: false, sprintUntil: 0, crouch: false, aimTarget: null, lastPos: null, velocity: { x: 0, z: 0 } };
    this.group = new THREE.Group();
    this.group.name = 'npcs';
    scene?.add(this.group);
    const collision = world?.collision ?? null;
    this.collision = collision;
    this.los = makeLineOfSight(collision);
    this.raycast = collision?.raycast ? collision.raycast.bind(collision) : null;
    this.unsub = this.listen();
    this.pairTimer = 0;
  }

  // --- spawning -----------------------------------------------------------------------------

  /** Spawns from the location's `npc_*` markers, or FALLBACK_SPAWNS when there are none. */
  spawnFromMarkers(markers = this.world?.markers ?? {}) {
    const defs = Object.values(markers).filter((m) => m?.name?.startsWith('npc_')).map((m) => ({
      id: m.name.slice(4),
      archetype: m.role ?? m.archetype ?? 'resident',
      preset: m.preset,
      name: m.label ?? null,
      pos: m.pos,
      yaw: m.yaw ?? 0,
      scenario: m.scenario ?? null,
      dialogue: m.dialogue,
    }));
    return (defs.length ? defs : FALLBACK_SPAWNS).map((d) => this.spawn(d));
  }

  /** Spawns one NPC: { id, archetype, preset, name, pos, yaw, scenario, traits, dialogue, character? }. */
  spawn(def) {
    const id = def.id ?? `npc${this.npcs.length}`;
    const personality = makePersonality(def.archetype ?? 'pedestrian', { id, traits: def.traits, name: def.name, dialogue: def.dialogue, faction: def.faction });
    const pos = [...def.pos];
    if (this.collision) {
      const g = this.collision.groundAt(pos[0], pos[2], (pos[1] ?? 0) + 0.5, 1);
      if (g) pos[1] = g.y;
      const p = { x: pos[0], y: pos[1], z: pos[2] };
      this.collision.resolve(p);
      pos[0] = p.x;
      pos[2] = p.z;
    }
    let character = def.character ?? null;
    let clips = def.clips ?? {};
    if (!character && this.build) {
      const presets = ARCHETYPES[personality.archetype].presets;
      const presetId = def.preset ?? presets[hashString(id) % presets.length];
      character = buildCharacter({ ...(PRESETS_BY_ID[presetId] ?? PRESETS_BY_ID['trial-default']) });
    }
    if (character && !def.clips) clips = this.clipsFor(character, def);
    const npc = new Npc({ id, personality, pos, yaw: def.yaw ?? 0, scenario: def.scenario ?? null, character, clips, manager: this, collision: this.collision, los: this.los, raycast: this.raycast });
    npc.onStateChange = (from, to) => this.events.emit('npc:state', { npc: id, from, to });
    this.relationships.register(id, { faction: personality.faction, base: personality.disposition });
    this.npcs.push(npc);
    this.byId.set(id, npc);
    if (npc.holder) this.group.add(npc.holder);
    return npc;
  }

  get(id) {
    return this.byId.get(typeof id === 'string' ? id.replace(/^npc:/, '') : id?.id);
  }

  remove(id) {
    const npc = this.get(id);
    if (!npc) return;
    this.group.remove(npc.holder);
    this.npcs = this.npcs.filter((n) => n !== npc);
    this.byId.delete(npc.id);
  }

  // --- events → stimuli ---------------------------------------------------------------------

  listen() {
    const on = (type, fn) => this.events.on(type, (p) => fn(p ?? {}));
    const ps = this.playerState;
    const offs = [
      on('player:fire', (p) => this.onFire(p)),
      on('player:aim', (p) => {
        ps.aiming = p.on !== false;
        ps.aimUntil = p.on === undefined ? this.time + 0.6 : Infinity;
        ps.aimTarget = p.target ?? null;
        if (p.weapon) ps.weapon = p.weapon;
      }),
      on('player:draw', (p) => {
        ps.weapon = p.weapon ?? ps.weapon ?? 'pistol';
        this.broadcast({ type: 'weaponDrawn', pos: this.playerPos(), source: 'player' });
      }),
      on('player:holster', () => {
        ps.weapon = null;
        ps.aiming = false;
        this.broadcast({ type: 'weaponHolstered', pos: this.playerPos(), source: 'player' });
      }),
      on('player:sprint', (p) => {
        ps.sprint = p.on !== false;
        ps.sprintUntil = p.on === undefined ? this.time + 0.6 : Infinity;
      }),
      on('player:crouch', (p) => {
        ps.crouch = p.on ?? !ps.crouch;
      }),
      on('player:interact', (p) => {
        const npc = this.get(String(p.id ?? ''));
        if (npc) this.requestTalk(npc);
      }),
      on('player:collide', (p) => {
        const npc = this.get(String(p.who ?? ''));
        if (npc) this.bump(npc);
      }),
      on('player:melee', (p) => this.onMelee(p)),
      on('world:door', (p) => p.pos && this.broadcast({ type: 'door', pos: v3(p.pos), source: p.door ?? 'door' })),
    ];
    return () => offs.forEach((off) => off?.());
  }

  onFire(p) {
    const from = v3(p.pos) ?? this.playerPos();
    if (!from) return;
    const dir = v3(p.dir) ?? { x: Math.sin(this.playerFacing()), y: 0, z: Math.cos(this.playerFacing()) };
    const end = { x: from.x + dir.x * 40, z: from.z + dir.z * 40 };
    const targetNpc = this.get(String(p.target ?? ''));
    for (const npc of this.npcs) {
      const near = npc === targetNpc || distToSegmentXZ(npc.pos, from, end) < 1.6;
      this.stimulate(npc, { type: near ? 'gunshotNear' : 'gunshot', pos: from, source: 'player', data: { weapon: p.weapon } });
    }
  }

  onMelee(p) {
    const at = v3(p.pos) ?? this.playerPos();
    this.broadcast({ type: 'melee', pos: at, source: 'player' });
    const pp = this.playerPos();
    for (const npc of this.npcs) if (pp && Math.hypot(npc.pos.x - at.x, npc.pos.z - at.z) < 1.4) this.stimulate(npc, { type: 'assault', pos: pp, source: 'player' });
  }

  /** Lets every NPC try to sense a stimulus. */
  broadcast(stim, { except = null } = {}) {
    for (const npc of this.npcs) if (npc !== except) this.stimulate(npc, stim);
  }

  /** Sense → react pipeline for one NPC. Returns the reaction (or null when not sensed / cooling down). */
  stimulate(npc, stim, { visibility = null, force = false } = {}) {
    const intensity = force ? stim.scale ?? 1 : npc.perception.sense(npc.pos, npc.facing, stim, { visibility });
    if (intensity <= 0) return null;
    const cd = REACT_COOLDOWN[stim.type] ?? 0;
    npc.reacted ??= {};
    if (!force && cd && this.time - (npc.reacted[stim.type] ?? -Infinity) < cd) return null;
    npc.reacted[stim.type] = this.time;
    return this.react(npc, stim, intensity);
  }

  react(npc, stim, intensity) {
    if (!REACTION_MATRIX[stim.type]) return null;
    const distance = Math.hypot(stim.pos.x - npc.pos.x, stim.pos.z - npc.pos.z);
    const deed = STIMULUS_DEEDS[stim.type];
    if (deed && stim.source === 'player') {
      this.relationships.deed(npc.id, deed, { scale: Math.max(0.35, intensity) });
      if (stim.type === 'bump') npc.memory.vars.bumps = (npc.memory.vars.bumps ?? 0) + 1;
    }
    const r = selectReaction({ type: stim.type, intensity, traits: npc.traits, temperament: npc.temperament, rank: npc.rank(), distance, repeats: npc.memory.vars.bumps ?? 0, state: npc.brain.state });
    if (!r || r.id === 'ignore') return r;
    for (const [k, v] of Object.entries(r.drives ?? {})) {
      const gain = v > 0 ? driveGain(k, npc.traits) * Math.max(0.4, intensity) : 1;
      npc.drives[k] = Math.max(0, Math.min(1, npc.drives[k] + v * gain));
    }
    const threat = STIMULI[stim.type].threat;
    // A weaker reaction (a startle after a gunshot) does not overwrite a stronger live intent (flee).
    const groupOf = (id) => GROUPS[npc.brain.states[id]?.group] ?? 0;
    if (r.state && (!npc.intent || npc.intent.weight < 0.3 || groupOf(r.state) >= groupOf(npc.intent.id))) npc.intent = { id: r.state, weight: 1, hold: threat >= 0.5 ? 8 : 4 };
    if (threat >= 0.3) npc.threat = { type: stim.type, pos: { ...stim.pos }, time: npc.clock };
    if (npc.inDialogue && threat >= 0.4) this.interruptDialogue(npc, stim.type);
    const sameState = r.state && r.state === npc.brain.state;
    if (r.anim && !npc.inDialogue && !sameState) npc.oneShot(r.anim);
    if (r.look) npc.look({ x: stim.pos.x, y: (stim.pos.y ?? 0) + 1.5, z: stim.pos.z }, r.look);
    if (r.bark) npc.bark(r.bark, { cause: stim.type });
    if (r.panic && (stim.gen ?? 0) < 2 && this.time - (npc.panickedAt ?? -Infinity) > 8) {
      npc.panickedAt = this.time;
      this.panics.push({ at: this.time + 0.35 + npc.rng.next() * 0.5, pos: { ...npc.pos }, gen: (stim.gen ?? 0) + 1, from: npc });
    }
    // Urgent reactions re-think now instead of waiting for the LOD tick.
    npc.lod.think = Infinity;
    this.events.emit('npc:react', { npc: npc.id, stimulus: stim.type, reaction: r.id, intensity });
    return r;
  }

  bump(npc) {
    if (this.time - (npc.reacted?.bump ?? -Infinity) < REACT_COOLDOWN.bump) return;
    this.stimulate(npc, { type: 'bump', pos: this.playerPos() ?? npc.pos, source: 'player' }, { force: true });
  }

  requestTalk(npc) {
    const tree = npc.personality.dialogue;
    if (npc.brain.state && GROUPS[npc.brain.states[npc.brain.state].group] >= GROUPS.threat) return false;
    if (!tree || npc.rank() === 'hostile') {
      npc.bark('noTalk', {}, { force: true });
      return false;
    }
    this.events.emit('npc:talk', { npc: npc.id, tree });
    if (this.dialogue && !this.dialogue.active) this.dialogue.start(npc, tree);
    return true;
  }

  interruptDialogue(npc, reason) {
    npc.inDialogue = false;
    this.events.emit('npc:interrupt', { npc: npc.id, reason });
    if (this.dialogue?.active && this.dialogue.npc === npc) this.dialogue.stop({ reason });
  }

  bark(npc, concept, facts = {}, opts = {}) {
    const all = {
      archetype: npc.personality.archetype, faction: npc.personality.faction, voice: npc.personality.voice, temperament: npc.temperament,
      rank: npc.rank(), state: npc.brain.state, traits: npc.traits, npc: npc.memory.vars, ...facts,
    };
    const line = this.barks.query(concept, all, { speaker: npc.id, memory: { npc: npc.memory.vars }, force: opts.force });
    if (!line) return null;
    const words = line.text.split(/\s+/).length;
    npc.speech = { ...line, until: npc.clock + 1.4 + words * 0.32 };
    this.events.emit('npc:bark', { npc: npc.id, name: npc.name, text: line.text, concept, emotion: line.emotion });
    return line;
  }

  // --- player view --------------------------------------------------------------------------

  playerObject(ctx) {
    return ctx?.player ?? this.player;
  }

  playerPos(ctx = this.ctx) {
    const p = this.playerObject(ctx);
    if (!p) return null;
    const src = p.pos ?? p.root?.position ?? p.holder?.position ?? p.position ?? (typeof p.getPosition === 'function' ? p.getPosition() : null);
    return src ? { x: src.x, y: src.y ?? 0, z: src.z } : null;
  }

  playerFacing(ctx = this.ctx) {
    const p = this.playerObject(ctx);
    return p?.facing ?? p?.root?.rotation?.y ?? p?.holder?.rotation?.y ?? p?.rotation?.y ?? 0;
  }

  /** Which NPC the player's aim points at (explicit target, else within 7° of the facing ray). */
  aimedNpc(pos, facing) {
    const t = this.playerState.aimTarget;
    if (t) {
      const byId = this.get(String(t.npc ?? t.id ?? t));
      if (byId) return byId;
      const tp = v3(t);
      if (tp && Number.isFinite(tp.x)) {
        let best = null;
        for (const n of this.npcs) {
          const d = Math.hypot(n.pos.x - tp.x, n.pos.z - tp.z);
          if (d < 1.2 && (!best || d < best.d)) best = { n, d };
        }
        if (best) return best.n;
      }
    }
    let best = null;
    for (const n of this.npcs) {
      const dx = n.pos.x - pos.x;
      const dz = n.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 30 || d < 0.2) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - facing), Math.cos(Math.atan2(dx, dz) - facing)));
      if (off > THREE.MathUtils.degToRad(7) + Math.atan2(0.35, d)) continue;
      if (!this.los({ x: pos.x, y: pos.y + 1.5, z: pos.z }, { x: n.pos.x, y: n.pos.y + 1.3, z: n.pos.z })) continue;
      if (!best || d < best.d) best = { n, d };
    }
    return best?.n ?? null;
  }

  // --- update -------------------------------------------------------------------------------

  /**
   * Per frame. ctx (all optional): { player: {pos|position, facing, weapon, aiming, sprint, crouch},
   * camera, events }. Player flags in ctx override what the bus reported.
   */
  update(dt, ctx = {}) {
    this.ctx = ctx;
    this.time += dt;
    this.relationships.update(dt);
    this.barks.update(dt);
    const ps = this.playerState;
    const cp = ctx.player ?? {};
    if (ps.aimUntil !== Infinity && this.time > ps.aimUntil) ps.aiming = false;
    if (ps.sprintUntil !== Infinity && this.time > ps.sprintUntil) ps.sprint = false;
    const pos = this.playerPos(ctx);
    const facing = this.playerFacing(ctx);
    if (pos && ps.lastPos && dt > 0) {
      ps.velocity = { x: (pos.x - ps.lastPos.x) / dt, z: (pos.z - ps.lastPos.z) / dt };
    }
    ps.lastPos = pos;
    const weapon = cp.weapon !== undefined ? cp.weapon : ps.weapon;
    const aiming = cp.aiming ?? ps.aiming;
    const view = pos && {
      pos, facing, head: { x: pos.x, y: pos.y + 1.6, z: pos.z }, weapon, aiming: !!(weapon && aiming),
      sprint: cp.sprint ?? ps.sprint, crouch: cp.crouch ?? ps.crouch, speed: Math.hypot(ps.velocity.x, ps.velocity.z),
    };
    if (view) view.aimingAt = view.aiming ? this.aimedNpc(pos, facing)?.id ?? null : null;
    this.view = view;

    this.updatePanics();
    this.pairTimer -= dt;
    if (this.pairTimer <= 0) {
      this.pairTimer = 1;
      this.pairSocial();
    }

    const others = this.npcs.map((n) => n.pos);
    this.npcs.forEach((npc, i) => {
      const d = view ? Math.hypot(npc.pos.x - pos.x, npc.pos.z - pos.z) : 0;
      const tier = d < this.lodTable.near.dist ? 'near' : d < this.lodTable.mid.dist ? 'mid' : 'far';
      const L = this.lodTable[tier];
      npc.lod.tier = tier;
      if (npc.holder) npc.holder.visible = d < this.lodTable.hide;
      npc.lod.think += dt;
      npc.lod.anim = (npc.lod.anim ?? 0) + dt;
      npc.lod.sense = (npc.lod.sense ?? 0) + dt;
      npc.lod.thinkDt = (npc.lod.thinkDt ?? 0) + dt;
      const env = { time: this.time, player: view ? { ...view, dist: d, visible: npc.perception.visibility > 0.15 } : null, neighbours: [...others.filter((o) => o !== npc.pos), ...(pos ? [pos] : [])] };
      // Senses at ≥ 5 Hz near, else with the think rate.
      const senseRate = tier === 'near' ? 1 / 8 : 1 / L.think;
      if (npc.lod.sense >= senseRate - 1e-9) {
        this.sensePlayer(npc, view, d, npc.lod.sense);
        npc.decay(npc.lod.sense, env);
        npc.lod.sense = 0;
      }
      const thinkEvery = 1 / L.think;
      // Stagger far NPCs so they do not all think on the same frame.
      if (npc.lod.think >= thinkEvery + (tier === 'near' ? 0 : (i % 4) * 0.02)) {
        npc.think(Math.min(npc.lod.thinkDt, 1), env, true);
        npc.lod.think = 0;
        npc.lod.thinkDt = 0;
      }
      const stepEvery = 1 / L.step;
      if (npc.lod.anim >= stepEvery - 1e-9) {
        npc.step(Math.min(npc.lod.anim, 0.25), env);
        npc.lod.anim = 0;
      }
    });
  }

  /** Continuous player-driven stimuli (visibility, weapon, aim, sneaking, proximity, bumps). */
  sensePlayer(npc, view, d, dt) {
    if (!view) return;
    const vis = npc.perception.sight(npc.pos, npc.facing, view.pos, { crouch: view.crouch, sprint: view.sprint });
    npc.perception.updateAwareness(vis, dt, view.pos);
    const stim = (type, opts) => this.stimulate(npc, { type, pos: view.pos, source: 'player', ...opts }, { visibility: vis });
    if (vis > 0.1 && view.aimingAt === npc.id) stim('aimedAt');
    else if (vis > 0.2 && view.weapon) stim('weaponDrawn');
    if (view.crouch && d < 8 && npc.perception.awareness > 0.6) stim('crouchSneak');
    if (view.sprint && d < 9) stim('sprint');
    if (d < 4.5 && vis > 0.4 && npc.perception.awareness > 0.45 && !view.weapon && !npc.inDialogue) {
      const g = GROUPS[npc.brain.states[npc.brain.state]?.group] ?? 0;
      if (g <= GROUPS.social && this.time - npc.memory.greetedAt > 45) stim('playerNear');
    }
    if (d < 0.62 && view.speed > 0.8) this.bump(npc);
  }

  updatePanics() {
    const due = this.panics.filter((p) => p.at <= this.time);
    if (!due.length) return;
    this.panics = this.panics.filter((p) => p.at > this.time);
    for (const p of due) this.broadcast({ type: 'panic', pos: p.pos, source: p.from.id, gen: p.gen, scale: 0.9 ** (p.gen - 1) }, { except: p.from });
  }

  /** Pairs nearby sociable idle NPCs into conversations; breaks pairs that drift or get busy. */
  pairSocial() {
    // NPCs holding a scenario point (leaning, behind a counter) stay put; free ones pair up.
    const ambient = (n) => !n.home.scenario && !n.inDialogue && ['idle', 'social', null, undefined].includes(n.brain.state) && n.drives.fear < 0.2 && n.drives.alarm < 0.3;
    for (const n of this.npcs) {
      if (n.partner && (!ambient(n) || !ambient(n.partner) || Math.hypot(n.pos.x - n.partner.pos.x, n.pos.z - n.partner.pos.z) > 4)) {
        n.partner.partner = null;
        n.partner = null;
      }
    }
    for (const n of this.npcs) {
      if (n.partner || !ambient(n) || n.traits.sociability < 0.5) continue;
      const m = this.npcs.find((o) => o !== n && !o.partner && ambient(o) && o.traits.sociability >= 0.45 && Math.hypot(o.pos.x - n.pos.x, o.pos.z - n.pos.z) < 3.2);
      if (m) {
        n.partner = m;
        m.partner = n;
      }
    }
  }

  // --- integration helpers ------------------------------------------------------------------

  /** NPCs as interactables (contract §2 shape, kind 'npc') for C's interaction prompts. */
  interactables() {
    return this.npcs.map((n) => ({
      id: `npc:${n.id}`, kind: 'npc', pos: [n.pos.x, n.pos.y + 1.0, n.pos.z], yaw: n.facing, radius: 1.8,
      prompt: n.personality.dialogue ? `Talk to ${n.name}` : 'Greet', data: { npc: n.id, tree: n.personality.dialogue },
    }));
  }

  /** Capsule bodies for World.update(dt, { bodies }) (doors, physics props). */
  bodies() {
    return this.npcs.map((n) => n.body());
  }

  nearest(pos, maxDist = Infinity, filter = () => true) {
    let best = null;
    for (const n of this.npcs) {
      const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
      if (d <= maxDist && filter(n) && (!best || d < best.d)) best = { npc: n, d };
    }
    return best?.npc ?? null;
  }

  /** Active barks for an overlay: [{ npc, text, emotion, head }]. */
  speeches() {
    return this.npcs.filter((n) => n.speech && n.holder?.visible !== false).map((n) => ({ npc: n, text: n.speech.text, emotion: n.speech.emotion, head: n.headPos() }));
  }

  dispose() {
    this.unsub?.();
    this.scene?.remove(this.group);
    this.npcs = [];
    this.byId.clear();
  }
}
