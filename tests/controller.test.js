import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../src/character/build.js';
import { attachWeapon } from '../src/weapons/model.js';
import { bakeAllClips } from '../src/anim/clips.js';
import { CharacterController } from '../src/game/character-controller.js';
import { CollisionWorld } from '../src/world/physics/collision.js';
import { CharacterMotor } from '../src/world/physics/kcc.js';
import { EventBus } from '../src/game/events.js';

const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));

function game() {
  const c = buildCharacter(trial);
  attachWeapon(c, ['pistol', 'rifle', 'smg'], { drawn: null });
  const root = new THREE.Group();
  root.add(c);
  const ctl = new CharacterController(c, bakeAllClips(c.userData.layout, { weapons: ['pistol', 'rifle', 'smg'] }), { root });
  const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, sprint: false, crouch: false, aim: false, fire: false, reload: false, weapon: null };
  const run = (patch, seconds) => {
    Object.assign(input, patch);
    for (let t = 0; t < seconds - 1e-9; t += 1 / 30) ctl.update(input, 1 / 30);
    return { ...ctl.state, weapon: ctl.weapon, ammo: ctl.weapon ? ctl.ammo[ctl.weapon] : null, locked: !!ctl.animator.locked, z: root.position.z, facing: ctl.facing };
  };
  return { run, ctl, root };
}

describe('gameplay controller', () => {
  test('root motion follows the clip speed and facing follows the stick', () => {
    const { run } = game();
    const s = run({ move: { x: 0, z: 0.5 } }, 2);
    expect(s.locomotion).toBe('walk');
    expect(s.z).toBeGreaterThan(1.5);
    const turned = run({ move: { x: 0.5, z: 0 } }, 1);
    expect(turned.facing).toBeGreaterThan(1.2);
  });

  test('switching weapons chains holster → draw → ready, and holstering drops the upper layer', () => {
    const { run } = game();
    expect(run({ weapon: 'pistol' }, 1.6).upper).toBe('pistol_idleTwoHand');
    const mid = run({ weapon: 'rifle' }, 0.4);
    expect(mid.upper).toBe('pistol_switch');
    expect(run({}, 2.4).upper).toBe('rifle_idle');
    expect(run({ weapon: null }, 1.6).upper).toBe(null);
  });

  test('fire spends ammo; an empty gun dry-fires; reload pressed during the click is buffered', () => {
    const { run } = game();
    run({ weapon: 'smg' }, 1.6);
    expect(run({ aim: true, fire: true }, 0.7).ammo).toBeLessThan(30);
    const empty = run({}, 5);
    expect(empty.ammo).toBe(0);
    run({ fire: false, reload: true }, 0.1);
    const s = run({ reload: false }, 0.5);
    expect(s.upper).toBe('smg_reloadEmpty');
    expect(run({}, 2.6).ammo).toBe(30);
  });

  test('aiming while moving strafes on the compass clips and sprinting lowers the weapon', () => {
    const { run } = game();
    run({ weapon: 'pistol' }, 1.6);
    expect(run({ aim: true, move: { x: -1, z: 0 } }, 0.6).locomotion).toBe('walk_E');
    const sprint = run({ aim: false, sprint: true, move: { x: 0, z: 1 } }, 0.8);
    expect(sprint.locomotion).toBe('sprint');
    expect(sprint.upper).toBe('pistol_sprint');
  });
});

describe('aiming while standing', () => {
  test('small aim turns stay in the upper body; past 45 deg the feet step the body round', () => {
    const { run, ctl } = game();
    run({ weapon: 'rifle' }, 2);
    const small = run({ aim: true, cameraYaw: THREE.MathUtils.degToRad(30) }, 1);
    expect(Math.abs(small.facing)).toBeLessThan(0.01);
    expect(ctl.animator.aim.yaw).toBeCloseTo(30, 0);
    run({ cameraYaw: THREE.MathUtils.degToRad(120) }, 0.3);
    expect(ctl.state.locomotion).toBe('stepInPlace');
    const settled = run({}, 2);
    expect(THREE.MathUtils.radToDeg(settled.facing)).toBeGreaterThan(110);
    expect(settled.locomotion).toBe('idle');
  });
});

