import * as THREE from 'three';
import { gripAt, handRotation } from './arm-ik.js';

const ARM = (side) => [`${side}Arm`, `${side}ForeArm`, `${side}Hand`];

/**
 * A hand target for reach(): where the grip point (palm centre) goes, the hand frame there (world
 * fingers / palm directions) and the elbow pole. Directions need not be orthogonal.
 */
export function handTargetAt(layout, side, grip, fingers, palm, pole) {
  return { grip: grip.clone(), rot: handRotation(layout, side, fingers, palm), pole: pole.clone().normalize() };
}

/** Hand frame from fingers and the thumb-side ("forward") direction: palm = fingers × forward (left) / forward × fingers (right). */
export function palmFrom(side, fingers, forward) {
  const f = fingers.clone().normalize();
  const fw = forward.clone().addScaledVector(f, -forward.dot(f)).normalize();
  return side === 'Left' ? f.clone().cross(fw) : fw.clone().cross(f);
}

/**
 * Moves one arm between two states, each a target (handTargetAt) or null (the arm as the body pose
 * already has it). Between two targets the grip position lerps, the hand rotation slerps and the arm
 * is re-solved (no pop); to or from a free arm the solved bone rotations blend with the free ones
 * (the IK and the body's own arm reach the same hand on different twists, so lerping targets would pop).
 */
export function reach(layout, pose, side, from, to, u) {
  if (!from && !to) return pose;
  const bones = ARM(side);
  const free = bones.map((b) => (pose.bones[b] ?? new THREE.Quaternion()).clone());
  const solve = (t) => gripAt(layout, pose, side, t.grip, t.rot, t.pole);
  if (from && to) {
    solve({ grip: from.grip.clone().lerp(to.grip, u), rot: from.rot.clone().slerp(to.rot, u), pole: from.pole.clone().lerp(to.pole, u).normalize() });
    return pose;
  }
  const target = from ?? to;
  const w = from ? 1 - u : u;
  if (w <= 0) return pose;
  solve(target);
  bones.forEach((b, i) => { pose.bones[b] = free[i].clone().slerp(pose.bones[b], w); });
  return pose;
}
