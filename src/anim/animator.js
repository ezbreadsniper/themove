import * as THREE from 'three';

/** Bones driven by the upper-body layer (weapon handling, gestures); everything else is the base. */
export const UPPER_BONES = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'Jaw', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];

const boneOf = (trackName) => trackName.split('.')[0].replace(/^.*:/, '');
const isUpper = (track) => UPPER_BONES.includes(boneOf(track.name)) || boneOf(track.name).startsWith('wpn_');

/** Clip restricted to the base (lower) or upper body bones. */
export function maskClip(clip, part) {
  const keep = part === 'upper' ? isUpper : (t) => !isUpper(t);
  const masked = new THREE.AnimationClip(`${clip.name}@${part}`, clip.duration, clip.tracks.filter(keep).map((t) => t.clone()));
  masked.userData = { ...clip.userData, mask: part };
  return masked;
}

/** Additive version of a clip relative to a reference clip's first frame (or its own). */
export function additiveClip(clip, reference = clip) {
  const add = THREE.AnimationUtils.makeClipAdditive(maskClip(clip, 'upper'), 0, maskClip(reference, 'upper'));
  add.name = `${clip.name}@additive`;
  return add;
}

/**
 * Transition times (s) between kinds of states. Locomotion ↔ locomotion is a slower blend than going
 * into a one-shot, and nothing is ever an instant cut except an explicit `snap`.
 */
export const BLEND = { locomotion: 0.25, upper: 0.18, upperOneShot: 0.12, fullOneShot: 0.1, aimOffset: 0.08 };

/**
 * Layered animation state machine for one character.
 *   base       looping locomotion (idle / walk / run / crouch ...), full body or legs-only
 *   upper      weapon or gesture clip on the upper body; one-shots lock it until they finish, then
 *              return to `upperIdle`
 *   additive   recoil (fire) and aim offsets on top
 *   full       full-body one-shots (jump, land, hit, death) that override everything, then hand back
 * Requests made during a locked one-shot are queued (last one wins), so transitions are predictable.
 * play(name, { then }) chooses what follows a one-shot: a clip name, or null to drop the upper layer.
 */
export class Animator {
  constructor(character, clips) {
    this.character = character;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(character);
    this.cache = new Map();
    this.base = null;
    this.baseName = null;
    this.upper = null;
    this.upperName = null;
    this.upperIdle = null;
    this.locked = null;
    this.queued = null;
    this.full = null;
    this.aim = { yaw: 0, pitch: 0 };
    this.aimActions = {};
    this.mixer.addEventListener('finished', (e) => this.onFinished(e.action));
  }

  clip(name, part = 'full') {
    const key = `${name}@${part}`;
    if (!this.cache.has(key)) {
      const src = this.clips[name];
      if (!src) throw new Error(`Unknown clip ${name}`);
      let clip = src;
      if (part === 'upper' || part === 'lower') clip = maskClip(src, part);
      if (part === 'additive') clip = additiveClip(src, this.clips[src.userData.additiveReference] ?? src);
      this.cache.set(key, clip);
    }
    return this.cache.get(key);
  }

  action(name, part) {
    const action = this.mixer.clipAction(this.clip(name, part));
    if (part === 'additive') action.blendMode = THREE.AdditiveAnimationBlendMode;
    return action;
  }

  /** Fades `to` in over `fade` and the previous action out, from the current blended state. */
  swap(from, to, fade, { loop = true } = {}) {
    to.enabled = true;
    to.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    to.clampWhenFinished = !loop;
    to.reset().setEffectiveWeight(1).play();
    if (from && from !== to) {
      to.fadeIn(fade);
      from.fadeOut(fade);
    }
    return to;
  }

  /** Base locomotion loop. Syncs foot phase when moving between gaits of the same cycle group. */
  locomotion(name) {
    if (name === this.baseName) return this;
    const part = this.upper ? 'lower' : 'full';
    const next = this.action(name, part);
    const prev = this.base;
    this.swap(prev, next, BLEND.locomotion);
    const group = this.clips[name].userData.syncGroup;
    if (prev && group && prev.getClip().userData.syncGroup === group) next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
    this.base = next;
    this.baseName = name;
    return this;
  }

  /** Upper-body clip. Loops become the new resting upper state; one-shots lock until they finish. */
  play(name, { fade, then } = {}) {
    if (this.locked) {
      this.queued = { name, then };
      return this;
    }
    this.after = then;
    const clip = this.clips[name];
    const oneShot = !clip.userData.loop;
    const next = this.action(name, 'upper');
    if (!this.upper) this.splitBase();
    this.swap(this.upper, next, fade ?? (oneShot ? BLEND.upperOneShot : BLEND.upper), { loop: !oneShot });
    this.upper = next;
    this.upperName = name;
    if (oneShot) this.locked = next;
    else this.upperIdle = name;
    return this;
  }

  /** Drops the upper layer (back to full-body locomotion). */
  release() {
    if (!this.upper || this.locked) return this;
    const full = this.action(this.baseName, 'full');
    full.time = this.base.time;
    this.swap(this.base, full, BLEND.upper);
    this.upper.fadeOut(BLEND.upper);
    this.base = full;
    this.upper = null;
    this.upperName = null;
    this.upperIdle = null;
    return this;
  }

  splitBase() {
    if (!this.base) return;
    const lower = this.action(this.baseName, 'lower');
    lower.time = this.base.time;
    this.swap(this.base, lower, BLEND.upper);
    this.base = lower;
  }

  /** Additive one-shot on top of whatever plays (recoil). Ignored while a one-shot locks the upper body. */
  additive(name) {
    if (this.locked) return false;
    const a = this.action(name, 'additive');
    a.setLoop(THREE.LoopOnce, 1);
    a.reset().setEffectiveWeight(1).play();
    return true;
  }

  /** Aim offsets: additive yaw / pitch poses weighted by the aim direction (degrees). */
  setAim(yaw, pitch, { left, right, up, down }) {
    this.aim = { yaw, pitch };
    const weights = { [left]: Math.max(0, yaw) / 45, [right]: Math.max(0, -yaw) / 45, [up]: Math.max(0, pitch) / 40, [down]: Math.max(0, -pitch) / 40 };
    for (const [name, w] of Object.entries(weights)) {
      if (!this.clips[name]) continue;
      const a = this.aimActions[name] ?? (this.aimActions[name] = this.action(name, 'additive').play());
      a.setEffectiveWeight(Math.min(1, w));
    }
    return this;
  }

  /** Full-body one-shot (jump, land, hit, death) over every layer; afterwards the layers resume. */
  oneShot(name) {
    const a = this.action(name, 'full');
    this.swap(this.full, a, BLEND.fullOneShot, { loop: false });
    a.fadeIn(BLEND.fullOneShot);
    this.full = a;
    [this.base, this.upper].forEach((x) => x?.fadeOut(BLEND.fullOneShot));
    return this;
  }

  onFinished(action) {
    if (action === this.full) {
      this.full.fadeOut(BLEND.fullOneShot);
      this.full = null;
      [this.base, this.upper].forEach((x) => x && x.reset().setEffectiveWeight(1).fadeIn(BLEND.fullOneShot).play());
      return;
    }
    if (action !== this.locked) return;
    this.locked = null;
    const queued = this.queued;
    this.queued = null;
    if (queued) return void this.play(queued.name, { then: queued.then });
    const next = this.after !== undefined ? this.after : this.upperIdle;
    this.after = undefined;
    if (next) this.play(next);
    else {
      this.upperIdle = null;
      this.release();
    }
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
