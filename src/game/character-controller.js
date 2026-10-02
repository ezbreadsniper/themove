import * as THREE from 'three';
import { Animator } from '../anim/animator.js';
import { WEAPONS } from '../weapons/specs.js';
import { FIRE } from '../combat/loadout.js';

const COMPASS = [['N', 0], ['NW', 45], ['W', 90], ['SW', 135], ['S', 180], ['SE', -135], ['E', -90], ['NE', -45]];
const TURN_RATE = 9;
/** How fast the root settles onto the ground height under the body (1/s). */
const GROUND_FOLLOW = 10;
/** Standing and aiming: the upper body covers this much yaw before the feet step round (degrees). */
const AIM_DEAD_ZONE = 45;
const AIM_SETTLE = 8;
const STEP_TURN_RATE = 4.5;
const UP = new THREE.Vector3(0, 1, 0);

/** Physical movement tuning (the motor path). */
export const MOVE = Object.freeze({
  /** Ground acceleration / deceleration toward the clip's speed (m/s²): start and stop inertia. */
  accel: 9,
  decel: 12,
  /** Air control (m/s²) and how much of the take-off velocity a jump keeps. */
  airAccel: 2.5,
  /** Turn in place when the stick points this far behind the body while (nearly) still (degrees). */
  turnInPlace: 110,
  turnInPlaceDone: 30,
  turnInPlaceRate: 7,
  /** Visual root: step heights are eased out over this rate (1/s) so stairs don't jitter. */
  stepSmooth: 14,
  /** Time airborne before the fall pose takes over (s) - small drops stay in the gait. */
  fallDelay: 0.14,
  /** Landing impact speeds (m/s): soft above the first, hard (locks movement) above the second. */
  landSoft: 5.2,
  landHard: 8.5,
  hardLock: 0.45,
  /** "Tight" space: a solid within this distance of the body centre slows a run to a walk. */
  tight: 0.42,
});

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Nearest compass clip suffix for a move direction in body space (degrees, 0 = forward, + = left). */
function compass(deg) {
  let best = COMPASS[0];
  for (const c of COMPASS) {
    const d = Math.abs(((deg - c[1] + 540) % 360) - 180);
    if (d < Math.abs(((deg - best[1] + 540) % 360) - 180)) best = c;
  }
  return best[0];
}

const clipFor = (type, action) => {
  const pistol = { draw: 'pistol_draw', holster: 'pistol_unequip', switch: 'pistol_switch', ready: 'pistol_idleTwoHand', sprint: 'pistol_sprint', crouch: 'pistol_crouch' };
  const long = { draw: `${type}_equip`, holster: `${type}_unequip`, switch: `${type}_switch`, ready: `${type}_idle`, sprint: `${type}_sprint`, crouch: `${type}_crouch` };
  const common = { aim: `${type}_aimIdle`, crouchAim: `${type}_crouchAim`, recoil: `${type}_recoil`, reload: `${type}_reload`, reloadEmpty: `${type}_reloadEmpty`, dryFire: `${type}_dryFire`, inspect: `${type}_inspect`, melee: `${type}_melee` };
  return { ...common, ...(type === 'pistol' ? pistol : long) }[action];
};

/**
 * Third-person gameplay controller: input → locomotion, weapon state and aim, driving an Animator.
 * input = { move: {x, z} (camera space, -1..1), cameraYaw (rad), sprint, crouch, aim, fire, reload,
 *   weapon: 'pistol' | 'rifle' | 'smg' | null, aimPitch (deg),
 *   physical path only: jump, indoor, inspect, melee, smoke (edge flags) }
 *
 * Two movement paths:
 *   - kinematic (default, the animation playground): root motion from each clip's own speed and
 *     the root follows `ground(x, z)`;
 *   - physical (`motor`, the world): the clip speed becomes a target velocity reached with inertia,
 *     a CharacterMotor collides, slides, steps, jumps and falls; the visual root follows the body
 *     with step smoothing, and locomotion playback is scaled to the achieved speed (no foot skate).
 * `events` (an EventBus) receives the perception events (player:fire, player:aim, ...).
 */
