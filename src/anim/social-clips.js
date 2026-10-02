import * as THREE from 'three';
import { JOINTS } from '../rig/skeleton.js';
import { Pose, createPose, curlFingers, relaxHands } from './pose.js';
import { FPS, TAU, SIDES, ease, window01, base, plantLegs, armDirs } from './clip-kit.js';
import { gripWith } from './arm-ik.js';
import { worldPose } from './fk.js';
import { gaitSampler } from './gait.js';

/**
 * Social / ambient clips for NPCs (names prefixed `npc_`), in the same sampler shape as clips.js:
 * { duration, loop, events?, meta?, sample(L, t, dur) → Pose }. Loops use whole periods over their
 * duration so the first and last frames match. Hand placements use arm IK onto points in character
 * space (feet on y = 0, facing +Z, +X = the character's left).
 *
 * Registration: `registerSocialClips(registerSamplers)` merges them into the shared registry when
 * clips.js offers it; `bakeSocialClip` / `bakeSocialClips` bake them directly otherwise.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const kOf = (L) => L.measures.height / 1.78;
const S = { Left: 1, Right: -1 };
/** Smooth in/out envelope over [0, dur] with ramp fractions a (in) and b (out start). */
const env = (u, a = 0.18, b = 0.8) => ease(window01(u, 0, a)) * (1 - ease(window01(u, b, 1)));
/** Whole-cycle sine over the clip: n periods in [0, 1). */
const cyc = (u, n = 1, ph = 0) => Math.sin((u * n + ph) * TAU);

function idleBreath(L, p, u, { sway = 1, cycles = 1 } = {}) {
  const breath = cyc(u, cycles * 2);
  Pose.spineFlex(p, 'Spine1', -1 + breath * 0.7);
  Pose.spineFlex(p, 'Spine2', breath * 0.5);
  Pose.headNod(p, 1.5 - breath * 0.5);
  return breath * sway;
}

/** Hand onto a world point with a finger / palm direction (character space), elbow toward `pole`. */
function hand(L, p, side, at, fingers, palm, pole) {
  gripWith(L, p, side, at, fingers.clone().normalize(), palm.clone().normalize(), pole.clone().normalize());
}

/** Chest-front reference point (between the nipples, on the shirt surface). */
function chest(L, p) {
  const fk = worldPose(L, p);
  return { fk, front: fk.pos.Spine2.clone().add(V(0, 0.04 * kOf(L), 0.15 * kOf(L))) };
}

/** Arms folded across the chest: right forearm over left, hands tucked at the opposite biceps. */
function foldArms(L, p, amount = 1, breath = 0) {
  const k = kOf(L);
  const { front } = chest(L, p);
  const y = front.y - 0.1 * k + breath * 0.004;
  hand(L, p, 'Right', front.clone().add(V(0.13 * k, y - front.y + 0.02 * k, 0.02 * k)), V(1, 0.15, -0.35), V(0, 0, -1), V(-0.6, -0.8, 0.1));
  hand(L, p, 'Left', front.clone().add(V(-0.12 * k, y - front.y - 0.03 * k, 0.0)), V(-1, 0.25, -0.4), V(0, 0.2, -1), V(0.6, -0.8, 0.1));
  if (amount < 1) return;
  SIDES.forEach((side) => curlFingers(p, L, side, { fingers: 40, thumb: 20 }));
}

/** Hands in the front trouser pockets. */
function pockets(L, p, sides = SIDES) {
  const k = kOf(L);
  const hipY = L.world.Hips.y + p.hips.y;
  for (const side of sides) {
    const at = V(S[side] * 0.165 * k, hipY - 0.07 * k, 0.055 * k + p.hips.z);
    hand(L, p, side, at, V(S[side] * 0.15, -1, 0.35), V(-S[side], 0, 0.1), V(S[side] * 0.4, -0.3, -1));
    curlFingers(p, L, side, { fingers: 20, thumb: 30 });
  }
}

/** Talking: jaw syllables, small head beats; `u` in [0,1), loops cleanly. */
function talkFace(p, t, u, amt = 1) {
  const syll = Math.abs(Math.sin(t * 9.4)) * (0.55 + 0.45 * Math.sin(t * 2.2 + 1));
  const edge = window01(u, 0, 0.05) * (1 - window01(u, 0.95, 1));
  Pose.jawOpen(p, 0.5 + syll * 12 * amt * edge);
}

function gestureBase(L, u, { lean = 0, sway = 0.008 } = {}) {
  const p = base(L, { skip: ['Left', 'Right'] });
  const b = idleBreath(L, p, u);
  Pose.spineFlex(p, 'Spine2', lean);
  plantLegs(L, p, { hips: V(cyc(u) * sway * kOf(L), -0.008 + b * 0.002, 0) });
  return p;
}

