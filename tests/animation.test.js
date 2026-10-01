import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildCharacter } from '../src/character/build.js';
import { PRESETS } from '../src/character/presets/index.js';
import { bakeClip, CLIP_NAMES } from '../src/anim/clips.js';
import { JOINTS } from '../src/rig/skeleton.js';
import { skinnedPositions, meshByName } from './helpers.js';

function poseAt(group, clipName, time) {
  const mixer = new THREE.AnimationMixer(group);
  mixer.clipAction(bakeClip(group.userData.layout, clipName)).play();
  mixer.setTime(time);
  group.updateMatrixWorld(true);
}

function minY(mesh) {
  const p = skinnedPositions(mesh);
  let m = Infinity;
  for (let i = 1; i < p.length; i += 3) m = Math.min(m, p[i]);
  return m;
}

function maxEdgeStretch(mesh) {
  const rest = mesh.geometry.attributes.position.array;
  const posed = skinnedPositions(mesh);
  const idx = mesh.geometry.index.array;
  const len = (a, i, j) => Math.hypot(a[i * 3] - a[j * 3], a[i * 3 + 1] - a[j * 3 + 1], a[i * 3 + 2] - a[j * 3 + 2]);
  let worst = 1;
  for (let t = 0; t < idx.length; t += 3) {
    for (const [i, j] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) {
      const r = len(rest, i, j);
      if (r < 0.004) continue;
      worst = Math.max(worst, len(posed, i, j) / r);
    }
  }
  return worst;
}

describe('procedural clips', () => {
  const layout = buildCharacter(PRESETS[0]).userData.layout;

  test.each(CLIP_NAMES)('%s bakes finite tracks for all 22 joints (loops close)', (name) => {
    const clip = bakeClip(layout, name);
    expect(clip.tracks).toHaveLength(JOINTS.length + 1);
    for (const track of clip.tracks) {
      expect(track.values.every(Number.isFinite)).toBe(true);
      if (!clip.userData.loop) continue;
      const size = track.getValueSize();
      const first = Array.from(track.values.slice(0, size));
      const last = Array.from(track.values.slice(-size));
      first.forEach((v, i) => expect(Math.abs(v - last[i])).toBeLessThan(1e-4));
    }
  });
});

describe.each(PRESETS)('$id deformation and contact', (preset) => {
  const group = buildCharacter(preset);
  const shoes = meshByName(group, 'shoes');
  const body = meshByName(group, 'body');
  const feet = shoes ?? body;

  test.each([['idle', 1], ['crouch', 1.2], ['wave', 0.5], ['shrug', 0.9], ['lookAround', 1]])('feet stay planted during %s', (clip, t) => {
    poseAt(group, clip, t);
    const floor = minY(feet);
    expect(floor).toBeGreaterThan(-0.025);
    expect(floor).toBeLessThan(0.03);
  });

  test('feet leave the ground at the jump apex and land again', () => {
    poseAt(group, 'jump', 0.85);
    expect(minY(feet)).toBeGreaterThan(0.15);
    poseAt(group, 'jump', 1.35);
    expect(minY(feet)).toBeLessThan(0.03);
  });

  test.each([['walk', 0.3], ['crouch', 1.2], ['jump', 0.85], ['cheer', 0.4], ['turn', 0.6]])('body edges do not tear during %s', (clip, t) => {
    poseAt(group, clip, t);
    expect(maxEdgeStretch(body)).toBeLessThan(1.9);
  });
});