export class CharacterController {
  constructor(character, clips, { root = character.parent, ground = null, motor = null, events = null } = {}) {
    this.character = character;
    this.root = root;
    this.clips = clips;
    this.animator = new Animator(character, clips);
    this.facing = 0;
    this.weapon = null;
    this.ammo = Object.fromEntries(Object.entries(WEAPONS).map(([t, s]) => [t, s.rounds]));
    this.state = { locomotion: 'idle', upper: null, grounded: true, airborne: false, seated: false };
    this.animator.locomotion('idle');
    this.fireCooldown = 0;
    this.events = events;
    // ground(x, z) → height: the root rides the ground under the body, foot IK plants each foot.
    this.ground = ground;
    if (ground) this.animator.setGround(ground);
    this.motor = motor;
    this.velocity = new THREE.Vector3();
    this.visualDY = 0;
    this.lock = 0;
    this.seat = null;
    this.gesture = null;
    this.flags = { aim: false, sprint: false, crouch: false };
    if (motor) {
      this.animator.setGround((x, z) => motor.collision.groundAt(x, z, motor.pos.y + 0.4, 0.8)?.y ?? null);
      if (root) root.position.set(motor.pos.x, motor.pos.y, motor.pos.z);
    }
  }

  has(name) {
    return !!(name && this.clips[name]);
  }

  /** First clip name that exists (fallback chains for clips other workstreams may or may not ship). */
  pick(...names) {
    return names.flat().find((n) => this.has(n)) ?? null;
  }

  emit(type, payload) {
    this.events?.emit(type, payload);
  }

  get position() {
    return this.root?.position ?? new THREE.Vector3();
  }

  locomotionFor(input) {
    const speed = Math.hypot(input.move.x, input.move.z);
    if (speed < 0.15 && this.turning && !input.crouch) return 'stepInPlace';
    if (speed < 0.15) return input.crouch ? 'crouchIdle' : 'idle';
    if (input.crouch) return `crouchWalk_${this.moveCompass}`;
    if (input.aim) return `walk_${this.moveCompass}`;
    if (input.sprint) return 'sprint';
    return speed > 0.6 ? 'run' : 'walk';
  }

  /** Weapon state changes: draw / holster / switch, each a one-shot chained into the next state. */
  setWeapon(type) {
    if (type === this.weapon) return;
    const a = this.animator;
    if (this.weapon && type) a.play(clipFor(this.weapon, 'switch'), { then: [clipFor(type, 'draw'), clipFor(type, 'ready')] });
    else if (this.weapon) a.play(clipFor(this.weapon, 'holster'), { then: null });
    else a.play(clipFor(type, 'draw'), { then: clipFor(type, 'ready') });
    if (type) this.emit('player:draw', { weapon: type, pos: this.position.toArray() });
    else this.emit('player:holster', { weapon: this.weapon, pos: this.position.toArray() });
    this.weapon = type;
  }

  upperFor(input) {
    if (!this.weapon) return null;
    if (input.aim) return clipFor(this.weapon, input.crouch ? 'crouchAim' : 'aim');
    if (this.state.locomotion === 'sprint') return clipFor(this.weapon, 'sprint');
    if (input.crouch) return clipFor(this.weapon, 'crouch');
    return clipFor(this.weapon, 'ready');
  }