/** One talking hand at a point in front of the body: from rest (0) to gesture (1). */
function gestureHand(L, p, side, at, fingers, palm, w) {
  const rest = base(L, { skip: SIDES.filter((s) => s !== side) });
  const restQ = (b) => (rest.bones[`${side}${b}`] ?? new THREE.Quaternion()).clone();
  if (w <= 0.001) {
    for (const b of ['Arm', 'ForeArm', 'Hand']) p.bones[`${side}${b}`] = restQ(b);
    return;
  }
  hand(L, p, side, at, fingers, palm, V(S[side] * 0.8, -0.6, -0.2));
  for (const b of ['Arm', 'ForeArm', 'Hand']) p.bones[`${side}${b}`] = restQ(b).slerp(p.bones[`${side}${b}`], w);
}

const RUN = gaitSampler('run', 0);

export const SOCIAL_SAMPLERS = {
  /** Weight shifts from foot to foot with a slow look; long, unhurried loop. */
  npc_idle_weight: {
    duration: 6,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L, { armDown: 22, elbow: 14 });
      idleBreath(L, p, u, { cycles: 2 });
      const shift = cyc(u, 1);
      Pose.spineSide(p, 'Spine1', -shift * 2);
      Pose.headTurn(p, cyc(u, 1, 0.3) * 8);
      Pose.headTilt(p, shift * 2);
      const relaxed = Math.max(0, shift);
      const ankles = { Right: L.world.RightFoot.clone().add(V(0.01 * k * relaxed, 0.012 * k * relaxed, 0.03 * k * relaxed)) };
      plantLegs(L, p, { hips: V(shift * 0.03 * k, -0.012 * k - Math.abs(shift) * 0.006 * k, 0), ankles });
      return p;
    },
  },
  /** Arms folded, weight on one leg, slow head movement. */
  npc_idle_armsCrossed: {
    duration: 5,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L, { skip: SIDES });
      const b = idleBreath(L, p, u, { cycles: 2 });
      Pose.headTurn(p, cyc(u, 1) * 6);
      Pose.spineSide(p, 'Spine1', 1.5);
      plantLegs(L, p, { hips: V(0.018 * k, -0.012 * k, 0), ankles: { Left: L.world.LeftFoot.clone().add(V(0.02 * k, 0, 0.04 * k)) } });
      foldArms(L, p, 1, b);
      return p;
    },
  },
  /** Hands in pockets, slight rock heel-to-toe. */
  npc_idle_pockets: {
    duration: 4,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L, { skip: SIDES });
      idleBreath(L, p, u, { cycles: 2 });
      Pose.headTurn(p, cyc(u, 1, 0.2) * 7);
      Pose.headNod(p, cyc(u, 2) * 1.5);
      SIDES.forEach((side) => Pose.shoulderShrug(p, side, 2 + cyc(u, 2) * 1.5));
      plantLegs(L, p, { hips: V(cyc(u) * 0.01 * k, -0.01 * k, cyc(u, 2) * 0.008 * k) });
      pockets(L, p);
      return p;
    },
  },
  /** Head down at a phone held in the right hand, thumb scrolling; left hand in pocket. */
  npc_phone: {
    duration: 4,
    loop: true,
    events: [{ name: 'tap', time: 1.1 }, { name: 'tap', time: 2.9 }],
    meta: () => ({ prop: 'phone' }),
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L, { skip: SIDES });
      idleBreath(L, p, u, { cycles: 2 });
      Pose.spineFlex(p, 'Spine2', 4);
      Pose.headNod(p, -22 + cyc(u, 2) * 1.5);
      plantLegs(L, p, { hips: V(0.012 * k, -0.01 * k, 0) });
      const { front } = chest(L, p);
      const at = front.clone().add(V(-0.04 * k, -0.06 * k, 0.17 * k + cyc(u, 1) * 0.004));
      hand(L, p, 'Right', at, V(0.3, 0.6, 0.6), V(0.1, 1, -0.4), V(-0.5, -1, -0.2));
      curlFingers(p, L, 'Right', { fingers: 45, thumb: 10 + Math.abs(Math.sin(u * TAU * 4)) * 25 });
      pockets(L, p, ['Left']);
      return p;
    },
  },
  /** Back against a wall (behind the character), one foot flat on it, arms folded. */
  npc_lean_wall: {
    duration: 5,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L, { skip: SIDES });
      const b = idleBreath(L, p, u, { cycles: 2 });
      Pose.spineFlex(p, 'Spine', -6);
      Pose.spineFlex(p, 'Spine1', -3);
      Pose.headNod(p, 6);
      Pose.headTurn(p, cyc(u, 1) * 9);
      const ankles = { Left: L.world.LeftFoot.clone().add(V(-0.02 * k, 0.26 * k, -0.12 * k)), Right: L.world.RightFoot.clone().add(V(0, 0, 0.12 * k)) };
      plantLegs(L, p, { hips: V(0, -0.03 * k, 0.07 * k), ankles, pitch: { Left: 25 } });
      foldArms(L, p, 1, b);
      return p;
    },
  },
  /** Startle: shoulders jump, half step back, then a wary hold. */
  npc_alert: {
    duration: 1.3,
    loop: false,
    events: [{ name: 'startle', time: 0.05 }],
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const jolt = Math.sin(Math.PI * window01(u, 0, 0.3));
      const back = ease(window01(u, 0.05, 0.35)) * (1 - 0.6 * ease(window01(u, 0.6, 1)));
      const p = base(L, { armDown: 18 - jolt * 12, elbow: 14 + jolt * 45 + back * 15 });
      SIDES.forEach((side) => {
        Pose.shoulderShrug(p, side, jolt * 12);
        Pose.armFlex(p, side, jolt * 25 + back * 10);
      });
      Pose.spineFlex(p, 'Spine1', -jolt * 8 - back * 3);
      Pose.headNod(p, -jolt * 6);
      SIDES.forEach((side) => curlFingers(p, L, side, { fingers: 15 - jolt * 10, thumb: 8 }));
      const ankles = { Right: L.world.RightFoot.clone().add(V(0, Math.sin(Math.PI * window01(u, 0.08, 0.32)) * 0.05 * k, -0.2 * k * back)) };
      plantLegs(L, p, { hips: V(0, -0.02 * k * jolt, -0.07 * k * back), ankles });
      return p;
    },
  },
  /** Crouched, arms wrapped over the head, trembling. */
  npc_fear_cower: {
    duration: 2,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const tremble = Math.sin(u * TAU * 12) * 0.6;
      const p = base(L, { skip: SIDES });
      Pose.spineFlex(p, 'Spine', 18);
      Pose.spineFlex(p, 'Spine1', 14 + tremble);
      Pose.spineFlex(p, 'Spine2', 10);
      Pose.headNod(p, -28);
      plantLegs(L, p, { hips: V(0, -0.42 * k + cyc(u, 2) * 0.004 * k, -0.12 * k) });
      const fk = worldPose(L, p);
      for (const side of SIDES) {
        const at = fk.pos.Head.clone().add(V(S[side] * 0.08 * k, 0.13 * k + tremble * 0.002, 0.06 * k));
        hand(L, p, side, at, V(-S[side] * 0.6, 0.2, 0.5), V(0, -1, -0.3), V(S[side] * 0.6, -0.2, 0.8));
        curlFingers(p, L, side, { fingers: 35, thumb: 15 });
      }
      return p;
    },
  },
  /** Surrender: hands up beside the head, palms out, a nervous sway. */
  npc_handsUp: {
    duration: 2,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L, { skip: SIDES });
      Pose.spineFlex(p, 'Spine1', -3);
      Pose.headNod(p, 4);
      plantLegs(L, p, { hips: V(cyc(u) * 0.008 * k, -0.012 * k, -0.02 * k) });
      const fk = worldPose(L, p);
      for (const side of SIDES) {
        const at = fk.pos.Head.clone().add(V(S[side] * 0.32 * k, 0.1 * k + cyc(u, 2, side === 'Left' ? 0 : 0.25) * 0.01 * k, 0.06 * k));
        hand(L, p, side, at, V(S[side] * 0.1, 1, 0.05), V(0, 0, 1), V(S[side], -0.8, 0));
        curlFingers(p, L, side, { fingers: 6, thumb: 4 });
      }
      return p;
    },
  },
  /** Flinch and duck before breaking into a run (the controller turns the body away). */
  npc_flee_start: {
    duration: 0.6,
    loop: false,
    meta: () => ({ then: 'npc_flee_run' }),
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const duck = Math.sin(Math.PI * window01(u, 0, 0.75));
      const p = base(L, { armDown: 10 - duck * 40, elbow: 30 + duck * 70 });
      SIDES.forEach((side) => Pose.armFlex(p, side, duck * 40));
      Pose.spineFlex(p, 'Spine', duck * 16);
      Pose.headNod(p, -duck * 20);
      plantLegs(L, p, { hips: V(0, -0.14 * k * duck, -0.04 * k * duck) });
      return p;
    },
  },
  /** Panicked run: the run cycle with the head ducked and arms higher. */
  npc_flee_run: {
    ...RUN,
    sample: (L, t, dur) => {
      const p = RUN.sample(L, t, dur);
      Pose.headNod(p, -10);
      Pose.spineFlex(p, 'Spine1', 6);
      SIDES.forEach((side) => {
        Pose.armAbduct(p, side, 12);
        Pose.shoulderShrug(p, side, 6);
      });
      return p;
    },
  },
  /** Aggressive point: lean in, jabbing a finger at whoever stands in front. */
  npc_anger_point: {
    duration: 2.4,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const jab = Math.max(0, cyc(u, 3)) ** 2;
      const p = base(L, { skip: ['Right'] , armDown: 18, elbow: 30 });
      Pose.spineFlex(p, 'Spine1', 6 + jab * 3);
      Pose.headNod(p, -4 + jab * 3);
      Pose.headTurn(p, cyc(u, 2) * 3);
      plantLegs(L, p, { hips: V(0, -0.01 * k, 0.03 * k), ankles: { Right: L.world.RightFoot.clone().add(V(0, 0, 0.12 * k)) } });
      const fk = worldPose(L, p);
      const at = fk.pos.RightArm.clone().add(V(0.06 * k, -0.06 * k + jab * 0.02 * k, (0.42 + jab * 0.1) * k));
      hand(L, p, 'Right', at, V(0.1, 0.05, 1), V(0, -1, 0), V(-0.8, -1, -0.2));
      curlFingers(p, L, 'Right', { fingers: 25, thumb: 25 });
      curlFingers(p, L, 'Left', { fingers: 70, thumb: 40 });
      talkFace(p, t, u, 1.3);
      return p;
    },
  },
  /** Squaring up: chest out, fists low, chin forward, a slow bounce. */
  npc_confront: {
    duration: 2,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const bob = cyc(u, 2);
      const p = base(L, { armDown: 14, elbow: 35 });
      SIDES.forEach((side) => {
        Pose.armAbduct(p, side, 6);
        Pose.armFlex(p, side, 8);
        Pose.shoulderShrug(p, side, 4);
        curlFingers(p, L, side, { fingers: 85, thumb: 45 });
      });
      Pose.spineFlex(p, 'Spine1', -6);
      Pose.spineFlex(p, 'Neck', 8);
      Pose.headNod(p, -6);
      plantLegs(L, p, { hips: V(0, -0.03 * k + bob * 0.006 * k, 0), ankles: { Left: L.world.LeftFoot.clone().add(V(0.04 * k, 0, 0.12 * k)), Right: L.world.RightFoot.clone().add(V(-0.03 * k, 0, -0.06 * k)) } });
      return p;
    },
  },
  /** Friendly wave: hand comes up beside the head, three waves, back down. */
  npc_greet_wave: {
    duration: 2,
    loop: false,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const e = env(u, 0.22, 0.78);
      const p = base(L, { skip: ['Right'] });
      idleBreath(L, p, u);
      Pose.headTilt(p, -4 * e);
      Pose.spineSide(p, 'Spine1', -3 * e);
      plantLegs(L, p, { hips: V(0.008 * k, -0.008 * k, 0) });
      const fk = worldPose(L, p);
      const w = Math.sin(window01(u, 0.2, 0.8) * TAU * 3) * e;
      const at = fk.pos.Head.clone().add(V(-0.3 * k + w * 0.06 * k, 0.02 * k, 0.1 * k));
      gestureHand(L, p, 'Right', at, V(w * 0.35, 1, 0.1), V(0, 0, 1), e);
      return p;
    },
  },
  /** Chin-up acknowledging nod. */
  npc_greet_nod: {
    duration: 1.2,
    loop: false,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L);
      const up = Math.sin(Math.PI * window01(u, 0.05, 0.4));
      const down = Math.sin(Math.PI * window01(u, 0.35, 0.8));
      Pose.headNod(p, up * 10 - down * 6);
      Pose.spineFlex(p, 'Spine2', -up * 2);
      plantLegs(L, p, { hips: V(0, -0.006 * k, 0) });
      return p;
    },
  },
  /** Shrug with open palms. */
  npc_shrug: {
    duration: 1.6,
    loop: false,
    sample: (L, t, dur) => {
      const s = Math.sin(Math.PI * window01(t / dur, 0.08, 0.85));
      const p = base(L, { armDown: 22 - s * 6, elbow: 12 + s * 75 });
      const dirs = armDirs(L);
      SIDES.forEach((side) => {
        Pose.shoulderShrug(p, side, s * 14);
        Pose.armAbduct(p, side, s * 8);
        Pose.wristFlex(p, side, dirs[side], -s * 25);
        curlFingers(p, L, side, { fingers: 28 - s * 22, thumb: 12 - s * 8 });
      });
      Pose.headTilt(p, s * 9);
      Pose.headNod(p, -s * 3);
      plantLegs(L, p, { hips: V(0, -0.006, 0) });
      return p;
    },
  },
  /** Listening: small acknowledgement nods, head tilt, hands loosely clasped in front. */
  npc_listen: {
    duration: 4,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = base(L, { skip: SIDES });
      idleBreath(L, p, u, { cycles: 2 });
      const nod = Math.max(0, Math.sin(u * TAU * 2)) ** 3;
      Pose.headNod(p, -nod * 6);
      Pose.headTilt(p, 4 + cyc(u, 1) * 2);
      plantLegs(L, p, { hips: V(cyc(u) * 0.01 * k, -0.01 * k, 0) });
      const hipY = L.world.Hips.y + p.hips.y;
      const at = V(0, hipY - 0.04 * k, 0.12 * k);
      hand(L, p, 'Left', at.clone().add(V(0.035 * k, 0.0, 0)), V(-1, -0.4, 0.2), V(0, 0.2, -1), V(0.6, -1, -0.2));
      hand(L, p, 'Right', at.clone().add(V(-0.035 * k, -0.02 * k, 0.01 * k)), V(1, -0.4, 0.2), V(0, 0.2, -1), V(-0.6, -1, -0.2));
      SIDES.forEach((side) => curlFingers(p, L, side, { fingers: 40, thumb: 20 }));
      return p;
    },
  },
};

