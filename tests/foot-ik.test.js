import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../src/character/build.js';
import { bakeAllClips } from '../src/anim/clips.js';
import { Animator } from '../src/anim/animator.js';

const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));

/** An idle character standing at the origin, held for `frames` frames on the given ground. */
function stand(ground, frames = 40, clip = 'idle') {
  const c = buildCharacter(trial);
  const root = new THREE.Group();
  root.add(c);
  const anim = new Animator(c, bakeAllClips(c.userData.layout));
  anim.locomotion(clip);
  if (ground) anim.setGround(ground);
  for (let i = 0; i < frames; i++) anim.update(1 / 30);
  c.updateWorldMatrix(true, true);
  return c;
}
const world = (c, name) => c.userData.rig.bones.find((b) => b.name.endsWith(name)).getWorldPosition(new THREE.Vector3());
const footPitch = (c) => {
  const a = world(c, 'LeftFoot');
  const t = world(c, 'LeftToeBase');
  return THREE.MathUtils.radToDeg(Math.atan2(t.y - a.y, Math.hypot(t.x - a.x, t.z - a.z)));
};

describe('runtime foot IK', () => {
  const flat = stand(null);

  test('flat ground leaves the pose exactly as the clip made it', () => {
    const c = stand(() => 0);
    // Compare components: angleTo reads float32 non-unit quaternions as ~6e-4 rad apart from themselves.
    c.userData.rig.bones.forEach((b, i) => {
      const other = flat.userData.rig.bones[i];
      expect(Math.max(...b.quaternion.toArray().map((v, j) => Math.abs(v - other.quaternion.toArray()[j]))), b.name).toBeLessThan(1e-6);
      expect(b.position.distanceTo(other.position), b.name).toBeLessThan(1e-6);
    });
  });

  test('a 15 cm step under the left foot lifts that foot onto it; the right stays planted', () => {
    const c = stand((x) => (x > 0 ? 0.15 : 0));
    expect(world(c, 'LeftFoot').y - world(flat, 'LeftFoot').y).toBeCloseTo(0.15, 2);
    expect(Math.abs(world(c, 'RightFoot').y - world(flat, 'RightFoot').y)).toBeLessThan(0.005);
  });

  test('ground lower under one foot drops the pelvis so that foot reaches down', () => {
    const c = stand((x) => (x > 0 ? -0.12 : 0));
    expect(world(c, 'LeftFoot').y - world(flat, 'LeftFoot').y).toBeCloseTo(-0.12, 2);
    expect(world(c, 'Hips').y - world(flat, 'Hips').y).toBeCloseTo(-0.12, 2);
    expect(Math.abs(world(c, 'RightFoot').y - world(flat, 'RightFoot').y)).toBeLessThan(0.005);
  });

  test('a planted foot on a 15 deg ramp pitches to the slope', () => {
    const slope = Math.tan(THREE.MathUtils.degToRad(15));
    const c = stand((x, z) => z * slope);
    expect(footPitch(c) - footPitch(flat)).toBeGreaterThan(10);
  });

  test('post-processing does not compound while a clip holds still (mixer skips unchanged values)', () => {
    // 'neutral' is a still pose: every frame samples identical values, so the mixer writes nothing.
    const flatStill = stand(null, 200, 'neutral');
    const a = stand((x) => (x > 0 ? 0.15 : 0), 40, 'neutral');
    const b = stand((x) => (x > 0 ? 0.15 : 0), 200, 'neutral');
    expect(world(a, 'Hips').distanceTo(world(b, 'Hips'))).toBeLessThan(1e-4);
    expect(world(b, 'LeftFoot').y - world(flatStill, 'LeftFoot').y).toBeCloseTo(0.15, 2);
  });
});
