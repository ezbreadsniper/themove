import * as THREE from 'three';
import { Pose, curlFingers, relaxHands } from './pose.js';
import { base, ease, window01, TAU, SIDES, bump, envelope, plantFeet, plantLegs } from './clip-kit.js';
import { worldPose } from './fk.js';
import { reach, handTargetAt } from './reach.js';
import { blendPoses } from './base-extra.js';

/**
 * Interaction, seating, landing, stairs and unarmed melee clips (the set the gameplay controller and
 * the world's interactables use). Authoring conventions:
 *   - in place; travel is reported (rootDelta / rootVelocity), never baked into the hips
 *   - one-shots start from and settle onto `idle` frame 0 (or the loop they chain into) exactly, so
 *     any of them can be entered from a standing idle and the `then` chain is pop-free
 *   - hand contacts are reported in clip.userData.contact ([x, y, z] in root space at the 'use' /
 *     'grab' / 'hit' event), so the game can place the character against the switch, door or item
 *   - seats are absolute heights (world metres, FURNITURE in src/world/units.js) because furniture
 *     does not scale with the sitter; clip.userData.seat = { height, hipsBack, variant }
 */

const k = (L) => L.measures.height / 1.78;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Seat variants: surface height (m), how far behind the root the hips settle (×k), feet forward (×k), recline (deg). */
export const SEATS = {
  chair: { height: 0.43, hipsBack: 0.24, ankleFwd: 0.12, recline: 0, spread: 0.03 },
  sofa: { height: 0.45, hipsBack: 0.34, ankleFwd: 0.14, recline: 13, spread: 0.06 },
};
/** Hip joints sit this far above the seat surface (×k): sitting bones under the thigh. */
export const SIT_DROP = 0.085;

const idle0 = (bases, L) => relaxHands(bases.idle.sample(L, 0, bases.idle.duration), L);
const settle = (L, a, b, w) => blendPoses(relaxHands(a, L), relaxHands(b, L), w);

/** Hand resting on the top of the thigh, fingers toward the knee. */
function thighTarget(L, p, side) {
  const fk = worldPose(L, p);
  const s = side === 'Left' ? 1 : -1;
  const hip = fk.pos[`${side}UpLeg`];
  const knee = fk.pos[`${side}Leg`];
  const grip = hip.clone().lerp(knee, 0.66).add(V(-s * 0.012 * k(L), L.measures.thighRadius * 0.95, 0));
  const fingers = knee.clone().sub(hip).normalize().add(V(-s * 0.15, -0.25, 0)).normalize();
  return handTargetAt(L, side, grip, fingers, V(-s * 0.15, -1, 0), V(s * 0.9, -0.3, -0.8));
}

/**
 * Seated (or on the way down / up). o: { down 0..1 (hips from standing to the seat), back 0..1 (hips
 * travel back), lean (trunk forward, deg), feet 0..1 (feet stepped forward), hands 0..1 (on thighs),
 * breath, look (head turn deg), lift: { Left, Right } foot lift (×k) }.
 */
function seated(L, variant, o = {}) {
  const { down = 1, back = 1, lean = 0, feet = 1, hands = 1, breath = 0, look = 0, lift = {} } = o;
  const kk = k(L);
  const seat = SEATS[variant];
  const p = base(L, { armDown: 20 - hands * 4, elbow: 14 + hands * 20 });
  const recline = seat.recline * down;
  // A reclined (sofa) sit rolls the pelvis back; the spine rounds forward to bring the head over.
  Pose.rootPitch(p, -recline + lean * 0.35);
  Pose.spineFlex(p, 'Spine', lean * 0.4 + recline * 0.25 + breath * 0.4);
  Pose.spineFlex(p, 'Spine1', lean * 0.35 + recline * 0.3 - breath * 0.8);
  Pose.spineFlex(p, 'Spine2', lean * 0.25 + recline * 0.15 - breath * 0.6);
  Pose.headNod(p, 2 - lean * 0.5 + recline * 0.3 + breath * 0.4);
  Pose.headTurn(p, look);
  const hipY = seat.height + SIT_DROP * kk;
  const standY = -0.006 * kk;
  p.hips.set(0, standY, -seat.hipsBack * kk * back);
  // Exact seat height: correct the hips for where the hip joints land after the pelvis rotation.
  const fk = worldPose(L, p);
  const jointY = (fk.pos.LeftUpLeg.y + fk.pos.RightUpLeg.y) / 2;
  p.hips.y += (hipY - jointY) * down + 0.0012 * kk * breath;
  const ankles = {};
  for (const side of SIDES) {
    const s = side === 'Left' ? 1 : -1;
    ankles[side] = L.world[`${side}Foot`].clone().add(V(s * seat.spread * kk * feet, (lift[side] ?? 0) * kk, seat.ankleFwd * kk * feet));
  }
  plantFeet(L, p, { ankles, feet: { Left: { yaw: 8 * feet }, Right: { yaw: 8 * feet } }, kneeOut: 0.2 + 0.2 * down });
  if (hands > 0) for (const side of SIDES) reach(L, p, side, null, thighTarget(L, p, side), hands);
  SIDES.forEach((side) => curlFingers(p, L, side, { fingers: 28 - hands * 10, thumb: 12 }));
  return p;
}

