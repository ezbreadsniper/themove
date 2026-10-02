import * as THREE from 'three';
import { Pose, curlFingers, relaxHands } from './pose.js';
import { base, ease, window01, TAU, bezier, bump, envelope, plantFeet } from './clip-kit.js';
import { worldPose } from './fk.js';
import { solveArm, handRotation } from './arm-ik.js';
import { reach, handTargetAt, palmFrom } from './reach.js';
import { blendPoses } from './base-extra.js';
import { cigaretteFromWrist, mouthLocal, cigarettePoints } from './cigarette.js';

/**
 * Smoking. Every clip is built from the same parts so the set chains without pops:
 *   smokerBody   relaxed contrapposto stance (weight on one leg, pelvis rolled, shoulders counter-
 *                tilted), breathing, inhale chest rise, head nod / turn / tilt, jaw
 *   cigHand      the right arm solved so the cigarette (not the wrist) lands where it should: the
 *                filter on the lips (in head space, so the hand meets the head wherever it is) or the
 *                relaxed waist hold. The raise follows a Bezier out and forward of the body with the
 *                elbow leading (its pole swings out before the hand rises) and the wrist trailing.
 *   lighterHand  the left hand with a lighter cupped under the tip (smoke_light)
 * Timings follow the usual drag rhythm: ~0.8 s raise, ~0.9 s drag, lower while holding the breath,
 * then a ~1 s exhale with the head tilted up and away from the cigarette.
 *
 * Events drive the SmokeEmitter (src/render/smoke.js): inhale / exhale (with duration), ash, lit,
 * lighterShow / lighterOn / lighterOff / lighterHide, cigShow, toss, drop, grind.
 */

const k = (L) => L.measures.height / 1.78;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Finger / thumb curl of the cigarette hand. */
const CURL = { hold: { fingers: 30, thumb: 24 }, lips: { fingers: 14, thumb: 14 }, open: { fingers: -6, thumb: 4 } };

/** Duration of the smoking loop (one drag, one exhale, one ash flick, one full weight shift). */
export const SMOKE_LOOP = 10;

/**
 * Body for every smoking frame. o: { w weight side (+1 left leg), breath (-1..1), chest (inhale 0..1),
 * nod (+ down), turn (+ left), tilt, jaw (deg), look (0..1 look down at the right foot), leftElbow }.
 */
export function smokerBody(L, o = {}) {
  const { w = 1, breath = 0, chest = 0, nod = 0, turn = 0, tilt = 0, jaw = 0, look = 0, leftElbow = 0, feet = {} } = o;
  const kk = k(L);
  const p = base(L, { armDown: 21 - chest * 2, elbow: 17 + breath + leftElbow, skip: ['Right'] });
  // Contrapposto: the weighted hip rises and moves over its foot, the shoulders tilt the other way.
  const roll = w * 2.4;
  Pose.rootRoll(p, roll);
  Pose.spineSide(p, 'Spine', roll * 0.55);
  Pose.spineSide(p, 'Spine1', roll * 0.45 + w * 0.7);
  Pose.spineSide(p, 'Spine2', w * 0.6);
  Pose.spineTwist(p, 'Spine1', -w * 2);
  // A slight slouch, breathing, and the held inhale lifting the chest and shoulders.
  Pose.spineFlex(p, 'Spine1', 2 - breath * 0.9 - chest * 2.5);
  Pose.spineFlex(p, 'Spine2', 1 - breath * 0.7 - chest * 3.5);
  for (const side of ['Left', 'Right']) Pose.shoulderShrug(p, side, breath * 0.6 + chest * 3.5);
  Pose.spineFlex(p, 'Neck', 2 + look * 12);
  Pose.headTilt(p, -w * 1.1 + tilt);
  Pose.headTurn(p, turn - look * 8);
  Pose.headNod(p, 1 + nod + chest * 2 - breath * 0.5 + look * 16);
  Pose.jawOpen(p, 0.5 + jaw);
  p.hips.set(w * 0.021 * kk, -0.011 * kk - Math.abs(w) * 0.003 * kk + breath * 0.0015 * kk, look * 0.01 * kk);
  const ankles = {
    Left: L.world.LeftFoot.clone().add(V(0.016 * kk, 0, 0.012 * kk)),
    Right: L.world.RightFoot.clone().add(V(-0.016 * kk, 0, -0.018 * kk)),
  };
  Object.assign(ankles, feet.ankles ?? {});
  plantFeet(L, p, { ankles, feet: { Left: { yaw: 6 }, Right: { yaw: 10 }, ...(feet.rot ?? {}) } });
  return p;
}

