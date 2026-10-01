import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildCharacter } from '../src/character/build.js';
import { PRESETS } from '../src/character/presets/index.js';
import { bakeClip } from '../src/anim/clips.js';
import { JOINTS } from '../src/rig/skeleton.js';
import { clipFromUnimateMotion, unimateMotionFromClip, mixamoTPose, validateUnimateMotion } from '../src/unimate/bridge.js';

function boneDirections(group, clip, time) {
  const mixer = new THREE.AnimationMixer(group);
  mixer.clipAction(clip).play();
  mixer.setTime(time);
  group.updateMatrixWorld(true);
  const bones = group.userData.rig.byName;
  const dir = {};
  for (const [name, child] of [['LeftArm', 'LeftForeArm'], ['RightForeArm', 'RightHand'], ['LeftUpLeg', 'LeftLeg'], ['RightLeg', 'RightFoot'], ['Spine2', 'Neck'], ['Neck', 'Head']]) {
    const a = new THREE.Vector3().setFromMatrixPosition(bones[name].matrixWorld);
    const b = new THREE.Vector3().setFromMatrixPosition(bones[child].matrixWorld);
    dir[name] = b.sub(a).normalize();
  }
  mixer.stopAllAction();
  return dir;
}

function identityMotion(frames = 2) {
  const rest = mixamoTPose();
  return {
    format: 'unimate-global-v1',
    fps: 30,
    joints: JOINTS.map(([n]) => n),
    parents: JOINTS.map(() => 0),
    restPositions: rest,
    globalRotations: Array.from({ length: frames }, () => JOINTS.map(() => [0, 0, 0, 1])),
    rootPositions: Array.from({ length: frames }, () => rest[0]),
  };
}

describe('UniMate bridge', () => {
  const group = buildCharacter(PRESETS[0]);
  const layout = group.userData.layout;

  test('identity UniMate frame puts our A-pose rig into the source T-pose', () => {
    const dirs = boneDirections(group, clipFromUnimateMotion(identityMotion(), layout), 0);
    expect(dirs.LeftArm.x).toBeGreaterThan(0.99);
    expect(dirs.RightForeArm.x).toBeLessThan(-0.99);
    expect(dirs.LeftUpLeg.y).toBeLessThan(-0.99);
  });

  test('a source global rotation turns the matching bone the same way', () => {
    const motion = identityMotion();
    const down = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
    const arm = JOINTS.findIndex(([n]) => n === 'LeftArm');
    for (const frame of motion.globalRotations) {
      for (const j of [arm, arm + 1, arm + 2]) frame[j] = down.toArray();
    }
    const dirs = boneDirections(group, clipFromUnimateMotion(motion, layout), 0);
    expect(dirs.LeftArm.y).toBeLessThan(-0.99);
  });

  test('our clips survive a round trip through the UniMate format', () => {
    const walk = bakeClip(layout, 'walk');
    const motion = unimateMotionFromClip(walk, layout, mixamoTPose());
    expect(validateUnimateMotion(motion)).toEqual([]);
    const back = clipFromUnimateMotion(motion, layout);
    for (const t of [0.1, 0.4, 0.8]) {
      const a = boneDirections(group, walk, t);
      const b = boneDirections(group, back, t);
      for (const k of Object.keys(a)) expect(a[k].dot(b[k]), `${k} @ ${t}`).toBeGreaterThan(0.995);
    }
  });

  test('malformed motion is rejected with reasons', () => {
    expect(() => clipFromUnimateMotion({ format: 'bvh' }, layout)).toThrow(/Invalid UniMate motion/);
    const bad = identityMotion();
    bad.joints = bad.joints.filter((j) => j !== 'Head');
    expect(validateUnimateMotion(bad)).toContain('missing joint Head');
  });
});
