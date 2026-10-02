import * as THREE from 'three';
import { bakeClip, CLIP_NAMES } from '../anim/clips.js';
import { updateCorrectives } from '../garment/correctives.js';

/**
 * Fallback death (used only while the NPC manager has no `damage`, contracts §6): the body leaves
 * the NPC update loop, turns so it falls away from the shot into free floor space, blends into the
 * shared `death` clip (buckle, fall onto the back) and holds its last frame on the floor.
 */
export const COLLAPSE = Object.freeze({
  /** The death clip ends lying along the body's local -Z (it falls backwards). */
  fallLocal: -1,
  /** Lying body length (m) that must be free floor. */
  length: 1.75,
  turnTime: 0.3,
  blend: 0.12,
});

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Picks the fall heading (unit XZ direction the body will lie along): the shot direction if the
 * floor there is free for a body length, else the nearest free heading. clear(x, z) → bool.
 */
export function fallHeading(dir, clear, length = COLLAPSE.length) {
  const base = Math.atan2(dir.x, dir.z);
  const offsets = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.6, -2.6, Math.PI];
  for (const o of offsets) {
    const a = base + o;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    let ok = true;
    for (let s = 0.35; s <= length + 1e-6; s += 0.35) if (!clear(sx * s, sz * s)) ok = false;
    if (ok) return a;
  }
  return base;
}

export class FallbackCorpses {
  constructor({ manager = null, collision = null, scene = null } = {}) {
    this.manager = manager;
    this.collision = collision;
    this.scene = scene;
    this.list = [];
  }

  /** Free floor at (x, z) for a lying body at floor height y. */
  clearAt(x, z, y) {
    const c = this.collision;
    if (!c) return true;
    const g = c.groundAt(x, z, y + 0.1, 0.2);
    if (!g || Math.abs(g.y - y) > 0.06) return false;
    return c.penetration(x, z, y, 0.16, 0.5, 0.04) <= 0;
  }

  ensureClip(npc, name) {
    if (npc.clips?.[name]) return true;
    const layout = npc.character?.userData?.layout;
    if (!layout || !CLIP_NAMES.includes(name)) return false;
    npc.clips[name] = bakeClip(layout, name);
    return true;
  }

  /** Collapses an NPC (B's Npc or anything with pos / facing / holder / animator). */
  kill(npc, { dir = new THREE.Vector3(0, 0, 1), at = null } = {}) {
    if (this.list.some((c) => c.npc === npc)) return;
    const m = this.manager;
    if (m?.npcs) m.npcs = m.npcs.filter((n) => n !== npc);
    npc.dead = true;
    npc.stop?.();
    if (npc.velocity) npc.velocity = { x: 0, z: 0 };
    if (at) Object.assign(npc.pos, { x: at.x, y: at.y, z: at.z });
    const y = npc.pos.y;
    const flat = new THREE.Vector3(dir.x, 0, dir.z);
    if (flat.lengthSq() < 1e-6) flat.set(Math.sin(npc.facing ?? 0), 0, Math.cos(npc.facing ?? 0));
    flat.normalize();
    const heading = fallHeading(flat, (dx, dz) => this.clearAt(npc.pos.x + dx, npc.pos.z + dz, y));
    // Falls backwards: the back faces the heading.
    const target = COLLAPSE.fallLocal < 0 ? heading + Math.PI : heading;
    const corpse = { npc, from: npc.facing ?? 0, to: target, t: 0, heading };
    const a = npc.animator;
    if (a && this.ensureClip(npc, 'death')) {
      a.setGround?.(null);
      if (a.upper) a.upper.fadeOut(COLLAPSE.blend);
      a.upper = null;
      a.upperName = null;
      a.upperIdle = null;
      a.locked = null;
      a.queued = null;
      if (a.full) a.full.fadeOut(COLLAPSE.blend);
      a.full = null;
      for (const act of Object.values(a.aimActions ?? {})) act.setEffectiveWeight(0);
      const death = a.action('death', 'full');
      a.swap(a.base, death, COLLAPSE.blend, { loop: false });
      a.base = death;
      a.baseName = 'death';
    }
    npc.lookAt?.setTarget?.(null);
    if (npc.phone) npc.phone.visible = false;
    this.list.push(corpse);
    return corpse;
  }

  update(dt) {
    for (const c of this.list) {
      c.t += dt;
      const npc = c.npc;
      const k = Math.min(1, c.t / COLLAPSE.turnTime);
      npc.facing = c.from + wrap(c.to - c.from) * (k * k * (3 - 2 * k));
      if (npc.holder) {
        npc.holder.position.set(npc.pos.x, npc.pos.y, npc.pos.z);
        npc.holder.rotation.y = npc.facing;
      }
      if (c.t < 3 && npc.animator) {
        npc.animator.update(dt);
        if (npc.character) updateCorrectives(npc.character);
      }
    }
  }

  get bodies() {
    return this.list.map((c) => c.npc);
  }
}
