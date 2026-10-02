import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { computeJointLayout } from '../src/rig/skeleton.js';
import { buildCharacter } from '../src/character/build.js';
import { attachWeapon, weaponNode } from '../src/weapons/model.js';
import { WEAPON_TYPES } from '../src/weapons/specs.js';
import { bakeClip, bakeAllClips, samplePose, WEAPON_CLIP_NAMES, clipsForWeapon } from '../src/anim/clips.js';
import { Animator } from '../src/anim/animator.js';
import { weaponContact } from '../src/anim/weapon-audit.js';
import { BODY_VARIANTS } from '../src/garment/audit.js';

const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const layoutFor = (variant) => computeJointLayout({ ...trial.body, ...BODY_VARIANTS[variant] });
const FRAME_STEP = 1 / 15;
/** Fast locomotion peaks at ~34°/frame on the knee; anything above this is a pop. */
const MAX_DEG_PER_FRAME = 40;

describe('weapon clip library', () => {
  test('pistol, rifle and smg each have the full clip set', () => {
    const required = {
      pistol: ['idleHolstered', 'idle', 'idleTwoHand', 'aimIdle', 'aimHip', 'aimOneHand', 'draw', 'drawNeutral', 'unequip', 'switch', 'raise', 'lower', 'fire', 'burst', 'recoil', 'dryFire', 'reload', 'reloadEmpty', 'magInsert', 'slideRelease', 'inspect', 'melee', 'hitReact', 'toSprint', 'walk', 'walkAim', 'run', 'sprint', 'crouch', 'crouchAim', 'crouchWalk', 'aimLeft', 'aimRight', 'aimUp', 'aimDown'],
      rifle: ['idleStowed', 'idle', 'lowReady', 'highReady', 'hipFire', 'aimIdle', 'equip', 'unequip', 'switch', 'raise', 'lower', 'fire', 'dryFire', 'burst', 'recoil', 'reload', 'reloadEmpty', 'magOut', 'magIn', 'boltPull', 'jam', 'inspect', 'melee', 'hitReact', 'walk', 'walkAim', 'run', 'sprint', 'toSprint', 'crouch', 'crouchAim', 'crouchWalk', 'aimLeft', 'aimRight', 'aimUp', 'aimDown'],
    };
    required.smg = required.rifle;
    for (const type of WEAPON_TYPES) {
      const have = clipsForWeapon(type);
      for (const name of required[type]) expect(have, type).toContain(`${type}_${name}`);
    }
  });

  test.each(WEAPON_CLIP_NAMES)('%s: finite tracks, loops close, no pops', (name) => {
    const clip = bakeClip(layoutFor('base'), name);
    for (const track of clip.tracks) {
      if (track instanceof THREE.BooleanKeyframeTrack) continue;
      expect(Array.from(track.values).every(Number.isFinite), track.name).toBe(true);
    }
    if (clip.userData.loop) {
      for (const track of clip.tracks.filter((t) => t.name.endsWith('.quaternion'))) {
        const n = track.values.length;
        const first = new THREE.Quaternion().fromArray(track.values, 0);
        const last = new THREE.Quaternion().fromArray(track.values, n - 4);
        expect(THREE.MathUtils.radToDeg(first.angleTo(last)), `${track.name} loop seam`).toBeLessThan(0.5);
      }
    }
    let worst = 0;
    for (const track of clip.tracks.filter((t) => t.name.endsWith('.quaternion'))) {
      for (let f = 4; f < track.values.length; f += 4) {
        const a = new THREE.Quaternion().fromArray(track.values, f - 4);
        const b = new THREE.Quaternion().fromArray(track.values, f);
        worst = Math.max(worst, THREE.MathUtils.radToDeg(a.angleTo(b)));
      }
    }
    expect(worst).toBeLessThan(MAX_DEG_PER_FRAME);
  });
});

describe.each(Object.keys(BODY_VARIANTS))('hands stay on the weapon: %s body', (variant) => {
  test.each(WEAPON_TYPES)('%s clips keep both hands on their targets (IK error < 1 mm, every target reachable)', (type) => {
    const L = layoutFor(variant);
    const failures = [];
    for (const name of clipsForWeapon(type)) {
      const duration = bakeClip(L, name).duration;
      for (let t = 0; t < duration; t += FRAME_STEP) {
        const { hold } = samplePose(L, name, t);
        if (hold.Right > 0.001 || hold.Left > 0.001 || !hold.reachable) failures.push(`${name}@${t.toFixed(2)} R${(hold.Right * 1000).toFixed(1)} L${(hold.Left * 1000).toFixed(1)} reach=${hold.reachable}`);
      }
    }
    expect(failures.slice(0, 8)).toEqual([]);
  });
});