/**
 * Talking gestures (loops): upper-body beats with jaw syllables. Each is a list of (hand, phase)
 * beats; hands rise into a gesture space in front of the chest and settle between beats.
 */
const TALK = [
  // 1: one open hand explaining, offered palm up.
  { duration: 3.2, beats: { Right: [[0.1, 0.55]], Left: [] }, palm: 'up' },
  // 2: both hands, open-palm "you see?" beats.
  { duration: 3.6, beats: { Right: [[0.05, 0.4], [0.55, 0.9]], Left: [[0.08, 0.42], [0.58, 0.92]] }, palm: 'up' },
  // 3: emphatic chops with the right, left hand on hip.
  { duration: 2.8, beats: { Right: [[0.05, 0.3], [0.35, 0.6], [0.65, 0.9]], Left: [] }, palm: 'side', chop: true },
  // 4: counting points on the fingers / small circular "and so on" with both hands low.
  { duration: 4, beats: { Right: [[0.1, 0.85]], Left: [[0.15, 0.8]] }, palm: 'in', circle: true },
];

TALK.forEach((g, i) => {
  SOCIAL_SAMPLERS[`npc_talk_gesture_${i + 1}`] = {
    duration: g.duration,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const p = gestureBase(L, u, { lean: 2 });
      Pose.headNod(p, cyc(u, 3) * 2.5);
      Pose.headTilt(p, cyc(u, 1) * 2.5);
      const { front } = chest(L, p);
      for (const side of SIDES) {
        const w = g.beats[side].reduce((m, [a, b]) => Math.max(m, Math.sin(Math.PI * window01(u, a, b)) ** 0.7), 0);
        let at = front.clone().add(V(S[side] * 0.17 * k, -0.2 * k, 0.16 * k));
        let fingers = V(-S[side] * 0.3, 0.2, 1);
        let palm = g.palm === 'up' ? V(-S[side] * 0.3, 1, 0.1) : g.palm === 'side' ? V(-S[side], 0, 0) : V(-S[side], 0.4, -0.2);
        if (g.chop) {
          const c = Math.sin(u * TAU * 3 * 2) * w;
          at = at.add(V(0, 0.04 * k * c, 0.04 * k));
          fingers = V(-S[side] * 0.2, -0.2 + c * 0.3, 1);
        }
        if (g.circle) {
          const a = u * TAU * 2;
          at = at.add(V(Math.cos(a) * 0.04 * k * S[side], Math.sin(a) * 0.04 * k, 0));
        }
        if (!g.beats[side].length && g.chop && side === 'Left') {
          // Hand on hip (knuckles in).
          const hipY = L.world.Hips.y + p.hips.y;
          hand(L, p, 'Left', V(0.19 * k, hipY + 0.03 * k, 0.0), V(-0.4, -1, -0.3), V(-1, 0, 0), V(1, 0, -0.6));
          curlFingers(p, L, 'Left', { fingers: 60, thumb: 30 });
          continue;
        }
        gestureHand(L, p, side, at, fingers, palm, w);
        curlFingers(p, L, side, { fingers: 28 - w * 18, thumb: 12 - w * 6 });
      }
      talkFace(p, t, u);
      return p;
    },
  };
});

