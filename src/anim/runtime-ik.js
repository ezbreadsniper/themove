import * as THREE from 'three';
import { WEAPONS } from '../weapons/specs.js';
import { weaponHandFrame } from '../weapons/model.js';
import { solveArmFrom, handRotation, handGripOffset } from './arm-ik.js';

const SUPPORT_ELBOW = new THREE.Vector3(0.8, -1, -0.2);
const v = () => new THREE.Vector3();
const q = () => new THREE.Quaternion();

function bone(character, name) {
  return character.userData.rig.bones.find((b) => b.name === name || b.name.endsWith(`:${name}`));
}

/**
 * Runtime support-hand IK. Layered and additive playback (aim offsets, recoil over locomotion) bends
 * the two arms by blended rotations, which cannot keep two hands on one rigid weapon. After the mixer
 * runs, the left arm is re-solved onto the weapon's support rail in the actual posed skeleton,
 * weighted by the clip's `supportIK` channel (1 while the left hand belongs on the support, easing to
 * 0 through reloads and one-hand stances). Returns the weight applied.
 */
export function applySupportIK(character) {
  const w = character.userData.weapon;
  if (!w) return 0;
  const type = w.types.find((t) => (w.models[t].supportIK ?? 0) > 0.001 && w.models[t].scale.x > 0.5);
  if (!type) return 0;
  const model = w.models[type];
  const weight = Math.min(1, model.supportIK);
  const spec = WEAPONS[type];
  const { layout } = character.userData;
  // Parents too: the root moves every frame and is otherwise only refreshed when the scene renders.
  character.updateWorldMatrix(true, true);
  const toLocal = character.matrixWorld.clone().invert();
  const local = (p) => p.applyMatrix4(toLocal);
  const charQ = character.getWorldQuaternion(q()).invert();
  const localQ = (o) => charQ.clone().multiply(o.getWorldQuaternion(q()));

  const weaponQ = localQ(model);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(weaponQ);
  const support = local(model.getObjectByName('socket_support').getWorldPosition(v()));
  const rail = new THREE.Line3(support, support.clone().addScaledVector(forward, -(spec.sockets.supportSlide ?? 0)));
  const hand = bone(character, 'LeftHand');
  const current = local(hand.getWorldPosition(v())).add(handGripOffset(layout, 'Left').applyQuaternion(localQ(hand)));
  const target = rail.closestPointToPoint(current, true, v());
  const frame = weaponHandFrame(spec, 'Left', weaponQ);
  const handQ = handRotation(layout, 'Left', frame.fingers, frame.palm);
  const grip = new THREE.Vector3().copy(target);
  const wrist = grip.sub(handGripOffset(layout, 'Left').applyQuaternion(handQ));
  const arm = bone(character, 'LeftArm');
  const fore = bone(character, 'LeftForeArm');
  const r = solveArmFrom(layout, 'Left', local(arm.getWorldPosition(v())), localQ(bone(character, 'LeftShoulder')), wrist, handQ, SUPPORT_ELBOW);
  arm.quaternion.slerp(r.arm, weight);
  fore.quaternion.slerp(r.foreArm, weight);
  hand.quaternion.slerp(r.hand, weight);
  return weight;
}