function seatClips(bases, variant) {
  const sfx = variant === 'chair' ? '' : `_${variant}`;
  const meta = (L) => ({ seat: { variant, height: SEATS[variant].height, hipsBack: SEATS[variant].hipsBack * k(L) } });
  const IDLE = 4;
  const idleState = (t) => ({ breath: Math.sin((t / IDLE) * TAU), look: 6 * Math.sin((t / IDLE) * TAU + 0.6) - 6 * Math.sin(0.6) });
  return {
    [`sitIdle${sfx}`]: {
      duration: IDLE,
      loop: true,
      meta,
      sample: (L, t) => seated(L, variant, idleState(t)),
    },
    /** Sit: hips go back first, the trunk leans forward to balance, the feet shuffle out, a controlled drop, the hands land on the thighs. */
    [`sitDown${sfx}`]: {
      duration: 1.8,
      loop: false,
      meta: (L) => ({ ...meta(L), then: `sitIdle${sfx}` }),
      events: [{ name: 'footstep', side: 'Left', time: 0.72 }, { name: 'footstep', side: 'Right', time: 0.95 }, { name: 'sit', time: 1.18 }],
      sample: (L, t) => {
        const back = ease(window01(t, 0.15, 1.05));
        // Slow start, faster at the end (the last centimetres are a drop), then a small settle.
        const d = window01(t, 0.3, 1.18);
        const down = d * d * (2 - d) - 0.025 * bump(t, 1.18, 1.45);
        const lean = 30 * Math.sin(Math.PI * Math.min(1, window01(t, 0.15, 1.45) * 1.05));
        const feet = ease(window01(t, 0.5, 1.0));
        const lift = { Left: 0.035 * bump(t, 0.5, 0.75), Right: 0.035 * bump(t, 0.72, 1.0) };
        const hands = ease(window01(t, 1.0, 1.55));
        const p = seated(L, variant, { down, back, lean, feet, hands, lift });
        SIDES.forEach((side) => Pose.armFlex(p, side, 18 * bump(t, 0.3, 1.2)));
        const end = seated(L, variant, idleState(0));
        return settle(L, settle(L, idle0(bases, L), p, ease(window01(t, 0, 0.25))), end, ease(window01(t, 1.5, 1.8)));
      },
    },
    /** Stand: feet pulled back under the seat, lean forward over them, drive up, settle into idle. */
    [`standUp${sfx}`]: {
      duration: 1.6,
      loop: false,
      meta: (L) => ({ ...meta(L), then: 'idle' }),
      events: [{ name: 'footstep', side: 'Right', time: 0.3 }, { name: 'footstep', side: 'Left', time: 0.45 }, { name: 'stand', time: 0.55 }],
      sample: (L, t) => {
        const feet = 1 - ease(window01(t, 0.05, 0.5));
        const lift = { Right: 0.03 * bump(t, 0.05, 0.3), Left: 0.03 * bump(t, 0.2, 0.45) };
        const lean = 34 * Math.sin(Math.PI * window01(t, 0.15, 1.3));
        const up = ease(window01(t, 0.5, 1.25));
        const back = 1 - ease(window01(t, 0.45, 1.2));
        const hands = 1 - ease(window01(t, 0.1, 0.55));
        const p = seated(L, variant, { down: 1 - up, back, lean, feet, hands, lift });
        SIDES.forEach((side) => Pose.armFlex(p, side, 22 * bump(t, 0.4, 1.25)));
        const start = seated(L, variant, idleState(0));
        return settle(L, settle(L, start, p, ease(window01(t, 0, 0.12))), idle0(bases, L), ease(window01(t, 1.2, 1.6)));
      },
    },
  };
}

