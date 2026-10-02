import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { computeJointLayout } from '../src/rig/skeleton.js';
import { buildCharacter } from '../src/character/build.js';
import { bakeClip, samplePose, CLIP_NAMES, registerSamplers, getSampler } from '../src/anim/clips.js';
import { SEATS, SIT_DROP } from '../src/anim/action-clips.js';
import { worldPose } from '../src/anim/fk.js';
import { handGripOffset } from '../src/anim/arm-ik.js';
import { BODY_VARIANTS } from '../src/garment/audit.js';
import { skinnedPositions, meshByName } from './helpers.js';

const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const layoutFor = (variant) => computeJointLayout({ ...trial.body, ...BODY_VARIANTS[variant] });

const ACTIONS = ['sitDown', 'sitIdle', 'standUp', 'sitDown_sofa', 'sitIdle_sofa', 'standUp_sofa', 'pressSwitch', 'pushDoor', 'pickUp', 'land_soft', 'land_hard', 'stairs_up', 'stairs_down', 'melee_jab', 'melee_cross', 'melee_kick'];
/** Strikes are fast by design (a punch extends in ~4 frames); everything else stays under the weapon gate. */
const LIMIT = (name) => (name.startsWith('melee_') ? 45 : 40);

function worstStep(clip) {
  let worst = 0;
  for (const track of clip.tracks.filter((t) => t.name.endsWith('.quaternion'))) {
    for (let f = 4; f < track.values.length; f += 4) {
      const a = new THREE.Quaternion().fromArray(track.values, f - 4);
      const b = new THREE.Quaternion().fromArray(track.values, f);
      worst = Math.max(worst, THREE.MathUtils.radToDeg(a.angleTo(b)));
    }
  }
  return worst;
}

/** Grip point (palm centre) of a posed hand. */
function gripPoint(L, pose, side) {
  const fk = worldPose(L, pose);
  return fk.pos[`${side}Hand`].clone().add(handGripOffset(L, side).applyQuaternion(fk.quat[`${side}Hand`]));
}

describe('action clip set', () => {
  test('every clip the gameplay contract names exists', () => {
    for (const name of [...ACTIONS, 'interact', 'lookAround', 'idle', 'smoke', 'smoke_light', 'smoke_flick', 'smoke_drop']) expect(CLIP_NAMES, name).toContain(name);
  });

  test.each(Object.keys(BODY_VARIANTS))('%s body: finite, no pops, elbows and knees within limits', (variant) => {
    const L = layoutFor(variant);
    for (const name of ACTIONS) {
      const clip = bakeClip(L, name);
      for (const track of clip.tracks) expect(Array.from(track.values).every(Number.isFinite), `${name} ${track.name}`).toBe(true);
      expect(worstStep(clip), name).toBeLessThan(LIMIT(name));
      for (let t = 0; t < clip.duration; t += 0.1) {
        const fk = worldPose(L, samplePose(L, name, t));
        for (const side of ['Left', 'Right']) {
          const elbow = fk.pos[`${side}ForeArm`].clone().sub(fk.pos[`${side}Arm`]).angleTo(fk.pos[`${side}Hand`].clone().sub(fk.pos[`${side}ForeArm`]));
          const knee = fk.pos[`${side}Leg`].clone().sub(fk.pos[`${side}UpLeg`]).angleTo(fk.pos[`${side}Foot`].clone().sub(fk.pos[`${side}Leg`]));
          expect(THREE.MathUtils.radToDeg(elbow), `${name}@${t.toFixed(1)} ${side} elbow`).toBeLessThan(155);
          expect(THREE.MathUtils.radToDeg(knee), `${name}@${t.toFixed(1)} ${side} knee`).toBeLessThan(150);
        }
      }
    }
  });
});

