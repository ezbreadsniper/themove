import * as THREE from 'three';
import { Pose, createPose } from './pose.js';
import { base, plantLegs, ease, TAU } from './clip-kit.js';
import { STANCES, aimDirection, bodyMarks, holdWeapon, blendXform, recoilXform, offsetXform } from './weapon-pose.js';
import { weaponNode } from '../weapons/model.js';
import { WEAPONS } from '../weapons/specs.js';

/**
 * Weapon clips are timelines of keys [time, state]. State fields (all optional, carried forward):
 *   stance            weapon placement (STANCES)            aim     [yawDeg, pitchDeg] (body + weapon)
 *   spin              [yawDeg, pitchDeg] weapon-only turn (inspect)
 *   R, L              hand targets ('grip' 'support' 'free' 'pouch' 'magWell' 'slide' 'bolt')
 *   kick              recoil 0..1                           slide   slide / bolt travel 0..1
 *   magDrop           magazine out 0..1                     handMag spare magazine in the left hand
 *   drawn             weapon in hand (else in the holster / sling)
 *   lean, cheek, blade, crouch, flinch   body set-up (degrees / 0..1)
 *   cant, tilt        weapon roll / pitch about the grip (deg): turning the magwell to the eyes, checks
 *   look, lookTurn    head down / left (deg) on top of the aim: eyes on the holster, magwell, chamber
 *   lift              weapon raised straight up (m at 1.78 m): clearing the holster
 * Between keys every number eases, stances blend as weapon transforms, and hands blend between targets,
 * so nothing snaps; the hand IK runs every frame, so hands stay on the weapon on every body.
 */
const DEFAULTS = { stance: 'stowed', aim: [0, 0], spin: [0, 0], R: 'free', L: 'free', kick: 0, slide: 0, magDrop: 0, handMag: false, drawn: false, lean: 0, cheek: 0, blade: 0, crouch: 0, flinch: 0, cant: 0, tilt: 0, look: 0, lookTurn: 0, lift: 0 };
/** Scale used for hidden weapon nodes (exactly zero breaks some importers' matrix inverses). */
export const HIDDEN = 1e-4;
const NUMERIC = ['kick', 'slide', 'magDrop', 'lean', 'cheek', 'blade', 'crouch', 'flinch', 'cant', 'tilt', 'look', 'lookTurn', 'lift'];

/** Long-gun stance: shoulders turned so the support side comes forward (degrees of spine twist). */
export const LONG_BLADE = 24;

/** Share of an aim's yaw taken by the torso (the head takes the rest). */
const AIM_TORSO_SHARE = 0.7;

function resolveKeys(keys) {
  let state = { ...DEFAULTS };
  return keys.map(([time, k]) => {
    state = { ...state, ...k };
    return [time, state];
  });
}

function stateAt(keys, t) {
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1][0] <= t) i += 1;
  const [t0, a] = keys[i];
  if (i === keys.length - 1) return { a, b: a, u: 0 };
  const [t1, b] = keys[i + 1];
  return { a, b, u: ease(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))) };
}

/** Upper-body set-up on top of a body pose (base stance or a locomotion frame). */
function aimBody(L, p, s) {
  const turn = s.yaw * AIM_TORSO_SHARE - s.blade;
  Pose.spineTwist(p, 'Spine', turn * 0.3);
  Pose.spineTwist(p, 'Spine1', turn * 0.35);
  Pose.spineTwist(p, 'Spine2', turn * 0.35);
  Pose.headTurn(p, s.yaw * (1 - AIM_TORSO_SHARE) + s.blade - s.cheek * 4 + s.flinch * 14);
  Pose.spineFlex(p, 'Spine', s.lean * 0.4);
  Pose.spineFlex(p, 'Spine1', s.lean * 0.6 - s.pitch * 0.25 - s.flinch * 12);
  Pose.spineFlex(p, 'Spine2', -s.pitch * 0.3 - s.flinch * 8);
  Pose.spineTwist(p, 'Spine2', s.flinch * 10);
  Pose.headNod(p, -s.pitch * 0.35 + s.cheek * 6 - s.flinch * 16);
  Pose.headTilt(p, -s.cheek * 9);
  if (s.look || s.lookTurn) {
    Pose.headNod(p, s.look);
    Pose.headTurn(p, s.lookTurn);
  }
  return p;
}

function standing(L, crouch) {
  const p = base(L, { armDown: 20, elbow: 15 });
  const k = L.measures.height / 1.78;
  Pose.spineFlex(p, 'Spine', crouch * 12);
  plantLegs(L, p, { hips: new THREE.Vector3(0, -0.012 - crouch * 0.38 * k, 0.004 - crouch * 0.09 * k) });
  return p;
}