// --- Combat: hit reactions, wound clutching, duck, deaths and resting dead poses ---------------------

/** Linear pose blend (bones slerp, hips lerp). */
function mix(a, b, t) {
  const p = createPose();
  for (const name of new Set([...Object.keys(a.bones), ...Object.keys(b.bones)])) {
    p.bones[name] = (a.bones[name] ?? new THREE.Quaternion()).clone().slerp(b.bones[name] ?? new THREE.Quaternion(), t);
  }
  p.hips.copy(a.hips).lerp(b.hips, t);
  return p;
}

/** Hips height of a body lying down (pelvis half-thickness), by how it lies. */
const LIE = { back: 0.11, front: 0.12, side: 0.2 };

/**
 * Resting dead pose. kind: 'back' (fell backwards, face up), 'front' (face down), 'side' (crumpled,
 * curled on the right side). The root stays at the feet's spot on the ground; the body lies along
 * −Z (back), +Z (front) or −X (side). Every joint ends between the floor and ~0.45 m.
 */
function deadPose(L, kind) {
  const k = kOf(L);
  const Hy = L.world.Hips.y;
  const p = createPose();
  if (kind === 'back') {
    Pose.rootPitch(p, -90);
    Pose.spineFlex(p, 'Spine1', -2);
    Pose.headTurn(p, 35);
    Pose.headNod(p, 4);
    Pose.hipFlex(p, 'Left', 14);
    Pose.kneeFlex(p, 'Left', 26);
    Pose.hipAbduct(p, 'Left', 8);
    Pose.hipAbduct(p, 'Right', 5);
    Pose.ankleFlex(p, 'Left', -12);
    Pose.ankleFlex(p, 'Right', -20);
    const dirs = armDirs(L);
    Pose.armAbduct(p, 'Left', 38);
    Pose.armAbduct(p, 'Right', 12);
    Pose.elbowFlex(p, 'Left', dirs.Left, 35);
    Pose.elbowFlex(p, 'Right', dirs.Right, 10);
    p.hips.set(0, LIE.back * k - Hy, -Hy * 0.95);
  } else if (kind === 'front') {
    Pose.rootPitch(p, 90);
    Pose.headTurn(p, -70);
    Pose.headNod(p, -6);
    Pose.hipFlex(p, 'Right', -4);
    Pose.hipAbduct(p, 'Right', 16);
    Pose.kneeFlex(p, 'Right', 45);
    Pose.ankleFlex(p, 'Left', 55);
    Pose.ankleFlex(p, 'Right', 40);
    const dirs = armDirs(L);
    // Face down: the left arm flung up beside the head, the right along the side, both on the floor.
    Pose.armAbduct(p, 'Left', 95);
    Pose.armFlex(p, 'Left', -6);
    Pose.elbowFlex(p, 'Left', dirs.Left, 10);
    Pose.armAbduct(p, 'Right', 8);
    Pose.armFlex(p, 'Right', -4);
    Pose.elbowFlex(p, 'Right', dirs.Right, 6);
    p.hips.set(0, LIE.front * k - Hy, Hy * 0.95);
  } else {
    Pose.rootRoll(p, 84);
    Pose.spineFlex(p, 'Spine', 16);
    Pose.spineFlex(p, 'Spine1', 12);
    Pose.headNod(p, -14);
    Pose.headTilt(p, -12);
    for (const [i, side] of SIDES.entries()) {
      Pose.hipFlex(p, side, 55 + i * 18);
      Pose.kneeFlex(p, side, 75 + i * 12);
      Pose.ankleFlex(p, side, 20);
    }
    const dirs = armDirs(L);
    // On the right side: the lower (right) arm reaches forward along the floor, the upper (left) arm
    // drops across the chest onto the floor in front.
    Pose.armAbduct(p, 'Right', -30);
    Pose.armFlex(p, 'Right', 85);
    Pose.elbowFlex(p, 'Right', dirs.Right, 20);
    Pose.armAbduct(p, 'Left', -45);
    Pose.armFlex(p, 'Left', 75);
    Pose.elbowFlex(p, 'Left', dirs.Left, 25);
    p.hips.set(0.25 * k, LIE.side * k - Hy, 0.08 * k);
  }
  SIDES.forEach((side) => curlFingers(p, L, side, { fingers: 38, thumb: 18 }));
  return p;
}

