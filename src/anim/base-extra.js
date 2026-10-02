import * as THREE from 'three';
import { createPose, Pose } from './pose.js';
import { SIDES, ease, window01, base, plantLegs, armDirs } from './clip-kit.js';
import { gripWith } from './arm-ik.js';
import { worldPose } from './fk.js';

/** Knockback's hit envelope on its last frame; `recover` starts from exactly this. */
const KNOCKBACK_END_HIT = 0.45;

/** Per-bone slerp between two poses (hips offset lerps). */
export function blendPoses(a, b, t) {
  const p = createPose();
  for (const name of new Set([...Object.keys(a.bones), ...Object.keys(b.bones)])) {
    const qa = a.bones[name] ?? new THREE.Quaternion();
    const qb = b.bones[name] ?? new THREE.Quaternion();
    p.bones[name] = qa.clone().slerp(qb, t);
  }
  p.hips.copy(a.hips).lerp(b.hips, t);
  return p;
}

/** Puts a hand at a point on the body (world, character space) with a palm direction, via arm IK. */
function handTo(L, p, side, grip, fingers, palm, pole) {
  gripWith(L, p, side, grip, fingers, palm, pole);
}

/**
 * Locomotion transitions, steps, reactions and social gestures that complete the base set.
 * `bases` are the existing samplers (idle, walk, turn ...), used to blend in and out of loops.
 */
