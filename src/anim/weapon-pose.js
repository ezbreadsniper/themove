import * as THREE from 'three';
import { WEAPONS } from '../weapons/specs.js';
import { socket, weaponHandFrame, mountTransform } from '../weapons/model.js';
import { worldPose } from './fk.js';
import { gripAt, handRotation } from './arm-ik.js';

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/** Rotation whose +Z is `forward` and whose +Y leans toward `up` (weapon space convention). */
export function lookRotation(forward, up = UP) {
  const z = forward.clone().normalize();
  const x = up.clone().cross(z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Aim direction from yaw (left +) and pitch (up +), degrees, in character space. */
export function aimDirection(yawDeg = 0, pitchDeg = 0) {
  const y = THREE.MathUtils.degToRad(yawDeg);
  const p = THREE.MathUtils.degToRad(pitchDeg);
  return new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
}

/** A weapon transform: position of the weapon origin and its rotation, in character space. */
export const xform = (position, quaternion) => ({ position, quaternion });

export function blendXform(a, b, t) {
  return xform(a.position.clone().lerp(b.position, t), a.quaternion.clone().slerp(b.quaternion, t));
}

/** Places the weapon so its socket `name` lands at `at` with rotation `q`. */
function bySocket(spec, name, at, q) {
  return xform(at.clone().sub(socket(spec, name).applyQuaternion(q)), q);
}

/** Body landmarks of the posed upper body that stances hang off. */
export function bodyMarks(layout, pose) {
  const fk = worldPose(layout, pose);
  const k = layout.measures.height / 1.78;
  const head = fk.pos.Head;
  const eye = head.clone().add(new THREE.Vector3(-0.032 * k, layout.measures.height - layout.measures.headHeight * 0.52 - layout.world.Head.y, 0.075 * k).applyQuaternion(fk.quat.Head));
  const reach = layout.measures.upperArm + layout.measures.foreArm;
  return { layout, fk, k, eye, reach, shoulderR: fk.pos.RightArm, shoulderL: fk.pos.LeftArm, chest: fk.pos.Spine2, hips: fk.pos.Hips, chestQ: fk.quat.Spine2 };
}

/**
 * Stance → weapon transform. aim is a unit direction; for long guns the stock sits in the right
 * shoulder pocket, for pistols the sights sit on the eye line (two-handed) or at arm's length.
 */
export const STANCES = {
  pistolAim: (spec, b, aim) => {
    // Sights on the eye line at near-full extension, pulled in whenever a lean or crouch would put
    // either hand out of reach.
    const q = lookRotation(aim);
    let wx = null;
    for (let d = b.reach * 0.84, i = 0; i < 12; i += 1, d *= 0.96) {
      wx = bySocket(spec, 'sight', b.eye.clone().addScaledVector(aim, d).add(new THREE.Vector3(0, -0.015 * b.k, 0)), q);
      const far = Math.max(b.shoulderR.distanceTo(socketWorld(spec, wx, 'grip')), b.shoulderL.distanceTo(socketWorld(spec, wx, 'support')));
      if (far < b.reach * 0.97) break;
    }
    return wx;
  },
  pistolAimOneHand: (spec, b, aim) => bySocket(spec, 'grip', b.shoulderR.clone().addScaledVector(aim, b.reach * 0.86).add(new THREE.Vector3(0.03 * b.k, 0.02 * b.k, 0)), lookRotation(aim)),
  pistolReady: (spec, b, aim) => {
    const low = aim.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(lookRotation(aim)), THREE.MathUtils.degToRad(32));
    return bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.01 * b.k, -0.04 * b.k, 0)).addScaledVector(aim, b.reach * 0.48), lookRotation(low));
  },
  pistolLow: (spec, b) => bySocket(spec, 'grip', b.hips.clone().add(new THREE.Vector3(-0.2 * b.k, -0.08 * b.k, 0.09 * b.k)), lookRotation(new THREE.Vector3(-0.1, -0.85, 0.5))),
  pistolHip: (spec, b, aim) => bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.06 * b.k, -0.13 * b.k, 0)).addScaledVector(aim, b.reach * 0.55), lookRotation(aim)),
  pistolInspect: (spec, b, aim) => bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.04 * b.k, 0.06 * b.k, 0.3 * b.k)), lookRotation(aim)),
  longInspect: (spec, b, aim) => bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.08 * b.k, -0.04 * b.k, 0.26 * b.k)), lookRotation(aim)),
  /** The stowed weapon (holster / sling) exactly where the mount bone carries it. */
  stowed: (spec, b) => {
    const m = mountTransform(b.layout, spec);
    const bone = spec.mount.bone;
    return xform(b.fk.pos[bone].clone().add(m.position.clone().applyQuaternion(b.fk.quat[bone])), b.fk.quat[bone].clone().multiply(m.quaternion));
  },
  longAim: (spec, b, aim) => bySocket(spec, 'butt', b.shoulderR.clone().add(new THREE.Vector3(0.045 * b.k, 0.012 * b.k, 0.045 * b.k)), lookRotation(aim)),
  longReady: (spec, b, aim) => {
    const low = aim.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(lookRotation(aim)), THREE.MathUtils.degToRad(38));
    return bySocket(spec, 'butt', b.shoulderR.clone().add(new THREE.Vector3(0.05 * b.k, -0.02 * b.k, 0.05 * b.k)), lookRotation(low));
  },
  longHigh: (spec, b, aim) => {
    const high = aim.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(lookRotation(aim)), THREE.MathUtils.degToRad(-50));
    return bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.08 * b.k, -0.06 * b.k, 0.2 * b.k)), lookRotation(high));
  },
  longHip: (spec, b, aim) => bySocket(spec, 'grip', b.hips.clone().add(new THREE.Vector3(-0.17 * b.k, 0.1 * b.k, 0.2 * b.k)), lookRotation(aim)),
};