/**
 * A fall into a dead pose: the knees go, then the body pivots over the feet (hips on a circle around
 * them) with a gravity ease-in, bounces once on impact and settles exactly into deadPose(kind).
 */
function deathSampler(kind, { duration, buckleEnd, impact }) {
  return {
    duration,
    loop: false,
    events: [{ name: 'bodyfall', time: impact }],
    meta: () => ({ dead: kind }),
    sample: (L, t) => {
      const k = kOf(L);
      const Hy = L.world.Hips.y;
      const final = deadPose(L, kind);
      if (t >= duration - 1e-6) return final;
      const buckle = ease(window01(t, 0, buckleEnd));
      const fall = window01(t, buckleEnd * 0.6, impact) ** 2;
      const settle = ease(window01(t, impact, duration * 0.92));
      const bounce = Math.sin(Math.PI * window01(t, impact, impact + 0.22)) * 0.035 * k * (1 - settle);
      // Upright, knees giving way.
      const up = base(L, { armDown: 20 - buckle * 25, elbow: 20 + buckle * 25 });
      Pose.spineFlex(up, 'Spine1', kind === 'back' ? -buckle * 10 : buckle * 18);
      Pose.headNod(up, kind === 'back' ? -buckle * 18 : buckle * 12);
      if (kind === 'side') plantLegs(L, up, { hips: V(0, -0.42 * k * buckle, -0.06 * k * buckle) });
      else plantLegs(L, up, { hips: V(0, -0.12 * k * buckle, (kind === 'back' ? -0.06 : 0.04) * k * buckle) });
      if (t <= buckleEnd * 0.6) return up;
      // The topple: pose blends toward the dead pose as the body rotates; hips follow the pivot.
      const p = mix(up, final, Math.min(1, fall * 0.92 + settle * 0.08));
      const ang = fall * (Math.PI / 2);
      const start = Hy + up.hips.y;
      const lie = final.hips.y + Hy;
      const y = Math.max(lie, start * Math.cos(ang)) + bounce;
      if (kind === 'side') p.hips.set(final.hips.x * fall, y - Hy, up.hips.z + (final.hips.z - up.hips.z) * fall);
      else p.hips.set(0, y - Hy, final.hips.z * Math.sin(ang));
      return keepAboveFloor(L, settle > 0 ? mix(p, final, settle) : p);
    },
  };
}

