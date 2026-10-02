import * as THREE from 'three';
import { pointInPoly } from '../physics/collision.js';
import { fallbackInteractables } from './fallback.js';

export { fallbackInteractables } from './fallback.js';

/** Focus tuning. */
export const FOCUS = Object.freeze({
  /** Default prompt radius (m) and the widest view angle that still focuses something (deg). */
  radius: 1.4,
  maxAngle: 75,
  /** Score = distance + angle (rad) × this: prefers what the camera points at over what is closest. */
  angleWeight: 1.1,
  /** Vertical reach between the player's waist and the item (m). */
  reach: 1.7,
  /** Line-of-sight slack: an obstruction this close to the item doesn't count (its own furniture). */
  losSlack: 0.35,
  /** A focused item keeps focus over a rival unless the rival scores this much better (anti-flicker). */
  hysteresis: 0.15,
});

const VERBS = { seat: 'Sit', switch: 'Use', lamp: 'Use', door: 'Open', tv: 'Use', item: 'Pick up', container: 'Open', npc: 'Talk' };

/**
 * Interaction: picks the focused interactable (distance + camera angle + line of sight), supplies its
 * HUD prompt and runs the handler for its kind. Interactables follow contracts §2; `addSource(fn)`
 * adds dynamic ones (NPCs) polled every frame.
 *
 * ctx for interact(): { controller, collision, doors, world, events, dialogue, makeSeat(item) }.
 */
export class InteractionSystem {
  constructor({ world = null, items = null, collision = world?.collision, doors = world?.doors, events = null } = {}) {
    this.world = world;
    this.collision = collision;
    this.doors = doors;
    this.events = events;
    this.items = items ?? (world ? fallbackInteractables(world) : []);
    for (const item of this.items) item.state ??= { on: item.data?.on ?? true };
    this.sources = [];
    this.focused = null;
    this.handlers = {
      seat: (item, ctx) => this.useSeat(item, ctx),
      door: (item, ctx) => this.doors?.toggle(item.data?.door, ctx.from) ?? null,
      switch: (item) => this.toggleLights(item),
      lamp: (item) => this.toggleLights(item),
      tv: (item) => this.toggleLights(item),
      item: (item, ctx) => this.pickUp(item, ctx),
      container: (item) => {
        item.state.open = !item.state.open;
        return item.state.open ? 'open' : 'closed';
      },
      npc: (item, ctx) => {
        const npc = item.data?.npc ?? item.npc;
        if (ctx.dialogue && npc) ctx.dialogue.start(npc, item.data?.tree ?? npc.tree ?? 'default');
        return npc ? 'talk' : null;
      },
    };
  }

  addSource(fn) {
    this.sources.push(fn);
  }

  all() {
    const dynamic = this.sources.flatMap((fn) => {
      try {
        return fn() ?? [];
      } catch {
        return [];
      }
    });
    return dynamic.length ? [...this.items, ...dynamic] : this.items;
  }

  /** HUD verb for an item, reflecting its state (door open / locked, lamp on). */
  prompt(item) {
    if (!item) return '';
    if (item.kind === 'door') {
      const d = this.doors?.get(item.data?.door);
      if (d?.locked) return 'Locked';
      if (d && this.doors.isOpen(d)) return 'Close';
      return item.prompt ?? 'Open';
    }
    if (item.kind === 'lamp' || item.kind === 'switch' || item.kind === 'tv') return item.prompt ?? (item.state.on ? 'Turn off' : 'Turn on');
    return item.prompt ?? VERBS[item.kind] ?? 'Use';
  }

  /** Point used for focus distance and line of sight. */
  anchor(item) {
    const p = new THREE.Vector3(...item.pos);
    if (item.kind === 'door') {
      const d = this.doors?.get(item.data?.door);
      if (d) p.set(d.centre.x, d.centre.y + 1.05, d.centre.z);
    }
    return p;
  }

  /**
   * Best item for a player at `feet` (Vector3) looking along `view` (Vector3, camera forward) from
   * `eye`. Returns the item (also stored in this.focused) or null.
   */
  focus(feet, eye, view) {
    const fwd = new THREE.Vector2(view.x, view.z);
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 1);
    fwd.normalize();
    let best = null;
    let bestScore = Infinity;
    let currentScore = Infinity;
    for (const item of this.all()) {
      if (item.state?.taken || item.enabled === false) continue;
      const p = this.anchor(item);
      const dx = p.x - feet.x;
      const dz = p.z - feet.z;
      const dist = Math.hypot(dx, dz);
      if (dist > (item.radius ?? FOCUS.radius)) continue;
      if (Math.abs(p.y - (feet.y + 0.9)) > FOCUS.reach) continue;
      const dir = new THREE.Vector2(dx, dz).normalize();
      const angle = dist < 0.35 ? 0 : Math.acos(THREE.MathUtils.clamp(dir.dot(fwd), -1, 1));
      if (THREE.MathUtils.radToDeg(angle) > FOCUS.maxAngle) continue;
      if (!this.visible(item, p, eye)) continue;
      const score = dist + angle * FOCUS.angleWeight;
      if (item === this.focused) currentScore = score;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (this.focused && best !== this.focused && currentScore < bestScore + FOCUS.hysteresis) best = this.focused;
    this.focused = best;
    return best;
  }

  /** Line of sight from the eye to the item, ignoring the item's own door leaf / furniture. */
  visible(item, p, eye) {
    if (!this.collision) return true;
    const target = item.kind === 'seat' ? p.clone().add(new THREE.Vector3(0, 0.5, 0)) : p;
    const d = target.clone().sub(eye);
    const len = d.length();
    if (len < 1e-3) return true;
    d.divideScalar(len);
    const door = item.kind === 'door' ? item.data?.door : null;
    const filter = (s) => !(door && s.door === door) && !(pointInPoly(target.x, target.z, s.poly) && target.y >= s.y0 - 0.05 && target.y <= s.y1 + 0.05);
    return this.collision.raycast(eye.toArray(), d.toArray(), len, filter) >= len - FOCUS.losSlack;
  }

  /** Runs the focused (or given) item's handler. Returns { item, result } or null. */
  interact(ctx, item = this.focused) {
    if (!item) return null;
    const handler = this.handlers[item.kind];
    const result = handler ? handler(item, ctx) : null;
    this.events?.emit('player:interact', { id: item.id, kind: item.kind, result });
    return { item, result };
  }

  useSeat(item, ctx) {
    if (!ctx.controller || !ctx.makeSeat) return null;
    return ctx.controller.sit(ctx.makeSeat(item)) ? 'sit' : null;
  }

  toggleLights(item) {
    const on = !item.state.on;
    item.state.on = on;
    for (const name of item.data?.lights ?? []) {
      if (typeof this.world?.setLight === 'function') this.world.setLight(name, on);
      else this.world?.group?.traverse((o) => { if (o.isLight && o.name === name) o.visible = on; });
    }
    return on ? 'on' : 'off';
  }

  pickUp(item, ctx) {
    item.state.taken = true;
    if (item.data?.object) item.data.object.visible = false;
    ctx.controller?.playGesture?.(ctx.controller.pick('pickUp', 'pickup'));
    this.events?.emit('player:pickup', { id: item.id, item: item.data?.item ?? item.id });
    return 'taken';
  }
}
