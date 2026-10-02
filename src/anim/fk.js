import * as THREE from 'three';
import { JOINTS } from '../rig/skeleton.js';

const PARENT = Object.fromEntries(JOINTS.map(([name, parent]) => [name, parent]));
const IDENTITY = new THREE.Quaternion();

/**
 * Forward kinematics of a pose on a layout (bones rest at identity rotation, so a bone's rest offset
 * is the difference of rest world positions). Returns world position and world rotation per joint,
 * in the character's root space (feet on y = 0, facing +Z).
 */
export function worldPose(layout, pose) {
  const pos = {};
  const quat = {};
  for (const [name, parent] of JOINTS) {
    const local = pose.bones[name] ?? IDENTITY;
    if (!parent) {
      pos[name] = layout.world[name].clone().add(pose.hips);
      quat[name] = local.clone();
      continue;
    }
    const offset = layout.world[name].clone().sub(layout.world[parent]);
    pos[name] = pos[parent].clone().add(offset.applyQuaternion(quat[parent]));
    quat[name] = quat[parent].clone().multiply(local);
  }
  return { pos, quat };
}

/** World rotation of a joint's parent (identity for the root). */
export function parentWorldQuat(fk, name) {
  const parent = PARENT[name];
  return parent ? fk.quat[parent] : IDENTITY.clone();
}

export { PARENT };