function clonePose(src) {
  const p = createPose();
  for (const [b, q] of Object.entries(src.bones)) p.bones[b] = q.clone();
  p.hips.copy(src.hips);
  return p;
}

/**
 * Samples one weapon frame for a weapon type at blended state (a → b at u). bodyPose: optional pose
 * to build on (locomotion); the clip otherwise stands (or crouches) in place.
 */
export function weaponFrame(L, type, a, b, u, bodyPose = null, sway = null) {
  const spec = WEAPONS[type];
  const mix = (key) => a[key] + (b[key] - a[key]) * u;
  const s = Object.fromEntries(NUMERIC.map((key) => [key, mix(key)]));
  s.yaw = a.aim[0] + (b.aim[0] - a.aim[0]) * u;
  s.pitch = a.aim[1] + (b.aim[1] - a.aim[1]) * u;
  const yaw = s.yaw + a.spin[0] + (b.spin[0] - a.spin[0]) * u;
  const weaponPitch = s.pitch + a.spin[1] + (b.spin[1] - a.spin[1]) * u;
  const p = aimBody(L, bodyPose ? clonePose(bodyPose) : standing(L, s.crouch), s);
  const marks = bodyMarks(L, p);
  const aim = aimDirection(yaw, weaponPitch);
  let wx = blendXform(STANCES[a.stance](spec, marks, aim), STANCES[b.stance](spec, marks, aim), u);
  if (s.kick) wx = recoilXform(wx, spec, s.kick);
  wx = offsetXform(wx, spec, { cant: s.cant + (sway?.cant ?? 0), tilt: s.tilt + (sway?.tilt ?? 0), yaw: sway?.yaw ?? 0, lift: (sway?.lift ?? 0) + s.lift * (L.measures.height / 1.78) });
  p.hold = holdWeapon(L, p, type, wx, { Right: [a.R, b.R, u], Left: [a.L, b.L, u] }, marks);
  const step = u < 1 ? a : b;
  const moving = spec.kind === 'pistol' ? 'slide' : 'bolt';
  // Show / hide is animated as scale (glTF cannot animate visibility).
  const shown = (on) => (on ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN]);
  p.props = {
    [`${weaponNode(type, 'hand')}.scale`]: shown(step.drawn),
    [`${weaponNode(type, 'stowed')}.scale`]: shown(!step.drawn),
    [`${weaponNode(type, moving)}.position`]: [0, 0, -spec.travel * s.slide],
    [`${weaponNode(type, 'mag')}.position`]: [0, -spec.magDrop * s.magDrop, 0],
    [`${weaponNode(type, 'mag')}.scale`]: shown(s.magDrop < 0.98),
    [`${weaponNode(type, 'handMag')}.scale`]: shown(step.handMag),
    // Runtime support-hand IK weight (src/anim/runtime-ik.js): 1 while the left hand is on the support.
    [`${weaponNode(type, 'hand')}.supportIK`]: (a.L === 'support' ? 1 - u : 0) + (b.L === 'support' ? u : 0),
  };
  return p;
}

/**
 * Sampler for a weapon timeline. body: name of a base sampler to run underneath (locomotion / idle),
 * played at its own duration.
 */
function timeline(type, keys, { duration = keys[keys.length - 1][0], loop = false, body = null, events = [], layer = 'full', additive = false, reference = null, bob = 0, breath = 0 } = {}, bases = {}) {
  const resolved = resolveKeys(keys);
  return {
    duration,
    loop,
    weapon: type,
    events,
    meta: () => ({ layer, ...(additive ? { additive: true } : {}), ...(reference ? { additiveReference: reference } : {}) }),
    sample: (L, t) => {
      const { a, b, u } = stateAt(resolved, t);
      const under = body ? bases[body].sample(L, t % bases[body].duration, bases[body].duration) : null;
      return weaponFrame(L, type, a, b, u, under, swayAt(t, duration, bob, breath));
    },
  };
}

/**
 * Procedural weapon motion on top of a loop (degrees / m). bob: the gun lags and bounces with the gait,
 * two bounces and one side-to-side sway per cycle (sync with the footfalls of the body clip); breath:
 * the slow rise and fall of the sights while holding aim. Both are periodic in the clip's duration.
 */
