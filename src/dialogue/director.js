import * as THREE from 'three';
import { DialogueRunner, makeContext } from './graph.js';
import { getTree } from './loader.js';
import { DialogueCamera } from './camera.js';
import { DialogueHud } from './hud.js';

/**
 * Runs a conversation: dialogue graph + cinematic camera + HUD + NPC performance cues.
 *
 * Contract (docs/INTEGRATION_CONTRACTS.md §4): new DialogueDirector({ camera, scene, hud });
 * start(npc, treeId); update(dt); get active.
 * Extras: player (Object3D / { position } / { pos }), events (bus), globals (game flags such as
 * cash), stats (skill values for checks), collision (keeps the camera out of walls), autoAdvance,
 * input (key target, default window; null = no key binding).
 *
 * Frame order: the game updates its gameplay camera first, then director.update(dt); while active the
 * director overrides the camera, and on exit it blends back to whatever the game wrote that frame.
 * Events: dialogue:start, dialogue:line, dialogue:choice, dialogue:effect, dialogue:end.
 */
const INTENSE = ['angry', 'afraid', 'worried', 'sad'];
const DEFAULT_COLORS = { npc: '#8fd3ff', player: '#ffd34a' };
const NOOP_BUS = { emit() {}, on() { return () => {}; } };

/** Shot for a presented step (pure; exported for tests). */
export function pickShot(step, index) {
  const speaker = step.kind === 'line' && step.speaker === 'player' ? 'a' : 'b';
  if (step.kind === 'choice') return { kind: 'ots', speaker: 'b' };
  if (step.shot && step.shot !== 'auto') return { kind: step.shot, speaker };
  if (index === 0) return { kind: 'two', speaker };
  if (INTENSE.includes(step.emotion)) return { kind: 'close', speaker };
  return { kind: 'ots', speaker };
}

/** Seconds a subtitle stays up. */
export const lineDuration = (text) => Math.max(1.8, Math.min(8, 1.1 + text.split(/\s+/).length * 0.33));

export class DialogueDirector {
  constructor({ camera, scene = null, hud = undefined, player = null, events = null, relationships = null, globals = {}, stats = {}, collision = null, autoAdvance = true, input = globalThis.window ?? null, resolveTree = getTree, seed = 'dialogue' } = {}) {
    this.camera = camera;
    this.scene = scene;
    this.player = player;
    this.events = events ?? NOOP_BUS;
    this.relationships = relationships;
    this.globals = globals;
    this.stats = stats;
    this.autoAdvance = autoAdvance;
    this.resolveTree = resolveTree;
    this.seed = seed;
    const raycast = collision?.raycast ? collision.raycast.bind(collision) : null;
    this.cam = camera ? new DialogueCamera(camera, { raycast }) : null;
    if (hud instanceof DialogueHud || hud === false || hud === null) this.hud = hud || null;
    else if (typeof document !== 'undefined') this.hud = new DialogueHud(hud ?? document.body);
    else this.hud = null;
    this.npc = null;
    this.runner = null;
    this.step = null;
    this.count = 0;
    this.conversations = 0;
    if (input?.addEventListener) {
      input.addEventListener('keydown', (e) => {
        if (this.active && this.handleKey(e.code)) e.preventDefault();
      });
    }
  }

  get active() {
    return !!this.runner || !!this.cam?.active;
  }

  playerHead() {
    const p = this.player;
    const src = p?.pos ?? p?.root?.position ?? p?.holder?.position ?? p?.position ?? null;
    return src ? new THREE.Vector3(src.x, (src.y ?? 0) + 1.6, src.z) : null;
  }

