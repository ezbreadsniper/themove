import * as THREE from 'three';
import { WEAPONS } from '../weapons/specs.js';
import { socket, weaponHandFrame, mountTransform } from '../weapons/model.js';
import { worldPose } from './fk.js';
import { gripAt, handRotation } from './arm-ik.js';
import { curlFingers, RELAXED_HAND } from './pose.js';

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
  /** Rifle lifted straight up off the back sling, hand above and behind the shoulder. */
  longLift: (spec, b) => bySocket(spec, 'grip', b.shoulderR.clone().add(new THREE.Vector3(-0.03 * b.k, 0.3 * b.k, -0.12 * b.k)), lookRotation(new THREE.Vector3(0.45, -0.85, -0.2), new THREE.Vector3(0, 0.2, -1))),
  /** Rifle coming off the back sling: lifted over the right shoulder, muzzle down and forward. */
  longOverShoulder: (spec, b) => bySocket(spec, 'grip', b.shoulderR.clone().add(new THREE.Vector3(-0.06 * b.k, 0.16 * b.k, 0.3 * b.k)), lookRotation(new THREE.Vector3(0.35, -0.75, 0.55))),
  longHip: (spec, b, aim) => bySocket(spec, 'grip', b.hips.clone().add(new THREE.Vector3(-0.17 * b.k, 0.1 * b.k, 0.2 * b.k)), lookRotation(aim)),
  /** Pistol whip wind-up: gun cocked back beside the right ear, muzzle up and back. */
  pistolWhipWind: (spec, b) => bySocket(spec, 'grip', b.shoulderR.clone().add(new THREE.Vector3(-0.02 * b.k, 0.14 * b.k, 0.06 * b.k)), lookRotation(new THREE.Vector3(0.1, 0.95, -0.25), new THREE.Vector3(-1, 0, 0))),
  /** Pistol whip follow-through: the frame has come down and across, muzzle leading down and left. */
  pistolWhipStrike: (spec, b) => bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(0.1 * b.k, -0.08 * b.k, 0.38 * b.k)), lookRotation(new THREE.Vector3(0.3, -0.45, 0.85), new THREE.Vector3(-0.8, 0.3, 0.2))),
  /**
   * Lying in a crate in front of the character (character space, absolute crate depth): flat, muzzle to
   * the left, so the right hand comes down onto the grip from above and behind. CRATE_GRIP is the grip.
   */
  crate: (spec, b) => bySocket(spec, 'grip', crateGrip(b.layout), lookRotation(new THREE.Vector3(1, 0, 0.2), new THREE.Vector3(0, 1, 0))),
  /** Coming up out of the crate: low in front of the belly, muzzle swinging from the left to the front. */
  crateLift: (spec, b) => bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.1 * b.k, -0.24 * b.k, 0.3 * b.k)), lookRotation(new THREE.Vector3(0.85, -0.25, 0.45), new THREE.Vector3(0, 1, 0))),
  /** Rifle shove wind-up: the gun turned across the chest at port arms (muzzle left), pulled in. */
  longPortWind: (spec, b) => bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.14 * b.k, -0.14 * b.k, 0.2 * b.k)), lookRotation(new THREE.Vector3(0.93, 0.33, 0.12), new THREE.Vector3(0, 0.35, 1))),
  /** Rifle shove contact: the receiver driven straight out at chest height with both hands. */
  longPortStrike: (spec, b) => bySocket(spec, 'grip', b.chest.clone().add(new THREE.Vector3(-0.13 * b.k, -0.08 * b.k, 0.44 * b.k)), lookRotation(new THREE.Vector3(0.95, 0.28, 0.05), new THREE.Vector3(0, 0.3, 1))),
};

/**
 * Weapon-local offsets on top of a stance: cant (roll about the bore, + = top to the right), tilt
 * (muzzle up +) and yaw, in degrees, plus a lift (m), all about the grip, which the right hand holds.
 * Used for reload presentation (magwell turned to the eyes), procedural sway and bob.
 */
