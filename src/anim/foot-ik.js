import * as THREE from 'three';
import { solveTwoBone } from './arm-ik.js';

const KNEE_REST_POLE = new THREE.Vector3(0, 0, 1);
const MAX_PELVIS_DROP = 0.35;
const MAX_FOOT_PITCH = THREE.MathUtils.degToRad(30);
const PELVIS_RATE = 12;
const v = () => new THREE.Vector3();

function bone(character, name) {
  return character.userData.rig.bones.find((b) => b.name === name || b.name.endsWith(`:${name}`));
}

/**
 * Runtime foot IK on uneven ground. Clips are authored on a flat floor at the character root's
 * height; groundAt(x, z) → world height (or null for no ground) gives the real floor. Per frame:
 *   1. each foot's clip-relative height is re-based on the ground under it (delta = ground − root y)
 *   2. the pelvis drops by the lower foot's delta (smoothed, never raised), so the other leg can reach
 *   3. each leg is re-solved with two-bone IK (knee toward the foot's forward), keeping the clip's foot
 *   4. a planted foot pitches to the slope between its heel and toe
 * On flat ground every delta is 0 and the pose is unchanged. Call after the mixer (which rewrites the
 * hips position each frame). Returns { left, right, pelvis } deltas.
 */
export function applyFootIK(character, groundAt, dt = 1 / 30, state = character.userData.footIK ?? (character.userData.footIK = { pelvis: 0 })) {
  const { layout } = character.userData;
  character.updateWorldMatrix(true, true);
  const toLocal = character.matrixWorld.clone().invert();
  const charQ = character.getWorldQuaternion(new THREE.Quaternion());
  const rootY = character.getWorldPosition(v()).y;
  const k = layout.measures.height / 1.78;
  const sides = {};
  for (const side of ['Left', 'Right']) {
    const foot = bone(character, `${side}Foot`);
    const ankle = foot.getWorldPosition(v());
    const toe = bone(character, `${side}ToeBase`).getWorldPosition(v());
    const g = groundAt(ankle.x, ankle.z);
    const lift = ankle.y - rootY - layout.world[`${side}Foot`].y;
    sides[side] = { foot, ankle, toe, delta: g == null ? 0 : g - rootY, planted: 1 - THREE.MathUtils.smoothstep(lift, 0.02 * k, 0.1 * k) };
  }
  const want = THREE.MathUtils.clamp(Math.min(sides.Left.delta, sides.Right.delta, 0), -MAX_PELVIS_DROP * k, 0);
  state.pelvis += (want - state.pelvis) * Math.min(1, dt * PELVIS_RATE);
  const hips = bone(character, 'Hips');
  hips.position.y += state.pelvis;
  character.updateWorldMatrix(true, true);

  for (const side of ['Left', 'Right']) {
    const s = sides[side];
    const up = bone(character, `${side}UpLeg`);
    const leg = bone(character, `${side}Leg`);
    const localQ = (o) => charQ.clone().invert().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
    const footQ = localQ(s.foot);
    let target = s.ankle.clone().add(new THREE.Vector3(0, s.delta, 0));
    // Slope: pitch the planted foot to the ground line between heel and toe.
    const heel = s.ankle.clone().add(s.ankle.clone().sub(s.toe).multiplyScalar(0.5));
    const gToe = groundAt(s.toe.x, s.toe.z);
    const gHeel = groundAt(heel.x, heel.z);
    let pitched = footQ;
    let angle = 0;
    if (gToe != null && gHeel != null && s.planted > 0) {
      const run = Math.hypot(s.toe.x - heel.x, s.toe.z - heel.z) || 1;
      angle = THREE.MathUtils.clamp(Math.atan2(gToe - gHeel, run), -MAX_FOOT_PITCH, MAX_FOOT_PITCH) * s.planted;
      const forward = new THREE.Vector3(s.toe.x - heel.x, 0, s.toe.z - heel.z).normalize();
      const axis = new THREE.Vector3(0, 1, 0).cross(forward).normalize().applyQuaternion(charQ.clone().invert());
      pitched = new THREE.Quaternion().setFromAxisAngle(axis, -angle).multiply(footQ);
      target = target.add(new THREE.Vector3(0, ((gToe + gHeel) / 2 - (rootY + s.delta)) * s.planted, 0));
    }
    // Flat under this foot and no pelvis drop: the clip's leg is already right, leave it untouched.
    if (Math.abs(s.delta) < 1e-5 && Math.abs(state.pelvis) < 1e-5 && Math.abs(angle) < 1e-5 && Math.abs(target.y - s.ankle.y) < 1e-5) continue;
    const kneePole = new THREE.Vector3(s.toe.x - s.ankle.x, 0, s.toe.z - s.ankle.z).normalize().applyQuaternion(charQ.clone().invert());
    const r = solveTwoBone(layout, [`${side}UpLeg`, `${side}Leg`, `${side}Foot`], up.getWorldPosition(v()).applyMatrix4(toLocal), localQ(hips), target.applyMatrix4(toLocal), pitched, kneePole, KNEE_REST_POLE);
    up.quaternion.copy(r.upper);
    leg.quaternion.copy(r.lower);
    s.foot.quaternion.copy(r.end);
  }
  return { left: sides.Left.delta, right: sides.Right.delta, pelvis: state.pelvis };
}
