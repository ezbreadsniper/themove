/**
 * Tiny synchronous event bus (EventTarget-like) for gameplay and perception events.
 * Listeners receive the payload object; `type` is added to it. Payloads are plain data, so NPC
 * perception (workstream B) can read positions without touching the player's objects.
 *
 * Perception events: player:fire {pos, weapon, target}, player:aim {target, weapon}, player:draw {weapon},
 * player:holster, player:sprint, player:crouch {on}, player:interact {id, kind}, player:collide {who},
 * player:melee {pos}, plus world events door:latch / door:rattle / door:open {door}.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
    this.log = [];
    this.logLimit = 200;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }

  once(type, fn) {
    const off = this.on(type, (e) => {
      off();
      fn(e);
    });
    return off;
  }

  emit(type, payload = {}) {
    const event = { ...payload, type };
    this.log.push(event);
    if (this.log.length > this.logLimit) this.log.shift();
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
    for (const fn of [...(this.listeners.get('*') ?? [])]) fn(event);
    return event;
  }

  // EventTarget-style aliases (listeners still receive the payload object).
  addEventListener(type, fn) {
    this.on(type, fn);
  }

  removeEventListener(type, fn) {
    this.off(type, fn);
  }

  dispatchEvent(event) {
    this.emit(event.type, event.detail ?? event);
    return true;
  }

  /** Recent events of a type (tests and debugging). */
  recent(type) {
    return this.log.filter((e) => e.type === type);
  }
}
