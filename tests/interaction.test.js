import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { CollisionWorld } from '../src/world/physics/collision.js';
import { CharacterMotor } from '../src/world/physics/kcc.js';
import { InteractionSystem, FOCUS } from '../src/world/interaction/index.js';
import { fallbackInteractables } from '../src/world/interaction/fallback.js';
import { EventBus } from '../src/game/events.js';
import { buildCharacter } from '../src/character/build.js';
import { bakeAllClips } from '../src/anim/clips.js';
import { CharacterController } from '../src/game/character-controller.js';
import { SeatAction, seatSpec } from '../src/game/seat.js';

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const FLOOR = { poly: rect(-20, -20, 20, 20), y: 0 };
const feet = new THREE.Vector3(0, 0, 0);
const eye = new THREE.Vector3(0, 1.6, 0);
const ahead = new THREE.Vector3(0, -0.2, 1);
const item = (id, kind, pos, extra = {}) => ({ id, kind, pos, yaw: 0, radius: 1.4, prompt: null, data: {}, ...extra });

describe('interaction focus', () => {
  test('picks what the camera points at over what is merely closest', () => {
    const sys = new InteractionSystem({ items: [item('front', 'switch', [0.1, 1.2, 1.1]), item('side', 'switch', [0.85, 1.2, 0.2])], collision: new CollisionWorld({ walkables: [FLOOR] }) });
    expect(sys.focus(feet, eye, ahead)?.id).toBe('front');
    expect(sys.focus(feet, eye, new THREE.Vector3(1, 0, 0.2))?.id).toBe('side');
  });

  test('ignores items out of range, behind the player, out of reach vertically or behind a wall', () => {
    const wall = { poly: rect(-2, 0.6, 2, 0.8), y0: 0, y1: 3 };
    const items = [
      item('far', 'switch', [0, 1.2, 2.5]),
      item('behind', 'switch', [0, 1.2, -1]),
      item('upstairs', 'switch', [0.2, 4.2, 0.8]),
    ];
    const open = new InteractionSystem({ items, collision: new CollisionWorld({ walkables: [FLOOR] }) });
    expect(open.focus(feet, eye, ahead)).toBe(null);
    const hidden = new InteractionSystem({ items: [item('hidden', 'switch', [0, 1.2, 1.2])], collision: new CollisionWorld({ solids: [wall], walkables: [FLOOR] }) });
    expect(hidden.focus(feet, eye, ahead)).toBe(null);
    const seen = new InteractionSystem({ items: [item('seen', 'switch', [0, 1.2, 1.2])], collision: new CollisionWorld({ walkables: [FLOOR] }) });
    expect(seen.focus(feet, eye, ahead)?.id).toBe('seen');
  });

  test('a seat inside its own sofa collider is still in view; focus is sticky between near-equal rivals', () => {
    const sofa = { poly: rect(-1, 0.5, 1, 1.4), y0: 0, y1: 0.78, tag: 'sofa' };
    const seats = [item('s1', 'seat', [-0.3, 0.45, 0.95]), item('s2', 'seat', [0.3, 0.45, 0.95])];
    const sys = new InteractionSystem({ items: seats, collision: new CollisionWorld({ solids: [sofa], walkables: [FLOOR] }) });
    const first = sys.focus(feet, eye, new THREE.Vector3(-0.02, 0, 1));
    expect(first).not.toBe(null);
    const other = first.id === 's1' ? 's2' : 's1';
    // Swinging the view slightly toward the other seat keeps the current one (hysteresis)...
    expect(sys.focus(feet, eye, new THREE.Vector3(first.id === 's1' ? 0.05 : -0.05, 0, 1)).id).toBe(first.id);
    // ...a clear preference switches.
    expect(sys.focus(feet, eye, new THREE.Vector3(first.id === 's1' ? 0.3 : -0.3, 0, 0.95)).id).toBe(other);
    expect(FOCUS.hysteresis).toBeGreaterThan(0);
  });

  test('door prompts follow the door state; interact fires the handler and the perception event', () => {
    const events = new EventBus();
    const door = { name: 'd', locked: false, latched: true, angle: 0, centre: new THREE.Vector3(0, 0, 1) };
    const calls = [];
    const doors = { get: () => door, isOpen: (d) => !d.latched, toggle: (name, from) => calls.push([name, from]) && 'open' };
    const sys = new InteractionSystem({ items: [item('door.d', 'door', [0, 1.05, 1], { data: { door: 'd' } })], collision: new CollisionWorld({ walkables: [FLOOR] }), doors, events });
    const focused = sys.focus(feet, eye, ahead);
    expect(sys.prompt(focused)).toBe('Open');
    sys.interact({ from: feet });
    expect(calls[0][0]).toBe('d');
    expect(events.recent('player:interact')[0]).toMatchObject({ id: 'door.d', kind: 'door' });
    door.latched = false;
    expect(sys.prompt(focused)).toBe('Close');
    door.locked = true;
    expect(sys.prompt(focused)).toBe('Locked');
  });

  test('lamps and switches toggle world lights through world.setLight', () => {
    const set = [];
    const world = { setLight: (name, on) => set.push([name, on]) };
    const sys = new InteractionSystem({ world, items: [item('lamp', 'lamp', [0, 1.2, 1], { data: { lights: ['a', 'b'], on: true } })], collision: new CollisionWorld({ walkables: [FLOOR] }) });
    const lamp = sys.focus(feet, eye, ahead);
    expect(sys.prompt(lamp)).toBe('Turn off');
    expect(sys.interact({}).result).toBe('off');
    expect(set).toEqual([['a', false], ['b', false]]);
    expect(sys.prompt(lamp)).toBe('Turn on');
  });

  test('picked-up items leave the focus list', () => {
    const events = new EventBus();
    const sys = new InteractionSystem({ items: [item('can', 'item', [0, 0.9, 0.8])], collision: new CollisionWorld({ walkables: [FLOOR] }), events });
    sys.focus(feet, eye, ahead);
    expect(sys.interact({}).result).toBe('taken');
    expect(sys.focus(feet, eye, ahead)).toBe(null);
    expect(events.recent('player:pickup')).toHaveLength(1);
  });
});