describe('weapon on the skinned character', () => {
  test.each(['base', 'short', 'tall', 'heavy', 'woman'])('two-hand aim and reload frames keep palms on the grip and support (%s body)', (variant) => {
    for (const type of WEAPON_TYPES) {
      const c = buildCharacter({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[variant] } });
      attachWeapon(c, type);
      const mixer = new THREE.AnimationMixer(c);
      for (const name of [type === 'pistol' ? 'pistol_aimIdle' : `${type}_aimIdle`, type === 'pistol' ? 'pistol_walkAim' : `${type}_crouchAim`]) {
        mixer.stopAllAction();
        mixer.clipAction(bakeClip(c.userData.layout, name)).play();
        mixer.setTime(0.5);
        const k = weaponContact(c);
        expect(k.right, `${name} right`).toBeLessThan(0.001);
        expect(k.left, `${name} left`).toBeLessThan(0.001);
      }
    }
  });

  test('the drawn and stowed copies swap at the draw frame (scale tracks export to glTF)', () => {
    const c = buildCharacter(trial);
    attachWeapon(c, 'pistol');
    const mixer = new THREE.AnimationMixer(c);
    mixer.clipAction(bakeClip(c.userData.layout, 'pistol_draw')).play();
    const hand = c.getObjectByName(weaponNode('pistol', 'hand'));
    const stowed = c.getObjectByName(weaponNode('pistol', 'stowed'));
    mixer.setTime(0.1);
    expect(hand.scale.x).toBeLessThan(0.01);
    expect(stowed.scale.x).toBe(1);
    mixer.setTime(0.5);
    expect(hand.scale.x).toBe(1);
    expect(stowed.scale.x).toBeLessThan(0.01);
  });
});

describe('animator state machine', () => {
  function run(type) {
    const c = buildCharacter(trial);
    attachWeapon(c, type);
    const anim = new Animator(c, bakeAllClips(c.userData.layout, { weapons: [type] }));
    const p = type === 'pistol'
      ? { draw: 'pistol_draw', aim: 'pistol_aimIdle', reload: 'pistol_reload', recoil: 'pistol_recoil', walkAim: 'pistol_walkAim', stow: 'pistol_unequip', sprint: 'pistol_sprint' }
      : { draw: `${type}_equip`, aim: `${type}_aimIdle`, reload: `${type}_reload`, recoil: `${type}_recoil`, walkAim: `${type}_walkAim`, stow: `${type}_unequip`, sprint: `${type}_sprint` };
    const log = {};
    const script = [
      [0, (a) => a.locomotion('idle')],
      [1, (a) => a.locomotion('walk')],
      [2, (a) => a.play(p.draw, { then: p.aim })],
      [3.4, (a) => a.additive(p.recoil)], [3.6, (a) => a.additive(p.recoil)],
      [4.2, (a) => a.play(p.reload)],
      [4.6, (a) => { log.fireDuringReload = a.additive(p.recoil); }],
      [4.7, (a) => a.play(p.walkAim)],
      [7.5, (a) => a.locomotion('run')],
      [8.5, (a) => { a.locomotion('sprint'); a.play(p.sprint); }],
      [9.5, (a) => a.locomotion('walk')],
      [9.6, (a) => a.play(p.stow, { then: null })],
      [11, (a) => a.locomotion('idle')],
    ];
    const bones = c.userData.rig.bones;
    const prev = bones.map((b) => b.quaternion.clone());
    let worst = 0;
    let contact = 0;
    let si = 0;
    const dt = 1 / 30;
    for (let t = 0; t < 12.5; t += dt) {
      while (si < script.length && script[si][0] <= t + 1e-9) script[si++][1](anim);
      anim.update(dt);
      if (t > 4.4 && t < 4.5) log.upperDuringReload = anim.upperName;
      if (t > 6.6 && t < 6.7) log.afterReload = anim.upperName;
      c.updateMatrixWorld(true);
      bones.forEach((b, i) => {
        if (t > dt) worst = Math.max(worst, THREE.MathUtils.radToDeg(b.quaternion.angleTo(prev[i])));
        prev[i].copy(b.quaternion);
      });
      const settled = anim.upper && !anim.locked && /aimIdle|walkAim/.test(anim.upperName) && anim.upper.getEffectiveWeight() === 1;
      if (settled) contact = Math.max(contact, weaponContact(c).left);
    }
    return { worst, contact, log, final: anim.upperName };
  }

  test.each(WEAPON_TYPES)('%s: draw → fire → reload → walk-aim → sprint → stow has no pops, keeps hands on, and respects locks', (type) => {
    const r = run(type);
    expect(r.worst).toBeLessThan(MAX_DEG_PER_FRAME);
    expect(r.contact).toBeLessThan(0.002);
    expect(r.log.fireDuringReload).toBe(false);
    expect(r.log.upperDuringReload).toBe(type === 'pistol' ? 'pistol_reload' : `${type}_reload`);
    expect(r.log.afterReload).toBe(type === 'pistol' ? 'pistol_walkAim' : `${type}_walkAim`);
    expect(r.final).toBe(null);
  });
});
