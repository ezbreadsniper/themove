import * as THREE from 'three';
import { PLAYER } from './units.js';

const DEG = Math.PI / 180;

/** Door leaf dynamics (SI units; a solid-core interior door is ~20-25 kg). */
export const DOOR_PHYSICS = Object.freeze({
  mass: 22,
  /** Hinge limit each way (the leaf stops short of the wall it swings toward). */
  limit: 95 * DEG,
  /** Hinge friction / air drag (1/s, exponential decay of angular velocity). */
  damping: 1.1,
  /** Door closer: spring stiffness (1/s²) and damping (1/s) pulling the leaf back to shut. */
  closer: 1.6,
  closerDamping: 2.2,
  /** The leaf latches when it comes back within this angle. */
  latchAngle: 2 * DEG,
  /** Closers have a latch-speed zone: the last few degrees get a constant extra pull (1/s²). */
  latchZone: 10 * DEG,
  latchPull: 2.5,
  /** Bounce off the hinge stop. */
  restitution: 0.25,
  /** Contact shell around the leaf for pushing (m). */
  skin: 0.06,
  /** Angular speed a push must give a latched leaf to release the latch (rad/s). */
  unlatch: 0.08,
  /** E-open: motor target, strength (1/s²) and how long the hand holds it before the closer takes over. */
  motorOpen: 85 * DEG,
  motorStrength: 28,
  motorTime: 1.1,
  holdOpen: 3.5,
});

const yawOf = (m) => Math.atan2(m.elements[8], m.elements[0]);
const rotY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);

/**
 * Physical swing doors built by kit.beginDynamic(..., { door: true }). Each leaf is a rigid body
 * hinged on a vertical axis: angle, angular velocity, damping, hinge limits, an optional closer
 * spring and a latch. Characters are capsule bodies { x, y, z, vx, vz, radius, height, mass }:
 *   - a body moving into the leaf transfers an impulse at its contact point (lever arm × normal
 *     relative velocity, body and leaf masses), so walking into a door swings it open in proportion
 *     to speed and direction; a push near the hinge does little;
 *   - the leaf never pushes bodies: if its swing would overlap a body it stops against it, so a
 *     closing door rests on a character's back and can never shove anyone through a wall;
 *   - the leaf's collision solid follows it at every angle;
 *   - latched doors need a push to release; locked doors only rattle.
 * data: { locked, width, height, closer (false/0 = none, number = stiffness), limit (rad), swing:
 *   'both' | 'pos' | 'neg', auto }.
 */
export class DoorSystem {
  constructor(dynamics, collision) {
    this.collision = collision;
    this.events = [];
    this.doors = Object.values(dynamics).filter((d) => d.data?.door).map((d) => this.makeDoor(d));
  }

  makeDoor(d) {
    const pivotY = d.pivotMatrix.elements[13];
    const localPolys = d.solids.map((s) => ({ poly: s.poly.map((q) => [...q]), y0: s.y0, y1: s.y1 }));
    const solids = localPolys.map((s) => this.collision.addSolid({ poly: this.transform(d, s.poly, 0), y0: s.y0 + pivotY, y1: s.y1 + pivotY, tag: 'door', door: d.name }));
    // Leaf thickness from its collider (half-depth across the leaf, including the solid's margin).
    const zs = localPolys.flatMap((s) => s.poly.map((q) => q[1]));
    const half = zs.length ? (Math.max(...zs) - Math.min(...zs)) / 2 : 0.045;
    const width = d.data.width ?? 0.92;
    const height = d.data.height ?? 2.13;
    const mass = d.data.mass ?? DOOR_PHYSICS.mass;
    const limit = d.data.limit ?? DOOR_PHYSICS.limit;
    const swing = d.data.swing ?? 'both';
    const closer = d.data.closer === false ? 0 : typeof d.data.closer === 'number' ? d.data.closer : DOOR_PHYSICS.closer;
    const centre = new THREE.Vector3(width / 2, 0, 0).applyMatrix4(d.pivotMatrix);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(d.pivotMatrix);
    return {
      ...d,
      solids,
      localPolys,
      centre,
      normal,
      hinge: [d.pivotMatrix.elements[12], d.pivotMatrix.elements[14]],
      yaw0: yawOf(d.pivotMatrix),
      y0: pivotY,
      width,
      height,
      half,
      inertia: (mass * width * width) / 3,
      min: swing === 'pos' ? 0 : -limit,
      max: swing === 'neg' ? 0 : limit,
      closer,
      angle: 0,
      omega: 0,
      latched: true,
      locked: !!d.data.locked,
      motor: null,
      hold: 0,
      rattle: 0,
      rattlePhase: 0,
      solidAngle: 0,
      // Legacy fields (pre-physics API).
      target: 0,
      side: 1,
    };
  }

  transform(d, poly, angle) {
    const m = d.pivotMatrix.clone().multiply(new THREE.Matrix4().makeRotationY(angle));
    return poly.map(([x, z]) => {
      const v = new THREE.Vector3(x, 0, z).applyMatrix4(m);
      return [v.x, v.z];
    });
  }