  /** Facing: move-direction turning, strafing while aiming, the standing-aim dead zone. */
  steer(input, dt, speed, worldMove) {
    const aimOffset = THREE.MathUtils.radToDeg(wrapAngle((input.cameraYaw ?? 0) - this.facing));
    if (input.aim && speed > 0.15) {
      this.turning = false;
      this.turnTo(input.cameraYaw ?? 0, dt);
    } else if (input.aim) {
      // Standing aim: the torso / aim offsets take up to ±45°, beyond that the feet step the body round.
      if (Math.abs(aimOffset) > AIM_DEAD_ZONE) this.turning = true;
      if (this.turning && Math.abs(aimOffset) < AIM_SETTLE) this.turning = false;
      if (this.turning) this.turnTo(input.cameraYaw ?? 0, dt, STEP_TURN_RATE);
    } else {
      this.turning = false;
      if (speed > 0.15) this.turnTo(Math.atan2(worldMove.x, worldMove.z), dt);
    }
    this.aimOffset = THREE.MathUtils.radToDeg(wrapAngle((input.cameraYaw ?? 0) - this.facing));
    const bodyDeg = THREE.MathUtils.radToDeg(Math.atan2(worldMove.x, worldMove.z) - this.facing);
    this.moveCompass = compass(bodyDeg);
  }

  /** Upper body: weapon layer, aim offsets, fire / dry fire, buffered reload, gestures. */
  upperBody(input, dt) {
    const a = this.animator;
    if (input.weapon !== undefined && input.weapon !== this.weapon) this.setWeapon(input.weapon);
    const upper = this.gesture ? null : this.upperFor(input);
    if (!a.locked && upper && upper !== a.upperName) a.play(upper);
    if (!upper && !this.gesture && a.upper && !a.locked) a.release();
    a.stabilize(!!this.weapon && !!input.aim);
    if (!this.weapon || !input.aim) a.setAim(0, 0, {});
    if (this.weapon && input.aim) a.setAim(THREE.MathUtils.clamp(this.aimOffset, -AIM_DEAD_ZONE, AIM_DEAD_ZONE), input.aimPitch ?? 0, { left: `${this.weapon}_aimLeft`, right: `${this.weapon}_aimRight`, up: `${this.weapon}_aimUp`, down: `${this.weapon}_aimDown` });

    // Semi-automatic guns need the trigger released between rounds; automatic ones fire while held
    // at their cadence (FIRE). `onFire(weapon)` (the gunplay hitscan) adds { pos, dir, target } to
    // the player:fire event.
    this.fireCooldown -= dt;
    if (!input.fire) this.triggerReady = true;
    const mode = FIRE[this.weapon] ?? { interval: 0.2, auto: false };
    if (this.weapon && input.fire && input.aim && this.fireCooldown <= 0 && !a.locked && (mode.auto || this.triggerReady !== false)) {
      if (this.ammo[this.weapon] > 0) {
        if (a.additive(clipFor(this.weapon, 'recoil'))) {
          this.ammo[this.weapon] -= 1;
          this.fireCooldown = Math.max(this.fireCooldown, -dt) + mode.interval;
          this.triggerReady = false;
          this.shots = (this.shots ?? 0) + 1;
          this.lastShot = { weapon: this.weapon, ammo: this.ammo[this.weapon] };
          let extra = null;
          try {
            extra = this.onFire?.(this.weapon, input) ?? null;
          } catch (err) {
            console.warn(`onFire: ${err.message}`);
          }
          this.emit('player:fire', { pos: this.position.toArray(), weapon: this.weapon, target: input.target ?? null, ...extra });
        }
      } else if (this.triggerReady !== false) {
        a.play(clipFor(this.weapon, 'dryFire'));
        this.fireCooldown = 0.5;
        this.triggerReady = false;
        this.emit('player:dryFire', { weapon: this.weapon, pos: this.position.toArray() });
      }
    }
    if (this.fireCooldown < 0 && !input.fire) this.fireCooldown = 0;
    // A reload pressed during another one-shot (dry fire, draw) is buffered, not dropped.
    if (input.reload) this.wantReload = true;
    if (this.weapon && this.wantReload && !a.locked) {
      this.wantReload = false;
      if (this.ammo[this.weapon] < WEAPONS[this.weapon].rounds) {
        a.play(clipFor(this.weapon, this.ammo[this.weapon] === 0 ? 'reloadEmpty' : 'reload'));
        this.ammo[this.weapon] = WEAPONS[this.weapon].rounds;
      }
    }
    this.actions(input, dt);
  }