/** Cigarette-hand frames: the waist hold, the ash-flick hold and the lips (filter on the mouth). */
function frames(L, fk, { flick = 0, tap = 0, lean = 0, light = 0 } = {}) {
  const kk = k(L);
  const hip = fk.pos.RightUpLeg;
  const holdWrist = hip.clone().add(V(-0.115 * kk - flick * 0.01 * kk, 0.1 * kk + flick * 0.045 * kk - tap * 0.012 * kk, 0.115 * kk + flick * 0.06 * kk + lean));
  const holdRot = handRotation(L, 'Right', V(0.06 - flick * 0.05, -0.45 + flick * 0.3, 0.89), V(1, 0.15 + flick * 0.35, -0.05));
  const hold = { wrist: holdWrist, rot: holdRot, pole: V(-0.35, -1, -0.55).normalize() };
  const headQ = fk.quat.Head;
  const mouth = fk.pos.Head.clone().add(mouthLocal(L).applyQuaternion(headQ));
  const lipsFilter = mouth.add(V(-0.01 * kk, -0.002 * kk, 0.002 * kk).applyQuaternion(headQ));
  // Lighting up, the cigarette points straight out so the left hand can cup the flame under its tip.
  const lipsRot = headQ.clone().multiply(handRotation(L, 'Right', V(0.55 - light * 0.3, 0.8 + light * 0.1, 0.2 - light * 0.1), V(0.55 - light * 0.45, -0.1, -0.83 - light * 0.17)));
  return { hold, lips: { filter: lipsFilter, rot: lipsRot, pole: V(-0.9, -0.72, 0.06).normalize() } };
}

const filterAt = (L, wrist, rot, curl) => wrist.clone().add(cigaretteFromWrist(L, 'filter', curl).applyQuaternion(rot));

/**
 * Solves the cigarette arm. u: 0 = waist hold, 1 = filter on the lips; dir: +1 raising, -1 lowering
 * (the two paths differ: up arcs out and forward with the elbow leading, down pulls away first).
 */
export function cigHand(L, p, { u = 0, dir = 1, flick = 0, tap = 0, thumb = 0, open = 0, light = 0 } = {}) {
  const kk = k(L);
  const fk = worldPose(L, p);
  const f = frames(L, fk, { flick, tap, light });
  const mix = (a, b, t) => a + (b - a) * t;
  const curlU = ease(window01(u, 0.55, 1));
  const curl = {
    fingers: mix(mix(CURL.hold.fingers, CURL.lips.fingers, curlU), CURL.open.fingers, open),
    thumb: mix(mix(CURL.hold.thumb, CURL.lips.thumb, curlU), CURL.open.thumb, open) + thumb,
  };
  const holdFilter = filterAt(L, f.hold.wrist, f.hold.rot, curl.fingers);
  const s = ease(u);
  const mid = holdFilter.clone().lerp(f.lips.filter, 0.5);
  const ctrl = dir > 0 ? mid.add(V(-0.09 * kk, -0.03 * kk, 0.16 * kk)) : mid.add(V(-0.1 * kk, 0.02 * kk, 0.2 * kk));
  const filter = bezier(holdFilter, ctrl, f.lips.filter, s);
  // Wrist trails on the way up and leads on the way down; the elbow leads both ways.
  const rotU = dir > 0 ? ease(window01(u, 0.12, 1)) : ease(window01(u, 0, 0.88));
  const rot = f.hold.rot.clone().slerp(f.lips.rot, rotU);
  const poleU = dir > 0 ? ease(Math.min(1, u / 0.62)) : ease(window01(u, 0.38, 1));
  const out = V(-1, -0.35, 0.15).normalize();
  const pole = f.hold.pole.clone().lerp(out, Math.sin(Math.PI * poleU) * 0.35).lerp(f.lips.pole, poleU).normalize();
  const wrist = filter.clone().sub(cigaretteFromWrist(L, 'filter', curl.fingers).applyQuaternion(rot));
  solveArm(L, p, 'Right', wrist, rot, pole);
  curlFingers(p, L, 'Right', curl);
  return p;
}

/** World point of the posed cigarette ('tip' | 'filter') for a pose (tests / emitter checks). */
export function cigarettePoint(L, p, which = 'tip') {
  const fk = worldPose(L, p);
  const c = cigarettePoints(L);
  return fk.pos.RightHandFingers1.clone().add(c.local[which].clone().applyQuaternion(fk.quat.RightHandFingers1));
}

/** Mouth position of a pose. */
export function mouthPoint(L, p) {
  const fk = worldPose(L, p);
  return fk.pos.Head.clone().add(mouthLocal(L).applyQuaternion(fk.quat.Head));
}