/** Lifts a pose so no joint dips under the floor (mid-fall blends would otherwise sink a foot). */
function keepAboveFloor(L, p) {
  const fk = worldPose(L, p);
  let min = Infinity;
  for (const [j] of JOINTS) min = Math.min(min, fk.pos[j].y);
  const floor = 0.01 * kOf(L);
  if (min < floor) p.hips.y += floor - min;
  return p;
}

/** Hold of a dead pose (a loop with no motion, so the Animator can rest on it). */
const deadHold = (kind) => ({ duration: 1, loop: true, meta: () => ({ dead: kind }), sample: (L) => deadPose(L, kind) });

/**
 * Hit reaction: a sharp impulse in the first ~0.1 s that decays, applied to the body part, with a
 * recovery step. `dir` is where the hit pushes (+1 back / −1 forward for torso; side for arms/legs).
 */
function hitSampler(part, side = null) {
  return {
    duration: part === 'leg' ? 1.0 : 0.75,
    loop: false,
    events: [{ name: 'hit', time: 0 }],
    sample: (L, t, dur) => {
      const k = kOf(L);
      const h = t < 0.07 ? t / 0.07 : 1 - ease(window01(t, 0.07, dur * 0.95));
      const step = Math.sin(Math.PI * window01(t, 0.05, 0.4));
      const s = side === 'Left' ? 1 : -1;
      const p = base(L, { armDown: 20 - h * 10, elbow: 14 + h * 35 });
      let hips = V(0, -0.02 * k * h, 0);
      const ankles = {};
      if (part === 'head') {
        Pose.headNod(p, -h * 30);
        Pose.headTurn(p, h * 12);
        Pose.spineFlex(p, 'Spine2', -h * 10);
        SIDES.forEach((sd) => Pose.armAbduct(p, sd, h * 18));
        hips = V(0, -0.03 * k * h, -0.07 * k * h);
        ankles.Right = L.world.RightFoot.clone().add(V(0, step * 0.05 * k, -0.18 * k * ease(window01(t, 0.05, 0.4))));
      } else if (part === 'torso' || part === 'back') {
        const f = part === 'torso' ? 1 : -1;
        Pose.spineFlex(p, 'Spine', f * h * 22);
        Pose.spineFlex(p, 'Spine1', f * h * 14);
        Pose.headNod(p, f * h * 12 - (f < 0 ? h * 10 : 0));
        SIDES.forEach((sd) => Pose.armFlex(p, sd, f * h * 30));
        hips = V(0, -0.05 * k * h, -f * 0.08 * k * h);
        const foot = f > 0 ? 'Right' : 'Left';
        ankles[foot] = L.world[`${foot}Foot`].clone().add(V(0, step * 0.05 * k, -f * 0.22 * k * ease(window01(t, 0.05, 0.4))));
      } else if (part === 'arm') {
        Pose.spineTwist(p, 'Spine1', -s * h * 22);
        Pose.spineTwist(p, 'Spine2', -s * h * 12);
        Pose.armFlex(p, side, -h * 45);
        Pose.armAbduct(p, side, h * 25);
        Pose.shoulderShrug(p, side, h * 12);
        Pose.headTurn(p, s * h * 25);
      } else if (part === 'leg') {
        Pose.spineSide(p, 'Spine1', s * h * 10);
        Pose.spineFlex(p, 'Spine', h * 14);
        Pose.headNod(p, -h * 10);
        Pose.armAbduct(p, side === 'Left' ? 'Right' : 'Left', h * 30);
        hips = V(s * 0.04 * k * h, -0.16 * k * h, 0);
        ankles[side] = L.world[`${side}Foot`].clone().add(V(0, 0.03 * k * step, -0.06 * k * step));
      }
      plantLegs(L, p, { hips, ankles });
      SIDES.forEach((sd) => curlFingers(p, L, sd, { fingers: 30 + h * 30, thumb: 15 }));
      Pose.jawOpen(p, h * 10);
      return p;
    },
  };
}