function swayAt(t, duration, bob, breath) {
  if (!bob && !breath) return null;
  const ph = (t / duration) * TAU;
  return {
    lift: -0.006 * bob * Math.cos(2 * ph),
    yaw: 0.9 * bob * Math.sin(ph),
    tilt: 0.6 * bob * Math.sin(2 * ph + 0.7) + breath * 0.45 * Math.sin(ph),
    cant: 1.4 * bob * Math.sin(ph + 0.4) + breath * 0.15 * Math.sin(2 * ph),
  };
}

/**
 * Recoil keys for one shot at time t0: the kick peaks within a frame, the slide / bolt cycles, and the
 * recovery is a damped spring (back through rest with a small undershoot, then settle) rather than a
 * linear return, so follow-up shots read as a muzzle coming back onto the target.
 */
const shot = (t0, { strength = 1, next = Infinity } = {}) => [
  [t0, { kick: 0, slide: 0 }],
  [t0 + 0.03, { kick: strength, slide: 1 }],
  [t0 + 0.08, { kick: strength * 0.38, slide: 0 }],
  [t0 + 0.14, { kick: -strength * 0.07 }],
  [t0 + 0.21, { kick: strength * 0.02 }],
].filter(([time]) => time < next - 1e-6);
/** Shots at the given times; each recovery is cut where the next shot starts. */
const burst = (times, strengths) => times.flatMap((t0, i) => shot(t0, { strength: strengths[i], next: times[i + 1] }));

