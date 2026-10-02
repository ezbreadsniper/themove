import { PLAYER } from '../units.js';

const DEG = Math.PI / 180;

/** Kinematic character tuning (metres, seconds). */
export const MOTOR = Object.freeze({
  gravity: 20,
  jumpHeight: 0.5,
  /** Grace after walking off a ledge during which a jump still counts. */
  coyote: 0.12,
  /** A jump pressed this long before landing fires on touchdown. */
  buffer: 0.14,
  /** Steepest planar walkable the character walks up; steeper planes block and slide. */
  maxSlope: 46 * DEG,
  slideSpeed: 2.5,
  terminal: 30,
  crouchHeight: 1.2,
  /** While airborne only tiny ledges are stepped (no climbing walls mid-jump). */
  airStep: 0.06,
  /**
   * The capsule narrows below the knees: solids whose top is under kneeHeight above the feet only
   * block a legRadius footprint (coffee tables, stair landings at shin height), so feet reach the
   * edge of low furniture and spiral-stair landings the torso clears.
   */
  kneeHeight: 0.55,
  legRadius: 0.16,
  mass: 75,
});

/**
 * Kinematic character controller (collide-and-slide on the 2.5D CollisionWorld):
 *   - horizontal motion is sub-stepped (≤ 0.4 × radius) and each step is pushed out of blocking
 *     solids along their normals, which slides the capsule along walls; the velocity component into
 *     every contact normal is clipped so no speed builds up against a wall;
 *   - step-up: a surface within stepUp is climbed if there is headroom at the new height;
 *   - slope limit: planar walkables steeper than maxSlope are not climbed and slide the character down;
 *   - snap-to-ground: while grounded, a surface up to snapDown below is followed (stairs, ramps down);
 *   - gravity, jumping with coyote time and an input buffer, head bumps, landing impact speed.
 * Positions are feet positions; y is exact (the controller smooths the visual root, not the body).
 */
export class CharacterMotor {
  constructor(collision, { x = 0, y = 0, z = 0, ...opts } = {}) {
    this.collision = collision;
    this.cfg = { ...PLAYER, ...MOTOR, ...opts };
    this.pos = { x, y, z };
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.height = this.cfg.height;
    this.radius = this.cfg.radius;
    this.grounded = false;
    this.surface = null;
    this.coyoteT = 0;
    this.bufferT = 0;
    this.airTime = 0;
    this.fallStartY = y;
    this.ignore = new Set();
    this.filter = (s) => !this.ignore.has(s);
    this.settle();
  }

  get jumpSpeed() {
    return Math.sqrt(2 * this.cfg.gravity * this.cfg.jumpHeight);
  }

  /** Places the feet at (x, y, z) and drops onto the surface below (within snapDown). */
  teleport(x, y, z) {
    Object.assign(this.pos, { x, y, z });
    this.vel.x = 0;
    this.vel.z = 0;
    this.vy = 0;
    this.settle();
    return this;
  }