describe('fallback interactables', () => {
  test('derives door items, keeps declared ones and adds Foundry seats only when none are declared', () => {
    const doors = { doors: [{ name: 'door-a', centre: new THREE.Vector3(1, 0.1, 2), yaw0: 0 }, { name: 'door-b', centre: new THREE.Vector3(5, 0.1, 2), yaw0: 0 }] };
    const declared = [{ id: 'mine', kind: 'door', pos: [1, 1, 2], yaw: 0, radius: 1, prompt: 'Open', data: { door: 'door-a' } }];
    const list = fallbackInteractables({ data: { interactables: declared }, doors, location: { id: 'foundry-st' } });
    expect(list.filter((i) => i.kind === 'door').map((i) => i.data.door).sort()).toEqual(['door-a', 'door-b']);
    expect(list.filter((i) => i.kind === 'seat').length).toBeGreaterThan(8);
    expect(list.every((i) => i.kind !== 'seat' || i.data.variant)).toBe(true);
    const withSeats = fallbackInteractables({ data: { interactables: [{ id: 's', kind: 'seat', pos: [0, 0.5, 0], yaw: 0, data: {} }] }, doors, location: { id: 'foundry-st' } });
    expect(withSeats.filter((i) => i.kind === 'seat')).toHaveLength(1);
    expect(fallbackInteractables({ data: {}, doors, location: { id: 'elsewhere' } }).filter((i) => i.kind === 'seat')).toHaveLength(0);
  });
});