  /**
   * Optional actions from other workstreams' clips (inspect, melee, smoke, door push). Each falls back
   * gracefully: a missing clip skips the animation but the gameplay event still fires.
   */
  actions(input, dt) {
    const a = this.animator;
    if (this.gesture) {
      this.gesture.t -= dt;
      if (this.gesture.t <= 0 || input.aim || input.sprint) {
        const g = this.gesture;
        this.gesture = null;
        if (g.loop && a.upperName === g.name && !a.locked) a.release();
      }
    }
    if (input.inspect && this.weapon && !a.locked) {
      const clip = this.pick(clipFor(this.weapon, 'inspect'));
      if (clip) a.play(clip, { then: clipFor(this.weapon, 'ready') });
    }
    if (input.melee && !a.locked) {
      const clip = this.weapon ? this.pick(clipFor(this.weapon, 'melee')) : this.pick(this.meleeCombo % 2 ? 'melee_cross' : 'melee_jab', 'melee_jab');
      this.meleeCombo = (this.meleeCombo ?? 0) + 1;
      if (clip) a.play(clip, { then: this.weapon ? clipFor(this.weapon, 'ready') : null });
      const f = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      this.emit('player:melee', { pos: this.position.clone().addScaledVector(f, 0.6).setY(this.position.y + 1.3).toArray(), weapon: this.weapon });
    }
    if (input.smoke && !this.weapon && !a.locked) this.playGesture(this.pick('smoke_light', 'smoke'));
  }

  /** Upper-body gesture (one-shot, or a loop played once through). */
  playGesture(name, { then = null } = {}) {
    if (!name || this.animator.locked) return false;
    const clip = this.clips[name];
    if (clip.userData.loop) {
      this.gesture = { name, t: clip.duration, loop: true };
      this.animator.play(name);
    } else {
      this.animator.play(name, { then });
    }
    return true;
  }

  /** Full-body one-shot over the layers if the clip exists. */
  oneShot(name) {
    if (!this.has(name)) return false;
    this.animator.oneShot(name);
    return true;
  }

  update(input, dt) {
    if (this.motor) return this.updatePhysical(input, dt);
    const a = this.animator;
    const move = new THREE.Vector3(input.move.x, 0, input.move.z);
    const speed = Math.min(1, move.length());
    const worldMove = move.clone().applyAxisAngle(UP, input.cameraYaw ?? 0);
    this.steer(input, dt, speed, worldMove);
    const loco = this.locomotionFor(input);
    if (loco !== this.state.locomotion) {
      a.locomotion(loco);
      this.state.locomotion = loco;
    }
    this.upperBody(input, dt);
    a.update(dt);
    const vel = this.clips[loco]?.userData.rootVelocity;
    if (vel && this.root) {
      const v = new THREE.Vector3(...vel).applyAxisAngle(UP, this.facing);
      this.root.position.addScaledVector(v, dt);
    }
    if (this.root) this.root.rotation.y = this.facing;
    if (this.root && this.ground) {
      const y = this.ground(this.root.position.x, this.root.position.z) ?? this.root.position.y;
      this.root.position.y += (y - this.root.position.y) * Math.min(1, dt * GROUND_FOLLOW);
    }
    this.state.upper = a.upperName;
  }

  // --- physical path ------------------------------------------------------------------------------

