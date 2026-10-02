import * as THREE from 'three';
import { JOINTS } from '../rig/skeleton.js';
import { createPose, Pose, rotate, relaxHands } from './pose.js';
import { gaitSampler, DIRECTIONS } from './gait.js';
import { solveLeg3D } from './ik.js';
import { makeWeaponSamplers } from './weapon-clips.js';
import { makeExtraSamplers } from './base-extra.js';

/**
 * Two-bone arm IK (shoulder joint → elbow → wrist) to a world target with an elbow pole, returning
 * local quaternions for Arm, ForeArm and Hand (hand fingers aimed at `aim`). Assumes the spine is near
 * rest, which holds for the gestures that use it.
 */
function armIK(L, side, target, pole, aim) {
  const w = L.world;
  const rig = {
    hip: w[`${side}Arm`].clone(),
    knee: w[`${side}ForeArm`].clone(),
    ankle: w[`${side}Hand`].clone(),
    thigh: w[`${side}Arm`].distanceTo(w[`${side}ForeArm`]),
    shin: w[`${side}ForeArm`].distanceTo(w[`${side}Hand`]),
  };
  const sol = solveLeg3D(rig, rig.hip, target, new THREE.Quaternion(), pole.clone().normalize());
  const handRest = L.measures.armDir.clone().setX(side === 'Left' ? L.measures.armDir.x : -L.measures.armDir.x);
  const foreDir = handRest.clone().applyQuaternion(sol.shin);
  const toAim = aim.clone().sub(sol.ankle).normalize();
  const handAim = foreDir.clone().lerp(toAim, 0.45).normalize();
  const handGlobal = new THREE.Quaternion().setFromUnitVectors(foreDir, handAim).multiply(sol.shin);
  return {
    [`${side}Arm`]: sol.thigh,
    [`${side}ForeArm`]: sol.thigh.clone().invert().multiply(sol.shin),
    [`${side}Hand`]: sol.shin.clone().invert().multiply(handGlobal),
  };
}

import { FPS, TAU, SIDES, ease, window01, armDirs, base, plantLegs } from './clip-kit.js';