/** Right-hand reach to a contact point: approach, contact (press / push), withdraw. */
function handReach(L, p, target, w) {
  reach(L, p, 'Right', null, target, w);
}

export function makeActionSamplers(bases) {
  const at = (name, L, t) => bases[name].sample(L, t % bases[name].duration, bases[name].duration);
  const SWITCH = (L) => V(-0.11 * k(L), 1.2 * k(L), 0.47 * k(L));
  const DOOR = (L) => V(-0.13 * k(L), 1.12 * k(L), 0.44 * k(L));
  const FLOOR = (L) => V(-0.13 * k(L), 0.03, 0.3 * k(L));
  return {
    ...seatClips(bases, 'chair'),
    ...seatClips(bases, 'sofa'),

    /** Light switch at ~1.2 m, half a metre ahead: fingertips press it, eyes on it. */
    pressSwitch: {
      duration: 1.1,
      loop: false,
      meta: (L) => ({ contact: SWITCH(L).toArray() }),
      events: [{ name: 'use', time: 0.45 }],
      sample: (L, t) => {
        const kk = k(L);
        const reachW = ease(window01(t, 0.08, 0.4)) * (1 - ease(window01(t, 0.62, 1.0)));
        const press = bump(t, 0.38, 0.56);
        const p = at('idle', L, 0);
        Pose.spineFlex(p, 'Spine1', 4 * reachW);
        Pose.spineTwist(p, 'Spine2', -6 * reachW);
        Pose.headNod(p, -6 * reachW);
        Pose.headTurn(p, -5 * reachW);
        const fingers = V(0.08, 0.12, 1).normalize();
        const contact = SWITCH(L);
        const grip = contact.clone().addScaledVector(fingers, -(0.58 * L.measures.handLength + 0.03 * kk - press * 0.038 * kk));
        handReach(L, p, handTargetAt(L, 'Right', grip, fingers, V(0.35, -1, 0), V(-0.8, -1, -0.2)), reachW);
        curlFingers(p, L, 'Right', { fingers: 28 - 22 * reachW, thumb: 12 + 25 * reachW });
        return p;
      },
    },

    /** Palm flat on a door at chest height, a lean into it as it swings, then let go. */
    pushDoor: {
      duration: 1.3,
      loop: false,
      meta: (L) => ({ contact: DOOR(L).toArray() }),
      events: [{ name: 'use', time: 0.42 }],
      sample: (L, t) => {
        const kk = k(L);
        const reachW = ease(window01(t, 0.05, 0.42)) * (1 - ease(window01(t, 0.9, 1.25)));
        const push = ease(window01(t, 0.42, 0.85));
        const leanIn = envelope(t, 0.3, 0.6, 0.85, 1.2);
        const p = base(L);
        Pose.spineFlex(p, 'Spine', 6 * leanIn);
        Pose.spineFlex(p, 'Spine1', 4 * leanIn);
        Pose.spineTwist(p, 'Spine2', -8 * reachW);
        Pose.headNod(p, -3 * leanIn);
        plantLegs(L, p, { hips: V(0, -0.012 * kk * leanIn - 0.006 * kk, 0.045 * kk * leanIn) });
        const grip = DOOR(L).add(V(0, 0, 0.16 * kk * push));
        handReach(L, p, handTargetAt(L, 'Right', grip, V(0.25, 1, 0.08), V(0.05, 0, 1), V(-0.85, -1, -0.3)), reachW);
        curlFingers(p, L, 'Right', { fingers: 28 - 22 * reachW, thumb: 12 + 10 * reachW });
        return settle(L, p, at('idle', L, 0), ease(window01(t, 1.1, 1.3)));
      },
    },

    /** Pick an item off the floor: hip hinge and squat, left hand on the knee, right hand grabs, rise holding it. */
    pickUp: {
      duration: 1.8,
      loop: false,
      meta: (L) => ({ contact: FLOOR(L).toArray(), then: 'idle' }),
      events: [{ name: 'grab', time: 0.78 }],
      sample: (L, t) => {
        const kk = k(L);
        const d = ease(window01(t, 0.08, 0.72)) * (1 - ease(window01(t, 0.9, 1.45)));
        const p = base(L);
        Pose.spineFlex(p, 'Spine', 34 * d);
        Pose.spineFlex(p, 'Spine1', 26 * d);
        Pose.spineFlex(p, 'Spine2', 12 * d);
        Pose.headNod(p, -14 * d);
        Pose.rootPitch(p, 26 * d);
        p.hips.set(0.02 * kk * d, -0.006 * kk - 0.52 * kk * d, -0.17 * kk * d);
        plantFeet(L, p, { ankles: { Left: L.world.LeftFoot.clone().add(V(0.02 * kk * d, 0, 0)), Right: L.world.RightFoot.clone().add(V(-0.03 * kk * d, 0, -0.04 * kk * d)) }, kneeOut: 0.35 });
        const grabbed = ease(window01(t, 0.72, 0.88));
        const floor = handTargetAt(L, 'Right', FLOOR(L).add(V(0, 0.03 * kk, 0)), V(0.1, -0.35, 1), V(0.2, -1, 0.1), V(-0.7, -0.4, -0.6));
        const fk = worldPose(L, p);
        const carry = handTargetAt(L, 'Right', fk.pos.RightUpLeg.clone().add(V(-0.02 * kk, 0.15 * kk, 0.22 * kk)), V(0.3, -0.2, 1), V(0.6, 0.2, 0.1), V(-0.6, -1, -0.4));
        // Free → floor (grab) → carried at the waist → back to the side.
        const rise = ease(window01(t, 0.85, 1.35));
        const release = ease(window01(t, 1.35, 1.65));
        if (rise <= 0) reach(L, p, 'Right', null, floor, ease(window01(t, 0.15, 0.72)));
        else if (release <= 0) reach(L, p, 'Right', floor, carry, rise);
        else reach(L, p, 'Right', carry, null, release);
        // Left hand braces on the left knee during the squat.
        const knee = fk.pos.LeftLeg.clone().add(V(0.01 * kk, 0.05 * kk, 0.06 * kk));
        reach(L, p, 'Left', null, handTargetAt(L, 'Left', knee, V(-0.2, -0.5, 1), V(0, -1, 0.2), V(0.9, 0, -0.6)), ease(window01(t, 0.2, 0.6)) * (1 - ease(window01(t, 0.95, 1.3))));
        curlFingers(p, L, 'Right', { fingers: 28 + 52 * grabbed * (1 - ease(window01(t, 1.5, 1.75))), thumb: 12 + 35 * grabbed * (1 - ease(window01(t, 1.5, 1.75))) });
        return settle(L, p, at('idle', L, 0), ease(window01(t, 1.55, 1.8)));
      },
    },

    /** Small drop: a quick knee dip and the arms barely move. */
    land_soft: {
      duration: 0.45,
      loop: false,
      events: [{ name: 'impact', time: 0.03 }],
      sample: (L, t) => {
        const kk = k(L);
        const d = t < 0.1 ? 0.45 + 0.55 * ease(t / 0.1) : 1 - ease(window01(t, 0.1, 0.45));
        const p = base(L, { armDown: 20 - d * 6, elbow: 14 + d * 10 });
        Pose.spineFlex(p, 'Spine', d * 7);
        Pose.headNod(p, -d * 4);
        plantLegs(L, p, { hips: V(0, -0.11 * d * kk - 0.006 * kk * (1 - d), -0.025 * d * kk) });
        return settle(L, p, at('idle', L, 0), ease(window01(t, 0.3, 0.45)));
      },
    },

    /** Big drop: deep absorption, the trunk folds, one hand dabs the ground, a heavy recovery. */
    land_hard: {
      duration: 1.25,
      loop: false,
      events: [{ name: 'impact', time: 0.03 }, { name: 'bodyfall', time: 0.18 }],
      sample: (L, t) => {
        const kk = k(L);
        const d = t < 0.16 ? 0.4 + 0.6 * ease(t / 0.16) : 1 - ease(window01(t, 0.38, 1.1));
        const p = base(L, { armDown: 15 - d * 30, elbow: 14 + d * 30 });
        SIDES.forEach((side, i) => Pose.armFlex(p, side, d * (40 + i * 12)));
        Pose.spineFlex(p, 'Spine', d * 30);
        Pose.spineFlex(p, 'Spine1', d * 12);
        Pose.headNod(p, -d * 18);
        Pose.rootPitch(p, d * 10);
        p.hips.set(0, -0.006 * kk * (1 - d) - 0.46 * d * kk, -0.12 * d * kk);
        plantFeet(L, p, { kneeOut: 0.3 });
        const fk = worldPose(L, p);
        const dab = envelope(t, 0.05, 0.26, 0.42, 0.75);
        const ground = fk.pos.RightUpLeg.clone().setY(0.03).add(V(-0.08 * kk, 0, 0.3 * kk));
        reach(L, p, 'Right', null, handTargetAt(L, 'Right', ground, V(0.1, -0.2, 1), V(0, -1, 0), V(-0.6, 0.1, -0.8)), dab);
        curlFingers(p, L, 'Right', { fingers: 28 - 18 * dab, thumb: 12 + 10 * dab });
        return settle(L, p, at('idle', L, 0), ease(window01(t, 1.0, 1.25)));
      },
    },

    ...stairs(1),
    ...stairs(-1),
    ...meleeClips(bases),
  };
}

