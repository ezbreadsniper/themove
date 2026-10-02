/**
 * Locomotion steering (Reynolds-style seek / arrive / flee plus wall feelers and separation) over
 * the collision world. All vectors are plain { x, z } on the ground plane; the NPC integrates the
 * desired velocity with an acceleration limit and moves through CollisionWorld.move (walls slide,
 * steps climb, the ground is followed) when a collision world is available.
 */
export const SPEEDS = { walk: 1.35, run: 3.4, sprint: 5.2 };
const FEELER_ANGLES = [0, 0.6, -0.6, 1.2, -1.2];

const len = (v) => Math.hypot(v.x, v.z);
const scale = (v, s) => ({ x: v.x * s, z: v.z * s });
const norm = (v) => {
  const l = len(v);
  return l > 1e-6 ? { x: v.x / l, z: v.z / l } : { x: 0, z: 0 };
};

export function seek(pos, target, speed) {
  return scale(norm({ x: target.x - pos.x, z: target.z - pos.z }), speed);
}

/** Seek that slows inside `slow` metres and stops within `stop`. */
export function arrive(pos, target, speed, { slow = 1.6, stop = 0.25 } = {}) {
  const d = { x: target.x - pos.x, z: target.z - pos.z };
  const dist = len(d);
  if (dist <= stop) return { x: 0, z: 0 };
  const s = dist < slow ? speed * Math.max(0.3, (dist - stop) / (slow - stop)) : speed;
  return scale(norm(d), s);
}

export function flee(pos, threat, speed) {
  return scale(norm({ x: pos.x - threat.x, z: pos.z - threat.z }), speed);
}

/**
 * Wall avoidance with feeler rays at waist height: a blocked heading is bent toward the clearest
 * neighbouring feeler. `raycast(o, d, max)` is CollisionWorld.raycast (array args).
 */
export function avoidWalls(pos, desired, raycast, { lookahead = 1.6, y = 0.9 } = {}) {
  const speed = len(desired);
  if (!raycast || speed < 1e-3) return desired;
  const heading = Math.atan2(desired.x, desired.z);
  let best = null;
  for (const a of FEELER_ANGLES) {
    const h = heading + a;
    const dir = [Math.sin(h), 0, Math.cos(h)];
    const free = raycast([pos.x, (pos.y ?? 0) + y, pos.z], dir, lookahead);
    // Prefer straight ahead; a feeler must be clearly freer to win.
    const score = free - Math.abs(a) * 0.35;
    if (!best || score > best.score) best = { h, free, score };
    if (a === 0 && free >= lookahead - 1e-3) return desired;
  }
  const slow = best.free < 0.45 ? Math.max(0.2, best.free / 0.45) : 1;
  return { x: Math.sin(best.h) * speed * slow, z: Math.cos(best.h) * speed * slow };
}

/** Pushes away from neighbours closer than `radius` (other NPCs, the player). */
export function separation(pos, others, radius = 0.9) {
  const out = { x: 0, z: 0 };
  for (const o of others) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4 || d > radius) continue;
    const w = (radius - d) / radius;
    out.x += (dx / d) * w;
    out.z += (dz / d) * w;
  }
  return out;
}

/**
 * Picks a flee heading: samples directions around "away from threat" and keeps the one with the
 * longest clear run (weighted toward straight away). Returns a target point.
 */
export function fleeTarget(pos, threat, raycast, { distance = 14, samples = 9 } = {}) {
  const away = Math.atan2(pos.x - threat.x, pos.z - threat.z);
  let best = null;
  for (let i = 0; i < samples; i++) {
    const a = away + ((i / (samples - 1)) - 0.5) * Math.PI * 1.3;
    const dir = [Math.sin(a), 0, Math.cos(a)];
    const free = raycast ? raycast([pos.x, (pos.y ?? 0) + 0.9, pos.z], dir, distance) : distance;
    const score = free * (0.6 + 0.4 * Math.cos(a - away));
    if (!best || score > best.score) best = { a, free, score };
  }
  const run = Math.max(1.5, best.free - 0.6);
  return { x: pos.x + Math.sin(best.a) * run, z: pos.z + Math.cos(best.a) * run, clear: best.free };
}

export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Turns `facing` toward `target` yaw at `rate` (1/s, exponential). */
export function turnToward(facing, target, rate, dt) {
  return facing + wrapAngle(target - facing) * Math.min(1, rate * dt);
}

export { len as vlen, norm as vnorm };