  /** Starts a conversation with an NPC (from NpcManager). Returns false when one is running or the tree is missing. */
  start(npc, treeId = npc?.personality?.dialogue, { player = null } = {}) {
    if (this.runner) return false;
    if (player) this.player = player;
    const tree = typeof treeId === 'object' ? treeId : this.resolveTree(treeId);
    if (!tree) return false;
    this.npc = npc;
    this.conversations += 1;
    const relationships = this.relationships ?? npc.manager?.relationships ?? null;
    if (npc.manager?.view) this.globals.armed = !!npc.manager.view.weapon;
    const ctx = makeContext({
      vars: { npc: npc.memory.vars, global: this.globals, local: {} },
      relationships,
      npcId: npc.id,
      stat: (s) => this.stats[s] ?? 0,
      effect: (e) => this.effect(e),
      seed: `${this.seed}:${npc.id}:${this.conversations}`,
      names: { 'npc.name': npc.name },
    });
    this.speakers = {
      npc: { name: npc.name, color: tree.speakers?.npc?.color ?? DEFAULT_COLORS.npc },
      player: { name: tree.speakers?.player?.name ?? 'You', color: tree.speakers?.player?.color ?? DEFAULT_COLORS.player },
    };
    npc.inDialogue = true;
    npc.stop?.();
    this.runner = new DialogueRunner(tree, ctx, { resolveTree: this.resolveTree });
    this.count = 0;
    this.logged = 0;
    const head = this.playerHead() ?? new THREE.Vector3(npc.pos.x, npc.pos.y + 1.6, npc.pos.z - 1.5);
    this.cam?.begin(head, new THREE.Vector3(npc.headPos().x, npc.headPos().y, npc.headPos().z));
    // Other NPCs are bystanders the camera keeps out of its shots.
    if (this.cam) this.cam.bystanders = () => (npc.manager?.npcs ?? []).filter((n) => n !== npc && n.holder?.visible !== false).map((n) => n.pos);
    this.hud?.setLetterbox(true);
    this.events.emit('dialogue:start', { npc: npc.id, tree: tree.id });
    this.present(this.runner.start());
    return true;
  }

  present(step) {
    this.step = step;
    this.timer = 0;
    this.waitPlayerLine = null;
    this.syncLog();
    if (step.kind === 'line') {
      const who = this.speakers[step.speaker] ?? this.speakers.npc;
      this.duration = step.duration ?? lineDuration(step.text);
      this.hud?.showLine({ name: who.name, color: who.color, text: step.text, emotion: step.emotion });
      this.npc.cue?.({ speaking: step.speaker === 'npc', anim: step.anim, emotion: step.emotion });
      this.events.emit('dialogue:line', { npc: this.npc.id, speaker: step.speaker, text: step.text, emotion: step.emotion, node: step.node });
    } else if (step.kind === 'choice') {
      this.npc.cue?.({ speaking: false, emotion: this.npc.emotion });
      this.selected = Math.max(0, step.options.findIndex((o) => !o.locked));
      this.hud?.showChoices(step.options, { prompt: step.prompt, selected: this.selected, onPick: (i) => this.choose(i) });
      this.events.emit('dialogue:choice', { npc: this.npc.id, options: step.options });
    } else if (step.kind === 'end') {
      this.duration = 0.7;
      this.hud?.hideLine();
      this.hud?.hideChoices();
    }
    const shot = pickShot(step, this.count);
    this.cam?.cut(shot.kind, shot.speaker);
    this.count += 1;
  }

  syncLog() {
    if (!this.runner) return;
    const h = this.runner.history;
    for (; this.logged < h.length; this.logged++) this.hud?.addLog(h[this.logged], this.speakers);
  }

  /** Space / E on a line: finish the reveal, then move on. */
  skip() {
    if (!this.step) return;
    if (this.step.kind === 'line' && this.hud?.revealing) return this.hud.finishReveal();
    if (this.step.kind === 'line' || this.step.kind === 'end') this.advance();
  }

  advance() {
    if (!this.runner || !this.step) return;
    if (this.step.kind === 'end') return this.finish();
    if (this.step.kind !== 'line') return;
    if (this.waitPlayerLine) {
      const next = this.waitPlayerLine;
      this.waitPlayerLine = null;
      return this.present(next);
    }
    this.present(this.runner.advance());
  }

  /** Chooses the i-th displayed option. The player "says" it, then the graph continues. */
  choose(i) {
    if (this.step?.kind !== 'choice') return false;
    const o = this.step.options[i];
    if (!o || o.locked) return false;
    const next = this.runner.choose(o.index);
    const said = { kind: 'line', node: this.step.node, speaker: 'player', text: o.text, emotion: 'neutral', shot: 'auto' };
    this.present(said);
    this.waitPlayerLine = next;
    this.duration = Math.min(this.duration, 2.4);
    return true;
  }