describe.each(Object.keys(BODY_VARIANTS))('seating on the %s body', (variant) => {
  const L = layoutFor(variant);
  const k = L.measures.height / 1.78;

  test.each(Object.keys(SEATS))('%s: hip joints sit SIT_DROP above the seat, the feet stay on the floor', (seat) => {
    const sfx = seat === 'chair' ? '' : `_${seat}`;
    for (let t = 0; t < 4; t += 0.5) {
      const fk = worldPose(L, samplePose(L, `sitIdle${sfx}`, t));
      const hipY = (fk.pos.LeftUpLeg.y + fk.pos.RightUpLeg.y) / 2;
      expect(Math.abs(hipY - (SEATS[seat].height + SIT_DROP * k)), `@${t}`).toBeLessThan(0.006);
      for (const side of ['Left', 'Right']) expect(Math.abs(fk.pos[`${side}Foot`].y - L.world[`${side}Foot`].y), side).toBeLessThan(0.002);
    }
    const clip = bakeClip(L, `sitDown${sfx}`);
    expect(clip.userData.seat.height).toBe(SEATS[seat].height);
    expect(clip.userData.seat.hipsBack).toBeCloseTo(SEATS[seat].hipsBack * k, 5);
  });

  test('the hands come to rest on the thighs', () => {
    const p = samplePose(L, 'sitIdle', 1);
    const fk = worldPose(L, p);
    for (const side of ['Left', 'Right']) {
      const thigh = new THREE.Line3(fk.pos[`${side}UpLeg`], fk.pos[`${side}Leg`]);
      const grip = gripPoint(L, p, side);
      expect(thigh.closestPointToPoint(grip, true, new THREE.Vector3()).distanceTo(grip), side).toBeLessThan(L.measures.thighRadius * 1.6);
    }
  });

  test('interaction contacts are reached at the event', () => {
    for (const [name, side, slack] of [['pressSwitch', 'Right', 0.13], ['pushDoor', 'Right', 0.03], ['pickUp', 'Right', 0.05]]) {
      const s = getSampler(name);
      const ev = s.events.find((e) => ['use', 'grab'].includes(e.name));
      const contact = new THREE.Vector3(...bakeClip(L, name).userData.contact);
      // pressSwitch reports the fingertip; the palm sits a hand's length behind it.
      expect(gripPoint(L, samplePose(L, name, ev.time), side).distanceTo(contact), name).toBeLessThan(slack);
    }
  });
});

describe('seated on the skinned body', () => {
  test.each(Object.keys(SEATS))('%s: the seat of the trousers rests on the seat (within 3 cm, no sinking)', (seat) => {
    const c = buildCharacter(trial);
    const mixer = new THREE.AnimationMixer(c);
    mixer.clipAction(bakeClip(c.userData.layout, seat === 'chair' ? 'sitIdle' : 'sitIdle_sofa')).play();
    mixer.setTime(0.5);
    c.updateMatrixWorld(true);
    const hips = c.userData.rig.byName.Hips.getWorldPosition(new THREE.Vector3());
    let low = Infinity;
    for (const name of ['body', 'bottom']) {
      const mesh = meshByName(c, name);
      if (!mesh) continue;
      const p = skinnedPositions(mesh);
      for (let i = 0; i < p.length; i += 3) {
        // Under the pelvis only (the thighs run forward from it, the calves hang below the seat edge).
        if (Math.abs(p[i]) < c.userData.layout.measures.hipHalfWidth && Math.abs(p[i + 2] - hips.z) < 0.09) low = Math.min(low, p[i + 1]);
      }
    }
    expect(low).toBeGreaterThan(SEATS[seat].height - 0.03);
    expect(low).toBeLessThan(SEATS[seat].height + 0.03);
  });
});

describe('stairs and landings', () => {
  test.each(['stairs_up', 'stairs_down'])('%s: the stance foot is fixed in the world while the root moves', (name) => {
    const L = layoutFor('base');
    const clip = bakeClip(L, name);
    const [, vy, vz] = clip.userData.rootVelocity;
    const dt = 1 / 30;
    // Left foot stance is the first 62% of the cycle.
    let first = null;
    for (let t = 0.05; t < clip.duration * 0.55; t += dt) {
      const fk = worldPose(L, samplePose(L, name, t));
      const world = fk.pos.LeftFoot.clone().add(new THREE.Vector3(0, vy * t, vz * t));
      if (!first) first = world;
      expect(world.distanceTo(first), `@${t.toFixed(2)}`).toBeLessThan(0.012);
    }
  });

  test('landings and one-shots settle into idle exactly', () => {
    const L = layoutFor('base');
    const idle = bakeClip(L, 'idle');
    for (const name of ['land_soft', 'land_hard', 'pushDoor', 'pressSwitch', 'melee_jab', 'melee_cross', 'melee_kick', 'pickUp']) {
      const clip = bakeClip(L, name);
      for (const track of clip.tracks.filter((t) => t.name.endsWith('.quaternion'))) {
        const other = idle.tracks.find((t) => t.name === track.name);
        const end = new THREE.Quaternion().fromArray(track.values, track.values.length - 4);
        const start = new THREE.Quaternion().fromArray(other.values, 0);
        expect(THREE.MathUtils.radToDeg(end.angleTo(start)), `${name} ${track.name}`).toBeLessThan(3);
      }
    }
  });
});

describe('clip registry', () => {
  test('registerSamplers adds clips other modules bake, and refuses name clashes', () => {
    const names = registerSamplers((bases) => ({
      test_registered_wave: { duration: 1, loop: true, sample: (L, t, d) => bases.wave.sample(L, t, d) },
    }));
    expect(names).toEqual(['test_registered_wave']);
    expect(CLIP_NAMES).toContain('test_registered_wave');
    const clip = bakeClip(layoutFor('base'), 'test_registered_wave');
    expect(clip.userData.loop).toBe(true);
    expect(() => registerSamplers({ idle: { duration: 1, loop: true, sample: () => null } })).toThrow(/already registered/);
    expect(() => registerSamplers({ broken: { loop: true } })).toThrow(/sample/);
  });
});
