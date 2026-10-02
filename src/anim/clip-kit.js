import * as THREE from 'three';
import { createPose, Pose, solveLeg } from './pose.js';

export const FPS = 30;
export const TAU = Math.PI * 2;
export const SIDES = ['Left', 'Right'];
export const ease = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const window01 = (t, a, b) => clamp01((t - a) / (b - a));

/** Cosine-interpolated cyclic key table (keys evenly spaced over one cycle). */
export function cyc(keys, phase) {
  const n = keys.length;
  const x = (((phase % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  const t = (1 - Math.cos((x - i) * Math.PI)) / 2;
  return keys[i] + (keys[(i + 1) % n] - keys[i]) * t;
}

export function armDirs(layout) {
  const d = layout.measures.armDir;
  return { Left: d.clone(), Right: d.clone().setX(-d.x) };
}

/** Relaxed standing base: arms down by the sides with a soft elbow. */
export function base(layout, { armDown = 23, elbow = 12, skip = [] } = {}) {
  const p = createPose();
  const dirs = armDirs(layout);
  for (const side of SIDES.filter((s) => !skip.includes(s))) {
    Pose.elbowFlex(p, side, dirs[side], elbow);
    Pose.armAbduct(p, side, -armDown);
    Pose.armFlex(p, side, 3);
  }
  for (const side of SIDES) Pose.hipAbduct(p, side, 3);
  const posture = layout.measures.posture ?? 0;
  if (posture > 0) {
    Pose.spineFlex(p, 'Spine1', posture * 8);
    Pose.spineFlex(p, 'Spine2', posture * 9);
    Pose.spineFlex(p, 'Neck', posture * 12);
    Pose.headNod(p, -posture * 16);
    for (const side of SIDES) Pose.shoulderShrug(p, side, -posture * 4);
  }
  return p;
}

export function plantLegs(layout, pose, { hips, ankles = {}, pitch = {} }) {
  for (const side of SIDES) {
    const target = ankles[side] ?? layout.world[`${side}Foot`].clone();
    const sol = solveLeg(layout, side, hips, target, pitch[side] ?? 0);
    Pose.kneeFlex(pose, side, sol.knee);
    Pose.hipFlex(pose, side, sol.thigh);
    Pose.ankleFlex(pose, side, sol.ankle);
  }
  pose.hips.copy(hips);
}