const SAMPLERS = {
  neutral: { duration: 1, loop: true, sample: (L) => base(L) },
  aPose: { duration: 1, loop: true, sample: () => createPose() },
  idle: {
    duration: 4,
    loop: true,
    sample: (L, t) => {
      const energy = L.measures.energy ?? 1;
      const breath = Math.sin(t * TAU * 0.5) * (0.7 + energy * 0.3);
      const sway = Math.sin(t * TAU * 0.25) * energy;
      const p = base(L, { armDown: 23 + breath * 0.8, elbow: 12 + breath });
      Pose.spineFlex(p, 'Spine1', -1 + breath * 0.8);
      Pose.spineFlex(p, 'Spine2', breath * 0.6);
      Pose.headNod(p, 2 - breath * 0.6);
      Pose.headTurn(p, sway * 3);
      plantLegs(L, p, { hips: new THREE.Vector3(sway * 0.012, -0.006 + breath * 0.002, 0) });
      return p;
    },
  },
  walk: gaitSampler('walk', 0),
  run: gaitSampler('run', 0),
  turn: {
    duration: 4.8,
    loop: true,
    sample: (L, t, dur) => {
      const quarter = dur / 4;
      const n = Math.floor(t / quarter);
      const lt = (t - n * quarter) / quarter;
      const p = base(L);
      const yaw = (n + ease(window01(lt, 0.1, 0.8))) * 90;
      SIDES.forEach((side, i) => {
        const lift = Math.sin(Math.PI * window01(lt, 0.15 + i * 0.3, 0.45 + i * 0.3));
        Pose.kneeFlex(p, side, 5 + lift * 40);
        Pose.hipFlex(p, side, lift * 22);
        Pose.ankleFlex(p, side, -lift * 10);
      });
      Pose.rootYaw(p, yaw % 360);
      Pose.headTurn(p, 12 * Math.sin(Math.PI * window01(lt, 0, 0.6)));
      p.hips.set(0, -0.015 * Math.sin(Math.PI * lt), 0);
      return p;
    },
  },
  crouch: {
    duration: 2.4,
    loop: true,
    sample: (L, t, dur) => {
      const d = ease(window01(t / dur, 0.08, 0.38)) * (1 - ease(window01(t / dur, 0.62, 0.92)));
      const p = base(L, { armDown: 17, elbow: 12 + d * 40 });
      SIDES.forEach((side) => Pose.armFlex(p, side, d * 32));
      Pose.spineFlex(p, 'Spine', d * 14);
      Pose.spineFlex(p, 'Spine1', d * 10);
      Pose.headNod(p, -d * 18);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.4 * d * (L.measures.height / 1.78), -0.1 * d) });
      return p;
    },
  },
  jump: {
    duration: 1.8,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = L.measures.height / 1.78;
      const crouch = (a, b, c, depth) => depth * ease(window01(u, a, b)) * (1 - ease(window01(u, b, c)));
      const pre = crouch(0.02, 0.2, 0.3, 0.2);
      const land = crouch(0.62, 0.7, 0.9, 0.24);
      const air = window01(u, 0.3, 0.64);
      const airborne = u > 0.3 && u < 0.64;
      const height = airborne ? Math.sin(Math.PI * air) * 0.42 * k : 0;
      const p = base(L, { armDown: 17, elbow: 16 });
      const armLift = Math.sin(Math.PI * air) * (airborne ? 1 : 0);
      SIDES.forEach((side) => {
        Pose.armAbduct(p, side, armLift * 35 - pre * 40);
        Pose.armFlex(p, side, armLift * 70 - pre * 120 + land * 90);
      });
      Pose.spineFlex(p, 'Spine', (pre + land) * 70);
      Pose.headNod(p, -(pre + land) * 50);
      const hipsY = -(pre + land) * k;
      if (airborne) {
        const tuck = Math.sin(Math.PI * air);
        SIDES.forEach((side, i) => {
          Pose.kneeFlex(p, side, 10 + tuck * (55 + i * 10));
          Pose.hipFlex(p, side, tuck * (38 + i * 8));
          Pose.ankleFlex(p, side, -tuck * 25);
        });
        p.hips.set(0, height + 0.02 * k * (1 - tuck), 0);
      } else {
        plantLegs(L, p, { hips: new THREE.Vector3(0, hipsY, -(pre + land) * 0.25) });
      }
      return p;
    },
  },
  wave: {
    duration: 2,
    loop: true,
    sample: (L, t, dur) => {
      const p = base(L, { skip: ['Right'] });
      const dirs = armDirs(L);
      const w = Math.sin((t / dur) * TAU * 2);
      const upOut = new THREE.Vector3(-dirs.Right.y, dirs.Right.x, 0).multiplyScalar(-1).normalize();
      rotate(p, 'RightArm', new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), upOut));
      Pose.elbowFlex(p, 'Right', dirs.Right, 100);
      Pose.armAbduct(p, 'Right', 43 + w * 6);
      Pose.armFlex(p, 'Right', 18);
      Pose.wristFlex(p, 'Right', dirs.Right, w * 25);
      Pose.headTilt(p, -5);
      Pose.spineSide(p, 'Spine1', -3);
      plantLegs(L, p, { hips: new THREE.Vector3(0.01, -0.006, 0) });
      return p;
    },
  },
  shrug: {
    duration: 2,
    loop: true,
    sample: (L, t, dur) => {
      const s = Math.sin(Math.PI * window01(t / dur, 0.1, 0.8));
      const p = base(L, { armDown: 23 - s * 8, elbow: 12 + s * 70 });
      const dirs = armDirs(L);
      SIDES.forEach((side) => {
        Pose.shoulderShrug(p, side, s * 12);
        Pose.armFlex(p, side, s * 8);
        Pose.wristFlex(p, side, dirs[side], -s * 20);
      });
      Pose.headTilt(p, s * 10);
      Pose.headNod(p, -s * 4);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.006, 0) });
      return p;
    },
  },
  cheer: {
    duration: 1.6,
    loop: true,
    sample: (L, t, dur) => {
      const b = Math.abs(Math.sin((t / dur) * TAU));
      const p = base(L, { armDown: -108 - b * 20, elbow: 25 - b * 10 });
      SIDES.forEach((side) => Pose.armFlex(p, side, 12));
      Pose.headNod(p, -12);
      Pose.spineFlex(p, 'Spine2', -6);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.05 * (1 - b), 0) });
      return p;
    },
  },
  lookAround: {
    duration: 4,
    loop: true,
    sample: (L, t, dur) => {
      const p = base(L);
      const u = t / dur;
      Pose.headTurn(p, 38 * Math.sin(u * TAU));
      Pose.spineTwist(p, 'Spine2', 10 * Math.sin(u * TAU));
      Pose.headNod(p, 4 * Math.sin(u * TAU * 2));
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.006, 0) });
      return p;
    },
  },
  fall: {
    duration: 0.8,
    loop: true,
    sample: (L, t, dur) => {
      const f = Math.sin((t / dur) * TAU);
      const p = base(L, { armDown: -10 + f * 6, elbow: 30 });
      for (const [i, side] of SIDES.entries()) {
        Pose.armFlex(p, side, 25 + f * 8 * (i ? -1 : 1));
        Pose.kneeFlex(p, side, 28 + i * 14 + f * 6);
        Pose.hipFlex(p, side, 14 + i * 10 - f * 5);
        Pose.ankleFlex(p, side, -18);
      }
      Pose.spineFlex(p, 'Spine', -4);
      Pose.headNod(p, -8);
      return p;
    },
  },
  land: {
    duration: 0.7,
    loop: false,
    events: [{ name: 'impact', time: 0.04 }],
    sample: (L, t) => {
      const k = L.measures.height / 1.78;
      // Contact happens with the knees already bent (as in `fall`), then the legs absorb.
      const d = t < 0.15 ? 0.35 + 0.65 * ease(t / 0.15) : 1 - ease(window01(t, 0.15, 0.7));
      const p = base(L, { armDown: 15 - d * 20, elbow: 12 + d * 30 });
      SIDES.forEach((side) => Pose.armFlex(p, side, d * 40));
      Pose.spineFlex(p, 'Spine', d * 22);
      Pose.headNod(p, -d * 18);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.26 * d * k, -0.06 * d) });
      return p;
    },
  },
  stumble: {
    duration: 1.0,
    loop: false,
    events: [{ name: 'footstep', side: 'Left', time: 0.32 }],
    sample: (L, t) => {
      const k = L.measures.height / 1.78;
      const lurch = Math.sin(Math.PI * window01(t, 0, 0.55)) * (1 - window01(t, 0.55, 1));
      const step = ease(window01(t, 0.08, 0.32));
      const back = 1 - ease(window01(t, 0.55, 0.95));
      const p = base(L, { armDown: 10 - lurch * 50, elbow: 25 });
      SIDES.forEach((side, i) => Pose.armFlex(p, side, lurch * (50 + i * 20)));
      Pose.spineFlex(p, 'Spine', lurch * 24);
      Pose.headNod(p, lurch * 10);
      const left = L.world.LeftFoot.clone().add(new THREE.Vector3(0, 0, 0.28 * k * step * back));
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.08 * lurch * k, 0.09 * lurch * k), ankles: { Left: left } });
      return p;
    },
  },
  hitReact: {
    duration: 0.6,
    loop: false,
    events: [{ name: 'hit', time: 0 }],
    sample: (L, t) => {
      const h = t < 0.08 ? t / 0.08 : 1 - ease(window01(t, 0.08, 0.6));
      const p = base(L, { armDown: 20 - h * 15, elbow: 12 + h * 30 });
      Pose.spineFlex(p, 'Spine1', -h * 14);
      Pose.spineFlex(p, 'Spine2', -h * 10);
      Pose.spineTwist(p, 'Spine2', h * 12);
      Pose.headNod(p, -h * 20);
      Pose.headTurn(p, h * 15);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.02 * h, -0.04 * h) });
      return p;
    },
  },
  death: {
    duration: 1.8,
    loop: false,
    events: [{ name: 'bodyfall', time: 1.25 }],
    sample: (L, t) => {
      const k = L.measures.height / 1.78;
      const buckle = ease(window01(t, 0, 0.7));
      const fall = ease(window01(t, 0.55, 1.25));
      const settle = Math.sin(Math.PI * window01(t, 1.25, 1.6)) * 0.15;
      const p = base(L, { armDown: 20 - fall * 50, elbow: 20 + buckle * 20 });
      Pose.rootPitch(p, -fall * 82);
      for (const side of SIDES) {
        Pose.kneeFlex(p, side, buckle * 70 * (1 - fall * 0.6));
        Pose.hipFlex(p, side, buckle * 40 * (1 - fall * 0.5));
        Pose.armFlex(p, side, -fall * 30);
      }
      Pose.spineFlex(p, 'Spine', buckle * 20 * (1 - fall));
      Pose.headNod(p, -fall * 20 + settle * 40);
      const restY = L.world.Hips.y;
      p.hips.set(0, -(buckle * 0.35 + fall * (restY - 0.16 * k - 0.35)) , -fall * 0.25 * k);
      return p;
    },
  },
  pickup: {
    duration: 1.5,
    loop: false,
    events: [{ name: 'grab', time: 0.7 }],
    sample: (L, t) => {
      const k = L.measures.height / 1.78;
      const d = ease(window01(t, 0.05, 0.6)) * (1 - ease(window01(t, 0.85, 1.4)));
      const p = base(L, { armDown: 20, elbow: 12, skip: ['Right'] });
      const dirs = armDirs(L);
      Pose.elbowFlex(p, 'Right', dirs.Right, 10 + d * 10);
      Pose.armAbduct(p, 'Right', -20);
      Pose.armFlex(p, 'Right', d * 55);
      Pose.spineFlex(p, 'Spine', d * 28);
      Pose.spineFlex(p, 'Spine1', d * 16);
      Pose.headNod(p, -d * 10);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.36 * d * k, -0.1 * d * k) });
      return p;
    },
  },
  interact: {
    duration: 1.1,
    loop: false,
    events: [{ name: 'use', time: 0.5 }],
    sample: (L, t) => {
      const r = ease(window01(t, 0.05, 0.45)) * (1 - ease(window01(t, 0.65, 1.05)));
      const p = base(L, { skip: ['Right'] });
      const dirs = armDirs(L);
      Pose.elbowFlex(p, 'Right', dirs.Right, 40 - r * 25);
      Pose.armAbduct(p, 'Right', -20);
      Pose.armFlex(p, 'Right', 10 + r * 72);
      Pose.spineFlex(p, 'Spine1', r * 6);
      Pose.headNod(p, -r * 4);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.01, 0.02 * r) });
      return p;
    },
  },
  smoke: {
    duration: 6,
    loop: true,
    events: [{ name: 'exhale', time: 2.35 }],
    sample: (L, t) => {
      const up = ease(window01(t, 0.15, 0.9)) * (1 - ease(window01(t, 1.85, 2.55)));
      const p = base(L);
      const k = L.measures.height / 1.78;
      const mouth = new THREE.Vector3(0, L.measures.height - L.measures.headHeight * 0.8, 0.095 * k);
      const target = mouth.clone().add(new THREE.Vector3(-0.05 * k, -0.14 * k, 0.085 * k));
      const ik = armIK(L, 'Right', target, new THREE.Vector3(-0.7, -1, -0.15), mouth.clone().add(new THREE.Vector3(0.02 * k, 0, 0.03 * k)));
      for (const [bone, q] of Object.entries(ik)) {
        const rest = p.bones[bone] ?? new THREE.Quaternion();
        p.bones[bone] = rest.clone().slerp(q, up);
      }
      const drag = Math.sin(Math.PI * window01(t, 0.9, 1.8));
      Pose.headNod(p, -up * 3 + drag * 2);
      Pose.spineFlex(p, 'Spine2', -drag * 2);
      const exhale = Math.sin(Math.PI * window01(t, 2.3, 3.2));
      Pose.headNod(p, -exhale * 7);
      plantLegs(L, p, { hips: new THREE.Vector3(0.01, -0.006, 0) });
      return p;
    },
  },
  point: {
    duration: 1.6,
    loop: false,
    sample: (L, t) => {
      const r = ease(window01(t, 0.05, 0.4)) * (1 - ease(window01(t, 1.2, 1.55)));
      const p = base(L, { skip: ['Right'] });
      const dirs = armDirs(L);
      Pose.elbowFlex(p, 'Right', dirs.Right, 12 - r * 8);
      Pose.armAbduct(p, 'Right', -20 + r * 15);
      Pose.armFlex(p, 'Right', 10 + r * 80);
      Pose.headTurn(p, -r * 10);
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.008, 0) });
      return p;
    },
  },
};