/** Standard stairs: 17 cm risers, 28 cm treads, one riser per step. */
export const STAIR = { riser: 0.17, tread: 0.28 };

/**
 * Stair cycle (loop, 1.1 s = two steps). The root moves forward and up/down at constant speed
 * (rootVelocity); each foot plants on a tread (fixed in world, so it slides back and down in root
 * space at exactly the root's speed) and swings over the next nosing: up, the knee lifts high first
 * and the trunk leans in; down, the foot reaches forward and down, toe first, and the knee absorbs.
 */
function stairs(dir) {
  const name = dir > 0 ? 'stairs_up' : 'stairs_down';
  const cycle = dir > 0 ? 1.1 : 1.0;
  const duty = 0.62;
  return {
    [name]: {
      duration: cycle,
      loop: true,
      meta: () => ({ rootVelocity: [0, (dir * 2 * STAIR.riser) / cycle, (2 * STAIR.tread) / cycle], speed: (2 * STAIR.tread) / cycle, syncGroup: name, events: [{ name: 'footstep', side: 'Left', time: 0 }, { name: 'footstep', side: 'Right', time: cycle / 2 }] }),
      sample: (L, t) => {
        const kk = k(L);
        const phase = t / cycle;
        const S = 2 * STAIR.tread;
        const R = 2 * STAIR.riser * dir;
        const p = base(L, { armDown: 20, elbow: 18 });
        const lean = dir > 0 ? 9 : 3;
        const ankles = {};
        const feet = {};
        let lowest = Infinity;
        SIDES.forEach((side, i) => {
          const ph = (phase + i * 0.5) % 1;
          let along;
          let rise;
          let pitch = 0;
          if (ph < duty) {
            const s = ph / duty;
            along = S * duty * (0.5 - s);
            rise = R * duty * (0.5 - s);
            if (dir < 0 && s < 0.15) pitch = -15 * (1 - s / 0.15);
            if (dir > 0 && s > 0.7) pitch = -12 * window01(s, 0.7, 1);
          } else {
            const u = (ph - duty) / (1 - duty);
            const fwd = dir > 0 ? ease(window01(u, 0.2, 1)) : ease(window01(u, 0, 0.85));
            const vert = dir > 0 ? ease(window01(u, 0, 0.6)) : ease(window01(u, 0.25, 1));
            along = S * duty * (-0.5 + fwd);
            rise = R * duty * (-0.5 + vert) + (dir > 0 ? 0.07 : 0.04) * Math.sin(Math.PI * u);
            pitch = dir > 0 ? -12 * (1 - window01(u, 0, 0.3)) : -15 * window01(u, 0.6, 1);
          }
          ankles[side] = L.world[`${side}Foot`].clone().add(V(0, rise, along));
          feet[side] = { pitch };
          lowest = Math.min(lowest, rise);
          // Arm swing opposite the legs.
          const swing = Math.cos((ph - 0.3) * TAU);
          Pose.armFlex(p, side, swing * 14);
        });
        Pose.spineFlex(p, 'Spine', lean * 0.6);
        Pose.spineFlex(p, 'Spine1', lean * 0.4);
        Pose.headNod(p, -lean * 0.6 + (dir < 0 ? 8 : 0));
        // Hips ride above the lower foot (legs never over-extend), with a small bob.
        const bob = Math.cos(phase * TAU * 2) * 0.012 * kk;
        p.hips.set(0, Math.min(0, lowest) * 0.6 + (dir > 0 ? -0.065 : -0.06) * kk + bob, dir > 0 ? 0.03 * kk : -0.01 * kk);
        plantFeet(L, p, { ankles, feet });
        return p;
      },
    },
  };
}