/** Pained hold: one hand pressing the wound, hunched; loops (upper body over any locomotion). */
function clutchSampler(where) {
  return {
    duration: 2.4,
    loop: true,
    sample: (L, t, dur) => {
      const u = t / dur;
      const k = kOf(L);
      const pant = cyc(u, 4) * 0.5 + 0.5;
      const p = base(L, { skip: SIDES });
      Pose.spineFlex(p, 'Spine', 10 + pant * 3);
      Pose.spineFlex(p, 'Spine1', 8);
      Pose.headNod(p, -8 + pant * 3);
      plantLegs(L, p, { hips: V(0, -0.05 * k, -0.02 * k) });
      const fk = worldPose(L, p);
      const rest = base(L);
      for (const sd of SIDES) for (const b of ['Arm', 'ForeArm', 'Hand']) p.bones[`${sd}${b}`] = (rest.bones[`${sd}${b}`] ?? new THREE.Quaternion()).clone();
      if (where === 'torso') {
        const belly = fk.pos.Spine.clone().add(V(0.02 * k, 0.04 * k, 0.12 * k));
        hand(L, p, 'Left', belly.clone().add(V(0.04 * k, 0, 0)), V(-1, -0.2, 0.1), V(0, 0, -1), V(0.8, -0.6, -0.2));
        hand(L, p, 'Right', belly.clone().add(V(-0.05 * k, 0.05 * k, 0.02 * k)), V(1, -0.1, 0.1), V(0, 0, -1), V(-0.8, -0.6, -0.2));
      } else if (where === 'leg') {
        Pose.spineFlex(p, 'Spine', 14);
        const thigh = V(-0.1 * k, L.measures.kneeY + 0.12 * k, 0.08 * k);
        hand(L, p, 'Right', thigh, V(0.3, -1, 0.2), V(0.3, 0, -1), V(-0.6, 0.2, -1));
      } else {
        // where = 'Left' / 'Right': the other hand grips the wounded upper arm.
        const hurt = where;
        const other = hurt === 'Left' ? 'Right' : 'Left';
        const arm = fk.pos[`${hurt}Arm`].clone().lerp(fk.pos[`${hurt}ForeArm`], 0.45).add(V(-S[hurt] * 0.03 * k, 0, 0.05 * k));
        hand(L, p, other, arm, V(S[hurt], -0.3, -0.2), V(S[hurt] * 0.3, 0, -1), V(-S[hurt] * 0.5, -1, -0.2));
        Pose.shoulderShrug(p, hurt, 6);
      }
      SIDES.forEach((sd) => curlFingers(p, L, sd, { fingers: 45, thumb: 25 }));
      Pose.jawOpen(p, 2 + pant * 4);
      return p;
    },
  };
}