  /** Dialogue effects beyond variables / relationships: performance and game hooks. */
  effect(e) {
    const npc = this.npc;
    if (e.drive) for (const [k, v] of Object.entries(e.drive)) npc.drives[k] = Math.max(0, Math.min(1, (npc.drives[k] ?? 0) + v));
    if (e.intent) npc.intent = { id: e.intent, weight: 1, hold: 8 };
    if (e.anim) npc.gesture?.(e.anim, { once: true });
    if (e.bark) npc.bark?.(e.bark, {}, { force: true });
    if (e.emit) this.events.emit(e.emit, { npc: npc.id, ...(e.payload ?? {}) });
    this.events.emit('dialogue:effect', { npc: npc.id, effect: e });
  }

  handleKey(code) {
    if (!this.runner) return false;
    if (code === 'KeyH') {
      this.hud?.toggleLog();
      return true;
    }
    if (code === 'Escape') {
      this.stop({ reason: 'leave' });
      return true;
    }
    if (this.step?.kind === 'choice') {
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      if (m) return this.choose(Number(m[1]) - 1), true;
      if (code === 'KeyW' || code === 'ArrowUp') return this.moveSelection(-1), true;
      if (code === 'KeyS' || code === 'ArrowDown') return this.moveSelection(1), true;
      if (code === 'KeyE' || code === 'Enter' || code === 'Space') return this.choose(this.selected), true;
      return false;
    }
    if (code === 'Space' || code === 'KeyE' || code === 'Enter') {
      this.skip();
      return true;
    }
    return false;
  }

  moveSelection(d) {
    const opts = this.step.options;
    for (let k = 1; k <= opts.length; k++) {
      const i = (this.selected + d * k + opts.length * k) % opts.length;
      if (!opts[i].locked) {
        this.selected = i;
        break;
      }
    }
    this.hud?.select(this.selected);
  }

  update(dt) {
    const gameplay = this.cam?.pose();
    if (this.runner && this.step) {
      this.timer += dt;
      const s = this.step;
      if (s.kind === 'line' && this.autoAdvance && this.timer >= this.duration && !this.hud?.revealing) this.advance();
      else if (s.kind === 'line' && this.waitPlayerLine && this.timer >= this.duration) this.advance();
      else if (s.kind === 'end' && this.timer >= this.duration) this.finish();
      else if (s.kind === 'choice' && s.timeout) {
        this.hud?.setTimer(1 - this.timer / s.timeout);
        if (this.timer >= s.timeout) {
          const def = s.options.findIndex((o) => o.index === s.default && !o.locked);
          this.choose(def >= 0 ? def : Math.max(0, s.options.findIndex((o) => !o.locked)));
        }
      }
    }
    if (this.runner && this.npc) {
      const h = this.npc.headPos();
      const head = this.playerHead();
      if (head) this.cam?.track(head, new THREE.Vector3(h.x, h.y, h.z));
    }
    this.hud?.update(dt);
    this.cam?.update(dt, gameplay);
  }

  /** Yaw the player should face during the conversation (toward the NPC), or null. */
  get playerFacing() {
    if (!this.runner || !this.npc) return null;
    const h = this.playerHead();
    return h ? Math.atan2(this.npc.pos.x - h.x, this.npc.pos.z - h.z) : null;
  }

  finish() {
    const outcome = this.step?.kind === 'end' ? this.step.outcome : null;
    this.close({ outcome, reason: 'end' });
  }

  /** Ends the conversation now (interrupted by a threat, Esc, or the game). */
  stop({ reason = 'stopped' } = {}) {
    if (!this.runner) return;
    this.close({ outcome: null, reason });
  }

  close({ outcome, reason }) {
    const npc = this.npc;
    const history = this.runner?.history ?? [];
    this.syncLog();
    this.runner = null;
    this.step = null;
    if (npc) {
      npc.inDialogue = false;
      npc.releaseGesture?.();
    }
    this.cam?.end();
    this.hud?.clear();
    this.events.emit('dialogue:end', { npc: npc?.id, outcome, reason, history });
    this.lastOutcome = { npc: npc?.id, outcome, reason, history };
    this.npc = null;
  }
}