/** Fists: guard at the chin, strikes along the shoulder line. */
function fist(L, p, side, from, to, w) {
  reach(L, p, side, from, to, w);
}

function guardTarget(L, p, side) {
  const kk = k(L);
  const s = side === 'Left' ? 1 : -1;
  const fk = worldPose(L, p);
  const chin = fk.pos.Head.clone().add(V(s * 0.12 * kk, -0.1 * kk, 0.17 * kk + (side === 'Left' ? 0.07 * kk : 0)));
  return handTargetAt(L, side, chin, V(-s * 0.25, 0.85, 0.35), V(-s * 0.4, 0, -1), V(s * 0.4, -1, -0.1));
}

function strikeTarget(L, p, side, extend = 0.97) {
  const kk = k(L);
  const fk = worldPose(L, p);
  const shoulder = fk.pos[`${side}Arm`];
  const s = side === 'Left' ? 1 : -1;
  const reachLen = (L.measures.upperArm + L.measures.foreArm) * extend;
  const aim = V(-s * 0.12, 0.02, 1).normalize();
  const grip = shoulder.clone().addScaledVector(aim, reachLen).add(V(0, 0.02 * kk, 0));
  return handTargetAt(L, side, grip, V(-s * 0.9, 0.1, 0.35), V(-s * 0.35, -1, -0.2), V(s * 0.5, -1, -0.4));
}