for (const [name, deg] of Object.entries(DIRECTIONS)) {
  SAMPLERS[`walk_${name}`] = gaitSampler('walk', deg);
  SAMPLERS[`run_${name}`] = gaitSampler('run', deg);
  SAMPLERS[`crouchWalk_${name}`] = gaitSampler('crouchWalk', deg);
}
SAMPLERS.sprint = gaitSampler('sprint', 0);
SAMPLERS.crouchWalk = gaitSampler('crouchWalk', 0);

/** Crouched hold (loop): the bottom of the crouch clip with a slow breath. */
SAMPLERS.crouchIdle = {
  duration: 3,
  loop: true,
  sample: (L, t, dur) => {
    const breath = Math.sin((t / dur) * TAU);
    const p = base(L, { armDown: 17, elbow: 50 });
    SIDES.forEach((side) => Pose.armFlex(p, side, 32));
    Pose.spineFlex(p, 'Spine', 14 + breath * 0.6);
    Pose.spineFlex(p, 'Spine1', 10);
    Pose.headNod(p, -18);
    plantLegs(L, p, { hips: new THREE.Vector3(0, -0.4 * (L.measures.height / 1.78) + breath * 0.003, -0.1) });
    return p;
  },
};

/**
 * Seated on a chair/bench (~46 cm seat at 1.78 m): pelvis down and back, thighs near horizontal,
 * shins vertical with the feet planted forward. The clothing gauntlet's sitting test pose.
 */
