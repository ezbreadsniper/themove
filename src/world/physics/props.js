import * as THREE from 'three';

/** Prop tuning: Coulomb friction against the floor, spin friction, sleep thresholds. */
export const PROP_PHYSICS = Object.freeze({ gravity: 18, friction: 0.55, spinFriction: 3.5, sleepSpeed: 0.03, sleepTime: 0.5, skin: 0.04, restitution: 0.1 });

const rect = (hx, hz) => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];

/**
 * Simple rigid props for a PS2-era world: boxes and upright cylinders that slide and spin on the
 * floor (yaw only, no tumbling), fall under gravity onto walkables, collide with the static world
 * and each other (positional), sleep when still, and are pushed by character capsules through
 * contact impulses (masses, lever arm → spin). Each prop registers a moving solid, so characters
 * collide with its real footprint. Deterministic: fixed math, no randomness.
 *
 * spec: { name, shape: 'box' | 'cylinder', size: [w, h, d] (box) or { radius, height } (cylinder),
 *   mass, pos: [x, y, z], yaw, object (THREE.Object3D to drive, optional) }
 */
export class PropSystem {
  constructor(collision, { dynamics = {}, scene = null } = {}) {
    this.collision = collision;
    this.scene = scene;
    this.props = [];
    for (const d of Object.values(dynamics)) if (d.data?.physical) this.add(fromDynamic(d));
  }

  add(spec) {
    const shape = spec.shape ?? 'box';
    const size = shape === 'cylinder'
      ? { radius: spec.size?.radius ?? 0.25, height: spec.size?.height ?? 0.6 }
      : { w: spec.size?.[0] ?? 0.5, h: spec.size?.[1] ?? 0.5, d: spec.size?.[2] ?? 0.5 };
    const p = {
      name: spec.name ?? `prop-${this.props.length}`,
      shape,
      size,
      mass: spec.mass ?? 15,
      x: spec.pos[0],
      y: spec.pos[1],
      z: spec.pos[2],
      yaw: spec.yaw ?? 0,
      vx: 0,
      vz: 0,
      vy: 0,
      w: 0,
      sleeping: false,
      still: 0,
      object: spec.object ?? null,
      offset: spec.offset ?? [0, 0, 0],
    };
    p.height = shape === 'cylinder' ? size.height : size.h;
    p.halfX = shape === 'cylinder' ? size.radius : size.w / 2;
    p.halfZ = shape === 'cylinder' ? size.radius : size.d / 2;
    /** Radius used against the static world (inscribed-ish; boxes are pushed back by their corners too). */
    p.radius = shape === 'cylinder' ? size.radius : Math.min(p.halfX, p.halfZ) * 0.95;
    p.inertia = shape === 'cylinder' ? 0.5 * p.mass * size.radius ** 2 : (p.mass * (size.w ** 2 + size.d ** 2)) / 12;
    p.solid = this.collision.addSolid({ poly: this.footprint(p), y0: p.y, y1: p.y + p.height, tag: 'prop', prop: p.name });
    this.sync(p);
    this.props.push(p);
    return p;
  }

  get(name) {
    return this.props.find((p) => p.name === name);
  }