export function makeExtraSamplers(bases) {
  const at = (name, L, t) => bases[name].sample(L, t % bases[name].duration, bases[name].duration);
  const k = (L) => L.measures.height / 1.78;
  return {
    /** Idle → walk: the gait ramps in over 0.6 s while the cycle advances (feet stay on the walk path). */
    startWalk: {
      duration: 1.0,
      loop: false,
      meta: () => ({ rootVelocityRamp: [0, 1], then: 'walk' }),
      sample: (L, t) => blendPoses(at('idle', L, 0), at('walk', L, t), ease(window01(t, 0, 0.6))),
    },
    /** Walk → idle: the last step plants and the body settles. */
    stopWalk: {
      duration: 0.9,
      loop: false,
      meta: () => ({ rootVelocityRamp: [1, 0], then: 'idle' }),
      sample: (L, t) => blendPoses(at('walk', L, t), at('idle', L, 0), ease(window01(t, 0.15, 0.75))),
    },
    startRun: {
      duration: 0.7,
      loop: false,
      meta: () => ({ rootVelocityRamp: [0, 1], then: 'run' }),
      sample: (L, t) => blendPoses(at('idle', L, 0), at('run', L, t), ease(window01(t, 0, 0.45))),
    },
    stopRun: {
      duration: 0.8,
      loop: false,
      meta: () => ({ rootVelocityRamp: [1, 0], then: 'idle' }),
      sample: (L, t) => {
        const p = blendPoses(at('run', L, t), at('idle', L, 0), ease(window01(t, 0.1, 0.65)));
        const brake = Math.sin(Math.PI * window01(t, 0.05, 0.6));
        Pose.spineFlex(p, 'Spine', -brake * 8);
        return p;
      },
    },
    /** 180° pivot in three quick steps (root yaw is part of the clip; the controller rotates after). */
    turnSharp: {
      duration: 0.75,
      loop: false,
      meta: () => ({ rootYawDelta: 180 }),
      sample: (L, t, dur) => {
        const u = t / dur;
        const p = base(L, { armDown: 18, elbow: 22 });
        SIDES.forEach((side, i) => {
          const lift = Math.sin(Math.PI * window01(u, 0.08 + i * 0.3, 0.42 + i * 0.3));
          Pose.kneeFlex(p, side, 8 + lift * 45);
          Pose.hipFlex(p, side, lift * 25);
          Pose.ankleFlex(p, side, -lift * 12);
          Pose.armFlex(p, side, (i ? -1 : 1) * 15 * Math.sin(Math.PI * u));
        });
        Pose.spineTwist(p, 'Spine2', -20 * Math.sin(Math.PI * window01(u, 0, 0.5)));
        Pose.headTurn(p, 35 * Math.sin(Math.PI * window01(u, 0, 0.45)));
        Pose.rootYaw(p, 180 * ease(window01(u, 0.05, 0.85)));
        p.hips.set(0, -0.03 * k(L) * Math.sin(Math.PI * u), 0);
        return p;
      },
    },
    /** Step up onto a 20 cm ledge, leading with the left foot (root ends 35 cm forward, 20 cm up). */
    stepUp: {
      duration: 1.0,
      loop: false,
      meta: (L) => ({ rootDelta: [0, 0.2 * k(L), 0.35 * k(L)] }),
      events: [{ name: 'footstep', side: 'Left', time: 0.35 }, { name: 'footstep', side: 'Right', time: 0.85 }],
      sample: (L, t) => {
        const kk = k(L);
        const h = 0.2 * kk;
        const d = 0.35 * kk;
        const lead = ease(window01(t, 0.05, 0.35));
        const body = ease(window01(t, 0.3, 0.75));
        const trail = ease(window01(t, 0.55, 0.85));
        const arc = (u) => Math.sin(Math.PI * u) * 0.06 * kk;
        const p = base(L, { armDown: 20, elbow: 15 });
        SIDES.forEach((side, i) => Pose.armFlex(p, side, (i ? 1 : -1) * 18 * Math.sin(Math.PI * body)));
        Pose.spineFlex(p, 'Spine', 10 * Math.sin(Math.PI * body));
        const ankles = {
          Left: L.world.LeftFoot.clone().add(new THREE.Vector3(0, h * lead + arc(lead) * (1 - lead), d * lead)),
          Right: L.world.RightFoot.clone().add(new THREE.Vector3(0, h * trail + arc(trail), d * trail)),
        };
        plantLegs(L, p, { hips: new THREE.Vector3(0, h * body - 0.03 * kk * Math.sin(Math.PI * body), d * body), ankles });
        return p;
      },
    },
    /** Step down off a 20 cm ledge (root ends 35 cm forward, 20 cm down). */
    stepDown: {
      duration: 0.9,
      loop: false,
      meta: (L) => ({ rootDelta: [0, -0.2 * k(L), 0.35 * k(L)] }),
      events: [{ name: 'footstep', side: 'Left', time: 0.4 }, { name: 'impact', time: 0.4 }, { name: 'footstep', side: 'Right', time: 0.8 }],
      sample: (L, t) => {
        const kk = k(L);
        const h = -0.2 * kk;
        const d = 0.35 * kk;
        const lead = ease(window01(t, 0.05, 0.4));
        const body = ease(window01(t, 0.15, 0.65));
        const trail = ease(window01(t, 0.5, 0.8));
        const lift = (u) => Math.sin(Math.PI * u) * 0.05 * kk;
        const absorb = Math.sin(Math.PI * window01(t, 0.35, 0.7)) * 0.05 * kk;
        const p = base(L, { armDown: 15, elbow: 18 });
        SIDES.forEach((side) => Pose.armAbduct(p, side, 8 * Math.sin(Math.PI * body)));
        const ankles = {
          Left: L.world.LeftFoot.clone().add(new THREE.Vector3(0, h * lead + lift(lead), d * lead)),
          Right: L.world.RightFoot.clone().add(new THREE.Vector3(0, h * trail + lift(trail), d * trail)),
        };
        plantLegs(L, p, { hips: new THREE.Vector3(0, h * body - absorb, d * body), ankles });
        return p;
      },
    },
    /** Big hit from the front: thrown back two steps, arms out for balance. Hold the last frame, then `recover`. */
    knockback: {
      duration: 0.9,
      loop: false,
      meta: () => ({ then: 'recover' }),
      events: [{ name: 'hit', time: 0 }, { name: 'footstep', side: 'Right', time: 0.35 }, { name: 'footstep', side: 'Left', time: 0.7 }],
      sample: (L, t) => {
        const kk = k(L);
        const hit = t < 0.08 ? t / 0.08 : 1 - (1 - KNOCKBACK_END_HIT) * ease(window01(t, 0.08, 0.9));
        const travel = ease(window01(t, 0, 0.8)) * 0.55 * kk;
        const r = ease(window01(t, 0.05, 0.4));
        const l = ease(window01(t, 0.4, 0.75));
        const p = base(L, { armDown: 20 - hit * 55, elbow: 20 + hit * 25 });
        SIDES.forEach((side) => Pose.armFlex(p, side, hit * 35));
        Pose.spineFlex(p, 'Spine1', -hit * 18);
        Pose.spineFlex(p, 'Spine2', -hit * 10);
        Pose.headNod(p, -hit * 22);
        const ankles = {
          Right: L.world.RightFoot.clone().add(new THREE.Vector3(0, Math.sin(Math.PI * r) * 0.06 * kk, -0.32 * kk * r)),
          Left: L.world.LeftFoot.clone().add(new THREE.Vector3(0, Math.sin(Math.PI * l) * 0.05 * kk, -0.55 * kk * l)),
        };
        plantLegs(L, p, { hips: new THREE.Vector3(0, -0.07 * kk * hit, -travel), ankles });
        return p;
      },
    },
    /**
     * From the last frame of `knockback` back to a neutral stance: the left foot steps up beside the
     * right and the hips come over the feet. Root motion for the chain lands here (35 cm back in all).
     */
    recover: {
      duration: 1.0,
      loop: false,
      meta: (L) => ({ rootDelta: [0, 0, -0.32 * k(L)], then: 'idle' }),
      events: [{ name: 'footstep', side: 'Left', time: 0.55 }],
      sample: (L, t) => {
        const kk = k(L);
        const settle = ease(window01(t, 0, 0.9));
        const step = ease(window01(t, 0.25, 0.6));
        const hit = KNOCKBACK_END_HIT * (1 - settle);
        const p = base(L, { armDown: 20 - hit * 55, elbow: 20 + hit * 25 - 5 * settle });
        SIDES.forEach((side) => Pose.armFlex(p, side, hit * 35));
        Pose.spineFlex(p, 'Spine1', -hit * 18 + 4 * Math.sin(Math.PI * settle));
        Pose.spineFlex(p, 'Spine2', -hit * 10);
        Pose.headNod(p, -hit * 22);
        const ankles = {
          Right: L.world.RightFoot.clone().add(new THREE.Vector3(0, 0, -0.32 * kk)),
          Left: L.world.LeftFoot.clone().add(new THREE.Vector3(0, Math.sin(Math.PI * step) * 0.05 * kk, -0.55 * kk + 0.23 * kk * step)),
        };
        plantLegs(L, p, { hips: new THREE.Vector3(0, -0.07 * kk * hit, -0.55 * kk + 0.23 * kk * settle), ankles });
        // The last quarter settles into idle's exact stance (shifted to where the feet now are).
        const idle = at('idle', L, 0);
        const out = blendPoses(p, idle, ease(window01(t, 0.75, 1)));
        out.hips.set(idle.hips.x * settle, p.hips.y + (idle.hips.y - p.hips.y) * ease(window01(t, 0.75, 1)), p.hips.z);
        return out;
      },
    },
    push: pushPull(1),
    pull: pushPull(-1),
    laugh: {
      duration: 2.4,
      loop: false,
      sample: (L, t, dur) => {
        const env = Math.sin(Math.PI * window01(t / dur, 0.02, 0.98));
        const bounce = Math.abs(Math.sin(t * 15)) * env;
        const p = base(L, { skip: ['Left'] });
        const fk = worldPose(L, p);
        const belly = fk.pos.Spine.clone().add(new THREE.Vector3(0.03 * k(L), 0.02 * k(L), 0.13 * k(L)));
        const rest = blendPoses(p, p, 0);
        handTo(L, p, 'Left', belly, new THREE.Vector3(-1, -0.3, 0.1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, -1, -0.3));
        const held = blendPoses(rest, p, ease(window01(t / dur, 0, 0.2)) * (1 - ease(window01(t / dur, 0.8, 1))));
        Object.assign(p.bones, held.bones);
        Pose.spineFlex(held, 'Spine1', -6 * env + bounce * 3);
        Pose.headNod(held, -14 * env + bounce * 5);
        SIDES.forEach((side) => Pose.shoulderShrug(held, side, bounce * 5));
        Pose.jawOpen(held, 4 + bounce * 12);
        plantLegs(L, held, { hips: new THREE.Vector3(0, -0.01 - bounce * 0.008, 0) });
        return held;
      },
    },
    angry: {
      duration: 2.0,
      loop: false,
      sample: (L, t, dur) => {
        const u = t / dur;
        const env = ease(window01(u, 0, 0.2)) * (1 - ease(window01(u, 0.8, 1)));
        const jab = Math.sin(Math.PI * window01(u, 0.3, 0.5)) + Math.sin(Math.PI * window01(u, 0.55, 0.72)) * 0.8;
        const dirs = armDirs(L);
        const p = base(L, { armDown: 20 - env * 10, elbow: 15 + env * 75, skip: ['Right'] });
        Pose.elbowFlex(p, 'Right', dirs.Right, 25 + env * 50 - jab * 50);
        Pose.armAbduct(p, 'Right', -15);
        Pose.armFlex(p, 'Right', 10 + env * 45 + jab * 25);
        Pose.spineFlex(p, 'Spine1', env * 6 + jab * 4);
        Pose.headNod(p, -env * 6 + jab * 5);
        Pose.headTurn(p, Math.sin(t * 8) * 3 * env);
        SIDES.forEach((side) => Pose.shoulderShrug(p, side, env * 4));
        Pose.jawOpen(p, jab * 10);
        plantLegs(L, p, { hips: new THREE.Vector3(0, -0.01, 0.02 * env) });
        return p;
      },
    },
    confused: {
      duration: 2.4,
      loop: false,
      sample: (L, t, dur) => {
        const u = t / dur;
        const env = ease(window01(u, 0, 0.25)) * (1 - ease(window01(u, 0.78, 1)));
        const scratch = Math.sin(t * 22) * 0.012 * k(L) * env;
        const p = base(L);
        Pose.headTilt(p, -12 * env);
        Pose.headNod(p, 4 * env);
        Pose.spineSide(p, 'Spine1', 3 * env);
        const rest = blendPoses(p, p, 0);
        const fk = worldPose(L, p);
        const head = fk.pos.Head.clone().add(new THREE.Vector3(-0.07 * k(L), 0.1 * k(L) + scratch, -0.02 * k(L)));
        handTo(L, p, 'Right', head, new THREE.Vector3(0.4, 0.6, -0.2), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0.2, 0.1));
        const out = blendPoses(rest, p, env);
        SIDES.forEach((side) => Pose.shoulderShrug(out, side, Math.sin(Math.PI * window01(u, 0.55, 0.8)) * 8));
        plantLegs(L, out, { hips: new THREE.Vector3(0.01, -0.008, 0) });
        return out;
      },
    },
  };
}