export function offsetXform(base, spec, { cant = 0, tilt = 0, yaw = 0, lift = 0 } = {}) {
  if (!cant && !tilt && !yaw && !lift) return base;
  const pivot = socket(spec, 'grip');
  const d = THREE.MathUtils.degToRad;
  const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(-d(tilt), d(yaw), d(cant), 'YXZ'));
  const q = base.quaternion.clone().multiply(local);
  const pivotWorld = base.position.clone().add(pivot.clone().applyQuaternion(base.quaternion));
  return xform(pivotWorld.sub(pivot.clone().applyQuaternion(q)).add(new THREE.Vector3(0, lift, 0)), q);
}

/** Where a weapon lying in a crate is gripped: 55 cm up (on top of the load in a waist-low crate), 40 cm ahead, right of centre. */
export function crateGrip(layout) {
  const k = layout.measures.height / 1.78;
  return new THREE.Vector3(-0.08 * k, 0.55, 0.4 * k);
}

/** Weapon-local recoil offset: kick back along −Z and muzzle rise about the grip. */
export function recoilXform(base, spec, kick) {
  const k = spec.kind === 'pistol' ? { back: 0.038, rise: 12 } : { back: 0.035, rise: 4.5 };
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
    const depth = spec.magWellDepth ?? (spec.kind === 'pistol' ? 0.075 : 0.11);
    return { grip: socketWorld(spec, wx, 'magazine').add(along(q, 0.012, -depth, 0)), fingers: along(q, 0, 0.25, 1).normalize(), palm: along(q, -0.3, 1, 0).normalize() };
  }
  if (name === 'slide') {
    return { grip: socketWorld(spec, wx, 'sight').add(along(q, 0.004, 0.004, -0.035)), fingers: along(q, -1, 0, 0), palm: along(q, 0, -1, 0) };
  }
  if (name === 'bolt' && spec.sockets.cock) {
    // Top-mounted cocking knob: the hand comes over the top cover, palm down, fingers across.
    return { grip: socketWorld(spec, wx, 'cock').add(along(q, 0.006, 0.022, -0.01)), fingers: along(q, -1, -0.15, 0.1).normalize(), palm: along(q, 0, -1, 0) };
  }
  if (name === 'bolt') {
    return { grip: socketWorld(spec, wx, 'ejection').add(along(q, 0.01, 0.035, -0.08)), fingers: along(q, -1, -0.2, 0).normalize(), palm: along(q, 0, -1, 0) };
  }
  throw new Error(`Unknown hand target ${name}`);
}

/** Finger / thumb curl (degrees) for a hand at each target: wrapped on grips, holding a magazine, pinching. */
const CURL = {
  free: RELAXED_HAND,
  grip: { fingers: 100, thumb: 40 },
  support: { fingers: 85, thumb: 25 },
  supportLong: { fingers: 55, thumb: 30 },
  pouch: { fingers: 75, thumb: 45 },
  magWell: { fingers: 75, thumb: 45 },
  slide: { fingers: 60, thumb: 50 },
  bolt: { fingers: 70, thumb: 30 },
};

function curlFor(spec, name) {
  return CURL[name === 'support' && spec.kind !== 'pistol' ? 'supportLong' : name];
}

const ELBOW = { Right: new THREE.Vector3(-0.8, -1, -0.35), Left: new THREE.Vector3(0.8, -1, -0.2) };

/**
 * Elbow direction for a hand target: down and out in front of the body, swinging up and forward as the
 * hand reaches behind the shoulder (drawing from a back sling), so the arm never flips through the pole.
 */
function elbowPole(side, marks, grip) {
  const shoulder = side === 'Right' ? marks.shoulderR : marks.shoulderL;
  const u = Math.max(0, Math.min(1, (shoulder.z + 0.12 * marks.k - grip.z) / (0.35 * marks.k)));
  const behind = u * u * (3 - 2 * u);
  return ELBOW[side].clone().lerp(new THREE.Vector3(Math.sign(ELBOW[side].x) * 0.5, 0.6, 0.9), behind).normalize();
}

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
    const ca = curlFor(spec, from);
    const cb = curlFor(spec, to);
    curlFingers(pose, layout, side, { fingers: ca.fingers + (cb.fingers - ca.fingers) * t, thumb: ca.thumb + (cb.thumb - ca.thumb) * t });
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
      return gripAt(layout, pose, side, grip, rot, elbowPole(side, marks, grip));
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
