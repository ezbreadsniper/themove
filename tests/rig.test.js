import { describe, test, expect } from 'vitest';
import { JOINTS, CORE_JOINTS, HAND_JOINTS, computeJointLayout, createSkeleton, RIG_PREFIX } from '../src/rig/skeleton.js';

/** Copied verbatim from UniMate data_process/feature_extraction/metadata.py (MIXAMO_CORE_JOINTS). */
const UNIMATE_MIXAMO_CORE = [
  'mixamorig:Hips',
  'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:Neck', 'mixamorig:Head',
  'mixamorig:LeftShoulder', 'mixamorig:LeftArm',
  'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
  'mixamorig:RightShoulder', 'mixamorig:RightArm',
  'mixamorig:RightForeArm', 'mixamorig:RightHand',
  'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg',
  'mixamorig:LeftFoot', 'mixamorig:LeftToeBase',
  'mixamorig:RightUpLeg', 'mixamorig:RightLeg',
  'mixamorig:RightFoot', 'mixamorig:RightToeBase',
];

describe('canonical skeleton', () => {
  test('joint list matches UniMate mixamo core exactly and in order', () => {
    expect(CORE_JOINTS.map(([n]) => `${RIG_PREFIX}${n}`)).toEqual(UNIMATE_MIXAMO_CORE);
    expect(JOINTS.slice(0, 22)).toEqual(CORE_JOINTS);
    expect(JOINTS.slice(22)).toEqual([['Jaw', 'Head'], ...HAND_JOINTS]);
  });

  test('bones have identity rest rotations and a single root', () => {
    const { bones, root } = createSkeleton(computeJointLayout());
    expect(bones).toHaveLength(JOINTS.length);
    expect(root.name).toBe('Hips');
    for (const b of bones) expect(b.quaternion.equals(b.quaternion.clone().identity())).toBe(true);
    expect(bones.filter((b) => !b.parent || !b.parent.isBone)).toHaveLength(1);
  });

  test('bind pose is left = +X, faces +Z, feet on the floor, scaled by height', () => {
    for (const height of [1.6, 1.78, 1.95]) {
      const { world } = computeJointLayout({ height });
      expect(world.LeftArm.x).toBeGreaterThan(0);
      expect(world.RightArm.x).toBeLessThan(0);
      expect(world.LeftToeBase.z).toBeGreaterThan(world.LeftFoot.z);
      expect(world.LeftFoot.y).toBeGreaterThan(0);
      expect(world.LeftFoot.y).toBeLessThan(0.12);
      expect(world.Head.y / height).toBeGreaterThan(0.85);
      expect(world.Head.y).toBeLessThan(height);
    }
  });

  test('left and right sides are mirror images', () => {
    const { world } = computeJointLayout({ shoulders: 1.1, build: 0.8 });
    for (const [name] of JOINTS.filter(([n]) => n.startsWith('Left'))) {
      const l = world[name];
      const r = world[name.replace('Left', 'Right')];
      expect(r.x).toBeCloseTo(-l.x, 6);
      expect(r.y).toBeCloseTo(l.y, 6);
      expect(r.z).toBeCloseTo(l.z, 6);
    }
  });
});