  /** World XZ footprint polygon. */
  footprint(p) {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const local = p.shape === 'cylinder'
      ? Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * p.halfX, Math.sin((i / 8) * Math.PI * 2) * p.halfZ])
      : rect(p.halfX, p.halfZ);
    // Same convention as THREE rotation.y: x' = x cos + z sin, z' = -x sin + z cos.
    return local.map(([x, z]) => [p.x + x * c + z * s, p.z - x * s + z * c]);
  }

  /** Closest point of the footprint to (x, z) and whether (x, z) is inside. */
  closest(p, x, z) {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const lx = (x - p.x) * c - (z - p.z) * s;
    const lz = (x - p.x) * s + (z - p.z) * c;
    if (p.shape === 'cylinder') {
      const d = Math.hypot(lx, lz) || 1e-6;
      const k = Math.min(1, p.halfX / d);
      const qx = lx * k;
      const qz = lz * k;
      return { x: p.x + qx * c + qz * s, z: p.z - qx * s + qz * c, inside: d < p.halfX };
    }
    const qx = THREE.MathUtils.clamp(lx, -p.halfX, p.halfX);
    const qz = THREE.MathUtils.clamp(lz, -p.halfZ, p.halfZ);
    return { x: p.x + qx * c + qz * s, z: p.z - qx * s + qz * c, inside: Math.abs(lx) < p.halfX && Math.abs(lz) < p.halfZ };
  }

  /** Character capsule pushing a prop: impulse along the contact normal with lever-arm spin. */
  push(p, b) {
    const by = b.y ?? p.y;
    if (by > p.y + p.height || by + (b.height ?? 1.8) < p.y) return false;
    const radius = b.radius ?? 0.3;
    const q = this.closest(p, b.x, b.z);
    let nx = b.x - q.x;
    let nz = b.z - q.z;
    const dist = Math.hypot(nx, nz);
    if (q.inside || dist > radius + PROP_PHYSICS.skin) return false;
    nx /= dist || 1;
    nz /= dist || 1;
    // Contact point relative to the prop centre; prop point velocity includes spin.
    const rx = q.x - p.x;
    const rz = q.z - p.z;
    const pvx = p.vx + p.w * rz;
    const pvz = p.vz - p.w * rx;
    const vrel = -(((b.vx ?? 0) - pvx) * nx + ((b.vz ?? 0) - pvz) * nz);
    if (vrel <= 0.02) return false;
    // Impulse direction on the prop: -n. Angular term: (r × n)² / I (yaw about +Y: τ = rz·Fx − rx·Fz).
    const rxn = rz * -nx - rx * -nz;
    const mb = b.mass ?? 75;
    const j = vrel / (1 / mb + 1 / p.mass + (rxn * rxn) / p.inertia);
    p.vx += (-nx * j) / p.mass;
    p.vz += (-nz * j) / p.mass;
    p.w += (rxn * j) / p.inertia;
    p.sleeping = false;
    p.still = 0;
    return true;
  }

  /** Steps all props against the static world and the given capsule bodies. Returns props touched by bodies. */
  update(dt, bodies = []) {
    const touched = [];
    const P = PROP_PHYSICS;
    for (const p of this.props) {
      for (const b of bodies) if (this.push(p, b)) touched.push({ prop: p.name, by: b.id ?? null });
      if (p.sleeping) continue;
      const filter = (s) => s !== p.solid;
      // Floor friction (Coulomb): decelerate by μg, never reversing.
      const speed = Math.hypot(p.vx, p.vz);
      const grounded = p.vy === 0;
      if (speed > 0 && grounded) {
        const k = Math.max(0, speed - P.friction * P.gravity * dt) / speed;
        p.vx *= k;
        p.vz *= k;
      }
      p.w *= Math.exp(-P.spinFriction * dt);
      const target = { x: p.x + p.vx * dt, y: p.y, z: p.z + p.vz * dt };
      // Static world and other props (positional). The prop climbs nothing: stepUp is tiny.
      this.collision.resolve(target, p.radius, p.height, 0.02, filter);
      for (const b of bodies) {
        const dx = target.x - b.x;
        const dz = target.z - b.z;
        const d = Math.hypot(dx, dz);
        const min = p.radius + (b.radius ?? 0.3);
        if (d < min && d > 1e-6) {
          target.x = b.x + (dx / d) * min;
          target.z = b.z + (dz / d) * min;
        }
      }
      const cx = target.x - (p.x + p.vx * dt);
      const cz = target.z - (p.z + p.vz * dt);
      const corr = Math.hypot(cx, cz);
      if (corr > 1e-6) {
        // Kill the velocity into whatever pushed us back (slight bounce).
        const nx = cx / corr;
        const nz = cz / corr;
        const vn = p.vx * nx + p.vz * nz;
        if (vn < 0) {
          p.vx -= (1 + P.restitution) * vn * nx;
          p.vz -= (1 + P.restitution) * vn * nz;
        }
      }
      p.x = target.x;
      p.z = target.z;
      p.yaw += p.w * dt;
      // Gravity onto the highest walkable at or below the prop's base.
      const g = this.collision.groundAt(p.x, p.z, p.y + 0.05, 0.05);
      const floor = g ? g.y : -Infinity;
      if (p.y > floor + 1e-4 || p.vy > 0) {
        p.vy -= P.gravity * dt;
        p.y += p.vy * dt;
        if (p.y <= floor) {
          p.y = floor;
          p.vy = 0;
        }
      } else {
        p.y = floor;
        p.vy = 0;
      }
      const moving = Math.hypot(p.vx, p.vz) > P.sleepSpeed || Math.abs(p.w) > P.sleepSpeed || p.vy !== 0;
      p.still = moving ? 0 : p.still + dt;
      if (p.still > P.sleepTime) {
        p.sleeping = true;
        p.vx = 0;
        p.vz = 0;
        p.w = 0;
      }
      this.collision.updateSolid(p.solid, this.footprint(p), p.y, p.y + p.height);
      this.sync(p);
    }
    return touched;
  }

  sync(p) {
    if (!p.object) return;
    p.object.position.set(p.x + p.offset[0], p.y + p.offset[1], p.z + p.offset[2]);
    p.object.rotation.y = p.yaw;
  }
}

/**
 * A physical dynamic from the world kit (D marks props with kit.physical(group, { shape, mass })).
 * Size comes from data.physical.size when given, else from the group's bounding box.
 */
function fromDynamic(d) {
  const phys = d.data.physical === true ? {} : d.data.physical;
  const group = d.group;
  let size = phys.size;
  let offset = [0, 0, 0];
  const pos = new THREE.Vector3();
  if (group) {
    group.updateMatrixWorld(true);
    pos.copy(group.position);
    if (!size) {
      const box = new THREE.Box3().setFromObject(group);
      const s = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      size = phys.shape === 'cylinder' ? { radius: Math.max(s.x, s.z) / 2, height: s.y } : [s.x, s.y, s.z];
      offset = [group.position.x - c.x, group.position.y - box.min.y, group.position.z - c.z];
      pos.set(c.x, box.min.y, c.z);
    }
  } else if (d.pivotMatrix) {
    pos.setFromMatrixPosition(d.pivotMatrix);
  }
  const yaw = group ? group.rotation.y : 0;
  return { name: d.name, shape: phys.shape ?? 'box', size, mass: phys.mass ?? 15, pos: pos.toArray(), yaw, object: group, offset };
}
