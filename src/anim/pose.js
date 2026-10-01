import * as THREE from 'three';

const DEG = Math.PI / 180;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const SIGN = { Left: 1, Right: -1 };

const q = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, deg * DEG);

/**
 * Pose = { bones: { Name: Quaternion }, hips: Vector3 offset }. Bones rest at identity, so every
 * helper rotates in world-aligned axes. Positive angles are anatomical: flex = forward.
 */
export function createPose() {
  return { bones: {}, hips: new THREE.Vector3() };
}

/** Pre-multiplies a rotation so later calls act after earlier ones (in parent space). */
export function rotate(pose, bone, quat) {
  const cur = pose.bones[bone] ?? new THREE.Quaternion();
  pose.bones[bone] = quat.clone().multiply(cur);
  return pose;
}

export const Pose = {
  spineFlex: (p, bone, deg) => rotate(p, bone, q(X, deg)),
  spineTwist: (p, bone, deg) => rotate(p, bone, q(Y, deg)),
  spineSide: (p, bone, deg) => rotate(p, bone, q(Z, -deg)),
  headNod: (p, deg) => rotate(p, 'Head', q(X, deg)),
  headTurn: (p, deg) => rotate(p, 'Head', q(Y, deg)),
  headTilt: (p, deg) => rotate(p, 'Head', q(Z, -deg)),
  /** Raises the arm outward (+) or lowers it toward the body (−) from the A-pose. */
  armAbduct: (p, side, deg) => rotate(p, `${side}Arm`, q(Z, deg * SIGN[side])),
  /** Swings the arm forward (+) / back (−). Applied after abduction. */
  armFlex: (p, side, deg) => rotate(p, `${side}Arm`, q(X, -deg)),
  armTwist: (p, side, dir, deg) => rotate(p, `${side}Arm`, new THREE.Quaternion().setFromAxisAngle(dir, deg * DEG)),
  shoulderShrug: (p, side, deg) => rotate(p, `${side}Shoulder`, q(Z, deg * SIGN[side])),
  /** Elbow flex around the axis perpendicular to the rest forearm and +Z. */
  elbowFlex: (p, side, restDir, deg) => rotate(p, `${side}ForeArm`, new THREE.Quaternion().setFromAxisAngle(restDir.clone().cross(Z).normalize(), deg * DEG)),
  wristFlex: (p, side, restDir, deg) => rotate(p, `${side}Hand`, new THREE.Quaternion().setFromAxisAngle(restDir.clone().cross(Z).normalize(), deg * DEG)),
  hipFlex: (p, side, deg) => rotate(p, `${side}UpLeg`, q(X, -deg)),
  hipAbduct: (p, side, deg) => rotate(p, `${side}UpLeg`, q(Z, deg * SIGN[side])),
  hipTwist: (p, side, deg) => rotate(p, `${side}UpLeg`, q(Y, deg * SIGN[side])),
  kneeFlex: (p, side, deg) => rotate(p, `${side}Leg`, q(X, deg)),
  ankleFlex: (p, side, deg) => rotate(p, `${side}Foot`, q(X, -deg)),
  toeFlex: (p, side, deg) => rotate(p, `${side}ToeBase`, q(X, -deg)),
  /** Opens the mouth (+) by rotating the jaw down about the hinge in front of the ears. */
  jawOpen: (p, deg) => rotate(p, 'Jaw', q(X, deg)),
  rootYaw: (p, deg) => rotate(p, 'Hips', q(Y, deg)),
  rootPitch: (p, deg) => rotate(p, 'Hips', q(X, deg)),
  rootRoll: (p, deg) => rotate(p, 'Hips', q(Z, deg)),
};

/**
 * Sagittal two-bone IK for a leg. Given the hip joint and ankle target (world, z forward),
 * returns thigh flex, knee flex and ankle flex (degrees, anatomical) that keep the foot level.
 */
export function solveLeg(layout, side, hipOffset, ankleTarget, footPitchDeg = 0) {
  const w = layout.world;
  const hip = w[`${side}UpLeg`].clone().add(hipOffset);
  const knee0 = w[`${side}Leg`];
  const ankle0 = w[`${side}Foot`];
  const T = w[`${side}UpLeg`].distanceTo(knee0);
  const S = knee0.distanceTo(ankle0);
  const restThigh = Math.atan2(knee0.z - w[`${side}UpLeg`].z, w[`${side}UpLeg`].y - knee0.y);
  const restShin = Math.atan2(ankle0.z - knee0.z, knee0.y - ankle0.y);
  const dz = ankleTarget.z - hip.z;
  const dy = hip.y - ankleTarget.y;
  const L = Math.min(T + S - 1e-4, Math.max(Math.abs(T - S) + 1e-4, Math.hypot(dz, dy)));
  const reach = Math.atan2(dz, dy);
  const gamma = Math.acos(THREE.MathUtils.clamp((T * T + L * L - S * S) / (2 * T * L), -1, 1));
  const kneeInterior = Math.acos(THREE.MathUtils.clamp((T * T + S * S - L * L) / (2 * T * S), -1, 1));
  const thighWorld = reach + gamma;
  const shinWorld = thighWorld - (Math.PI - kneeInterior);
  const thigh = (thighWorld - restThigh) / DEG;
  const knee = ((thighWorld - shinWorld) - (restThigh - restShin)) / DEG;
  const ankle = footPitchDeg - (shinWorld - restShin) / DEG;
  return { thigh, knee, ankle };
}

/** Writes a pose into a skeleton's bones (bone names may carry a prefix). */
export function applyPose(bonesByJoint, pose) {
  for (const [name, bone] of Object.entries(bonesByJoint)) {
    bone.quaternion.copy(pose.bones[name] ?? new THREE.Quaternion());
  }
  const hips = bonesByJoint.Hips;
  hips.position.copy(hips.userData.restPosition ?? hips.position).add(pose.hips);
}

export { DEG, q };