/** Unarmed melee: jab (lead left), cross (rear right with hip drive), front kick (right). */
function meleeClips(bases) {
  const at = (name, L, t) => bases[name].sample(L, t % bases[name].duration, bases[name].duration);
  const fists = (p, L, w) => SIDES.forEach((side) => curlFingers(p, L, side, { fingers: 28 + 72 * w, thumb: 12 + 50 * w }));
  /** Fighting set-up: weight 60/40 on the rear (right) leg, shoulders bladed, chin down. */
  const stance = (L, g, { twist = 0, shift = 0, heel = 0, lean = 0 } = {}) => {
    const kk = k(L);
    const p = base(L);
    Pose.spineTwist(p, 'Spine', (-8 * g + twist) * 0.35);
    Pose.spineTwist(p, 'Spine1', (-8 * g + twist) * 0.35);
    Pose.spineTwist(p, 'Spine2', (-8 * g + twist) * 0.3);
    Pose.spineFlex(p, 'Spine1', (4 + lean) * g);
    Pose.headNod(p, 6 * g);
    Pose.headTurn(p, (8 * g - twist) * 0.6);
    Pose.rootYaw(p, twist * 0.35);
    p.hips.set(shift * 0.035 * kk, -0.006 * kk - 0.03 * kk * g, 0.02 * kk * shift);
    plantFeet(L, p, { feet: { Right: { yaw: heel * 25, pitch: -heel * 18 } }, ankles: { Right: L.world.RightFoot.clone().add(V(0, heel * 0.03 * kk, heel * 0.01 * kk)) }, kneeOut: 0.2 });
    return p;
  };
  return {
    melee_jab: {
      duration: 0.82,
      loop: false,
      meta: (L) => ({ contact: [0.06 * k(L), L.world.LeftArm.y, (L.measures.upperArm + L.measures.foreArm) * 0.97], then: 'idle' }),
      events: [{ name: 'hit', time: 0.32 }],
      sample: (L, t) => {
        const g = ease(window01(t, 0, 0.25)) * (1 - ease(window01(t, 0.52, 0.8)));
        const strike = ease(window01(t, 0.2, 0.32)) * (1 - ease(window01(t, 0.34, 0.5)));
        const p = stance(L, g, { twist: -10 * strike, shift: 0.3 * strike });
        for (const side of SIDES) fist(L, p, side, null, guardTarget(L, p, side), g);
        if (strike > 0) fist(L, p, 'Left', guardTarget(L, p, 'Left'), strikeTarget(L, p, 'Left'), strike);
        fists(p, L, g);
        return settle(L, p, at('idle', L, 0), ease(window01(t, 0.7, 0.82)));
      },
    },
    melee_cross: {
      duration: 0.95,
      loop: false,
      meta: (L) => ({ contact: [-0.02 * k(L), L.world.RightArm.y, (L.measures.upperArm + L.measures.foreArm) * 1.05], then: 'idle' }),
      events: [{ name: 'hit', time: 0.38 }],
      sample: (L, t) => {
        const g = ease(window01(t, 0, 0.25)) * (1 - ease(window01(t, 0.64, 0.92)));
        const strike = ease(window01(t, 0.23, 0.38)) * (1 - ease(window01(t, 0.42, 0.64)));
        // Hips and shoulders drive the rear hand: the rear heel pivots out, weight goes forward.
        const p = stance(L, g, { twist: 32 * strike, shift: 0.9 * strike, heel: strike, lean: 4 * strike });
        for (const side of SIDES) fist(L, p, side, null, guardTarget(L, p, side), g);
        if (strike > 0) fist(L, p, 'Right', guardTarget(L, p, 'Right'), strikeTarget(L, p, 'Right', 0.98), strike);
        fists(p, L, g);
        return settle(L, p, at('idle', L, 0), ease(window01(t, 0.82, 0.95)));
      },
    },
    melee_kick: {
      duration: 1.15,
      loop: false,
      meta: (L) => ({ contact: [-0.1 * k(L), 0.75 * k(L), 0.62 * k(L)], then: 'idle' }),
      events: [{ name: 'hit', time: 0.45 }, { name: 'footstep', side: 'Right', time: 0.78 }],
      sample: (L, t) => {
        const kk = k(L);
        const g = ease(window01(t, 0, 0.25)) * (1 - ease(window01(t, 0.72, 1.05)));
        const chamber = ease(window01(t, 0.12, 0.33)) * (1 - ease(window01(t, 0.6, 0.78)));
        const extend = ease(window01(t, 0.33, 0.45)) * (1 - ease(window01(t, 0.48, 0.62)));
        const p = base(L);
        // Support on the left leg: hips over it, trunk leaning back against the kick.
        Pose.spineFlex(p, 'Spine', -8 * chamber - 6 * extend);
        Pose.spineFlex(p, 'Spine1', 6 * g);
        Pose.headNod(p, 10 * g + 6 * extend);
        Pose.rootPitch(p, -4 * extend);
        p.hips.set(0.075 * kk * chamber, -0.006 * kk - 0.03 * kk * g, -0.03 * kk * extend);
        const rest = L.world.RightFoot.clone();
        const knee = rest.clone().add(V(0.03 * kk, 0.38 * kk, 0.28 * kk));
        const out = rest.clone().add(V(0.02 * kk, 0.62 * kk, 0.58 * kk));
        const ankle = rest.clone().lerp(knee, chamber).lerp(out, extend);
        plantFeet(L, p, { ankles: { Left: L.world.LeftFoot.clone().add(V(0.0, 0, 0)), Right: ankle }, feet: { Left: { yaw: 10 * chamber }, Right: { pitch: 25 * extend - 30 * chamber * (1 - extend) } }, kneeOut: 0.05 });
        for (const side of SIDES) fist(L, p, side, null, guardTarget(L, p, side), g);
        fists(p, L, g);
        return settle(L, p, at('idle', L, 0), ease(window01(t, 1.0, 1.15)));
      },
    },
  };
}