/** The loop's state at time t (also the start / end state other clips chain to). */
function loopState(t) {
  const T = SMOKE_LOOP;
  const up = ease(window01(t, 1.2, 2.0));
  const down = ease(window01(t, 2.9, 3.65));
  const u = up * (1 - down);
  const chest = envelope(t, 1.95, 2.85, 3.75, 4.7);
  const exhale = envelope(t, 3.4, 3.85, 4.9, 5.7);
  const breathOn = 1 - envelope(t, 1.6, 2.0, 4.6, 5.6);
  return {
    u, dir: t < 2.45 ? 1 : -1,
    w: Math.cos((t / T) * TAU),
    breath: Math.sin((t / T) * TAU * 3) * breathOn,
    chest,
    // Head comes down to meet the hand, then tips up and away from the hand to blow the smoke out.
    nod: u * 5 - exhale * 15,
    turn: -u * 4 + exhale * 24,
    tilt: -u * 2 + exhale * 3,
    jaw: bump(t, 3.7, 4.85) * 5 + u * 2.5,
    flick: envelope(t, 6.4, 6.85, 7.6, 8.1),
    tap: bump(t, 6.88, 7.02) + bump(t, 7.14, 7.28),
  };
}

function smokePose(L, s, extra = {}) {
  const p = smokerBody(L, { ...s, ...extra.body });
  cigHand(L, p, { u: s.u, dir: s.dir, flick: s.flick, tap: s.tap, thumb: s.tap * 38, ...extra.hand });
  return p;
}

/** Blends a clip's pose onto the pose it chains into (both with relaxed hands where unset). */
function settle(L, p, target, w) {
  return blendPoses(relaxHands(p, L), relaxHands(target, L), w);
}

/** Lighter in the left fist cupped under the tip (lighter axis along the thumb side). */
function lighterTarget(L, p) {
  const kk = k(L);
  const tip = cigarettePoint(L, p, 'tip');
  const fingers = V(-0.5, 0.05, -0.85).normalize();
  const forward = V(0.12, 1, 0.12).normalize();
  const palm = palmFrom('Left', fingers, forward);
  const grip = tip.clone().addScaledVector(forward, -(0.029 + 0.029) * kk).addScaledVector(palm, -0.006 * kk).add(V(0.004 * kk, 0, 0.004 * kk));
  return handTargetAt(L, 'Left', grip, fingers, palm, V(0.75, -1, -0.15));
}

/** Left front pocket (where the lighter comes from). */
function pocketTarget(L, p) {
  const kk = k(L);
  const fk = worldPose(L, p);
  const grip = fk.pos.LeftUpLeg.clone().add(V(0.045 * kk, -0.06 * kk, 0.1 * kk));
  return handTargetAt(L, 'Left', grip, V(-0.15, -1, 0.25), V(-0.9, 0, -0.35), V(0.6, -0.8, -0.5));
}