/** Weapon-local recoil offset: kick back along −Z and muzzle rise about the grip. */
export function recoilXform(base, spec, kick) {
  const k = spec.kind === 'pistol' ? { back: 0.03, rise: 9 } : { back: 0.035, rise: 4 };
  const pivot = socket(spec, spec.kind === 'pistol' ? 'grip' : 'butt');
  const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -THREE.MathUtils.degToRad(k.rise * kick));
  const q = base.quaternion.clone().multiply(rot);
  const pivotWorld = base.position.clone().add(pivot.clone().applyQuaternion(base.quaternion));
  const position = pivotWorld.sub(pivot.clone().applyQuaternion(q)).addScaledVector(FWD.clone().applyQuaternion(base.quaternion), -k.back * kick);
  return xform(position, q);
}

export function socketWorld(spec, wx, name) {
  return wx.position.clone().add(socket(spec, name).applyQuaternion(wx.quaternion));
}

const along = (q, x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q);

/**
 * Named hand targets { grip, fingers, palm } (world). 'free' is the hand where the body pose left it
 * (the relaxed arm); the rest hang off the weapon or the belt.
 */
export function handTarget(spec, wx, marks, side, name) {
  const q = wx.quaternion;
  const k = marks.k;
  if (name === 'free') {
    const fk = marks.fk;
    const hq = fk.quat[`${side}Hand`];
    const s = side === 'Left' ? 1 : -1;
    const fingers = marks.layout.measures.armDir.clone().setX(marks.layout.measures.armDir.x * s).normalize();
    const palm = fingers.clone().cross(new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(s);
    const grip = fingers.clone().multiplyScalar(marks.layout.measures.handLength * 0.42).addScaledVector(palm, 0.013 * k).applyQuaternion(hq).add(fk.pos[`${side}Hand`]);
    return { grip, fingers: fingers.applyQuaternion(hq), palm: palm.applyQuaternion(hq) };
  }
  if (name === 'grip' || name === 'support') {
    const f = weaponHandFrame(spec, side, q);
    let grip = socketWorld(spec, wx, name);
    const slide = name === 'support' ? spec.sockets.supportSlide ?? 0 : 0;
    // Short arms hold a long gun further back on the handguard.
    for (let i = 0; i < 8 && slide && marks.shoulderL.distanceTo(grip) > marks.reach * 0.96; i += 1) {
      grip = grip.addScaledVector(along(q, 0, 0, -1), slide / 8);
    }
    return { grip, ...f };
  }
  if (name === 'pouch') {
    return { grip: marks.hips.clone().add(new THREE.Vector3(0.14 * k, 0.07 * k, 0.1 * k)), fingers: new THREE.Vector3(0.1, -1, 0.25).normalize(), palm: new THREE.Vector3(-1, 0, 0) };
  }
  if (name === 'magWell') {
    const depth = spec.kind === 'pistol' ? 0.075 : 0.11;
    return { grip: socketWorld(spec, wx, 'magazine').add(along(q, 0.012, -depth, 0)), fingers: along(q, 0, 0.25, 1).normalize(), palm: along(q, -0.3, 1, 0).normalize() };
  }
  if (name === 'slide') {
    return { grip: socketWorld(spec, wx, 'sight').add(along(q, 0.004, 0.004, -0.035)), fingers: along(q, -1, 0, 0), palm: along(q, 0, -1, 0) };
  }
  if (name === 'bolt') {
    return { grip: socketWorld(spec, wx, 'ejection').add(along(q, 0.01, 0.035, -0.08)), fingers: along(q, -1, -0.2, 0).normalize(), palm: along(q, 0, -1, 0) };
  }
  throw new Error(`Unknown hand target ${name}`);
}

const ELBOW = { Right: new THREE.Vector3(-0.8, -1, -0.35), Left: new THREE.Vector3(0.8, -1, -0.2) };

/**
 * Puts the hands where the clip wants them. hands = { Right: [from, to, t], Left: [from, to, t] } with
 * target names (see handTarget); a hand left at 'free' keeps the body pose's arm. The weapon is
 * parented to the right hand, so the right hand defines where it really is.
 * Returns attachment errors (metres) for validation.
 */
export function holdWeapon(layout, pose, type, wx, hands = { Right: ['grip', 'grip', 0], Left: ['support', 'support', 0] }, marks = bodyMarks(layout, pose)) {
  const spec = WEAPONS[type];
  const out = { Right: 0, Left: 0, reachable: true };
  for (const side of ['Right', 'Left']) {
    const [from, to, t] = hands[side];
    if (from === 'free' && (to === 'free' || t <= 0)) continue;
    if (to === 'free' && t >= 1) continue;
    const bones = [`${side}Arm`, `${side}ForeArm`, `${side}Hand`];
    const freePose = bones.map((b) => (pose.bones[b] ?? new THREE.Quaternion()).clone());
    // Toward or away from a free hand, the arm's own rotations blend (the IK and the body's arm reach the
    // same hand on different twists, so blending targets would pop); between two weapon targets, the
    // target position lerps and the hand rotation slerps.
    const solve = (name, other = null, u = 0) => {
      const a = handTarget(spec, wx, marks, side, name);
      let grip = a.grip;
      let rot = handRotation(layout, side, a.fingers, a.palm);
      if (other) {
        const b = handTarget(spec, wx, marks, side, other);
        grip = grip.clone().lerp(b.grip, u);
        rot = rot.slerp(handRotation(layout, side, b.fingers, b.palm), u);
      }
      return gripAt(layout, pose, side, grip, rot, ELBOW[side]);
    };
    let r;
    if (from === 'free' || to === 'free') {
      r = solve(from === 'free' ? to : from);
      const w = from === 'free' ? t : 1 - t;
      bones.forEach((b, i) => { pose.bones[b] = freePose[i].clone().slerp(pose.bones[b], w); });
      if (w < 1) {
        r.error = 0;
        r.reachable = true;
      }
    } else {
      r = solve(from, to, t);
    }
    out[side] = r.error;
    out.reachable &&= r.reachable;
  }
  return out;
}