/** Push (+1) or pull (−1) a heavy object at chest height with a staggered stance. */
function pushPull(dir) {
  return {
    duration: 2.0,
    loop: true,
    sample: (L, t, dur) => {
      const kk = L.measures.height / 1.78;
      const effort = 0.5 + 0.5 * Math.sin((t / dur) * Math.PI * 2);
      const p = base(L);
      Pose.spineFlex(p, 'Spine', dir * (14 + effort * 4));
      Pose.spineFlex(p, 'Spine1', dir * 6);
      Pose.headNod(p, -dir * 10);
      const fk = worldPose(L, p);
      for (const side of SIDES) {
        const s = side === 'Left' ? 1 : -1;
        const grip = fk.pos.Spine2.clone().add(new THREE.Vector3(s * 0.2 * kk, -0.02 * kk, (0.42 + (dir > 0 ? 0.04 : -0.03) * effort) * kk));
        gripWith(L, p, side, grip, new THREE.Vector3(-s * 0.25, 0.4, 1).normalize().multiplyScalar(dir > 0 ? 1 : 1), dir > 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-s, 0, 0), new THREE.Vector3(s, -1, -0.5));
      }
      const lean = dir * (0.1 + effort * 0.02) * kk;
      const ankles = { Left: L.world.LeftFoot.clone().add(new THREE.Vector3(0, 0, 0.12 * kk * dir)), Right: L.world.RightFoot.clone().add(new THREE.Vector3(0, 0, -0.2 * kk * dir)) };
      plantLegs(L, p, { hips: new THREE.Vector3(0, -0.06 * kk, lean * 0.6), ankles });
      return p;
    },
  };
}
