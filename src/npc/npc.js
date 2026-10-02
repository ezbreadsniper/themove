import * as THREE from 'three';
import { Animator } from '../anim/animator.js';
import { handRestFrame } from '../anim/arm-ik.js';
import { createRng } from '../core/rng.js';
import { Perception } from './perception.js';
import { Brain } from './brain.js';
import { LookAt } from './look-at.js';
import { temperament } from './reactions.js';
import { SPEEDS, arrive, avoidWalls, separation, turnToward, wrapAngle, vlen } from './steering.js';

/**
 * Clip substitutes when a clip is missing (a character baked without social clips, or a name another
 * workstream has not shipped yet). Walks the chain until something exists.
 */
export const CLIP_FALLBACKS = {
  npc_idle_weight: 'idle', npc_idle_armsCrossed: 'npc_idle_weight', npc_idle_pockets: 'npc_idle_weight', npc_phone: 'npc_idle_weight',
  npc_lean_wall: 'npc_idle_armsCrossed', npc_alert: 'hitReact', npc_fear_cower: 'crouchIdle', npc_handsUp: 'idle', npc_flee_start: null,
  npc_flee_run: 'run', npc_anger_point: 'angry', npc_confront: 'idle', npc_greet_wave: 'wave', npc_greet_nod: null, npc_shrug: 'shrug',
  npc_listen: 'idle', npc_talk_gesture_1: 'talk', npc_talk_gesture_2: 'talk', npc_talk_gesture_3: 'talk', npc_talk_gesture_4: 'talk',
  lookAround: 'idle', sprint: 'run', melee_jab: 'angry', crouchIdle: 'idle', stepInPlace: 'idle', angry: 'point', hitReact: null,
};

const DRIVE_DECAY = { fear: 0.045, anger: 0.035, alarm: 0.12, interest: 0.09, social: 0.2, surrender: 0.12 };
const ACCEL = 7;
const TURN = 7;
const STAND_TURN = 4;
/** Bodies scaled from the default 1.78 m rig. */
const EYE_FRACTION = 1.6 / 1.78;

/**
 * One NPC: body (character + Animator + head tracking), senses, drives, memory and brain.
 * Works headless (character = null) for tests and server-side simulation.
 */
export class Npc {
  constructor({ id, personality, pos, yaw = 0, scenario = null, character = null, clips = {}, manager = null, collision = null, los, raycast = null }) {
    this.id = id;
    this.personality = personality;
    this.traits = personality.traits;
    this.temperament = temperament(personality.traits);
    this.name = personality.name ?? `${personality.label} ${id}`;
    this.manager = manager;
    this.collision = collision;
    this.raycast = raycast;
    this.rng = createRng(`npc-brain:${id}`);
    this.pos = { x: pos[0], y: pos[1] ?? 0, z: pos[2] };
    this.home = { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw, scenario };
    this.facing = yaw;
    this.targetFacing = null;
    this.velocity = { x: 0, z: 0 };
    this.vy = 0;
    this.nav = null;
    this.moving = false;
    this.stuck = false;
    this.stuckTime = 0;
    this.drives = { fear: 0, anger: 0, alarm: 0, interest: 0, social: 0, surrender: 0 };
    this.intent = null;
    this.threat = null;
    this.memory = { vars: {}, bumps: 0, greetedAt: -Infinity };
    this.boredom = 0;
    this.partner = null;
    this.inDialogue = false;
    this.clock = 0;
    this.speech = null;
    this.lookTarget = null;
    this.lookTime = 0;
    this.perception = new Perception({ ...personality.perception, los });
    this.brain = new Brain(this);
    this.clips = clips;
    this.character = character;
    this.height = character?.userData.layout?.measures.height ?? 1.75;
    this.lod = { tier: 'near', think: 0, anim: 0 };
    if (character) this.attachBody(character);
  }

  attachBody(character) {
    this.holder = new THREE.Group();
    this.holder.name = `npc:${this.id}`;
    this.holder.add(character);
    this.holder.userData.npc = this;
    this.animator = new Animator(character, this.clips);
    if (this.collision) this.animator.setGround((x, z) => this.collision.groundAt(x, z, this.pos.y + 0.4)?.y ?? null);
    this.lookAt = new LookAt(character);
    this.animator.locomotion(this.resolveClip('idle'));
    this.baseName = 'idle';
    this.sync();
  }

  // --- queries ------------------------------------------------------------------------------

  hasClip(name) {
    return !!this.clips[name];
  }

  /** Name of the clip to play for `name`, following CLIP_FALLBACKS; null when nothing fits. */
  resolveClip(name) {
    let n = name;
    for (let i = 0; i < 6 && n; i++) {
      if (this.clips[n]) return n;
      n = CLIP_FALLBACKS[n] ?? null;
    }
    return null;
  }

  rank() {
    return this.manager?.relationships.rank(this.id) ?? 'neutral';
  }

  disposition() {
    return this.manager?.relationships.score(this.id) ?? 0;
  }

  headPos() {
    return { x: this.pos.x, y: this.pos.y + this.height * EYE_FRACTION, z: this.pos.z };
  }