describe('seat state machine', () => {
  const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
  const sofa = { poly: rect(-1, 0, 1, 0.92), y0: 0, y1: 0.78, tag: 'sofa' };

  function setup() {
    const collision = new CollisionWorld({ solids: [sofa], walkables: [FLOOR] });
    const c = buildCharacter(trial);
    const root = new THREE.Group();
    root.add(c);
    const motor = new CharacterMotor(collision, { x: 0.3, y: 0, z: 2.2 });
    const events = new EventBus();
    const ctl = new CharacterController(c, bakeAllClips(c.userData.layout), { root, motor, events });
    ctl.facing = Math.PI;
    const seat = item('sofa.1', 'seat', [0, 0.45, 0.5], { radius: 2, data: { seatHeight: 0.45, variant: 'sofa' } });
    const sys = new InteractionSystem({ items: [seat], collision, events });
    const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, weapon: null };
    const run = (patch, seconds) => {
      Object.assign(input, patch);
      const phases = new Set();
      for (let t = 0; t < seconds - 1e-9; t += 1 / 30) {
        ctl.update(input, 1 / 30);
        input.interact = false;
        if (ctl.seat) phases.add(ctl.seat.phase);
      }
      return phases;
    };
    return { collision, motor, ctl, sys, seat, run, root, events };
  }

  test('walk up, turn, sit, stay put while seated, stand up clear of the sofa', () => {
    const { collision, motor, ctl, sys, run, root, events } = setup();
    expect(sys.focus(root.position, root.position.clone().setY(1.6), new THREE.Vector3(0, -0.3, -1))?.id).toBe('sofa.1');
    sys.interact({ controller: ctl, makeSeat: (it) => new SeatAction(ctl, seatSpec(it, collision, (x, z, y) => motor.fits(x, z, y)), { events }) });
    const phases = run({}, 4);
    expect([...phases]).toEqual(expect.arrayContaining(['approach', 'turn', 'down', 'seated']));
    expect(ctl.seat.phase).toBe('seated');
    expect(ctl.state.seated).toBe(true);
    // Facing out of the seat, root over the seat, hips behind it.
    expect(Math.abs(Math.atan2(Math.sin(ctl.facing), Math.cos(ctl.facing)))).toBeLessThan(0.1);
    const seatedAt = root.position.clone();
    expect(seatedAt.z).toBeCloseTo(0.56, 2);
    expect(seatedAt.y).toBeCloseTo(0, 5);
    // Locked in place while seated (no input): the motor does not move the body.
    run({}, 1);
    expect(root.position.distanceTo(seatedAt)).toBeLessThan(1e-6);
    expect(ctl.state.locomotion).toBe(ctl.seat.clips.idle);
    // Stand: E (interact) while seated.
    run({ interact: true }, 2);
    expect(ctl.seat).toBe(null);
    expect(ctl.state.seated).toBe(false);
    expect(collision.penetration(motor.pos.x, motor.pos.z, motor.pos.y)).toBeLessThan(1e-3);
    expect(motor.pos.z).toBeGreaterThan(0.92 + motor.radius - 1e-3);
    // And can walk again.
    const z = motor.pos.z;
    run({ move: { x: 0, z: 1 }, cameraYaw: 0 }, 1);
    expect(motor.pos.z).toBeGreaterThan(z + 0.5);
    expect(events.recent('player:sit')).toHaveLength(1);
    expect(events.recent('player:stand')).toHaveLength(1);
  });

  test('moving the stick while seated stands up instead of sliding the seated body', () => {
    const { collision, motor, ctl, sys, run, root } = setup();
    sys.focus(root.position, root.position.clone().setY(1.6), new THREE.Vector3(0, -0.3, -1));
    sys.interact({ controller: ctl, makeSeat: (it) => new SeatAction(ctl, seatSpec(it, collision, (x, z, y) => motor.fits(x, z, y))) });
    run({}, 4);
    const seatedAt = root.position.clone();
    const phases = run({ move: { x: 0, z: 1 } }, 0.2);
    expect(phases.has('up')).toBe(true);
    expect(root.position.z).toBeGreaterThanOrEqual(seatedAt.z - 1e-6);
    run({ move: { x: 0, z: 0 } }, 2);
    expect(ctl.seat).toBe(null);
  });
});
