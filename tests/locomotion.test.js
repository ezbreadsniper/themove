import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildCharacter } from '../src/character/build.js';
import { PRESETS_BY_ID } from '../src/character/presets/index.js';
import { bakeClip } from '../src/anim/clips.js';
import { DIRECTIONS, GAITS } from '../src/anim/gait.js';

const trial = PRESETS_BY_ID['trial-default'];
const VARIANTS = {
  default: {},
  thin: { build: 0 },
  heavy: { build: 1 },
  short: { height: 1.56 },
  tall: { height: 2.0 },
  old: { age: 76 },
  young: { age: 15 },
};

function footPositions(group, clip, side, times) {
  const mixer = new THREE.AnimationMixer(group);
  mixer.clipAction(clip).play();
  const bone = group.userData.rig.byName[`${side}Foot`];
  return times.map((t) => {
    mixer.setTime(t);
    group.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  });
}

/**
 * Mid-stance (flat foot): in a world where the root moves at rootVelocity, the foot must be still.
 * In the in-place clip that means foot displacement == −rootVelocity · dt.
 */
function slideError(group, clip, kind) {
  const g = GAITS[kind];
  const v = new THREE.Vector3(...clip.userData.rootVelocity);
  let worst = 0;
  for (const [i, side] of ['Left', 'Right'].entries()) {
    const start = ((1 - i * 0.5) % 1) * g.cycle;
    const times = [0.2, 0.3, 0.4, 0.5].map((s) => (start + s * g.duty * g.cycle) % g.cycle);
    const pos = footPositions(group, clip, side, times);
    for (let j = 1; j < pos.length; j++) {
      const dt = ((times[j] - times[j - 1] + g.cycle) % g.cycle);
      const world = pos[j].clone().sub(pos[j - 1]).addScaledVector(v, dt);
      worst = Math.max(worst, world.length() / dt);
    }
  }
  return worst;
}

/** Smallest lateral distance between the two ankles over the cycle (feet must never cross). */
function minFootGap(group, clip) {
  const times = Array.from({ length: 20 }, (_, i) => (i / 20) * clip.duration);
  const l = footPositions(group, clip, 'Left', times);
  const r = footPositions(group, clip, 'Right', times);
  return Math.min(...l.map((p, i) => p.x - r[i].x));
}

describe.each(Object.entries(VARIANTS))('gait on %s body', (name, body) => {
  const group = buildCharacter({ ...trial, body: { ...trial.body, ...body } });
  test.each(Object.keys(DIRECTIONS).flatMap((d) => [['walk', d], ['run', d]]))('%s %s: planted foot does not slide', (kind, dir) => {
    const clip = bakeClip(group.userData.layout, `${kind}_${dir}`);
    expect(clip.userData.speed).toBeGreaterThan(kind === 'run' ? 0.9 : 0.3);
    const err = slideError(group, clip, kind);
    expect(err, `${name} ${kind}_${dir} slide m/s`).toBeLessThan(Math.max(0.05, clip.userData.speed * 0.03));
    expect(minFootGap(group, clip), `${name} ${kind}_${dir} feet cross`).toBeGreaterThan(0.075);
  });
});

describe('gait metadata', () => {
  test('8 directions per gait share one cycle length so phase-synced blending works', () => {
    const L = buildCharacter(trial).userData.layout;
    for (const kind of ['walk', 'run']) {
      const durations = new Set(Object.keys(DIRECTIONS).map((d) => bakeClip(L, `${kind}_${d}`).duration));
      expect(durations.size).toBe(1);
    }
  });

  test('footstep events land on heel strike for both feet', () => {
    const clip = bakeClip(buildCharacter(trial).userData.layout, 'walk_N');
    const steps = clip.userData.events.filter((e) => e.name === 'footstep');
    expect(steps.map((e) => e.side).sort()).toEqual(['Left', 'Right']);
    expect(Math.abs(steps[0].time - steps[1].time)).toBeCloseTo(clip.duration / 2, 5);
  });
});