  intentBonus(id) {
    return this.intent && this.intent.id === id ? 0.35 * this.intent.weight : 0;
  }

  scenarioClip() {
    const s = this.home.scenario;
    return s ? { lean: 'npc_lean_wall', phone: 'npc_phone', smoke: 'smoke', armsCrossed: 'npc_idle_armsCrossed', pockets: 'npc_idle_pockets', counter: 'npc_idle_weight' }[s] ?? null : null;
  }

  pickIdle() {
    return this.rng.pick(this.personality.idles);
  }

  /** A walkable, reachable point within r of center (tries a few samples). */
  randomPointNear(center, r, env) {
    const c = this.collision;
    for (let i = 0; i < 10; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = r * (0.3 + 0.7 * this.rng.next());
      const p = { x: center.x + Math.sin(a) * d, z: center.z + Math.cos(a) * d };
      if (!c) return { ...p, y: center.y };
      const g = c.groundAt(p.x, p.z, center.y + 0.4);
      if (!g || Math.abs(g.y - center.y) > 0.4) continue;
      const dx = p.x - this.pos.x;
      const dz = p.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (this.raycast && this.raycast([this.pos.x, this.pos.y + 0.9, this.pos.z], [dx / len, 0, dz / len], len) < len - 0.4) continue;
      if (env?.bounds && !env.bounds(p)) continue;
      return { ...p, y: g.y };
    }
    return null;
  }

  // --- commands (used by brain states and dialogue) -------------------------------------------

  moveTo(target, gait = 'walk', { stop = 0.35 } = {}) {
    this.nav = { target: { x: target.x, y: target.y ?? this.pos.y, z: target.z }, speed: SPEEDS[gait] ?? SPEEDS.walk, gait, stop };
    this.moving = true;
    this.stuck = false;
    this.stuckTime = 0;
  }

  stop() {
    this.nav = null;
    this.moving = false;
  }

  faceYaw(yaw) {
    this.targetFacing = yaw;
  }

  faceToward(p) {
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    if (Math.hypot(dx, dz) > 0.05) this.targetFacing = Math.atan2(dx, dz);
  }

  /** Looks at a world point for `seconds` (refresh each think to hold), or null to release. */
  look(p, seconds = 1) {
    this.lookTarget = p ? { x: p.x, y: p.y ?? this.pos.y + 1.5, z: p.z } : null;
    this.lookTime = p ? seconds : 0;
  }

  /** Base pose while standing (a full-body loop), null = default idle. */
  setRest(name) {
    this.rest = name;
  }

  /** Upper-body gesture. Loops stay until released (or `duration`); one-shots return to the previous gesture. */
  gesture(name, { once = null, duration = null } = {}) {
    const a = this.animator;
    const clip = this.resolveClip(name);
    if (!a || !clip) return false;
    const loop = this.clips[clip].userData.loop;
    if (!loop) a.play(clip, { then: a.upperIdle ?? null });
    else a.play(clip);
    this.gestureTimer = loop && (once || duration) ? duration ?? this.clips[clip].duration : null;
    this.gestureName = clip;
    return true;
  }

  releaseGesture() {
    const a = this.animator;
    this.gestureTimer = null;
    this.gestureName = null;
    if (!a) return;
    if (a.locked) {
      a.queued = null;
      a.after = null;
    } else a.release();
  }

  /** Full-body one-shot (startle, flee start); the layers resume after. */
  oneShot(name) {
    const clip = this.resolveClip(name);
    if (!this.animator || !clip) return false;
    this.animator.oneShot(clip);
    return true;
  }

  bark(concept, facts = {}, opts = {}) {
    return this.manager?.bark(this, concept, facts, opts) ?? null;
  }

  /** Dialogue cue from the DialogueDirector: speaking / listening, emotion and an optional clip. */
  cue({ speaking = false, anim = null, emotion = null } = {}) {
    if (speaking) {
      this.gesture(anim && this.resolveClip(anim) ? anim : this.rng.pick(this.personality.talk));
    } else if (anim) this.gesture(anim);
    else {
      this.releaseGesture();
      this.setRest(emotion === 'angry' ? 'npc_confront' : emotion === 'afraid' ? 'npc_idle_armsCrossed' : 'npc_listen');
    }
    this.emotion = emotion;
  }

  // --- simulation ---------------------------------------------------------------------------

  /** Drives and intent decay; perception memory ages. */
  decay(dt, env) {
    const aimed = env.player?.aimingAt === this.id;
    for (const [k, rate] of Object.entries(DRIVE_DECAY)) {
      if (k === 'surrender' && aimed) continue;
      const fast = k === 'fear' && !this.perception.strongest(0.4) ? 2 : 1;
      this.drives[k] = Math.max(0, this.drives[k] - rate * fast * dt);
    }
    if (this.intent) {
      this.intent.weight -= dt / this.intent.hold;
      if (this.intent.weight <= 0) this.intent = null;
    }
    if (this.threat && this.clock - this.threat.time > 30) this.threat = null;
    this.perception.update(dt);
  }

