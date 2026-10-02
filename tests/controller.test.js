import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../src/character/build.js';
import { attachWeapon } from '../src/weapons/model.js';
import { bakeAllClips } from '../src/anim/clips.js';
import { CharacterController } from '../src/game/character-controller.js';

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
