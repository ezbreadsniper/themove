/**
 * Tiny event bus with the `on / off / emit` shape the game's bus uses (src/game/events.js), plus an
 * adapter so the NPC layer can listen to whatever bus the host passes in:
 *   - anything with on(type, fn) / emit(type, payload)  (the game's bus, this class)
 *   - a DOM-style EventTarget (addEventListener / dispatchEvent with CustomEvent.detail)
 *   - nothing → a private EventBus (the demo and tests drive it directly)
 */
export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  /** Subscribes; returns an unsubscribe function. `*` receives every event as (type, payload). */
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload = {}) {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn(payload, type);
    for (const fn of [...(this.handlers.get('*') ?? [])]) fn(payload, type);
  }
}

/**
 * Wraps a host bus into { on(type, fn) → off, emit(type, payload) }. The returned object is what the
 * NPC layer talks to; `source` is never modified.
 */
export function connectBus(source) {
  if (!source) return new EventBus();
  if (source instanceof EventBus) return source;
  if (typeof source.on === 'function' && typeof source.emit === 'function') {
    return {
      source,
      on(type, fn) {
        const res = source.on(type, fn);
        return typeof res === 'function' ? res : () => source.off?.(type, fn);
      },
      emit: (type, payload = {}) => source.emit(type, payload),
    };
  }
  if (typeof source.addEventListener === 'function') {
    return {
      source,
      on(type, fn) {
        const h = (e) => fn(e.detail ?? {}, type);
        source.addEventListener(type, h);
        return () => source.removeEventListener(type, h);
      },
      emit(type, payload = {}) {
        const Ev = globalThis.CustomEvent;
        if (Ev) source.dispatchEvent(new Ev(type, { detail: payload }));
      },
    };
  }
  throw new Error('connectBus: expected an object with on/emit or addEventListener/dispatchEvent');
}

/** Player events the NPC layer listens for (integration contract §4). */
export const PLAYER_EVENTS = ['player:fire', 'player:aim', 'player:draw', 'player:holster', 'player:sprint', 'player:crouch', 'player:interact', 'player:collide', 'player:melee'];