  /** Brain tick (rate set by LOD). */
  think(dt, env, decide = true) {
    this.brain.update(dt, env, { decide });
  }

  /** Movement, facing, animation and head tracking (rate set by LOD). */
  step(dt, env) {
    this.clock += dt;
    if (this.gestureTimer !== null && this.gestureTimer !== undefined) {
      this.gestureTimer -= dt;
      if (this.gestureTimer <= 0) this.releaseGesture();
    }
    this.integrate(dt, env);
    this.animate(dt);
    if (this.speech && this.clock > this.speech.until) this.speech = null;
  }

  integrate(dt, env) {
    let desired = { x: 0, z: 0 };
    if (this.nav) {
      desired = arrive(this.pos, this.nav.target, this.nav.speed, { stop: this.nav.stop, slow: this.nav.speed > 2 ? 2.2 : 1.2 });
      if (vlen(desired) < 1e-3) this.stop();
      else {
        desired = avoidWalls(this.pos, desired, this.raycast);
        const sep = separation(this.pos, env.neighbours ?? [], 0.85);
        desired.x += sep.x * 1.4;
        desired.z += sep.z * 1.4;
      }
    } else if (env.neighbours?.length) {
      // Standing NPCs make room (slowly) when someone stands inside their personal space.
      const sep = separation(this.pos, env.neighbours, 0.55);
      desired = { x: sep.x * 0.8, z: sep.z * 0.8 };
    }
    const k = Math.min(1, ACCEL * dt / Math.max(0.5, vlen(desired) || 1));
    this.velocity.x += (desired.x - this.velocity.x) * k;
    this.velocity.z += (desired.z - this.velocity.z) * k;
    const speed = vlen(this.velocity);
    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    if (this.collision) {
      const s = this.collision.move({ x: this.pos.x, y: this.pos.y, z: this.pos.z, vy: this.vy }, dx, dz, dt);
      this.pos.x = s.x;
      this.pos.y = s.y;
      this.pos.z = s.z;
      this.vy = s.vy;
    } else {
      this.pos.x += dx;
      this.pos.z += dz;
    }
    if (this.nav && speed > 0.3) {
      const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
      this.stuckTime = moved < speed * dt * 0.25 ? this.stuckTime + dt : 0;
      this.stuck = this.stuckTime > 1.2;
    }
    if (speed > 0.25) this.facing = turnToward(this.facing, Math.atan2(this.velocity.x, this.velocity.z), TURN, dt);
    else if (this.targetFacing !== null) this.facing = turnToward(this.facing, this.targetFacing, STAND_TURN, dt);
    this.facing = wrapAngle(this.facing);
    this.speed = speed;
  }

  locomotionClip() {
    const s = this.speed ?? 0;
    if (s > 0.2) {
      if (this.fleeing) return s > 2 ? 'npc_flee_run' : 'walk';
      return s > 4.3 ? 'sprint' : s > 2.2 ? 'run' : 'walk';
    }
    const turning = this.targetFacing !== null && Math.abs(wrapAngle(this.targetFacing - this.facing)) > 0.5;
    if (turning && !['npc_fear_cower', 'npc_handsUp'].includes(this.rest)) return 'stepInPlace';
    return this.rest ?? 'npc_idle_weight';
  }

  animate(dt) {
    const a = this.animator;
    if (!a) return;
    const want = this.resolveClip(this.locomotionClip()) ?? 'idle';
    if (want !== a.baseName) a.locomotion(want);
    const clipSpeed = this.clips[want]?.userData.speed;
    if (a.base) a.base.timeScale = clipSpeed && this.speed > 0.2 ? THREE.MathUtils.clamp(this.speed / clipSpeed, 0.6, 1.6) : 1;
    this.sync();
    a.update(dt);
    if (this.phone) this.phone.visible = want === 'npc_phone';
    else if (want === 'npc_phone') this.attachPhone();
    if (this.lookTime > 0) this.lookTime -= dt;
    this.lookAt.setTarget(this.lookTime > 0 ? this.lookTarget : null);
    this.lookAt.update(dt, this.facing, this.headPos());
  }

  sync() {
    if (!this.holder) return;
    this.holder.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.holder.rotation.y = this.facing;
    this.holder.updateMatrixWorld(true);
  }

  /** A little phone in the right palm while the phone idle plays. */
  attachPhone() {
    const hand = this.character.userData.rig.bones.find((b) => b.name.endsWith('RightHand'));
    if (!hand) return;
    const { fingers, palm } = handRestFrame(this.character.userData.layout, 'Right');
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.012, 0.135), new THREE.MeshLambertMaterial({ color: '#1b1d24', emissive: '#22364a' }));
    mesh.position.copy(fingers.clone().multiplyScalar(0.075)).addScaledVector(palm, 0.022);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), fingers, palm));
    mesh.name = 'phone';
    hand.add(mesh);
    this.phone = mesh;
  }

  /** Capsule body for door pushing / physics (contract §3). */
  body() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, vx: this.velocity.x, vz: this.velocity.z, radius: 0.3, height: this.height, mass: 70, npc: this.id };
  }
}
