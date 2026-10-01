import * as THREE from 'three';

const V = () => new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Rotation taking basis (axis, pole) at rest to basis (axis, pole) now; axis is the bone direction. */
function basisRotation(a0, p0, a1, p1) {
  const m0 = new THREE.Matrix4().makeBasis(a0, p0, a0.clone().cross(p0));
  const m1 = new THREE.Matrix4().makeBasis(a1, p1, a1.clone().cross(p1));
  return new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
}

function orthoPole(axis, pole) {
  const p = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (p.lengthSq() < 1e-8) p.copy(Z).addScaledVector(axis, -Z.dot(axis));
  return p.normalize();
}

/** Rest-pose leg geometry for one side, cached per layout. */
export function legRig(layout, side) {
  const w = layout.world;
  const hip = w[`${side}UpLeg`].clone();
  const knee = w[`${side}Leg`].clone();
  const ankle = w[`${side}Foot`].clone();
  const toe = w[`${side}ToeBase`].clone();
  const k = layout.measures.height / 1.78;
  return {
    hip, knee, ankle, toe,
    thigh: hip.distanceTo(knee),
    shin: knee.distanceTo(ankle),
    heel: ankle.clone().add(new THREE.Vector3(0, -ankle.y + 0.004, -0.045 * k)),
    ball: toe.clone().setY(0.004),
  };
}

/**
 * Full 3D two-bone leg IK. Inputs are world-space (character root at origin facing +Z).
 * Returns GLOBAL rotations for UpLeg, Leg, Foot plus the solved knee and whether the target
 * was reachable. `footRot` is the desired global foot orientation.
 */
export function solveLeg3D(rig, hipPos, ankleTarget, footRot, pole = Z) {
  const toTarget = ankleTarget.clone().sub(hipPos);
  const maxReach = (rig.thigh + rig.shin) * 0.9995;
  const reachable = toTarget.length() <= maxReach;
  const d = Math.min(maxReach, Math.max(Math.abs(rig.thigh - rig.shin) + 1e-4, toTarget.length()));
  const dir = toTarget.normalize();
  const pp = orthoPole(dir, pole);
  const cosA = THREE.MathUtils.clamp((rig.thigh ** 2 + d ** 2 - rig.shin ** 2) / (2 * rig.thigh * d), -1, 1);
  const knee = hipPos.clone()
    .addScaledVector(dir, rig.thigh * cosA)
    .addScaledVector(pp, rig.thigh * Math.sqrt(1 - cosA * cosA));
  const ankle = hipPos.clone().addScaledVector(dir, d);

  const a0 = rig.knee.clone().sub(rig.hip).normalize();
  const a1 = knee.clone().sub(hipPos).normalize();
  const thighQ = basisRotation(a0, orthoPole(a0, Z), a1, orthoPole(a1, pp));
  const b0 = rig.ankle.clone().sub(rig.knee).normalize();
  const b1 = ankle.clone().sub(knee).normalize();
  const shinQ = basisRotation(b0, orthoPole(b0, Z), b1, orthoPole(b1, pp));
  return { thigh: thighQ, shin: shinQ, foot: footRot.clone(), knee, ankle, reachable };
}

/** Ankle position when the foot is pitched (+ = toes up) about the heel (toes up) or the ball (heel up). */
export function rolledAnkle(rig, pitchDeg, yaw = 0) {
  const pivot = pitchDeg >= 0 ? rig.heel : rig.ball;
  const rot = new THREE.Quaternion().setFromAxisAngle(Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -THREE.MathUtils.degToRad(pitchDeg)));
  const local = rig.ankle.clone().sub(pivot).applyQuaternion(rot);
  return { offset: pivot.clone().sub(rig.ankle).add(local), rot };
}

export { V };
