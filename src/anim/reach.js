import * as THREE from 'three';
import { gripAt, handRotation, handGripOffset } from './arm-ik.js';
import { worldPose } from './fk.js';


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
 * The arm as the pose has it, expressed as a target: the hand's grip point and world rotation, and the
 * elbow's direction off the shoulder–wrist line as the pole. Solving it reproduces the arm.
 */
export function freeTarget(layout, pose, side) {
  const fk = worldPose(layout, pose);
  const rot = fk.quat[`${side}Hand`].clone();
  const wrist = fk.pos[`${side}Hand`];
  const shoulder = fk.pos[`${side}Arm`];
  const elbow = fk.pos[`${side}ForeArm`];
  const line = wrist.clone().sub(shoulder).normalize();
  const off = elbow.clone().sub(shoulder);
  const pole = off.addScaledVector(line, -off.dot(line));
  if (pole.lengthSq() < 1e-8) pole.set(0, 0, -1);
  return { grip: wrist.clone().add(handGripOffset(layout, side).applyQuaternion(rot)), rot, pole: pole.normalize() };
}

/**
 * Moves one arm from one state to another by u (0..1). Each state is a target (handTargetAt) or null
 * (the arm as the body pose already has it). The whole path is solved by IK in hand space: the grip
 * lerps (bowed by `arc` × sin(πu) when given, so a hand does not cut through the body), the hand
 * rotation slerps and the elbow pole swings, so the elbow never swings out the way a blend of joint
 * rotations would. A free end is the arm as posed (freeTarget), which the IK reproduces exactly.
 */
export function reach(layout, pose, side, from, to, u, { arc = null } = {}) {
  if ((!from && !to) || (!from && u <= 0) || (!to && u >= 1)) return pose;
  const a = from ?? freeTarget(layout, pose, side);
  const b = to ?? freeTarget(layout, pose, side);
  const grip = a.grip.clone().lerp(b.grip, u);
  if (arc) grip.addScaledVector(arc, Math.sin(Math.PI * u));
  gripAt(layout, pose, side, grip, a.rot.clone().slerp(b.rot, u), a.pole.clone().lerp(b.pole, u).normalize());
  return pose;
}
