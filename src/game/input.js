/**
 * Keyboard + mouse → the controller's input object (see CharacterController). Held states are read
 * each frame from the pressed-key set; one-frame actions (jump, interact, reload, ...) are edge flags
 * set on key-down and cleared by consume() after the game step reads them. In scripted mode (tests)
 * the key set is ignored and callers write the input object directly.
 *
 * Bindings: WASD run (the default gait) · Alt held or CapsLock toggle walk · Shift sprint (outdoors) ·
 * C / Ctrl crouch (toggle) · Space jump · E interact · F / RMB aim · LMB fire (hip-aims when not
 * aiming; held = full auto on automatic guns) · R reload · 1 pistol / 2 SMG / 3 rifle (only once
 * owned, see Loadout), 0 holster · Q / MMB shoulder swap · X inspect · V melee · G smoke.
 * Mouse look uses pointer lock (click the view); without the lock, dragging looks around.
 */
export const BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], walk: ['AltLeft', 'AltRight'], aim: ['KeyF'],
});

import { Loadout } from '../combat/loadout.js';

const EDGES = ['jump', 'interact', 'reload', 'inspect', 'melee', 'smoke', 'shoulder'];

export function createInput() {
  return {
    move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0,
    sprint: false, walk: false, crouch: false, aim: false, fire: false, weapon: null, indoor: false, target: null,
    jump: false, interact: false, reload: false, inspect: false, melee: false, smoke: false, shoulder: false,
  };
}

/**
 * Stick from the held keys: full deflection (run) by default, half (walk) while Alt is held or the
 * CapsLock toggle is on; sprint only when not walking.
 */
export function moveFromKeys(keys, { walkToggle = false } = {}) {
  const k = (list) => list.some((c) => keys.has(c));
  let x = (k(BINDINGS.left) ? 1 : 0) - (k(BINDINGS.right) ? 1 : 0);
  let z = (k(BINDINGS.forward) ? 1 : 0) - (k(BINDINGS.back) ? 1 : 0);
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  const walk = k(BINDINGS.walk) !== walkToggle;
  const scale = walk ? 0.5 : 1;
  return { x: x * scale, z: z * scale, walk, sprint: k(BINDINGS.sprint) && !walk };
}

export class GameInput {
  constructor(element, { onLook = null, loadout = new Loadout() } = {}) {
    this.loadout = loadout;
    this.element = element;
    this.state = createInput();
    this.keys = new Set();
    this.mouse = { left: false, right: false };
    this.walkToggle = false;
    this.scripted = false;
    this.onLook = onLook;
    this.sensitivity = 0.0024;
    this.bind();
  }

  get locked() {
    return document.pointerLockElement === this.element;
  }

  bind() {
    const s = this.state;
    const typing = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName);
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (['Space', 'AltLeft', 'AltRight', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.scripted) return;
      if (e.code === 'Space') s.jump = true;
      if (e.code === 'KeyE') s.interact = true;
      if (e.code === 'KeyR') s.reload = true;
      if (e.code === 'KeyX') s.inspect = true;
      if (e.code === 'KeyV') s.melee = true;
      if (e.code === 'KeyG') s.smoke = true;
      if (e.code === 'KeyQ') s.shoulder = true;
      if (e.code === 'KeyC' || e.code === 'ControlLeft') s.crouch = !s.crouch;
      if (e.code === 'CapsLock') this.walkToggle = !this.walkToggle;
      const pick = this.loadout.select(e.code);
      if (pick !== undefined) s.weapon = pick;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = false;
      this.mouse.right = false;
    });
    const el = this.element;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (!this.locked && e.button === 0 && el.requestPointerLock) {
        try {
          el.requestPointerLock()?.catch?.(() => {});
        } catch { /* headless / unsupported */ }
      }
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      if (e.button === 1) {
        s.shoulder = true;
        e.preventDefault();
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked && !e.buttons) return;
      this.onLook?.(-e.movementX * this.sensitivity, e.movementY * this.sensitivity);
    });
  }

  /** Held states from the key set (skipped in scripted mode). */
  read() {
    if (this.scripted) return this.state;
    const s = this.state;
    const k = (list) => list.some((c) => this.keys.has(c));
    const m = moveFromKeys(this.keys, { walkToggle: this.walkToggle });
    s.walk = m.walk;
    s.move.x = m.x;
    s.move.z = m.z;
    s.sprint = m.sprint;
    s.aim = k(BINDINGS.aim) || this.mouse.right || (this.mouse.left && !!s.weapon);
    s.fire = this.mouse.left;
    return s;
  }

  consume() {
    for (const e of EDGES) this.state[e] = false;
  }
}
