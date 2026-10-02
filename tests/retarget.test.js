import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { computeJointLayout, CORE_JOINTS } from '../src/rig/skeleton.js';
import { bakeClip } from '../src/anim/clips.js';
import { worldPose } from '../src/anim/fk.js';
import { createPose } from '../src/anim/pose.js';
import { unimateMotionFromClip, mixamoTPose } from '../src/unimate/bridge.js';
import { retargetClip, canonicalJoint, mapSkeleton } from '../src/anim/retarget.js';

/**
 * A Mixamo-style source rig in centimetres with arbitrary bind rotations on every bone (as FBX rigs
 * have), driven so its world motion equals one of our clips.
 */
function mixamoSource(layout, clipName) {
  const tpose = mixamoTPose(1.8);
  const rng = (i) => Math.sin(i * 12.9898) * 0.5;
  const bones = {};
  const restWorld = {};
  for (const [i, [name, parent]] of CORE_JOINTS.entries()) {
    const b = new THREE.Bone();
    b.name = `mixamorig:${name}`;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(i), rng(i + 7), rng(i + 13)));
    restWorld[name] = q;
    const world = new THREE.Vector3(...tpose[i]).multiplyScalar(100);
    if (parent) {
      const pw = new THREE.Vector3(...tpose[CORE_JOINTS.findIndex(([n]) => n === parent)]).multiplyScalar(100);
      b.position.copy(world.sub(pw).applyQuaternion(restWorld[parent].clone().invert()));
      b.quaternion.copy(restWorld[parent].clone().invert().multiply(q));
      bones[parent].add(b);
    } else {
      b.position.copy(world);
      b.quaternion.copy(q);
    }
    bones[name] = b;
  }
  const ours = bakeClip(layout, clipName);
  const motion = unimateMotionFromClip(ours, layout, tpose, { fps: 30 });
  const times = motion.globalRotations.map((_, f) => f / 30);
  const tracks = CORE_JOINTS.map(([name, parent], j) => {
    const values = [];
    for (const row of motion.globalRotations) {
      const world = new THREE.Quaternion(...row[j]).multiply(restWorld[name]);
      const pj = parent ? CORE_JOINTS.findIndex(([n]) => n === parent) : -1;
      const parentWorld = parent ? new THREE.Quaternion(...row[pj]).multiply(restWorld[parent]) : new THREE.Quaternion();
      values.push(...parentWorld.invert().multiply(world).toArray());
    }
    return new THREE.QuaternionKeyframeTrack(`mixamorig:${name}.quaternion`, times, values);
  });
  tracks.push(new THREE.VectorKeyframeTrack('mixamorig:Hips.position', times, motion.rootPositions.flatMap((p) => p.map((v) => v * 100))));
  const root = new THREE.Group();
  root.add(bones.Hips);
  return { root, bones: Object.values(bones), clip: new THREE.AnimationClip(clipName, ours.duration, tracks), ours };
}

function boneDirections(layout, clip, t) {
  const pose = createPose();
  for (const tr of clip.tracks) {
    const [node, prop] = tr.name.split('.');
    const v = tr.createInterpolant().evaluate(t);
    if (prop === 'quaternion') pose.bones[node.replace(/^.*:/, '')] = new THREE.Quaternion().fromArray(v);
  }
  const fk = worldPose(layout, pose);
  return CORE_JOINTS.filter(([, p]) => p).map(([n, p]) => fk.pos[n].clone().sub(fk.pos[p]).normalize());
}

describe('retargeting', () => {
  test('bone names from Mixamo (any namespace) and Unreal-style rigs map to canonical joints', () => {
    expect(canonicalJoint('mixamorig:LeftForeArm')).toBe('LeftForeArm');
    expect(canonicalJoint('mixamorig1:Hips')).toBe('Hips');
    expect(canonicalJoint('upperarm_r', 'mannequin')).toBe('RightArm');
    expect(mapSkeleton([{ name: 'mixamorig:Hips' }]).missing).toContain('Spine');
  });

  test('motion without a licence record is refused', () => {
    const layout = computeJointLayout({});
    const src = mixamoSource(layout, 'wave');
    expect(() => retargetClip({ ...src, profile: 'mixamo', metresPerUnit: 0.01 }, layout)).toThrow(/licence/);
  });

  test.each(['walk', 'wave', 'jump'])('a %s from a cm-unit Mixamo rig with arbitrary bind rotations round-trips (bone directions < 2 deg)', (name) => {
    const layout = computeJointLayout({});
    const src = mixamoSource(layout, name);
    const clip = retargetClip({ ...src, profile: 'mixamo', metresPerUnit: 0.01, license: { source: 'fixture', licence: 'test fixture (generated)' } }, layout, { inPlace: false });
    expect(clip.userData.provenance.licence).toBe('test fixture (generated)');
    let worst = 0;
    for (let t = 0; t < src.ours.duration; t += 0.1) {
      const a = boneDirections(layout, src.ours, t);
      const b = boneDirections(layout, clip, t);
      a.forEach((d, i) => { worst = Math.max(worst, THREE.MathUtils.radToDeg(d.angleTo(b[i]))); });
    }
    expect(worst).toBeLessThan(2);
  });

  test('in-place clean-up removes horizontal root drift and reports the root velocity', () => {
    const layout = computeJointLayout({});
    const src = mixamoSource(layout, 'walk');
    const hips = src.clip.tracks.find((t) => t.name.endsWith('Hips.position'));
    for (let f = 0; f < hips.times.length; f++) hips.values[f * 3 + 2] += hips.times[f] * 140;
    const clip = retargetClip({ ...src, profile: 'mixamo', metresPerUnit: 0.01, license: { source: 'fixture', licence: 'test' } }, layout);
    const out = clip.tracks.find((t) => t.name.endsWith('Hips.position'));
    const zs = out.times.map((_, f) => out.values[f * 3 + 2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.05);
    expect(clip.userData.rootVelocity[2]).toBeGreaterThan(1.2);
  });
});