/** The full pistol set. */
function pistolClips(T) {
  const draw = { stance: 'stowed', R: 'free', L: 'free', drawn: false };
  const aim = { stance: 'pistolAim', R: 'grip', L: 'support', drawn: true, lean: 4 };
  const ready = { stance: 'pistolReady', R: 'grip', L: 'support', drawn: true, lean: 2 };
  const low = { stance: 'pistolLow', R: 'grip', L: 'free', drawn: true, lean: 0 };
  const sway = (st) => [[0, { ...st, aim: [0, 0] }], [1, { aim: [0.5, 0.3] }], [2, { aim: [-0.3, -0.2] }], [3, { aim: [0.2, -0.4] }], [4, { aim: [0, 0] }]];
  /** Gun turned so the eyes see the magwell (canted, muzzle up a little), and back. */
  const present = { cant: -18, tilt: 10, look: 12 };
  const square = { cant: 0, tilt: 0, look: 0, lookTurn: 0 };
  // Tactical: the partly spent magazine is pulled by hand and kept (pouch), the fresh one is seated
  // with a palm bump; a round is still chambered so the slide never moves.
  const tactical = (t0) => [
    [t0, { ...ready }],
    [t0 + 0.14, { ...present }],
    [t0 + 0.34, { L: 'magWell' }],
    [t0 + 0.42, { L: 'magWell', magDrop: 0.35 }],
    [t0 + 0.44, { L: 'magWell', magDrop: 1, handMag: true }],
    [t0 + 0.72, { L: 'pouch', handMag: true }],
    [t0 + 0.84, { L: 'pouch', handMag: true }],
    [t0 + 1.12, { L: 'magWell', handMag: true }],
    [t0 + 1.22, { L: 'magWell', handMag: false, magDrop: 0 }],
    [t0 + 1.28, { L: 'magWell', magDrop: -0.04, kick: 0.1 }],
    [t0 + 1.36, { magDrop: 0, kick: 0 }],
  ];
  // Empty: the slide is locked back; the empty magazine drops free while the hand goes straight to
  // the pouch, the fresh one is seated with a bump, then the support hand slingshots the slide.
  const empty = (t0) => [
    [t0, { ...ready, slide: 1 }],
    [t0 + 0.14, { ...present, magDrop: 0.3 }],
    [t0 + 0.3, { magDrop: 1, L: 'pouch' }],
    [t0 + 0.42, { L: 'pouch', handMag: true }],
    [t0 + 0.74, { L: 'magWell', handMag: true }],
    [t0 + 0.84, { L: 'magWell', handMag: false, magDrop: 0 }],
    [t0 + 0.9, { L: 'magWell', magDrop: -0.04, kick: 0.1 }],
    [t0 + 0.98, { magDrop: 0, kick: 0, cant: -8, tilt: 4, look: 6 }],
    [t0 + 1.2, { L: 'slide', slide: 1 }],
    [t0 + 1.28, { L: 'slide', slide: 1 }],
    [t0 + 1.34, { slide: 0 }],
  ];
  return {
    pistol_idleHolstered: T('pistol', [[0, draw]], { duration: 4, loop: true, body: 'idle' }),
    pistol_idle: T('pistol', [[0, low]], { duration: 4, loop: true, body: 'idle' }),
    pistol_idleTwoHand: T('pistol', [[0, ready]], { duration: 4, loop: true, body: 'idle', breath: 0.5 }),
    pistol_aimIdle: T('pistol', sway(aim), { duration: 4, loop: true, breath: 1 }),
    pistol_aimHip: T('pistol', sway({ ...aim, stance: 'pistolHip', lean: 2 }), { duration: 4, loop: true, breath: 0.7 }),
    pistol_aimOneHand: T('pistol', sway({ ...aim, stance: 'pistolAimOneHand', L: 'free' }), { duration: 4, loop: true, breath: 1.3 }),
    // Eyes go to the holster, the hand grips, the gun clears the holster straight up, rotates out
    // toward the target while the support hand meets it, and pushes out to aim.
    pistol_draw: T('pistol', [[0, draw], [0.22, { R: 'grip', look: 14, lookTurn: -10 }], [0.24, { drawn: true }], [0.36, { lift: 0.09 }], [0.55, { ...ready, L: 'free', lift: 0, look: 0, lookTurn: 0 }], [0.75, ready], [0.95, aim]], { events: [{ name: 'draw', time: 0.24 }] }),
    pistol_drawNeutral: T('pistol', [[0, { ...low, drawn: true }], [0.4, ready], [0.65, aim]]),
    pistol_unequip: T('pistol', [[0, aim], [0.25, ready], [0.45, { ...ready, L: 'free' }], [0.68, { stance: 'stowed', R: 'grip', L: 'free', lift: 0.08, look: 10, lookTurn: -8 }], [0.8, { lift: 0 }], [0.82, { drawn: false }], [1.06, { ...draw, look: 0, lookTurn: 0 }]], { events: [{ name: 'holster', time: 0.82 }] }),
    pistol_switch: T('pistol', [[0, aim], [0.2, { ...ready, L: 'free' }], [0.42, { stance: 'stowed', R: 'grip', L: 'free' }], [0.44, { drawn: false }], [0.6, draw]], { events: [{ name: 'holster', time: 0.44 }] }),
    // Aim-in overshoots a touch high and settles; aim-out drops the muzzle first.
    pistol_raise: T('pistol', [[0, low], [0.28, ready], [0.44, { ...aim, aim: [0, 0.9] }], [0.58, { aim: [0, 0] }]]),
    pistol_lower: T('pistol', [[0, aim], [0.12, { aim: [0, -4] }], [0.3, { ...ready, aim: [0, 0] }], [0.52, low]]),
    pistol_fire: T('pistol', [[0, aim], ...shot(0), [0.32, { kick: 0 }]], { events: [{ name: 'fire', time: 0 }] }),
    pistol_burst: T('pistol', [[0, aim], ...burst([0, 0.13, 0.26], [1, 1.1, 1.2]), [0.6, { kick: 0 }]], { events: [0, 0.13, 0.26].map((time) => ({ name: 'fire', time })) }),
    pistol_recoil: T('pistol', [[0, aim], ...shot(0), [0.32, { kick: 0 }]], { additive: true, layer: 'additive', events: [{ name: 'fire', time: 0 }] }),
    pistol_dryFire: T('pistol', [[0, aim], [0.05, { kick: 0.07 }], [0.25, { kick: 0 }], [0.4, {}]], { events: [{ name: 'click', time: 0.04 }] }),
    pistol_reload: T('pistol', [[0, aim], ...tactical(0.15), [1.76, { ...ready, ...square }], [2.0, aim]], { events: [{ name: 'magOut', time: 0.55 }, { name: 'magIn', time: 1.37 }, { name: 'tap', time: 1.43 }] }),
    pistol_reloadEmpty: T('pistol', [[0, { ...aim, slide: 1 }], ...empty(0.12), [1.7, { ...ready, ...square }], [1.95, aim]], { events: [{ name: 'magOut', time: 0.26 }, { name: 'magIn', time: 0.96 }, { name: 'tap', time: 1.02 }, { name: 'slideRelease', time: 1.46 }] }),
    pistol_magInsert: T('pistol', [[0, { ...ready, L: 'pouch', handMag: true, magDrop: 1 }], [0.33, { L: 'magWell' }], [0.46, { handMag: false, magDrop: 0 }], [0.7, ready]], { events: [{ name: 'magIn', time: 0.46 }] }),
    pistol_slideRelease: T('pistol', [[0, { ...ready, slide: 1 }], [0.2, { L: 'slide' }], [0.3, { L: 'slide', slide: 1 }], [0.36, { slide: 0 }], [0.6, ready]], { events: [{ name: 'slideRelease', time: 0.34 }] }),
    // Turned to show one flank, then the other (eyes following), then a press check: the support hand
    // pinches the slide back a centimetre to see brass, lets it go, and the gun returns to ready.
    pistol_inspect: T('pistol', [[0, ready], [0.42, { stance: 'pistolInspect', L: 'free', spin: [70, 15], look: 14, lookTurn: -6 }], [1.05, { spin: [70, 15] }], [1.45, { spin: [-60, 10], lookTurn: 5 }], [1.95, { spin: [-60, 10] }], [2.25, { spin: [0, 0], L: 'slide', look: 10, lookTurn: 0 }], [2.4, { L: 'slide', slide: 0.35 }], [2.62, { L: 'slide', slide: 0.35 }], [2.7, { slide: 0 }], [3.1, { ...ready, ...square }]], { events: [{ name: 'slideRelease', time: 2.7 }] }),
    // Pistol whip: gun cocked back by the ear, the frame driven down and across with the hips.
    pistol_melee: T('pistol', [[0, ready], [0.26, { stance: 'pistolWhipWind', L: 'free', aim: [-14, 4], lean: -2 }], [0.44, { stance: 'pistolWhipStrike', aim: [24, -6], lean: 10 }], [0.56, { aim: [26, -7], lean: 11 }], [1.0, { ...ready, aim: [0, 0] }]], { events: [{ name: 'hit', time: 0.42 }] }),
    pistol_hitReact: T('pistol', [[0, aim], [0.07, { flinch: 1, kick: 0.5 }], [0.6, { flinch: 0, kick: 0 }]], { events: [{ name: 'hit', time: 0 }] }),
    pistol_toSprint: T('pistol', [[0, aim], [0.35, low]], { body: 'run' }),
    pistol_walk: T('pistol', [[0, ready]], { duration: 1, loop: true, body: 'walk', bob: 1 }),
    pistol_walkAim: T('pistol', [[0, aim]], { duration: 1, loop: true, body: 'walk', bob: 0.3 }),
    pistol_walkBackAim: T('pistol', [[0, aim]], { duration: 1, loop: true, body: 'walk_S', bob: 0.3 }),
    pistol_strafeLeftAim: T('pistol', [[0, aim]], { duration: 1, loop: true, body: 'walk_W', bob: 0.3 }),
    pistol_strafeRightAim: T('pistol', [[0, aim]], { duration: 1, loop: true, body: 'walk_E', bob: 0.3 }),
    pistol_run: T('pistol', [[0, ready]], { duration: 0.7, loop: true, body: 'run', bob: 1.6 }),
    pistol_sprint: T('pistol', [[0, low]], { duration: 0.62, loop: true, body: 'sprint', bob: 1.2 }),
    pistol_crouch: T('pistol', [[0, ready]], { duration: 3, loop: true, body: 'crouchIdle', breath: 0.5 }),
    pistol_crouchAim: T('pistol', [[0, aim]], { duration: 3, loop: true, body: 'crouchIdle', breath: 0.8 }),
    pistol_crouchWalk: T('pistol', [[0, ready]], { duration: 1.25, loop: true, body: 'crouchWalk', bob: 0.7 }),
  };
}

