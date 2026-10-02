import * as THREE from 'three';
import { WEAPONS } from './specs.js';
import { frameRotation, handRestFrame, handGripOffset } from '../anim/arm-ik.js';

const PALETTE = { metal: '#2b2d31', polymer: '#18181b', accent: '#3d4148' };
const v3 = (a) => new THREE.Vector3(...a);
const HIDDEN_SCALE = 1e-4;
const shown = (node, on) => node.scale.setScalar(on ? 1 : HIDDEN_SCALE);

/**
 * Node names shared by the models and the weapon animation tracks. Every weapon type has its own
 * names, so a character can carry a pistol and a long gun at once.
 *   hand    the weapon in the right hand (frame + moving parts)
 *   stowed  the holstered / slung copy on the mount bone
 *   slide / bolt / mag   moving parts of the hand weapon; handMag the spare magazine in the left hand
 */
export const weaponNode = (type, part) => `wpn_${type}_${part}`;

function boxMesh(name, size, part) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color: PALETTE[part] ?? PALETTE.metal }));
  mesh.name = `${name}Mesh`;
  return mesh;
}

/** World-direction hand frame for a hand on this weapon, given the weapon's world rotation. */
export function weaponHandFrame(spec, side, weaponQuat) {
  const h = side === 'Right' ? spec.rightHand : spec.leftHand;
  return { fingers: v3(h.fingers).normalize().applyQuaternion(weaponQuat), palm: v3(h.palm).normalize().applyQuaternion(weaponQuat) };
}

export function socket(spec, name) {
  return v3(spec.sockets[name]);
}

/** Weapon rotation from a forward (muzzle) and up direction. */
export function weaponRotation(forward, up) {
  const z = forward.clone().normalize();
  const x = up.clone().cross(z).normalize();
  const y = z.clone().cross(x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Stowed transform relative to the mount bone (bones rest unrotated, so this is also bind space). */
export function mountTransform(layout, spec) {
  const k = layout.measures.height / 1.78;
  const quaternion = weaponRotation(v3(spec.mount.forward), v3(spec.mount.up));
  const grip = v3(spec.mount.grip).multiplyScalar(k);
  grip.x = Math.sign(grip.x) * (Math.abs(grip.x) - 0.215 * k + layout.measures.hipHalfWidth + 0.03 * k);
  return { position: grip.sub(socket(spec, 'grip').applyQuaternion(quaternion)), quaternion };
}

/**
 * Weapon pose relative to the right hand bone. The right hand's world rotation is the hand-rest frame
 * mapped onto the weapon's grip frame, so this offset is constant: parenting the weapon to the hand
 * bone with it keeps the grip under the palm in every frame of every clip.
 */
export function handToWeapon(layout, spec) {
  const rest = handRestFrame(layout, 'Right');
  const grip = weaponHandFrame(spec, 'Right', new THREE.Quaternion());
  const palm = grip.palm.clone().addScaledVector(grip.fingers, -grip.palm.dot(grip.fingers)).normalize();
  const handInWeapon = frameRotation(rest.fingers, rest.palm.clone().addScaledVector(rest.fingers, -rest.palm.dot(rest.fingers)).normalize(), grip.fingers, palm);
  const quaternion = handInWeapon.clone().invert();
  const position = handGripOffset(layout, 'Right').sub(socket(spec, 'grip').applyQuaternion(quaternion));
  return { position, quaternion };
}

/** Builds a weapon as rigid nodes: root (frame), moving-part groups, socket markers. */
export function buildWeaponModel(type, { root: rootName = weaponNode(type, 'hand'), moving = true } = {}) {
  const spec = WEAPONS[type];
  const root = new THREE.Group();
  root.name = rootName;
  root.userData.weapon = type;
  const groups = {};
  if (moving) {
    for (const [partName, members] of Object.entries(spec.moving ?? {})) {
      const g = new THREE.Group();
      g.name = weaponNode(type, partName);
      root.add(g);
      for (const m of members) groups[m] = g;
    }
  }
  for (const [name, center, size, part, pitch = 0] of spec.boxes) {
    const mesh = boxMesh(`${rootName}_${name}`, size, part);
    mesh.position.copy(v3(center));
    mesh.rotation.x = THREE.MathUtils.degToRad(pitch);
    (groups[name] ?? root).add(mesh);
  }
  if (moving) {
    for (const [name, p] of Object.entries(spec.sockets).filter(([, value]) => Array.isArray(value))) {
      const s = new THREE.Object3D();
      s.name = `socket_${name}`;
      s.position.copy(v3(p));
      root.add(s);
    }
  }
  return root;
}

/** A spare magazine that lives in the left hand during reloads (hidden otherwise). */
export function buildHandMagazine(layout, type) {
  const spec = WEAPONS[type];
  const src = spec.boxes.find(([n]) => n === 'mag');
  const g = new THREE.Group();
  g.name = weaponNode(type, 'handMag');
  const mesh = boxMesh(g.name, src[2], src[3]);
  const { fingers, palm } = handRestFrame(layout, 'Left');
  mesh.position.copy(handGripOffset(layout, 'Left').addScaledVector(palm, src[2][0] * 0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fingers.clone().negate());
  g.add(mesh);
  g.scale.setScalar(HIDDEN_SCALE);
  return g;
}

/** Holster shell around the stowed pistol's slide and frame. */
function holsterMesh(spec) {
  const slide = spec.boxes.find(([n]) => n === 'slide');
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(slide[2][0] + 0.014, slide[2][1] + 0.04, slide[2][2] * 0.9), new THREE.MeshLambertMaterial({ color: '#141212' }));
  mesh.name = 'holsterMesh';
  mesh.position.set(slide[1][0], slide[1][1] - 0.012, slide[1][2] + 0.012);
  return mesh;
}

function boneNamed(rig, name) {
  return rig.bones.find((b) => b.name === name || b.name.endsWith(`:${name}`));
}

/**
 * Attaches weapons to a built character: for each type, the hand model under RightHand (hidden until a
 * clip draws it), the stowed copy on its mount bone, and the spare magazine under LeftHand. The first
 * type starts in hand. Returns character.userData.weapon = { type, types, model }.
 */
export function attachWeapon(character, types) {
  const list = Array.isArray(types) ? types : [types];
  const { layout, rig } = character.userData;
  const right = boneNamed(rig, 'RightHand');
  const left = boneNamed(rig, 'LeftHand');
  const models = {};
  for (const [i, type] of list.entries()) {
    const spec = WEAPONS[type];
    const model = buildWeaponModel(type);
    const grip = handToWeapon(layout, spec);
    model.position.copy(grip.position);
    model.quaternion.copy(grip.quaternion);
    shown(model, i === 0);
    right.add(model);
    const stowed = buildWeaponModel(type, { root: weaponNode(type, 'stowed'), moving: false });
    const mount = mountTransform(layout, spec);
    stowed.position.copy(mount.position);
    stowed.quaternion.copy(mount.quaternion);
    shown(stowed, i !== 0);
    boneNamed(rig, spec.mount.bone).add(stowed);
    if (spec.kind === 'pistol') {
      const holster = holsterMesh(spec);
      holster.position.applyQuaternion(mount.quaternion).add(mount.position);
      holster.quaternion.copy(mount.quaternion);
      boneNamed(rig, spec.mount.bone).add(holster);
    }
    left.add(buildHandMagazine(layout, type));
    models[type] = model;
  }
  character.userData.weapon = { type: list[0], types: list, model: models[list[0]], models };
  return models[list[0]];
}
