import * as THREE from 'three';
import { JOINTS } from '../rig/skeleton.js';
import { Pose, curlFingers, relaxHands } from './pose.js';
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