/** The shared long-gun set (rifle, SMG): two-hand IK on the weapon's own sockets. */
function longGunClips(T, type) {
  const blade = LONG_BLADE;
  const stowed = { stance: 'stowed', R: 'free', L: 'free', drawn: false, blade: 0 };
  const aim = { stance: 'longAim', R: 'grip', L: 'support', drawn: true, lean: 5, cheek: 1, blade };
  const ready = { stance: 'longReady', R: 'grip', L: 'support', drawn: true, lean: 3, cheek: 0, blade };
  const high = { stance: 'longHigh', R: 'grip', L: 'support', drawn: true, lean: 1, cheek: 0, blade: blade * 0.6 };
  const hip = { stance: 'longHip', R: 'grip', L: 'support', drawn: true, lean: 2, cheek: 0, blade: blade * 0.6 };
  const sway = (st) => [[0, { ...st, aim: [0, 0] }], [1, { aim: [0.4, 0.25] }], [2, { aim: [-0.25, -0.15] }], [3, { aim: [0.15, -0.3] }], [4, { aim: [0, 0] }]];
  const n = (name) => `${type}_${name}`;
  // A back-slung weapon passes over the shoulder on the way on and off the back (the straight path
  // would drag the grip through the shoulder joint); a hip-slung one goes straight.
  const fromBack = WEAPONS[type].mount.bone !== 'Hips';
  const shoulder = {
    lift: { stance: 'longLift', R: 'grip', L: 'free', drawn: true, blade: 0 },
    over: { stance: 'longOverShoulder', R: 'grip', L: 'free', drawn: true, blade: 0 },
  };
  const magOut = (t0, after = 'free') => [[t0, { ...ready, L: 'support' }], [t0 + 0.2, { L: 'magWell', magDrop: 0 }], [t0 + 0.3, { L: 'magWell', magDrop: 0.3 }], [t0 + 0.5, { L: after, magDrop: 1 }]];
  const magIn = (t0) => [[t0, { L: 'pouch', handMag: true }], [t0 + 0.38, { L: 'magWell', handMag: true }], [t0 + 0.5, { L: 'magWell', handMag: false, magDrop: 0 }]];
  const boltPull = (t0) => [[t0 + 0.32, { L: 'bolt', slide: 0 }], [t0 + 0.44, { L: 'bolt', slide: 1 }], [t0 + 0.5, { slide: 0 }]];
  const present = { cant: 14, tilt: 9, look: 9, lookTurn: -4 };
  const square = { cant: 0, tilt: 0, look: 0, lookTurn: 0 };
  // Tactical: retain the partial magazine (pulled by hand, into the pouch), seat a fresh one with a
  // bump; the chamber is loaded, so no bolt.
  const tactical = (t0) => [
    [t0, { ...ready, L: 'support' }],
    [t0 + 0.16, { ...present }],
    [t0 + 0.32, { L: 'magWell' }],
    [t0 + 0.44, { L: 'magWell', magDrop: 0.3 }],
    [t0 + 0.46, { L: 'magWell', magDrop: 1, handMag: true }],
    [t0 + 0.78, { L: 'pouch', handMag: true }],
    [t0 + 0.9, { L: 'pouch', handMag: true }],
    [t0 + 1.22, { L: 'magWell', handMag: true }],
    [t0 + 1.32, { L: 'magWell', handMag: false, magDrop: 0 }],
    [t0 + 1.38, { L: 'magWell', magDrop: -0.04, kick: 0.08 }],
    [t0 + 1.46, { magDrop: 0, kick: 0 }],
  ];
  // Empty: release and let the magazine fall, straight to the pouch, seat with a bump, then run the bolt.
  const empty = (t0) => [
    [t0, { ...ready, L: 'support' }],
    [t0 + 0.18, { ...present, L: 'magWell' }],
    [t0 + 0.26, { L: 'magWell', magDrop: 0.3 }],
    [t0 + 0.4, { magDrop: 1 }],
    [t0 + 0.58, { L: 'pouch', handMag: true }],
    [t0 + 0.9, { L: 'magWell', handMag: true }],
    [t0 + 1.0, { L: 'magWell', handMag: false, magDrop: 0 }],
    [t0 + 1.06, { L: 'magWell', magDrop: -0.04, kick: 0.08 }],
    [t0 + 1.14, { magDrop: 0, kick: 0, cant: 8 }],
    ...boltPull(t0 + 1.14),
  ];
  return {
    [n('idleStowed')]: T(type, [[0, stowed]], { duration: 4, loop: true, body: 'idle' }),
    [n('idle')]: T(type, [[0, ready]], { duration: 4, loop: true, body: 'idle', breath: 0.5 }),
    [n('lowReady')]: T(type, [[0, ready]], { duration: 4, loop: true, breath: 0.6 }),
    [n('highReady')]: T(type, [[0, high]], { duration: 4, loop: true, breath: 0.6 }),
    [n('hipFire')]: T(type, sway(hip), { duration: 4, loop: true, breath: 0.7 }),
    [n('aimIdle')]: T(type, sway(aim), { duration: 4, loop: true, breath: 1 }),
    [n('equip')]: T(type, fromBack
      // Head turns to the shoulder as the hand finds the sling, then back to the front as the gun comes round.
      ? [[0, stowed], [0.3, { R: 'grip', lookTurn: -16, look: 4 }], [0.32, { drawn: true }], [0.6, { ...shoulder.lift }], [0.85, { ...shoulder.over, lookTurn: 0, look: 0 }], [1.15, { ...ready, L: 'free' }], [1.4, ready]]
      : [[0, stowed], [0.3, { R: 'grip', look: 10, lookTurn: -8 }], [0.32, { drawn: true }], [0.65, { ...ready, L: 'free', look: 0, lookTurn: 0 }], [0.9, ready]], { events: [{ name: 'draw', time: 0.32 }] }),
    [n('unequip')]: T(type, fromBack
      ? [[0, ready], [0.25, { L: 'free' }], [0.55, { ...shoulder.over }], [0.8, { ...shoulder.lift }], [1.05, { stance: 'stowed', R: 'grip', L: 'free', blade: 0 }], [1.07, { drawn: false }], [1.35, stowed]]
      : [[0, ready], [0.25, { L: 'free' }], [0.6, { stance: 'stowed', R: 'grip', L: 'free', blade: 0 }], [0.62, { drawn: false }], [0.9, stowed]], { events: [{ name: 'holster', time: fromBack ? 1.07 : 0.62 }] }),
    [n('switch')]: T(type, fromBack
      ? [[0, ready], [0.18, { L: 'free' }], [0.5, { ...shoulder.over }], [0.74, { ...shoulder.lift }], [0.96, { stance: 'stowed', R: 'grip', L: 'free', blade: 0 }], [0.98, { drawn: false }], [1.2, stowed]]
      : [[0, ready], [0.2, { L: 'free' }], [0.55, { stance: 'stowed', R: 'grip', L: 'free', blade: 0 }], [0.57, { drawn: false }], [0.85, stowed]], { events: [{ name: 'holster', time: fromBack ? 0.98 : 0.57 }] }),
    // Aim-in: the stock comes up into the pocket and the cheek lands a beat later, with a small settle.
    [n('raise')]: T(type, [[0, ready], [0.3, { ...aim, cheek: 0.6, aim: [0, 0.7] }], [0.44, { cheek: 1, aim: [0, 0] }]]),
    [n('lower')]: T(type, [[0, aim], [0.12, { cheek: 0.3 }], [0.4, ready]]),
    [n('fire')]: T(type, [[0, aim], ...shot(0), [0.25, { kick: 0 }]], { events: [{ name: 'fire', time: 0 }] }),
    [n('dryFire')]: T(type, [[0, aim], [0.05, { kick: 0.05 }], [0.25, { kick: 0 }], [0.4, {}]], { events: [{ name: 'click', time: 0.04 }] }),
    [n('burst')]: T(type, [[0, aim], ...burst([0, 0.09, 0.18], [1, 1.1, 1.25]), [0.5, { kick: 0 }]], { events: [0, 0.09, 0.18].map((time) => ({ name: 'fire', time })) }),
    [n('recoil')]: T(type, [[0, aim], ...shot(0), [0.25, { kick: 0 }]], { additive: true, layer: 'additive', events: [{ name: 'fire', time: 0 }] }),
    [n('reload')]: T(type, [[0, aim], ...tactical(0.12), [1.8, { ...ready, ...square }], [2.05, aim]], { events: [{ name: 'magOut', time: 0.58 }, { name: 'magIn', time: 1.44 }, { name: 'tap', time: 1.5 }] }),
    [n('reloadEmpty')]: T(type, [[0, aim], ...empty(0.12), [2.05, { ...ready, ...square }], [2.3, aim]], { events: [{ name: 'magOut', time: 0.4 }, { name: 'magIn', time: 1.12 }, { name: 'tap', time: 1.18 }, { name: 'boltRelease', time: 1.74 }] }),
    [n('magOut')]: T(type, [[0, ready], ...magOut(0.05), [0.75, { L: 'free', magDrop: 1 }]], { events: [{ name: 'magOut', time: 0.35 }] }),
    [n('magIn')]: T(type, [[0, { ...ready, L: 'pouch', handMag: true, magDrop: 1 }], ...magIn(0.05), [0.85, ready]], { events: [{ name: 'magIn', time: 0.55 }] }),
    [n('boltPull')]: T(type, [[0, ready], ...boltPull(0), [0.82, ready]], { events: [{ name: 'boltRelease', time: 0.48 }] }),
    [n('jam')]: T(type, [[0, aim], [0.15, { kick: 0.1 }], [0.4, { ...ready, L: 'magWell' }], [0.52, { L: 'magWell', magDrop: -0.05 }], [0.6, { L: 'magWell', magDrop: 0 }], ...boltPull(0.6), [1.42, ready], [1.67, aim]], { events: [{ name: 'click', time: 0.12 }, { name: 'tap', time: 0.52 }, { name: 'boltRelease', time: 1.08 }] }),
    // Both flanks with the eyes following, then a chamber check: the bolt eased back a little and let go.
    [n('inspect')]: T(type, [[0, ready], [0.45, { stance: 'longInspect', spin: [60, 20], blade: 10, look: 10, lookTurn: 6 }], [1.15, { spin: [60, 20] }], [1.55, { spin: [-25, 35], lookTurn: -4 }], [2.05, { spin: [-25, 35] }], [2.35, { spin: [0, 12], L: 'bolt', look: 12, lookTurn: 0 }], [2.5, { L: 'bolt', slide: 0.35 }], [2.7, { L: 'bolt', slide: 0.35 }], [2.78, { slide: 0 }], [3.25, { ...ready, ...square, spin: [0, 0] }]], { events: [{ name: 'boltRelease', time: 2.78 }] }),
    // Rifle shove: the gun turned across the chest at port arms and driven out with both arms and the hips.
    [n('melee')]: T(type, [[0, ready], [0.18, { spin: [55, 25], blade: 14 }], [0.42, { stance: 'longPortWind', spin: [0, 0], aim: [-6, 0], blade: 8, lean: -2, cheek: 0 }], [0.56, { stance: 'longPortStrike', aim: [4, 0], blade: 0, lean: 12 }], [0.68, { lean: 13 }], [0.94, { ...ready, spin: [55, 25], blade: 14 }], [1.16, { ...ready, spin: [0, 0] }]], { events: [{ name: 'hit', time: 0.54 }] }),
    [n('hitReact')]: T(type, [[0, aim], [0.07, { flinch: 1, kick: 0.6 }], [0.6, { flinch: 0, kick: 0 }]], { events: [{ name: 'hit', time: 0 }] }),
    [n('walk')]: T(type, [[0, ready]], { duration: 1, loop: true, body: 'walk', bob: 1 }),
    [n('walkAim')]: T(type, [[0, aim]], { duration: 1, loop: true, body: 'walk', bob: 0.25 }),
    [n('walkBackAim')]: T(type, [[0, aim]], { duration: 1, loop: true, body: 'walk_S', bob: 0.25 }),
    [n('strafeLeftAim')]: T(type, [[0, aim]], { duration: 1, loop: true, body: 'walk_W', bob: 0.25 }),
    [n('strafeRightAim')]: T(type, [[0, aim]], { duration: 1, loop: true, body: 'walk_E', bob: 0.25 }),
    [n('run')]: T(type, [[0, ready]], { duration: 0.7, loop: true, body: 'run', bob: 1.5 }),
    [n('sprint')]: T(type, [[0, { ...high, blade: 0, lean: 0 }]], { duration: 0.62, loop: true, body: 'sprint', bob: 1.2 }),
    [n('toSprint')]: T(type, [[0, aim], [0.35, { ...high, blade: 0, lean: 0 }]], { body: 'run' }),
    [n('crouch')]: T(type, [[0, ready]], { duration: 3, loop: true, body: 'crouchIdle', breath: 0.5 }),
    [n('crouchAim')]: T(type, [[0, aim]], { duration: 3, loop: true, body: 'crouchIdle', breath: 0.8 }),
    [n('crouchWalk')]: T(type, [[0, ready]], { duration: 1.25, loop: true, body: 'crouchWalk', bob: 0.7 }),
  };
}

