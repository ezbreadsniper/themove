import * as THREE from 'three';
import { createPose, Pose, solveLeg } from './pose.js';
import { worldPose } from './fk.js';
import { solveTwoBone } from './arm-ik.js';

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

const KNEE_REST_POLE = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** Foot world rotation from a yaw (toes out +, degrees, per side) and a pitch (toes up +). */
export function footRotation(side, yawDeg = 0, pitchDeg = 0) {
  const s = side === 'Left' ? 1 : -1;
  return new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(yawDeg * s))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -THREE.MathUtils.degToRad(pitchDeg)));
}

/**
 * Full 3D leg plant on the posed pelvis: unlike plantLegs (sagittal, unrotated hips) this works with
 * a rolled / yawed pelvis and sideways hip shifts, so weight shifts keep the feet exactly planted.
 * pose.hips and the Hips rotation must already be set. ankles: world targets per side (default: rest),
 * feet: { [side]: { yaw, pitch } } in degrees (toes out / toes up), kneeOut: knee pole outward bias.
 */
export function plantFeet(layout, pose, { ankles = {}, feet = {}, kneeOut = 0.12 } = {}) {
  const fk = worldPose(layout, pose);
  for (const side of SIDES) {
    const s = side === 'Left' ? 1 : -1;
    const target = ankles[side] ?? layout.world[`${side}Foot`].clone();
    const { yaw = 0, pitch = 0 } = feet[side] ?? {};
    const footQ = footRotation(side, yaw, pitch);
    const pole = new THREE.Vector3(s * kneeOut, 0, 1).applyQuaternion(footRotation(side, yaw, 0)).normalize();
    const r = solveTwoBone(layout, [`${side}UpLeg`, `${side}Leg`, `${side}Foot`], fk.pos[`${side}UpLeg`], fk.quat.Hips, target, footQ, pole, KNEE_REST_POLE);
    pose.bones[`${side}UpLeg`] = r.upper;
    pose.bones[`${side}Leg`] = r.lower;
    pose.bones[`${side}Foot`] = r.end;
  }
  return pose;
}

/** Quadratic Bezier a → b with control c. */
export function bezier(a, c, b, u) {
  const v = 1 - u;
  return a.clone().multiplyScalar(v * v).addScaledVector(c, 2 * v * u).addScaledVector(b, u * u);
}

/** 0 → 1 → 0 bump over [a, b]. */
export const bump = (t, a, b) => Math.sin(Math.PI * window01(t, a, b));
/** Eased up over [a, b], held, eased down over [c, d]. */
export const envelope = (t, a, b, c, d) => ease(window01(t, a, b)) * (1 - ease(window01(t, c, d)));