export function makeSmokeSamplers(bases) {
  const idleAt0 = (L) => bases.idle.sample(L, 0, bases.idle.duration);
  return {
    smoke: {
      duration: SMOKE_LOOP,
      loop: true,
      events: [{ name: 'inhale', time: 2.0, duration: 0.85 }, { name: 'exhale', time: 3.72, duration: 1.1 }, { name: 'ash', time: 6.97 }, { name: 'ash', time: 7.23 }],
      sample: (L, t) => smokePose(L, loopState(t)),
    },
    /**
     * Lighting up: cigarette to the lips, the left hand brings the lighter out of the pocket and cups
     * it under the tip, the head dips into the flame, two short puffs, lighter away, a small exhale,
     * and the hand settles into the loop's waist hold (chains into `smoke`).
     */
    smoke_light: {
      duration: 3.6,
      loop: false,
      meta: () => ({ then: 'smoke' }),
      events: [
        { name: 'cigShow', time: 0 }, { name: 'lighterShow', time: 0.42 }, { name: 'lighterOn', time: 1.1 },
        { name: 'inhale', time: 1.15, duration: 0.3 }, { name: 'lit', time: 1.25 }, { name: 'inhale', time: 1.55, duration: 0.35 },
        { name: 'lighterOff', time: 1.98 }, { name: 'lighterHide', time: 2.5 }, { name: 'exhale', time: 2.62, duration: 0.6 },
      ],
      sample: (L, t) => {
        const end = loopState(0);
        const up = ease(window01(t, 0.05, 0.75));
        const down = ease(window01(t, 2.15, 2.95));
        const u = up * (1 - down);
        const puffs = bump(t, 1.15, 1.45) * 0.5 + bump(t, 1.55, 1.9) * 0.7;
        const exhale = envelope(t, 2.4, 2.7, 3.0, 3.5);
        const strike = bump(t, 1.0, 1.15);
        const s = {
          ...end, u, dir: t < 1.5 ? 1 : -1, breath: 0,
          chest: puffs * 0.6 + envelope(t, 1.5, 1.9, 2.5, 3.0) * 0.4,
          nod: u * 5 + envelope(t, 0.7, 1.0, 1.85, 2.2) * 7 - exhale * 9,
          turn: -u * 4 + exhale * 12, tilt: -u * 2, jaw: u * 2.5 + bump(t, 2.6, 3.2) * 3,
        };
        const p = smokerBody(L, { ...s, leftElbow: 0 });
        cigHand(L, p, { u: s.u, dir: s.dir, light: envelope(t, 0.35, 0.9, 1.95, 2.4) });
        // Left: side → pocket (0.15..0.42) → under the tip (0.42..0.95) → pocket (1.98..2.5) → side (2.5..2.95).
        const pocketIn = ease(window01(t, 0.12, 0.42)) * (1 - ease(window01(t, 2.5, 2.95)));
        const toTip = ease(window01(t, 0.42, 0.95)) * (1 - ease(window01(t, 1.98, 2.5)));
        if (toTip > 0) reach(L, p, 'Left', pocketTarget(L, p), lighterTarget(L, p), toTip);
        else reach(L, p, 'Left', null, pocketTarget(L, p), pocketIn);
        curlFingers(p, L, 'Left', { fingers: 28 + Math.max(pocketIn, toTip) * 52, thumb: 12 + toTip * (28 - strike * 30) });
        // The last half second settles onto the loop's first frame exactly.
        return settle(L, p, smokePose(L, end), ease(window01(t, 3.0, 3.6)));
      },
    },
    /** Flicking the butt away: a short wind-up, the forearm snaps forward-out and the fingers open. */
    smoke_flick: {
      duration: 1.6,
      loop: false,
      meta: () => ({ then: 'idle' }),
      events: [{ name: 'toss', time: 0.56 }],
      sample: (L, t) => {
        const s = loopState(0);
        const wind = ease(window01(t, 0.05, 0.42)) * (1 - ease(window01(t, 0.42, 0.56)));
        const snap = ease(window01(t, 0.42, 0.58)) * (1 - ease(window01(t, 0.7, 1.15)));
        const p = smokerBody(L, { ...s, turn: -6 * wind + 4 * snap, nod: 2 * snap });
        cigHand(L, p, { u: wind * 0.22, dir: 1, flick: -wind * 0.6 + snap * 1.4, open: ease(window01(t, 0.5, 0.62)) });
        Pose.spineTwist(p, 'Spine2', 5 * wind - 6 * snap);
        return settle(L, p, idleAt0(L), ease(window01(t, 0.85, 1.6)));
      },
    },
    /** Dropping the butt and grinding it out under the right foot (ball pivots twice), eyes down. */
    smoke_drop: {
      duration: 2.8,
      loop: false,
      meta: () => ({ then: 'idle' }),
      events: [{ name: 'drop', time: 0.38 }, { name: 'grind', time: 1.32 }, { name: 'grind', time: 1.66 }],
      sample: (L, t) => {
        const kk = k(L);
        const s = loopState(0);
        const look = envelope(t, 0.25, 0.75, 2.0, 2.5);
        const step = envelope(t, 0.75, 1.1, 1.95, 2.35);
        const lift = bump(t, 0.75, 1.1) + bump(t, 1.95, 2.35);
        const twist = Math.sin(window01(t, 1.15, 1.95) * TAU * 1.5) * 16 * envelope(t, 1.15, 1.25, 1.85, 1.95);
        const ballRest = L.world.RightToeBase.clone();
        const ankleRest = L.world.RightFoot.clone().add(V(-0.016 * kk, 0, -0.018 * kk));
        const ball = ballRest.clone().add(V(-0.03 * kk, 0, 0.11 * kk).multiplyScalar(step));
        const yaw = 10 + twist;
        const heel = 12 * envelope(t, 1.05, 1.2, 1.9, 2.05);
        // Pivot on the ball: the ankle swings round it and lifts with the heel.
        const rel = ankleRest.clone().sub(ballRest).applyAxisAngle(V(0, 1, 0), -THREE.MathUtils.degToRad(twist));
        rel.applyAxisAngle(V(1, 0, 0).applyAxisAngle(V(0, 1, 0), -THREE.MathUtils.degToRad(yaw)), THREE.MathUtils.degToRad(heel));
        const ankle = ball.clone().add(rel).add(V(0, lift * 0.05 * kk, 0));
        const p = smokerBody(L, { ...s, w: s.w + step * 0.5, look, feet: { ankles: { Right: ankle }, rot: { Right: { yaw, pitch: -heel } } } });
        cigHand(L, p, { u: 0, flick: -0.4 * envelope(t, 0.1, 0.3, 0.45, 0.8), open: ease(window01(t, 0.3, 0.45)) });
        return settle(L, p, idleAt0(L), ease(window01(t, 2.2, 2.8)));
      },
    },
  };
}