SAMPLERS.sit = {
  duration: 3,
  loop: true,
  sample: (L, t, dur) => {
    const k = L.measures.height / 1.78;
    const w = L.world;
    const breath = Math.sin((t / dur) * TAU);
    const p = base(L, { armDown: 14, elbow: 38 });
    SIDES.forEach((side) => Pose.armFlex(p, side, 22));
    Pose.spineFlex(p, 'Spine', 4 + breath * 0.6);
    Pose.spineFlex(p, 'Spine1', 3);
    Pose.headNod(p, 3);
    const hipDrop = w.LeftUpLeg.y - (0.46 * k + 0.06 * k);
    const hips = new THREE.Vector3(0, -hipDrop, -0.06 * k);
    const thigh = w.LeftUpLeg.distanceTo(w.LeftLeg);
    const ankles = Object.fromEntries(SIDES.map((side) => [side, w[`${side}Foot`].clone().add(new THREE.Vector3(0, 0, hips.z + thigh * 0.92))]));
    plantLegs(L, p, { hips, ankles });
    return p;
  },
};

SAMPLERS.talk = {
  duration: 4,
  loop: true,
  sample: (L, t, dur) => {
    const p = SAMPLERS.idle.sample(L, (t / dur) * 4, 4);
    const syll = Math.abs(Math.sin(t * 9.1)) * (0.55 + 0.45 * Math.sin(t * 2.3 + 1)) * (1 - window01(t, 3.4, 3.8)) * window01(t, 0, 0.15);
    Pose.jawOpen(p, 0.5 + syll * 14);
    Pose.headNod(p, Math.sin(t * 3.1) * 2.5);
    Pose.headTilt(p, Math.sin(t * 1.3) * 2);
    return p;
  },
};