  get(name) {
    return this.doors.find((d) => d.name === name);
  }

  /** Leaf frame at `angle`: u along the leaf from the hinge, n the direction a +angle swing moves it. */
  frame(d, angle) {
    const a = d.yaw0 + angle;
    return { ux: Math.cos(a), uz: -Math.sin(a), nx: -Math.sin(a), nz: -Math.cos(a) };
  }

  /**
   * Contact between a capsule body and the leaf at `angle`:
   * { pen (overlap depth, negative = gap), s (lever arm), mx, mz (normal from leaf to body), mn (normal · swing dir) }.
   */
  contact(d, b, angle) {
    const radius = b.radius ?? PLAYER.radius;
    const h = b.height ?? PLAYER.height;
    const by = b.y ?? d.y0;
    if (by > d.y0 + d.height || by + h < d.y0) return null;
    // Leaf frame coordinates; the leaf is the rectangle [0, width] × [-half, half] (same as its collider).
    const f = this.frame(d, angle);
    const rx = b.x - d.hinge[0];
    const rz = b.z - d.hinge[1];
    const along = rx * f.ux + rz * f.uz;
    const across = rx * f.nx + rz * f.nz;
    const s = THREE.MathUtils.clamp(along, 0, d.width);
    const c = THREE.MathUtils.clamp(across, -d.half, d.half);
    const la = along - s;
    const lc = across - c;
    const dist = Math.hypot(la, lc);
    let mx;
    let mz;
    if (dist > 1e-6) {
      mx = (la * f.ux + lc * f.nx) / dist;
      mz = (la * f.uz + lc * f.nz) / dist;
    } else {
      const side = across >= 0 ? 1 : -1;
      mx = f.nx * side;
      mz = f.nz * side;
    }
    return { pen: radius - dist, s, mx, mz, mn: mx * f.nx + mz * f.nz };
  }

  emit(type, d, extra = {}) {
    this.events.push({ type, door: d.name, ...extra });
  }

  /** Applies a body push to one door (impulse at the contact point). */
  push(d, b) {
    const k = this.contact(d, b, d.angle);
    if (!k || k.pen < -DOOR_PHYSICS.skin || k.s < 0.02) return;
    const f = this.frame(d, d.angle);
    const leafV = d.omega * k.s;
    // Approach speed of the body toward the leaf surface along the contact normal.
    const vrel = -(((b.vx ?? 0) - leafV * f.nx) * k.mx + ((b.vz ?? 0) - leafV * f.nz) * k.mz);
    if (vrel <= 0.02) return;
    const arm = k.s * k.mn;
    const mb = b.mass ?? 75;
    const j = vrel / (1 / mb + (arm * arm) / d.inertia);
    const dOmega = (-arm * j) / d.inertia;
    if (d.locked) {
      if (d.rattle < 0.3) this.emit('rattle', d, { by: b.id ?? null });
      d.rattle = Math.min(1, d.rattle + Math.abs(dOmega) * 0.6 + 0.2);
      return;
    }
    if (d.latched) {
      if (Math.abs(dOmega) < DOOR_PHYSICS.unlatch) return;
      d.latched = false;
      this.emit('open', d, { by: b.id ?? null });
    }
    d.omega += dOmega;
    d.hold = 0;
    d.motor = null;
  }

