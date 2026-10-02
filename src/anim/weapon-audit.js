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

/** The weapon currently in hand (drawn copies are at scale 1, holstered ones hidden), else the first. */
export function drawnWeapon(character) {
  const w = character.userData.weapon;
  if (!w) return null;
  const type = (w.types ?? [w.type]).find((t) => w.models?.[t]?.scale.x > 0.5) ?? w.type;
  return { type, model: w.models?.[type] ?? w.model };
}

export function socketWorldOf(character, name) {
  const s = drawnWeapon(character)?.model.getObjectByName(`socket_${name}`);
  return s ? s.getWorldPosition(v()) : null;
}

/**
 * Attachment of both hands to the weapon in the current (already applied) pose, in metres, plus the
 * muzzle and aim direction for stability checks. Call after mixer.update / updateMatrixWorld.
 */
export function weaponContact(character) {
  character.updateWorldMatrix(true, true);
  const grip = socketWorldOf(character, 'grip');
  const support = socketWorldOf(character, 'support');
  const muzzle = socketWorldOf(character, 'muzzle');
  const { type, model } = drawnWeapon(character);
  const forward = new THREE.Vector3(0, 0, 1).transformDirection(model.matrixWorld);
  // The support hand may slide back along the handguard (short arms), so it is measured to that rail.
  const slide = WEAPONS[type].sockets.supportSlide ?? 0;
  const rail = new THREE.Line3(support, support.clone().addScaledVector(forward, -slide));
  const left = handGripWorld(character, 'Left');
  return {
    right: handGripWorld(character, 'Right').distanceTo(grip),
    left: left.distanceTo(rail.closestPointToPoint(left, true, v())),
    muzzle,
    forward,
  };
}
