import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { computeJointLayout } from '../src/rig/skeleton.js';
import { buildCharacter } from '../src/character/build.js';
import { bakeClip, samplePose, getSampler } from '../src/anim/clips.js';
import { cigarettePoint, mouthPoint, SMOKE_LOOP } from '../src/anim/smoke-clips.js';
import { worldPose } from '../src/anim/fk.js';
import { SmokeEmitter } from '../src/render/smoke.js';
import { BODY_VARIANTS } from '../src/garment/audit.js';

const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const layoutFor = (variant) => computeJointLayout({ ...trial.body, ...BODY_VARIANTS[variant] });
const SMOKE_CLIPS = ['smoke', 'smoke_light', 'smoke_flick', 'smoke_drop'];

/** Largest rotation between consecutive baked frames (degrees). */
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

/** Elbow flexion (degrees between upper arm and forearm) of a pose. */
function elbowFlex(L, pose, side) {
  const fk = worldPose(L, pose);
  const upper = fk.pos[`${side}ForeArm`].clone().sub(fk.pos[`${side}Arm`]);
  const lower = fk.pos[`${side}Hand`].clone().sub(fk.pos[`${side}ForeArm`]);
  return THREE.MathUtils.radToDeg(upper.angleTo(lower));
}

describe.each(Object.keys(BODY_VARIANTS))('smoking on the %s body', (variant) => {
  const L = layoutFor(variant);

  test('every smoking clip bakes finite, pops < 30°/frame, elbows within the flexion limit', () => {
    for (const name of SMOKE_CLIPS) {
      const clip = bakeClip(L, name);
      for (const track of clip.tracks) expect(Array.from(track.values).every(Number.isFinite), `${name} ${track.name}`).toBe(true);
      expect(worstStep(clip), name).toBeLessThan(30);
      for (let t = 0; t < clip.duration; t += 0.1) {
        const p = samplePose(L, name, t);
        for (const side of ['Left', 'Right']) expect(elbowFlex(L, p, side), `${name}@${t.toFixed(1)} ${side}`).toBeLessThan(155);
      }
    }
  });

  test('the filter is on the lips through the drag, and the tip points away from the face', () => {
    for (const t of [2.1, 2.4, 2.8]) {
      const p = samplePose(L, 'smoke', t);
      const mouth = mouthPoint(L, p);
      expect(cigarettePoint(L, p, 'filter').distanceTo(mouth), `filter @${t}`).toBeLessThan(0.012);
      expect(cigarettePoint(L, p, 'tip').distanceTo(mouth), `tip @${t}`).toBeGreaterThan(0.07);
    }
    // At the waist hold the cigarette is nowhere near the face.
    expect(cigarettePoint(L, samplePose(L, 'smoke', 0.5), 'tip').distanceTo(mouthPoint(L, samplePose(L, 'smoke', 0.5)))).toBeGreaterThan(0.45);
  });

  test('feet stay planted through the weight shifts of the loop', () => {
    const start = worldPose(L, samplePose(L, 'smoke', 0));
    for (let t = 0; t < SMOKE_LOOP; t += 0.25) {
      const fk = worldPose(L, samplePose(L, 'smoke', t));
      for (const side of ['Left', 'Right']) expect(fk.pos[`${side}Foot`].distanceTo(start.pos[`${side}Foot`]), `${side} @${t}`).toBeLessThan(0.002);
    }
    // The weight really moves from one leg to the other.
    const a = samplePose(L, 'smoke', 0).hips.x;
    const b = samplePose(L, 'smoke', SMOKE_LOOP / 2).hips.x;
    expect(a - b).toBeGreaterThan(0.03);
  });

  test('the lighter flame reaches the tip while lighting', () => {
    const p = samplePose(L, 'smoke_light', 1.3);
    const fk = worldPose(L, p);
    const tip = cigarettePoint(L, p, 'tip');
    expect(fk.pos.LeftHand.distanceTo(tip)).toBeLessThan(0.14);
  });
});

describe('smoke chains', () => {
  test('smoke_light hands over to smoke; flick and drop end in idle', () => {
    const L = layoutFor('base');
    expect(bakeClip(L, 'smoke_light').userData.then).toBe('smoke');
    expect(bakeClip(L, 'smoke_flick').userData.then).toBe('idle');
    expect(bakeClip(L, 'smoke_drop').userData.then).toBe('idle');
    expect(getSampler('smoke').events.map((e) => e.name)).toEqual(['inhale', 'exhale', 'ash', 'ash']);
  });
});

describe('smoke emitter', () => {
  function rig() {
    const c = buildCharacter({ ...trial, accessories: [...trial.accessories, { type: 'cigarette' }] });
    const scene = new THREE.Scene();
    scene.add(c);
    const mixer = new THREE.AnimationMixer(c);
    return { c, scene, mixer };
  }

  test('fires the loop events (wrap-around included), flares the ember on the drag and puffs on the exhale', () => {
    const { c, scene, mixer } = rig();
    const em = new SmokeEmitter(scene, c);
    const clip = bakeClip(c.userData.layout, 'smoke');
    const action = mixer.clipAction(clip).play();
    const fired = [];
    const event = em.event.bind(em);
    em.event = (ev) => { fired.push(ev.name); event(ev); };
    let maxDraw = 0;
    let exhaleParticles = 0;
    for (let i = 0; i < 13 * 30; i++) {
      mixer.update(1 / 30);
      c.updateMatrixWorld(true);
      em.sync(clip, action.time);
      em.update(1 / 30);
      maxDraw = Math.max(maxDraw, em.draw);
      if (action.time > 4 && action.time < 4.4) exhaleParticles = Math.max(exhaleParticles, em.smokeP.filter((p) => p.life > 0 && p.drag > 2).length);
    }
    expect(fired.slice(0, 4)).toEqual(['inhale', 'exhale', 'ash', 'ash']);
    expect(fired.filter((n) => n === 'inhale').length).toBe(2);
    expect(maxDraw).toBeGreaterThan(0.8);
    expect(exhaleParticles).toBeGreaterThan(10);
    const live = em.smokeP.filter((p) => p.life > 0);
    expect(live.every((p) => Number.isFinite(p.pos.x) && Number.isFinite(p.size))).toBe(true);
    em.dispose();
  });

  test('flicking the butt hides the cigarette and the butt falls to the ground and comes to rest', () => {
    const { c, scene, mixer } = rig();
    const em = new SmokeEmitter(scene, c);
    const clip = bakeClip(c.userData.layout, 'smoke_flick');
    const action = mixer.clipAction(clip).play();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    for (let i = 0; i < 4 * 30; i++) {
      mixer.update(1 / 30);
      c.updateMatrixWorld(true);
      em.sync(clip, action.time);
      em.update(1 / 30);
    }
    expect(em.held).toBe(false);
    expect(em.cigMesh.visible).toBe(false);
    expect(em.butt.rest).toBe(true);
    expect(em.butt.mesh.position.y).toBeLessThan(0.02);
    expect(em.butt.mesh.position.z).toBeGreaterThan(0.3);
    em.dispose();
  });
});