describe('runtime support-hand IK', () => {
  test.each(['pistol', 'rifle', 'smg'])('%s: both hands stay on the weapon across aim offsets; the IK lets go for the reload', async (type) => {
    const { weaponContact } = await import('../src/anim/weapon-audit.js');
    const { run, ctl } = game();
    run({ weapon: type }, 2.2);
    for (const [yaw, pitch] of [[20, 0], [-44, 0], [0, 25], [30, 30], [-40, -35]]) {
      run({ aim: true, cameraYaw: THREE.MathUtils.degToRad(yaw), aimPitch: pitch }, 0.8);
      const k = weaponContact(ctl.character);
      expect(k.left, `${yaw}/${pitch}`).toBeLessThan(0.002);
      expect(k.right, `${yaw}/${pitch}`).toBeLessThan(0.001);
    }
    run({ cameraYaw: 0, aimPitch: 0, fire: true }, 0.5);
    run({ fire: false, reload: true }, 0.1);
    run({ reload: false }, 0.6);
    expect(ctl.animator.supportIK).toBeLessThan(0.5);
  });
});

describe('walking while aiming (moving root)', () => {
  test.each(['pistol', 'rifle'])('%s: the muzzle holds the aim line within 1.5 deg and both hands stay on', async (type) => {
    const { weaponContact } = await import('../src/anim/weapon-audit.js');
    const { run, ctl, root } = game();
    run({ weapon: type }, 2.5);
    run({ aim: true, move: { x: 0, z: 0.5 } }, 1);
    let worstAngle = 0;
    let worstLeft = 0;
    for (let i = 0; i < 30; i++) {
      run({}, 1 / 30);
      const k = weaponContact(ctl.character);
      const forward = k.forward.clone().applyQuaternion(root.quaternion.clone().invert());
      worstAngle = Math.max(worstAngle, THREE.MathUtils.radToDeg(forward.angleTo(new THREE.Vector3(0, 0, 1))));
      worstLeft = Math.max(worstLeft, k.left);
    }
    expect(worstAngle).toBeLessThan(1.5);
    expect(worstLeft).toBeLessThan(0.002);
  });
});

// --- physical movement (CharacterMotor) -----------------------------------------------------------