Object.assign(SAMPLERS, makeExtraSamplers(SAMPLERS));

export const CLIP_NAMES = Object.keys(SAMPLERS);

const WEAPON_SAMPLERS = makeWeaponSamplers(SAMPLERS);
Object.assign(SAMPLERS, WEAPON_SAMPLERS);

/** Clips that need a weapon in hand, by weapon type (bake only the ones a character carries). */
export const WEAPON_CLIP_NAMES = Object.keys(WEAPON_SAMPLERS);
export const clipsForWeapon = (type) => WEAPON_CLIP_NAMES.filter((n) => SAMPLERS[n].weapon === type);

export function samplePose(layout, name, time) {
  const s = SAMPLERS[name];
  return s.sample(layout, time % s.duration, s.duration);
}

/** Bakes a procedural sampler into a THREE.AnimationClip on the given bone naming. */
export function bakeClip(layout, name, { prefix = '' } = {}) {
  const s = SAMPLERS[name];
  const frames = Math.round(s.duration * FPS);
  const times = new Float32Array(frames + 1);
  const quats = Object.fromEntries(JOINTS.map(([j]) => [j, new Float32Array((frames + 1) * 4)]));
  const hipPos = new Float32Array((frames + 1) * 3);
  const props = {};
  const restHips = layout.world.Hips;
  for (let f = 0; f <= frames; f++) {
    const t = s.loop && f === frames ? 0 : (f / FPS);
    times[f] = f / FPS;
    const pose = relaxHands(s.sample(layout, t, s.duration), layout);
    for (const [path, value] of Object.entries(pose.props ?? {})) (props[path] ??= []).push(value);
    for (const [j] of JOINTS) {
      const qq = pose.bones[j] ?? new THREE.Quaternion();
      qq.toArray(quats[j], f * 4);
    }
    hipPos[f * 3] = restHips.x + pose.hips.x;
    hipPos[f * 3 + 1] = restHips.y + pose.hips.y;
    hipPos[f * 3 + 2] = restHips.z + pose.hips.z;
  }
  const tracks = JOINTS.map(([j]) => new THREE.QuaternionKeyframeTrack(`${prefix}${j}.quaternion`, times, quats[j]));
  tracks.push(new THREE.VectorKeyframeTrack(`${prefix}Hips.position`, times, hipPos));
  for (const [path, values] of Object.entries(props)) {
    if (typeof values[0] === 'boolean') tracks.push(new THREE.BooleanKeyframeTrack(path, times, values));
    else if (typeof values[0] === 'number') tracks.push(new THREE.NumberKeyframeTrack(path, times, values));
    else tracks.push(new THREE.VectorKeyframeTrack(path, times, values.flat()));
  }
  const clip = new THREE.AnimationClip(name, s.duration, tracks);
  clip.userData = { loop: s.loop, ...(s.weapon ? { weapon: s.weapon } : {}), ...(s.meta ? s.meta(layout) : {}), ...(s.events ? { events: s.events } : {}) };
  return clip;
}

/** Every shared clip, plus the clips for `opts.weapon` when the character carries one. */
export function bakeAllClips(layout, opts = {}) {
  const weapons = opts.weapons ?? (opts.weapon ? [opts.weapon] : []);
  const names = [...CLIP_NAMES, ...weapons.flatMap(clipsForWeapon)];
  return Object.fromEntries(names.map((n) => [n, bakeClip(layout, n, opts)]));
}
