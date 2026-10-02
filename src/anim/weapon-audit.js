import * as THREE from 'three';
import { handGripOffset } from './arm-ik.js';
import { WEAPONS } from '../weapons/specs.js';

const v = () => new THREE.Vector3();

function bone(character, name) {
  return character.userData.rig.bones.find((b) => b.name.endsWith(name));
}

/** World position of a hand's grip contact point, from the posed hand bone. */
export function handGripWorld(character, side) {
  const b = bone(character, `${side}Hand`);
  const offset = handGripOffset(character.userData.layout, side);
  return offset.applyMatrix4(b.matrixWorld);
}

export function socketWorldOf(character, name) {
  const s = character.userData.weapon?.model.getObjectByName(`socket_${name}`);
  return s ? s.getWorldPosition(v()) : null;
}

/**
 * Attachment of both hands to the weapon in the current (already applied) pose, in metres, plus the
 * muzzle and aim direction for stability checks. Call after mixer.update / updateMatrixWorld.
 */
export function weaponContact(character) {
  character.updateMatrixWorld(true);
  const grip = socketWorldOf(character, 'grip');
  const support = socketWorldOf(character, 'support');
  const muzzle = socketWorldOf(character, 'muzzle');
  const model = character.userData.weapon.model;
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  // The support hand may slide back along the handguard (short arms), so it is measured to that rail.
  const slide = WEAPONS[character.userData.weapon.type].sockets.supportSlide ?? 0;
  const rail = new THREE.Line3(support, support.clone().addScaledVector(forward, -slide));
  const left = handGripWorld(character, 'Left');
  return {
    right: handGripWorld(character, 'Right').distanceTo(grip),
    left: left.distanceTo(rail.closestPointToPoint(left, true, v())),
    muzzle,
    forward,
  };
}
