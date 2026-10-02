import * as THREE from 'three';
import { worldPose } from './fk.js';

const REST_ELBOW_POLE = new THREE.Vector3(0, 0, -1);
/** Closest a wrist may come to its shoulder, as a fraction of arm length (~152° elbow flexion). */
const MIN_REACH = 0.24;

function orthoPole(axis, pole) {
  const p = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(axis, axis.z);
  return p.normalize();
}

/** Rotation taking the frame (axis, pole) to (axis', pole'); both pairs orthonormal. */
export function frameRotation(a0, p0, a1, p1) {
  const m0 = new THREE.Matrix4().makeBasis(a0, p0, a0.clone().cross(p0));
  const m1 = new THREE.Matrix4().makeBasis(a1, p1, a1.clone().cross(p1));
  return new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
}

/** Rest frame of a hand: fingers along the rest arm direction, palm normal facing the body side. */
export function handRestFrame(layout, side) {
  const s = side === 'Left' ? 1 : -1;
  const fingers = layout.measures.armDir.clone().setX(layout.measures.armDir.x * s).normalize();
  const palm = fingers.clone().cross(new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(s);
  return { fingers, palm };
}

/** Grip contact point in the hand bone's rest frame (relative to the wrist joint). */
export function handGripOffset(layout, side) {
  const { fingers, palm } = handRestFrame(layout, side);
  const k = layout.measures.height / 1.78;
  return fingers.clone().multiplyScalar(layout.measures.handLength * 0.42).addScaledVector(palm, 0.013 * k);
}

/**
 * Two-bone arm IK in world space, after whatever the pose already does to the spine and shoulders.
 * Places the wrist at `wrist`, bends the elbow toward `elbowPole` (world direction) and gives the hand
 * the world rotation `handWorld`. Writes Arm / ForeArm / Hand local rotations into the pose and
 * returns { reachable, error } (metres between requested and achieved wrist).
 */
export function solveArm(layout, pose, side, wrist, handWorld, elbowPole) {
  const fk = worldPose(layout, pose);
  const w = layout.world;
  const upper = w[`${side}Arm`].distanceTo(w[`${side}ForeArm`]);
  const lower = w[`${side}ForeArm`].distanceTo(w[`${side}Hand`]);
  const root = fk.pos[`${side}Arm`];
  const toTarget = wrist.clone().sub(root);
  // Elbow flexion stops near 152°: a wrist target closer to the shoulder than that is held off.
  const minReach = (upper + lower) * MIN_REACH;
  if (toTarget.length() < minReach) toTarget.setLength(minReach);
  const distance = toTarget.length();
  const maxReach = (upper + lower) * 0.9995;
  const d = Math.min(maxReach, Math.max(Math.abs(upper - lower) + 1e-4, distance));
  const dir = toTarget.normalize();
  const pole = orthoPole(dir, elbowPole);
  const cosA = THREE.MathUtils.clamp((upper ** 2 + d ** 2 - lower ** 2) / (2 * upper * d), -1, 1);
  const elbow = root.clone().addScaledVector(dir, upper * cosA).addScaledVector(pole, upper * Math.sqrt(1 - cosA * cosA));
  const reached = root.clone().addScaledVector(dir, d);

  const restUpper = w[`${side}ForeArm`].clone().sub(w[`${side}Arm`]).normalize();
  const restLower = w[`${side}Hand`].clone().sub(w[`${side}ForeArm`]).normalize();
  const upperDir = elbow.clone().sub(root).normalize();
  const lowerDir = reached.clone().sub(elbow).normalize();
  const armGlobal = frameRotation(restUpper, orthoPole(restUpper, REST_ELBOW_POLE), upperDir, orthoPole(upperDir, pole));
  const foreGlobal = frameRotation(restLower, orthoPole(restLower, REST_ELBOW_POLE), lowerDir, orthoPole(lowerDir, pole));
  const shoulderWorld = fk.quat[`${side}Shoulder`];
  pose.bones[`${side}Arm`] = shoulderWorld.clone().invert().multiply(armGlobal);
  pose.bones[`${side}ForeArm`] = armGlobal.clone().invert().multiply(foreGlobal);
  pose.bones[`${side}Hand`] = foreGlobal.clone().invert().multiply(handWorld);
  return { reachable: distance <= maxReach, error: reached.distanceTo(wrist) };
}

/** World rotation of a hand whose rest frame is mapped onto (fingers, palm) world directions. */
export function handRotation(layout, side, fingersWorld, palmWorld) {
  const rest = handRestFrame(layout, side);
  const fingers = fingersWorld.clone().normalize();
  return frameRotation(rest.fingers, orthoPole(rest.fingers, rest.palm), fingers, orthoPole(fingers, palmWorld));
}

/** Places a hand with world rotation `handWorld` so its grip point lands on `gripWorld`. */
export function gripAt(layout, pose, side, gripWorld, handWorld, elbowPole) {
  const wrist = gripWorld.clone().sub(handGripOffset(layout, side).applyQuaternion(handWorld));
  return { handWorld, ...solveArm(layout, pose, side, wrist, handWorld, elbowPole) };
}

/**
 * Places a hand so its grip point lands on `gripWorld` with the hand frame (fingers, palm) mapped onto
 * the world directions given; solves the arm to match.
 */
export function gripWith(layout, pose, side, gripWorld, fingersWorld, palmWorld, elbowPole) {
  return gripAt(layout, pose, side, gripWorld, handRotation(layout, side, fingersWorld, palmWorld), elbowPole);
}