  /** Largest step from `from` toward `to` that keeps the leaf out of every body. */
  limitByBodies(d, from, to, bodies) {
    let blocked = null;
    // A few millimetres of stand-off: a leaf resting exactly on a body would be resolved against it
    // every frame and creep forward by the solver's push-out margin.
    for (const body of bodies) {
      const b = { ...body, radius: (body.radius ?? PLAYER.radius) + 0.003 };
      const before = this.contact(d, b, from);
      const after = this.contact(d, b, to);
      if (!after || after.pen <= 0 || after.pen <= (before?.pen ?? -1) + 1e-5) continue;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const k = this.contact(d, b, from + (to - from) * mid);
        if (k && k.pen > Math.max(0, before?.pen ?? 0) + 1e-5) hi = mid;
        else lo = mid;
      }
      to = from + (to - from) * lo;
      blocked = b;
    }
    return { angle: to, blocked };
  }

  /**
   * E / scripted use: opens (away from `from`, a {x, z} point) or closes the door with a motor.
   * Returns 'open' | 'close' | 'locked'.
   */
  toggle(name, from = null) {
    const d = typeof name === 'string' ? this.get(name) : name;
    if (!d) return null;
    if (d.locked) {
      d.rattle = 1;
      this.emit('rattle', d);
      return 'locked';
    }
    if (Math.abs(d.angle) < 15 * DEG) {
      let side = 1;
      if (from) {
        const f = this.frame(d, 0);
        // Swing away from the user: positive angles move the leaf along n.
        side = (from.x - d.centre.x) * f.nx + (from.z - d.centre.z) * f.nz > 0 ? -1 : 1;
      }
      const target = THREE.MathUtils.clamp(side * DOOR_PHYSICS.motorOpen, d.min, d.max) || (side > 0 ? d.min : d.max);
      d.latched = false;
      d.motor = { target, t: DOOR_PHYSICS.motorTime };
      d.hold = DOOR_PHYSICS.holdOpen;
      this.emit('open', d);
      return 'open';
    }
    d.motor = { target: 0, t: 1.6 };
    d.hold = 0;
    return 'close';
  }

  /** Raw angular impulse (rad/s) on a door; ignored while locked. */
  impulse(name, omega) {
    const d = this.get(name);
    if (!d || d.locked) return;
    d.latched = false;
    d.omega += omega;
  }

  setLocked(name, locked) {
    const d = this.get(name);
    if (d) d.locked = locked;
  }

  isOpen(d) {
    return !d.latched || Math.abs(d.angle) > 1 * DEG;
  }

  /**
   * Steps every door. `bodies` is an array of capsule bodies; a single actor position (legacy
   * callers: the free camera, a placed character) is accepted and treated as a still body.
   */
  update(dt, bodies = []) {
    if (bodies && !Array.isArray(bodies)) bodies = [{ x: bodies.x, y: bodies.y, z: bodies.z, vx: 0, vz: 0 }];
    bodies = bodies ?? [];
    this.events.length = 0;
    for (const d of this.doors) {
      if (d.data.auto) this.autoOpen(d, bodies);
      for (const b of bodies) this.push(d, b);
      if (!d.latched) this.integrate(d, dt, bodies);
      d.rattle = Math.max(0, d.rattle - dt * 3);
      d.rattlePhase += dt * 55;
      const shake = d.rattle * 0.8 * DEG * Math.sin(d.rattlePhase);
      d.group.quaternion.copy(d.baseQuaternion).multiply(rotY(d.angle + shake));
      if (Math.abs(d.angle - d.solidAngle) > 1e-5) {
        const pivotY = d.y0;
        d.solids.forEach((s, i) => this.collision.updateSolid(s, this.transform(d, d.localPolys[i].poly, d.angle), d.localPolys[i].y0 + pivotY, d.localPolys[i].y1 + pivotY));
        d.solidAngle = d.angle;
      }
      for (const s of d.solids) s.enabled = true;
      d.target = d.motor?.target ?? 0;
    }
    return this.events;
  }

  integrate(d, dt, bodies) {
    const P = DOOR_PHYSICS;
    let alpha = 0;
    if (d.motor) {
      alpha = d.motorStrength ?? P.motorStrength;
      alpha = alpha * (d.motor.target - d.angle) - 2 * Math.sqrt(alpha) * d.omega;
      d.motor.t -= dt;
      if (d.motor.t <= 0) d.motor = null;
    } else if (d.hold > 0) {
      d.hold -= dt;
    } else if (d.closer > 0) {
      alpha = -d.closer * d.angle - P.closerDamping * d.omega;
      if (Math.abs(d.angle) < P.latchZone) alpha -= Math.sign(d.angle) * P.latchPull;
    }
    d.omega = (d.omega + alpha * dt) * Math.exp(-P.damping * dt);
    let next = d.angle + d.omega * dt;
    if (next > d.max) {
      next = d.max;
      if (d.omega > 0) d.omega = -d.omega * P.restitution;
    } else if (next < d.min) {
      next = d.min;
      if (d.omega < 0) d.omega = d.omega * -P.restitution;
    }
    const { angle, blocked } = this.limitByBodies(d, d.angle, next, bodies);
    if (blocked) d.omega = 0;
    // Latch when the leaf returns through (or settles at) the shut position under the closer / motor.
    const crossed = d.angle !== 0 && Math.sign(angle) !== Math.sign(d.angle);
    const returning = d.omega * angle <= 0 || Math.abs(d.omega) < 0.05;
    const settling = Math.abs(angle) < P.latchAngle && returning && (d.closer > 0 || d.motor?.target === 0 || Math.abs(d.omega) < 0.2);
    if (!blocked && (crossed || settling) && !(d.motor && d.motor.target !== 0)) {
      d.angle = 0;
      d.omega = 0;
      d.latched = true;
      d.motor = null;
      this.emit('latch', d);
      return;
    }
    d.angle = angle;
  }

  /** `auto` doors (data.auto) open away from a body that comes within 1.5 m, like the old system. */
  autoOpen(d, bodies) {
    const near = bodies.find((b) => Math.hypot(b.x - d.centre.x, b.z - d.centre.z) < 1.5 && Math.abs((b.y ?? d.y0) - d.centre.y) < 1.5);
    if (near && !d.motor && Math.abs(d.angle) < 10 * DEG) this.toggle(d, near);
    if (near && d.motor) d.hold = DOOR_PHYSICS.holdOpen;
  }

  /** Snapshot for tests / HUD. */
  state(name) {
    const d = this.get(name);
    return d && { angle: d.angle, omega: d.omega, latched: d.latched, locked: d.locked };
  }
}
