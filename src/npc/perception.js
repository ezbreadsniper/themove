import { STIMULI, decayRate } from './stimuli.js';

/**
 * Per-NPC senses and short-term memory.
 *
 *   sight     a primary cone (fov, sightRange) and a wider, shorter peripheral cone, scaled by the
 *             target's stealth (crouching, sprinting draws the eye), with line of sight through the
 *             collision world (`los(from, to)` → true when clear; distance-only when absent)
 *   hearing   loudness falls off linearly to radius × hearing; walls halve what gets through
 *   awareness a 0..1 meter on the player that rises with visibility and decays when unseen
 *             (Splinter Cell / Thief style), so a sneaking player is noticed late, a sprinting one early
 *   memory    stimuli with position, intensity and a half-life; the strongest drives investigation
 */
export const AWARENESS = { suspicious: 0.3, aware: 0.7 };
const EYE = 1.6;
const DEG = Math.PI / 180;

/**
 * Line of sight helper over CollisionWorld.raycast (exists in src/world/physics/collision.js): true
 * when nothing blocks the segment from → to (both {x, y, z}). Falls back to "always visible".
 */
export function makeLineOfSight(collision) {
  if (!collision || typeof collision.raycast !== 'function') return () => true;
  return (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return true;
    const hit = collision.raycast([from.x, from.y, from.z], [dx / len, dy / len, dz / len], len);
    return hit >= len - 0.25;
  };
}

export class Perception {
  constructor({ fov = 140, sightRange = 20, peripheral = 220, peripheralRange = 6, hearing = 1, los = () => true } = {}) {
    this.fov = fov;
    this.sightRange = sightRange;
    this.peripheral = peripheral;
    this.peripheralRange = peripheralRange;
    this.hearing = hearing;
    this.los = los;
    this.awareness = 0;
    this.visibility = 0;
    this.lastSeen = null;
    this.memories = [];
    this.time = 0;
  }

  /**
   * How well the NPC (eye at `self` + EYE, facing yaw) sees `target` right now: 0..1.
   * stealth: { crouch, sprint, light (0..1, default 1) }.
   */
  sight(self, facing, target, { crouch = false, sprint = false, light = 1 } = {}) {
    const dx = target.x - self.x;
    const dz = target.z - self.z;
    const dist = Math.hypot(dx, dz);
    const stealth = (crouch ? 0.55 : 1) * (sprint ? 1.25 : 1) * (0.35 + 0.65 * light);
    const range = this.sightRange * stealth;
    if (dist > range) return 0;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const cos = dist < 1e-4 ? 1 : (dx * fx + dz * fz) / dist;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
    let cone = 0;
    if (angle <= (this.fov / 2) * DEG) cone = 1;
    else if (angle <= (this.peripheral / 2) * DEG && dist < this.peripheralRange * stealth) cone = 0.45;
    else if (dist < 1.1) cone = 0.35; // someone right behind you is felt
    if (!cone) return 0;
    const eye = { x: self.x, y: (self.y ?? 0) + EYE, z: self.z };
    const chest = { x: target.x, y: (target.y ?? 0) + (crouch ? 0.8 : 1.3), z: target.z };
    if (!this.los(eye, chest)) return 0;
    const falloff = 1 - Math.max(0, (dist - range * 0.35) / (range * 0.65));
    return Math.max(0, Math.min(1, cone * falloff));
  }

  /** Updates the player awareness meter from this frame's visibility. */
  updateAwareness(vis, dt, targetPos) {
    this.visibility = vis;
    if (vis > 0) {
      // Close & clear: near-instant; far & peripheral: slow fill.
      this.awareness = Math.min(1, this.awareness + vis * vis * 2.2 * dt + (vis > 0.85 ? 0.5 * dt : 0));
      if (targetPos) this.lastSeen = { x: targetPos.x, y: targetPos.y ?? 0, z: targetPos.z, time: this.time };
    } else {
      this.awareness = Math.max(0, this.awareness - 0.08 * dt);
    }
    return this.awareness;
  }

  get level() {
    return this.awareness >= AWARENESS.aware ? 'aware' : this.awareness >= AWARENESS.suspicious ? 'suspicious' : 'unaware';
  }

  /** Heard loudness (0..1) of a sound at `pos` with base `radius`. */
  hear(self, pos, radius) {
    const r = radius * this.hearing;
    const d = Math.hypot(pos.x - self.x, pos.z - self.z);
    if (d >= r) return 0;
    let v = 1 - d / r;
    const ear = { x: self.x, y: (self.y ?? 0) + EYE, z: self.z };
    if (!this.los(ear, { x: pos.x, y: (pos.y ?? 0) + 1.2, z: pos.z })) v *= 0.5;
    return v;
  }

  /**
   * Senses a stimulus { type, pos, ... } given the NPC's position/facing and the source's
   * visibility (for sight stimuli). Returns the perceived intensity (0 = not sensed) and stores it.
   */
  sense(self, facing, stim, { visibility = null } = {}) {
    const def = STIMULI[stim.type];
    if (!def) return 0;
    let v = 0;
    const d = Math.hypot(stim.pos.x - self.x, stim.pos.z - self.z);
    if (def.sense === 'sound') v = this.hear(self, stim.pos, def.radius);
    else if (def.sense === 'touch') v = d <= def.radius ? 1 : 0;
    else {
      const vis = visibility ?? this.sight(self, facing, stim.pos, stim.stealth);
      v = d <= def.radius ? vis : 0;
    }
    v *= stim.scale ?? 1;
    if (v <= 0.01) return 0;
    this.remember({ type: stim.type, pos: { ...stim.pos }, intensity: v, source: stim.source ?? null, data: stim.data });
    return v;
  }

  remember(m) {
    const existing = this.memories.find((x) => x.type === m.type && x.source === m.source);
    if (existing) {
      existing.pos = m.pos;
      existing.intensity = Math.max(existing.intensity, m.intensity);
      existing.time = this.time;
      existing.data = m.data;
    } else {
      this.memories.push({ ...m, time: this.time });
    }
  }

  /** Strongest remembered stimulus, optionally only those with threat ≥ minThreat. */
  strongest(minThreat = 0) {
    let best = null;
    for (const m of this.memories) {
      const t = STIMULI[m.type].threat;
      if (t < minThreat) continue;
      const score = m.intensity * (0.3 + t);
      if (!best || score > best.score) best = { ...m, score };
    }
    return best;
  }

  recall(type) {
    return this.memories.find((m) => m.type === type) ?? null;
  }

  update(dt) {
    this.time += dt;
    for (const m of this.memories) m.intensity *= Math.exp(-decayRate(STIMULI[m.type].memory) * dt);
    this.memories = this.memories.filter((m) => m.intensity > 0.04);
  }
}