  settle() {
    const g = this.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, this.cfg.stepUp);
    this.grounded = !!g && this.pos.y - g.y <= this.cfg.snapDown + 0.05;
    if (this.grounded) {
      this.pos.y = g.y;
      this.surface = g.surface;
    }
  }

  /** Can a capsule of `height` stand at (x, z, y) without overlapping a solid? */
  fits(x, z, y, height = this.height) {
    return this.collision.penetration(x, z, y, this.radius, height, this.cfg.kneeHeight, this.filter) < 1e-3
      && this.collision.penetration(x, z, y, this.cfg.legRadius, height, this.cfg.stepUp, this.filter) < 1e-3
      && !this.collision.ceiling(x, z, y + this.cfg.stepUp, y + height, this.radius, this.filter);
  }

  /** Crouch shrinks the capsule; standing back up needs headroom. Returns the resulting state. */
  setCrouch(on) {
    if (on) this.height = this.cfg.crouchHeight;
    else if (this.height !== this.cfg.height && this.fits(this.pos.x, this.pos.z, this.pos.y, this.cfg.height)) this.height = this.cfg.height;
    return this.height < this.cfg.height;
  }

  requestJump() {
    this.bufferT = this.cfg.buffer;
  }

  /**
   * Advances the body by the wished horizontal velocity (m/s). Returns
   * { grounded, jumped, landed (impact speed or null), left (walked off a ledge), contacts: Set<solid>,
   *   vx, vz (velocity actually achieved), stepped (height change from steps this tick) }.
   */
  step(dt, vx, vz) {
    const c = this.collision;
    const cfg = this.cfg;
    const p = this.pos;
    const out = { grounded: this.grounded, jumped: false, landed: null, left: false, contacts: new Set(), vx: 0, vz: 0, stepped: 0, fall: 0 };
    if (!(dt > 0)) return out;
    // Depenetrate first (teleports, a door or prop that ended up overlapping): not counted as velocity.
    this.depenetrate(out.contacts);
    const x0 = p.x;
    const z0 = p.z;

    this.bufferT -= dt;
    this.coyoteT = this.grounded ? cfg.coyote : this.coyoteT - dt;
    if (this.bufferT > 0 && this.coyoteT > 0 && this.fits(p.x, p.z, p.y + 0.02)) {
      this.vy = this.jumpSpeed;
      this.grounded = false;
      this.coyoteT = 0;
      this.bufferT = 0;
      this.fallStartY = p.y;
      out.jumped = true;
    }

    // Steep planes push the character downhill instead of holding it.
    if (this.grounded && c.slopeOf(this.surface) > cfg.maxSlope) {
      const { gx, gz } = this.surface.plane;
      const g = Math.hypot(gx, gz);
      vx -= (gx / g) * cfg.slideSpeed;
      vz -= (gz / g) * cfg.slideSpeed;
    }

    // Collide-and-slide: sub-step, push out along contact normals, clip velocity against them.
    let mx = vx * dt;
    let mz = vz * dt;
    const len = Math.hypot(mx, mz);
    const steps = Math.max(1, Math.ceil(len / (this.radius * 0.4)));
    for (let i = 0; i < steps; i++) {
      const remaining = steps - i;
      const sx = mx / remaining;
      const sz = mz / remaining;
      const q = { x: p.x + sx, y: p.y, z: p.z + sz };
      const normals = [];
      const stepUp = this.grounded ? cfg.stepUp : cfg.airStep;
      for (const s of c.resolve(q, this.radius, this.height, Math.max(stepUp, cfg.kneeHeight), this.filter, normals)) out.contacts.add(s);
      for (const s of c.resolve(q, cfg.legRadius, this.height, stepUp, this.filter, normals)) out.contacts.add(s);
      if (this.grounded) {
        const g = c.groundAt(q.x, q.z, p.y, cfg.stepUp);
        if (g && g.y > p.y + 1e-4) {
          const steep = c.slopeOf(g.surface) > cfg.maxSlope;
          if (steep || !this.fits(q.x, q.z, g.y)) {
            q.x = p.x;
            q.z = p.z;
          } else {
            out.stepped += g.y - p.y;
            q.y = g.y;
            this.surface = g.surface;
          }
        } else if (g && p.y - g.y <= cfg.snapDown) {
          out.stepped += g.y - p.y;
          q.y = g.y;
          this.surface = g.surface;
        }
      }
      // Remove the part of the remaining motion that pushes into the surfaces we touched.
      mx -= q.x - p.x;
      mz -= q.z - p.z;
      for (const [nx, nz] of normals) {
        const into = mx * nx + mz * nz;
        if (into < 0) {
          mx -= nx * into;
          mz -= nz * into;
        }
      }
      p.x = q.x;
      p.z = q.z;
      p.y = q.y;
    }

    // Vertical: snap to ground while grounded, otherwise gravity, head bumps and landing.
    if (this.grounded && !out.jumped) {
      const g = c.groundAt(p.x, p.z, p.y, cfg.stepUp);
      if (g && p.y - g.y <= cfg.snapDown + 1e-6) {
        out.stepped += g.y - p.y;
        p.y = g.y;
        this.vy = 0;
        this.surface = g.surface;
      } else {
        this.grounded = false;
        this.vy = 0;
        this.fallStartY = p.y;
        out.left = true;
      }
    }
    if (!this.grounded) {
      this.airTime += dt;
      // Average of the old and new velocity: exact for constant gravity (true jump height at any dt).
      const vy0 = this.vy;
      this.vy = Math.max(-cfg.terminal, this.vy - cfg.gravity * dt);
      let ny = p.y + ((vy0 + this.vy) / 2) * dt;
      if (this.vy > 0 && c.ceiling(p.x, p.z, p.y + this.height, ny + this.height, this.radius, this.filter)) {
        this.vy = 0;
        ny = p.y;
      }
      if (this.vy <= 0) {
        const land = c.groundAt(p.x, p.z, p.y, 0);
        if (land && ny <= land.y) {
          out.landed = -this.vy;
          out.fall = this.fallStartY - land.y;
          ny = land.y;
          this.vy = 0;
          this.grounded = true;
          this.airTime = 0;
          this.surface = land.surface;
        }
      }
      p.y = ny;
      for (const s of c.resolve(p, this.radius, this.height, cfg.kneeHeight, this.filter)) out.contacts.add(s);
      for (const s of c.resolve(p, cfg.legRadius, this.height, cfg.airStep, this.filter)) out.contacts.add(s);
    } else {
      this.airTime = 0;
    }

    out.vx = (p.x - x0) / dt;
    out.vz = (p.z - z0) / dt;
    this.vel.x = out.vx;
    this.vel.z = out.vz;
    out.grounded = this.grounded;
    return out;
  }

  depenetrate(contacts = null) {
    const p = this.pos;
    for (const s of this.collision.resolve(p, this.radius, this.height, this.cfg.kneeHeight, this.filter)) contacts?.add(s);
    for (const s of this.collision.resolve(p, this.cfg.legRadius, this.height, this.cfg.stepUp, this.filter)) contacts?.add(s);
  }

  /** Distance to the nearest solid around the body at waist height (≤ max), for "tight space" checks. */
  clearance(max = 1.2) {
    let best = max;
    const o = [this.pos.x, this.pos.y + 0.9, this.pos.z];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      best = Math.min(best, this.collision.raycast(o, [Math.sin(a), 0, Math.cos(a)], max, this.filter));
    }
    return best;
  }

  /**
   * Keeps the body out of other capsules (NPCs): pushes it out along the line between centres.
   * Returns the bodies touched.
   */
  separate(bodies) {
    const touched = [];
    for (const b of bodies) {
      const dx = this.pos.x - b.x;
      const dz = this.pos.z - b.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + (b.radius ?? PLAYER.radius);
      if (d >= min || Math.abs((b.y ?? this.pos.y) - this.pos.y) > 1.2) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const q = { x: b.x + nx * min, y: this.pos.y, z: b.z + nz * min };
      this.collision.resolve(q, this.radius, this.height, this.cfg.stepUp, this.filter);
      this.pos.x = q.x;
      this.pos.z = q.z;
      touched.push(b);
    }
    return touched;
  }
}