/** Aim-offset poses (additive against the aim idle): 45° left / right, 40° up / down. */
function aimOffsets(T, type, aimState) {
  const at = (aim) => T(type, [[0, { ...aimState, aim }]], { duration: 1, loop: true, layer: 'additive', additive: true, reference: `${type}_aimIdle` });
  return { [`${type}_aimLeft`]: at([45, 0]), [`${type}_aimRight`]: at([-45, 0]), [`${type}_aimUp`]: at([0, 40]), [`${type}_aimDown`]: at([0, -40]) };
}

/** Builds every weapon sampler on top of the base samplers (for locomotion bodies). */
export function makeWeaponSamplers(bases) {
  const T = (type, keys, opts) => timeline(type, keys, opts, bases);
  const longAim = { stance: 'longAim', R: 'grip', L: 'support', drawn: true, lean: 5, cheek: 1, blade: LONG_BLADE };
  return {
    ...pistolClips(T),
    ...aimOffsets(T, 'pistol', { stance: 'pistolAim', R: 'grip', L: 'support', drawn: true, lean: 4 }),
    ...longGunClips(T, 'rifle'),
    ...aimOffsets(T, 'rifle', longAim),
    ...longGunClips(T, 'smg'),
    ...aimOffsets(T, 'smg', longAim),
  };
}

export { TAU };