describe('physical movement', () => {
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

  function physical(world) {
    const c = buildCharacter(trial);
    attachWeapon(c, ['pistol', 'rifle', 'smg'], { drawn: null });
    const root = new THREE.Group();
    root.add(c);
    const collision = new CollisionWorld(world);
    const motor = new CharacterMotor(collision);
    const events = new EventBus();
    const ctl = new CharacterController(c, clips ??= bakeAllClips(c.userData.layout, { weapons: ['pistol', 'rifle', 'smg'] }), { root, motor, events });
    const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, sprint: false, crouch: false, aim: false, fire: false, reload: false, weapon: null };
    const run = (patch, seconds, each) => {
      Object.assign(input, patch);
      for (let t = 0; t < seconds - 1e-9; t += 1 / 30) {
        ctl.update(input, 1 / 30);
        input.jump = false;
        each?.();
      }
      return ctl.state;
    };
    return { ctl, root, motor, run, events, collision };
  }
  let clips;
  const FLOOR = { poly: rect(-30, -30, 30, 30), y: 0 };

  test('starts and stops with inertia toward the clip speed; playback follows the achieved speed', () => {
    const { ctl, run } = physical({ walkables: [FLOOR] });
    run({ move: { x: 0, z: 1 } }, 0.1);
    const early = ctl.state.speed;
    run({}, 1);
    const cruise = ctl.state.speed;
    const clipSpeed = Math.hypot(...ctl.clips.run.userData.rootVelocity);
    expect(early).toBeLessThan(cruise * 0.5);
    expect(cruise).toBeCloseTo(clipSpeed, 1);
    expect(ctl.animator.base.timeScale).toBeCloseTo(1, 1);
    run({ move: { x: 0, z: 0 } }, 0.1);
    expect(ctl.state.speed).toBeGreaterThan(0.2);
    run({}, 0.6);
    expect(ctl.state.speed).toBeLessThan(0.01);
  });

  test('running into a wall stops the body (velocity clipped) and slows the gait playback', () => {
    const { ctl, root, run } = physical({ walkables: [FLOOR], solids: [{ poly: rect(-5, 2, 5, 2.2), y0: 0, y1: 3 }] });
    run({ move: { x: 0, z: 1 } }, 2.5);
    expect(root.position.z).toBeLessThanOrEqual(2 - 0.3 + 1e-3);
    expect(ctl.state.speed).toBeLessThan(0.05);
    expect(ctl.animator.base.timeScale).toBeLessThan(0.5);
  });

  test('jump: airborne pose, landing back on the ground; the visual root rides the body', () => {
    const { ctl, root, motor, run, events } = physical({ walkables: [FLOOR] });
    run({}, 0.3);
    run({ jump: true }, 0.25);
    expect(ctl.state.grounded).toBe(false);
    expect(ctl.state.airborne).toBe(true);
    expect(ctl.state.locomotion).toBe('fall');
    expect(root.position.y).toBeCloseTo(motor.pos.y, 5);
    run({}, 1.2);
    expect(ctl.state.grounded).toBe(true);
    expect(ctl.state.airborne).toBe(false);
    expect(events.recent('player:land').length).toBe(1);
  });

  test('stairs: the body steps 0.2 m risers while the visual root rises smoothly', () => {
    const walk = [FLOOR];
    const solids = [];
    for (let i = 1; i <= 10; i++) {
      walk.push({ poly: rect(-1, i * 0.28, 1, i * 0.28 + 0.28), y: i * 0.2 });
      solids.push({ poly: rect(-1, i * 0.28, 1, i * 0.28 + 0.28), y0: i * 0.2 - 0.3, y1: i * 0.2 - 0.1 });
    }
    walk.push({ poly: rect(-1, 3.08, 1, 8), y: 2 });
    const { root, motor, run } = physical({ walkables: walk, solids });
    let maxBody = 0;
    let maxVisual = 0;
    let lastBody = 0;
    let lastVisual = 0;
    run({ move: { x: 0, z: 0.5 } }, 4, () => {
      maxBody = Math.max(maxBody, motor.pos.y - lastBody);
      maxVisual = Math.max(maxVisual, root.position.y - lastVisual);
      lastBody = motor.pos.y;
      lastVisual = root.position.y;
    });
    expect(motor.pos.y).toBeCloseTo(2, 5);
    expect(maxBody).toBeGreaterThan(0.15);
    expect(maxVisual).toBeLessThan(maxBody * 0.6);
    run({ move: { x: 0, z: 0 } }, 1);
    expect(root.position.y).toBeCloseTo(2, 3);
  });

  test('turns in place when the stick points behind, then moves off', () => {
    const { ctl, root, run } = physical({ walkables: [FLOOR] });
    run({ move: { x: 0, z: -1 } }, 0.2);
    expect(ctl.state.locomotion).toBe('stepInPlace');
    expect(Math.hypot(root.position.x, root.position.z)).toBeLessThan(0.05);
    run({}, 1.2);
    expect(root.position.z).toBeLessThan(-0.5);
  });

  test('indoors there is no sprint; perception events fire for draw / sprint / crouch / fire', () => {
    const { ctl, run, events } = physical({ walkables: [FLOOR] });
    run({ move: { x: 0, z: 1 }, sprint: true, indoor: true }, 0.8);
    expect(ctl.state.locomotion).toBe('run');
    run({ indoor: false }, 0.5);
    expect(ctl.state.locomotion).toBe('sprint');
    expect(events.recent('player:sprint').length).toBe(1);
    run({ sprint: false, move: { x: 0, z: 0 }, crouch: true }, 0.3);
    expect(events.recent('player:crouch')[0].on).toBe(true);
    run({ crouch: false, weapon: 'pistol' }, 1.8);
    expect(events.recent('player:draw')[0].weapon).toBe('pistol');
    run({ aim: true, fire: true }, 0.5);
    expect(events.recent('player:aim').length).toBe(1);
    expect(events.recent('player:fire').length).toBeGreaterThan(0);
    run({ aim: false, fire: false, melee: true }, 1 / 30);
    expect(events.recent('player:melee').length).toBe(1);
  });
});
