import * as THREE from 'three';
import { wrapAngle } from './character-controller.js';

/** Seat interaction tuning. */
export const SEAT = Object.freeze({
  /** Hips sit this far behind the root in the sit clips (m, 1.78 m body). */
  hipsBehindRoot: 0.06,
  /** Standing spot in front of the seat point, by variant (m). */
  approach: { sofa: 0.62, chair: 0.52, stool: 0.48, bed: 0.6, bench: 0.52 },
  walkSpeed: 1.3,
  turnRate: 8,
  /** Fallback glide times when the transition clips are missing (s). */
  downTime: 0.7,
  upTime: 0.65,
  /** Give up walking to the seat after this long and glide the rest (s). */
  approachTimeout: 2.5,
});

const ease = (t) => t * t * (3 - 2 * t);

/**
 * Normalises a seat interactable (contracts §2): pos is the seat point (where the hips go, y the
 * seat top), yaw the facing out of the seat, data { seatHeight, variant, exit }. fits(x, z, y) tests
 * a standing spot (CharacterMotor.fits) when the seat gives no exit point.
 */
export function seatSpec(item, collision, fits = null) {
  const [x, y, z] = item.pos;
  const yaw = item.yaw ?? 0;
  const variant = item.data?.variant ?? 'chair';
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const floor = collision?.groundAt(x, z, y + 0.05, 2.5)?.y ?? (y - (item.data?.seatHeight ?? 0.45));
  const back = SEAT.hipsBehindRoot;
  const dist = SEAT.approach[variant] ?? SEAT.approach.chair;
  let exit = item.data?.exit ? new THREE.Vector3(...item.data.exit) : null;
  if (!exit) {
    // The standing spot: the nearest point in front of the seat where the capsule fits.
    exit = new THREE.Vector3(x + fx * dist, floor, z + fz * dist);
    for (let d = dist; d <= dist + 0.8 && fits; d += 0.04) {
      exit.set(x + fx * d, floor, z + fz * d);
      if (fits(exit.x, exit.z, floor)) break;
    }
  }
  return {
    id: item.id,
    variant,
    yaw,
    floor,
    seatHeight: item.data?.seatHeight ?? y - floor,
    hips: new THREE.Vector3(x, y, z),
    root: new THREE.Vector3(x + fx * back, floor, z + fz * back),
    exit,
  };
}

/**
 * Seat state machine driving a CharacterController with a motor:
 *   approach → walk to the standing spot in front of the seat (kinematic glide at walk speed)
 *   turn     → step round to face out of the seat
 *   down     → sitDown clip (or a blend into the seated loop) while the root slides back over the seat
 *   seated   → sitIdle loop; movement is locked; the camera lowers; E / move / jump stands up
 *   up       → standUp clip while the root slides back to the standing spot; then the motor resumes
 * The body's collision is off from `down` to the end of `up` (the hips are inside the seat's collider).
 */
export class SeatAction {
  constructor(controller, seat, { events = null } = {}) {
    this.ctl = controller;
    this.seat = seat;
    this.events = events;
    this.phase = 'approach';
    this.t = 0;
    this.done = false;
    const v = seat.variant;
    const c = controller;
    this.clips = {
      down: c.pick(`sitDown_${v}`, 'sitDown'),
      idle: c.pick(`sitIdle_${v}`, 'sitIdle', 'sit'),
      up: c.pick(`standUp_${v}`, 'standUp'),
    };
    this.from = c.position.clone();
    this.standRequested = false;
  }

  get seated() {
    return this.phase === 'down' || this.phase === 'seated' || this.phase === 'up';
  }

  stand() {
    if (this.phase === 'seated' || this.phase === 'down') this.standRequested = true;
    if (this.phase === 'approach' || this.phase === 'turn') this.finish(this.ctl.position.clone());
  }

  setLoco(name) {
    const c = this.ctl;
    if (name && c.state.locomotion !== name) {
      c.animator.locomotion(name);
      c.state.locomotion = name;
    }
  }

  update(input, dt) {
    const c = this.ctl;
    const s = this.seat;
    const root = c.root;
    this.t += dt;
    if (this.phase === 'approach') {
      const to = s.exit.clone().sub(root.position).setY(0);
      const d = to.length();
      if (input.jump || (Math.hypot(input.move.x, input.move.z) > 0.5 && this.t > 0.3)) return this.finish(root.position.clone());
      if (d < 0.04 || this.t > SEAT.approachTimeout) {
        root.position.x = s.exit.x;
        root.position.z = s.exit.z;
        this.phase = 'turn';
        this.t = 0;
      } else {
        const step = Math.min(d, SEAT.walkSpeed * dt);
        root.position.addScaledVector(to.normalize(), step);
        root.position.y += (s.floor - root.position.y) * Math.min(1, dt * 10);
        if (d > 0.15) c.turnTo(Math.atan2(to.x, to.z), dt, 10);
        this.setLoco(d > 0.15 ? 'walk' : 'stepInPlace');
      }
    }
    if (this.phase === 'turn') {
      c.turnTo(s.yaw, dt, SEAT.turnRate);
      this.setLoco('stepInPlace');
      if (Math.abs(wrapAngle(s.yaw - c.facing)) < 0.08 || this.t > 1.5) {
        c.facing = s.yaw;
        this.phase = 'down';
        this.t = 0;
        this.from = root.position.clone();
        // The seated loop is the base; the sitDown one-shot (if any) plays over it and hands back.
        this.setLoco(this.clips.idle ?? 'idle');
        if (this.clips.down) c.animator.oneShot(this.clips.down);
        this.duration = this.clips.down ? c.clips[this.clips.down].duration : SEAT.downTime;
        this.events?.emit('player:sit', { id: s.id, pos: s.hips.toArray() });
      }
    }
    if (this.phase === 'down') {
      const k = ease(Math.min(1, this.t / this.duration));
      root.position.lerpVectors(this.from, s.root, k);
      if (this.t >= this.duration) {
        this.phase = 'seated';
        this.t = 0;
      }
    }
    if (this.phase === 'seated') {
      root.position.copy(s.root);
      const wantsUp = input.interact || input.jump || Math.hypot(input.move.x, input.move.z) > 0.5;
      if ((wantsUp && this.t > 0.4) || this.standRequested) {
        this.phase = 'up';
        this.t = 0;
        this.from = root.position.clone();
        this.setLoco('idle');
        if (this.clips.up) c.animator.oneShot(this.clips.up);
        this.duration = this.clips.up ? c.clips[this.clips.up].duration : SEAT.upTime;
      }
    }
    if (this.phase === 'up') {
      const k = ease(Math.min(1, this.t / this.duration));
      root.position.lerpVectors(this.from, s.exit, k);
      if (this.t >= this.duration) this.finish(s.exit.clone());
    }
    root.rotation.y = c.facing;
  }

  finish(at) {
    const c = this.ctl;
    this.done = true;
    this.phase = 'done';
    c.motor?.teleport(at.x, at.y + 0.05, at.z);
    c.velocity.set(0, 0, 0);
    this.setLoco('idle');
    this.events?.emit('player:stand', { id: this.seat.id });
  }
}