  updatePhysical(input, dt) {
    const a = this.animator;
    const m = this.motor;
    const st = this.state;
    if (this.seat) {
      this.seat.update(input, dt);
      if (this.seat.done) this.seat = null;
      this.upperBody({ ...input, aim: false, fire: false, reload: false, inspect: false, melee: false, weapon: this.weapon }, dt);
      a.update(dt);
      st.upper = a.upperName;
      st.seated = !!this.seat;
      return st;
    }

    // Crouch needs headroom to stand back up; sprinting stands up.
    const crouch = m.setCrouch(!!input.crouch && !input.sprint);
    if (crouch !== this.flags.crouch) this.emit('player:crouch', { on: crouch, pos: this.position.toArray() });
    this.flags.crouch = crouch;
    const sprintAllowed = !input.indoor && !crouch;
    const inp = { ...input, crouch, sprint: !!input.sprint && sprintAllowed && !input.aim };
    if (inp.aim && !this.flags.aim && this.weapon) this.emit('player:aim', { target: input.target ?? null, weapon: this.weapon, pos: this.position.toArray() });
    this.flags.aim = !!inp.aim && !!this.weapon;

    const move = new THREE.Vector3(inp.move.x, 0, inp.move.z);
    const stick = Math.min(1, move.length());
    const worldMove = move.clone().applyAxisAngle(UP, inp.cameraYaw ?? 0);
    const hspeed = Math.hypot(this.velocity.x, this.velocity.z);

    // Turn in place: stick far behind the body while nearly still → step round before moving off.
    const wantYaw = Math.atan2(worldMove.x, worldMove.z);
    if (!inp.aim && st.grounded && stick > 0.15 && hspeed < 0.6 && Math.abs(THREE.MathUtils.radToDeg(wrapAngle(wantYaw - this.facing))) > MOVE.turnInPlace) this.pivoting = true;
    if (this.pivoting && (stick < 0.15 || inp.aim || Math.abs(THREE.MathUtils.radToDeg(wrapAngle(wantYaw - this.facing))) < MOVE.turnInPlaceDone)) this.pivoting = false;

    if (this.pivoting) {
      this.turnTo(wantYaw, dt, MOVE.turnInPlaceRate);
      this.moveCompass = 'N';
    } else if (st.grounded || inp.aim) {
      this.steer(inp, dt, stick, worldMove);
    } else {
      this.moveCompass = 'N';
    }

    if (input.jump && !crouch && this.lock <= 0) m.requestJump();

    // Gait: the clip the body would play on the ground; tight spaces cap a run to a walk.
    let loco = this.pivoting ? 'stepInPlace' : this.locomotionFor(inp);
    if (this.tightT === undefined) this.tightT = 0;
    if ((loco === 'run' || loco === 'sprint') && this.tightT > 0.15) loco = 'walk';
    if (this.lock > 0) loco = crouch ? 'crouchIdle' : 'idle';
    if (inp.sprint && loco === 'sprint' && st.locomotion !== 'sprint') this.emit('player:sprint', { pos: this.position.toArray() });

    // Target velocity from the clip's own root speed, reached with inertia (start / stop).
    const target = new THREE.Vector3();
    const rv = this.clips[loco]?.userData.rootVelocity;
    if (rv && stick > 0.15 && !this.pivoting && this.lock <= 0) target.set(...rv).applyAxisAngle(UP, this.facing);
    const v = this.velocity;
    if (st.grounded) {
      const rate = target.lengthSq() > v.lengthSq() ? MOVE.accel : MOVE.decel;
      const dv = target.clone().sub(v);
      const max = rate * dt;
      if (dv.length() > max) dv.setLength(max);
      v.add(dv);
    } else {
      const dv = target.clone().sub(v);
      const max = MOVE.airAccel * dt;
      if (dv.length() > max) dv.setLength(max);
      if (target.lengthSq() > 0) v.add(dv);
    }

    // What the player is trying to do (pushes doors and props even while they hold the body back).
    this.wantVelocity = target.lengthSq() > 0 ? target.clone() : v.clone();
    const r = m.step(dt, v.x, v.z);
    // Velocity actually achieved (walls clip it), so inertia never builds up against an obstacle.
    v.set(r.vx, 0, r.vz);
    this.lastStep = r;
    this.contacts = r.contacts;
    this.visualDY -= r.stepped;
    if (!r.grounded) this.visualDY = 0;
    this.visualDY = THREE.MathUtils.clamp(this.visualDY, -0.4, 0.4) * Math.exp(-MOVE.stepSmooth * dt);
    if (Math.abs(this.visualDY) < 1e-4) this.visualDY = 0;
    const clearance = st.grounded && hspeed > 2 ? m.clearance(0.8) : 1;
    this.tightT = clearance < MOVE.tight ? Math.min(0.5, this.tightT + dt) : Math.max(0, this.tightT - dt);

    // Air states and landings.
    const airT = m.airTime;
    st.grounded = r.grounded;
    if (r.jumped) {
      this.airborneAnim = true;
      if (!this.oneShot(this.pick('jump_start', 'jumpStart'))) loco = this.pick('jump_loop', 'jumpLoop', 'fall') ?? loco;
    }
    if (!r.grounded && (airT > MOVE.fallDelay || this.airborneAnim)) {
      this.airborneAnim = true;
      loco = this.pick('jump_loop', 'jumpLoop', 'fall') ?? loco;
    }
    if (r.landed !== null) {
      const wasAir = this.airborneAnim;
      this.airborneAnim = false;
      if (r.landed > MOVE.landHard) {
        this.lock = MOVE.hardLock;
        this.oneShot(this.pick('land_hard', 'land'));
      } else if (r.landed > MOVE.landSoft || (wasAir && r.fall > 0.3)) {
        this.oneShot(this.pick('land_soft'));
      }
      this.emit('player:land', { speed: r.landed, pos: this.position.toArray() });
    }
    if (this.airborneAnim && r.grounded) this.airborneAnim = false;
    this.lock = Math.max(0, this.lock - dt);
    st.airborne = !!this.airborneAnim;

    if (loco !== st.locomotion) {
      a.locomotion(loco);
      st.locomotion = loco;
    }
    // Playback follows the achieved speed during starts / stops / pushes (no foot skating).
    const clipSpeed = rv ? Math.hypot(rv[0], rv[2]) : 0;
    if (a.base && clipSpeed > 0.1 && r.grounded) {
      const actual = Math.hypot(v.x, v.z);
      a.base.timeScale = THREE.MathUtils.clamp(actual / clipSpeed, 0.45, 1.2);
    } else if (a.base) a.base.timeScale = 1;

    this.upperBody(inp, dt);
    a.update(dt);
    if (this.root) {
      this.root.position.set(m.pos.x, m.pos.y + this.visualDY, m.pos.z);
      this.root.rotation.y = this.facing;
    }
    st.upper = a.upperName;
    st.seated = false;
    st.speed = Math.hypot(v.x, v.z);
    st.tight = this.tightT > 0.15;
    return st;
  }

  /** The capsule body other systems (doors, props, NPCs) see this frame: intended velocity included. */
  body() {
    const m = this.motor;
    if (!m) return { id: 'player', x: this.position.x, y: this.position.y, z: this.position.z, vx: 0, vz: 0, radius: 0.3, height: 1.8, mass: 75 };
    // Doors and props are pushed by what the player is trying to do, not by what the wall allowed.
    const want = this.wantVelocity ?? this.velocity;
    return { id: 'player', x: m.pos.x, y: m.pos.y, z: m.pos.z, vx: want.x, vz: want.z, radius: m.radius, height: m.height, mass: m.cfg.mass };
  }

  /** Begins a seat interaction (see src/game/seat.js); holsters first. */
  sit(seatAction) {
    if (this.seat) return false;
    if (this.weapon) this.setWeapon(null);
    this.gesture = null;
    this.seat = seatAction;
    this.velocity.set(0, 0, 0);
    this.state.seated = true;
    return true;
  }

  turnTo(target, dt, rate = TURN_RATE) {
    this.facing += wrapAngle(target - this.facing) * Math.min(1, dt * rate);
  }
}

export { wrapAngle, clipFor };