Object.assign(SOCIAL_SAMPLERS, {
  npc_hit_head: hitSampler('head'),
  npc_hit_torso_front: hitSampler('torso'),
  npc_hit_torso_back: hitSampler('back'),
  npc_hit_arm_left: hitSampler('arm', 'Left'),
  npc_hit_arm_right: hitSampler('arm', 'Right'),
  npc_hit_leg_left: hitSampler('leg', 'Left'),
  npc_hit_leg_right: hitSampler('leg', 'Right'),
  npc_clutch_torso: clutchSampler('torso'),
  npc_clutch_arm_left: clutchSampler('Left'),
  npc_clutch_arm_right: clutchSampler('Right'),
  npc_clutch_leg: clutchSampler('leg'),
  /** Duck at a gunshot: drop into the cower crouch with the hands going over the head. */
  npc_duck: {
    duration: 0.55,
    loop: false,
    meta: () => ({ then: 'npc_fear_cower' }),
    sample: (L, t, dur) => {
      const d = ease(window01(t / dur, 0, 0.9));
      return mix(SOCIAL_SAMPLERS.npc_idle_weight.sample(L, 0, 6), SOCIAL_SAMPLERS.npc_fear_cower.sample(L, 0, 2), d);
    },
  },
  npc_death_back: deathSampler('back', { duration: 1.6, buckleEnd: 0.35, impact: 1.0 }),
  npc_death_forward: deathSampler('front', { duration: 1.7, buckleEnd: 0.4, impact: 1.1 }),
  npc_death_crumple: deathSampler('side', { duration: 2.0, buckleEnd: 0.7, impact: 1.45 }),
  npc_dead_pose_back: deadHold('back'),
  npc_dead_pose_front: deadHold('front'),
  npc_dead_pose_side: deadHold('side'),
});

/** Death clip → the dead pose it ends in. */
export const DEATH_CLIPS = { npc_death_back: 'npc_dead_pose_back', npc_death_forward: 'npc_dead_pose_front', npc_death_crumple: 'npc_dead_pose_side' };

/** Clip names provided by this module. */
export const SOCIAL_CLIP_NAMES = Object.keys(SOCIAL_SAMPLERS);

/**
 * Hands the samplers to a registry (`registerSamplers` from clips.js when available). Returns true
 * when registered, false when no registry function was given.
 */
export function registerSocialClips(register) {
  if (typeof register !== 'function') return false;
  register(SOCIAL_SAMPLERS);
  return true;
}

/**
 * Bakes one social sampler into a THREE.AnimationClip. Same track layout and userData as
 * clips.js bakeClip (22 joints + hands + Hips.position), so it plays on any Animator.
 */
export function bakeSocialClip(layout, name, { prefix = '', samplers = SOCIAL_SAMPLERS } = {}) {
  const s = samplers[name];
  if (!s) throw new Error(`Unknown social clip ${name}`);
  const frames = Math.round(s.duration * FPS);
  const times = new Float32Array(frames + 1);
  const quats = Object.fromEntries(JOINTS.map(([j]) => [j, new Float32Array((frames + 1) * 4)]));
  const hipPos = new Float32Array((frames + 1) * 3);
  const restHips = layout.world.Hips;
  for (let f = 0; f <= frames; f++) {
    const t = s.loop && f === frames ? 0 : f / FPS;
    times[f] = f / FPS;
    const pose = relaxHands(s.sample(layout, Math.min(t, s.duration), s.duration), layout);
    for (const [j] of JOINTS) (pose.bones[j] ?? new THREE.Quaternion()).toArray(quats[j], f * 4);
    hipPos[f * 3] = restHips.x + pose.hips.x;
    hipPos[f * 3 + 1] = restHips.y + pose.hips.y;
    hipPos[f * 3 + 2] = restHips.z + pose.hips.z;
  }
  const tracks = JOINTS.map(([j]) => new THREE.QuaternionKeyframeTrack(`${prefix}${j}.quaternion`, times, quats[j]));
  tracks.push(new THREE.VectorKeyframeTrack(`${prefix}Hips.position`, times, hipPos));
  const clip = new THREE.AnimationClip(name, s.duration, tracks);
  clip.userData = { loop: s.loop, social: true, ...(s.meta ? s.meta(layout) : {}), ...(s.events ? { events: s.events } : {}) };
  return clip;
}

/** Bakes every social clip (or `names`) for a layout: { name: AnimationClip }. */
export function bakeSocialClips(layout, { names = SOCIAL_CLIP_NAMES, prefix = '' } = {}) {
  return Object.fromEntries(names.map((n) => [n, bakeSocialClip(layout, n, { prefix })]));
}
