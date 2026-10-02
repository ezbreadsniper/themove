import * as THREE from 'three';
import { attach, boneByName } from '../garment/correctives.js';

/**
 * Joint-volume correctives for the skin (pose-space morph targets).
 *
 * Linear-blend skinning averages the parent and child bone matrices, so a vertex half-weighted across
 * a 90° bend is pulled toward the joint centre: the groin folds flat, the glutes go angular, knees and
 * elbows pinch. For each driver pose, every vertex in a joint's blend zone is instead rotated rigidly
 * about the joint by its weighted share of the bend (what dual-quaternion skinning does). The
 * difference from LBS is stored in bind space as a morph target with the same driver table the garment
 * correctives use, so `updateCorrectives` (Stage.update) drives it and glTF exports it as plain morphs.
 */
export const BODY_DRIVERS = [
  { joint: 'UpLeg', name: 'HipFlex45', angle: -45, to: -95 },
  { joint: 'UpLeg', name: 'HipFlex95', angle: -95, from: -45, to: -130 },
  { joint: 'UpLeg', name: 'HipFlex130', angle: -130, from: -95 },
  { joint: 'UpLeg', name: 'HipExtend', angle: 35 },
  { joint: 'Leg', name: 'KneeBend70', angle: 70, to: 130 },
  { joint: 'Leg', name: 'KneeBend130', angle: 130, from: 70 },
];

const X = new THREE.Vector3(1, 0, 0);
const MIN_SHIFT = 1e-5;
const FADE_SPAN = 0.05;

/** Bone indices of `bone` and everything below it (a vertex weighted to any of them moves with it). */
function subtree(skel, bone) {
  const out = new Set();
  const walk = (b) => {
    out.add(skel.bones.indexOf(b));
    b.children.forEach((c) => { if (c.isBone) walk(c); });
  };
  walk(bone);
  return out;
}

function bakeDriver(mesh, skel, side, driver, fade) {
  const bone = boneByName(skel, `${side}${driver.joint}`);
  const moving = subtree(skel, bone);
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const radians = THREE.MathUtils.degToRad(driver.angle);

  bone.quaternion.setFromAxisAngle(X, radians);
  skel.bones[0].updateMatrixWorld(true);
  skel.update();
  mesh.updateMatrixWorld(true);

  const pivot = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  const axis = X.clone().transformDirection(bone.parent.matrixWorld);
  const delta = new Float32Array(pos.count * 3);
  const bind = new THREE.Vector3();
  const lbs = new THREE.Vector3();
  const rigid = new THREE.Vector3();
  const blend = new THREE.Matrix3();
  const m3 = new THREE.Matrix3();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let any = false;
  for (let i = 0; i < pos.count; i++) {
    let share = 0;
    for (let c = 0; c < 4; c++) if (moving.has(si.getComponent(i, c))) share += sw.getComponent(i, c);
    if (share <= 0.001 || share >= 0.999) continue;
    bind.fromBufferAttribute(pos, i);
    lbs.copy(bind);
    mesh.applyBoneTransform(i, lbs);
    q.setFromAxisAngle(axis, radians * share);
    rigid.copy(bind).sub(pivot).applyQuaternion(q).add(pivot);
    const push = rigid.sub(lbs);
    if (push.lengthSq() < MIN_SHIFT * MIN_SHIFT) continue;
    blend.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c);
      if (!w) continue;
      m4.multiplyMatrices(skel.bones[si.getComponent(i, c)].matrixWorld, skel.boneInverses[si.getComponent(i, c)]);
      m3.setFromMatrix4(m4);
      for (let e = 0; e < 9; e++) blend.elements[e] += m3.elements[e] * w;
    }
    push.applyMatrix3(blend.invert()).multiplyScalar(fade(bind.y));
    if (push.lengthSq() < MIN_SHIFT * MIN_SHIFT) continue;
    delta.set([push.x, push.y, push.z], i * 3);
    any = true;
  }
  bone.quaternion.identity();
  return any ? {
    name: `${side}${driver.name}`,
    delta,
    driver: { bone: `${side}${driver.joint}`, axis: 'x', angle: driver.angle, ...(driver.from !== undefined ? { from: driver.from } : {}), ...(driver.to !== undefined ? { to: driver.to } : {}) },
  } : null;
}

/**
 * Bakes the joint-volume correctives onto a skinned skin mesh (body). Returns the driver table.
 * coveredAboveY: skin above this height is under a garment that keeps plain LBS, so the correction
 * fades out over FADE_SPAN below it (otherwise the preserved volume pushes through the fabric).
 */
export function bakeBodyCorrectives(mesh, rig, { drivers = BODY_DRIVERS, coveredAboveY = Infinity } = {}) {
  const fade = (y) => {
    const t = Math.max(0, Math.min(1, (coveredAboveY - y) / FADE_SPAN));
    return t * t * (3 - 2 * t);
  };
  const skel = rig.skeleton;
  const rest = skel.bones.map((b) => b.quaternion.clone());
  const targets = [];
  for (const side of ['Left', 'Right']) {
    for (const d of drivers) {
      const t = bakeDriver(mesh, skel, side, d, fade);
      if (t) targets.push(t);
    }
  }
  skel.bones.forEach((b, i) => b.quaternion.copy(rest[i]));
  skel.bones[0].updateMatrixWorld(true);
  skel.update();
  mesh.updateMatrixWorld(true);
  return attach(mesh, targets);
}
