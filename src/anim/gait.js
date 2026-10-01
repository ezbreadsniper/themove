import * as THREE from 'three';
import { createPose, Pose, rotate } from './pose.js';
import { legRig, solveLeg3D, rolledAnkle } from './ik.js';

const TAU = Math.PI * 2;
const SIDES = ['Left', 'Right'];
const DEG = Math.PI / 180;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Compass directions relative to the character's facing (N = forward, W = character's left = +X). */
export const DIRECTIONS = { N: 0, NE: -45, E: -90, SE: -135, S: 180, SW: 135, W: 90, NW: 45 };

/**
 * Gait parameters. Stance spans are the stance-foot travel (front reach F, back reach B) in metres
 * at 1.78 m; the stance foot moves back linearly at exactly root speed, so it never slides.
 */
export const GAITS = {
  walk: { cycle: 1.0, duty: 0.6, F: 0.25, B: 0.33, lift: 0.07, drop: 0.02, bob: 0.016, strike: 14, heelRise: 26, arm: 22, elbow: 14, lean: 4, width: 1 },
  run: { cycle: 0.7, duty: 0.37, F: 0.36, B: 0.46, lift: 0.17, drop: 0.08, bob: 0.03, strike: 8, heelRise: 32, arm: 34, elbow: 88, lean: 11, width: 1 },
};

/** Direction-dependent span scale: side steps and backpedals are shorter than forward steps. */
function spanScale(dir) {
  const fwd = Math.cos(dir);
  const side = Math.abs(Math.sin(dir));
  return fwd >= 0 ? 1 - side * 0.62 : 0.72 - side * 0.34;
}

/** Foot translation (body frame) and pitch for one leg at phase φ ∈ [0, 1). */
function footState(g, phase, span, moveDir) {
  const { duty } = g;
  const fwd = Math.cos(moveDir);
  const roll = Math.max(0, fwd);
  const F = g.F * span;
  const B = g.B * span;
  if (phase < duty) {
    const s = phase / duty;
    const along = F - (F + B) * s;
    let pitch = 0;
    if (s < 0.15) pitch = g.strike * roll * (1 - s / 0.15);
    if (s > 0.55) pitch = -g.heelRise * roll * smooth((s - 0.55) / 0.45);
    return { along, lift: 0, pitch, stance: true, s };
  }
  const u = (phase - duty) / (1 - duty);
  const along = -B + (F + B) * smooth(u);
  const peak = u < 0.4 ? Math.sin((u / 0.4) * Math.PI * 0.5) : Math.cos(((u - 0.4) / 0.6) * Math.PI * 0.5);
  const pitch = (-g.heelRise * (1 - smooth(clamp01(u / 0.5))) + g.strike * smooth(clamp01((u - 0.5) / 0.5))) * roll;
  return { along, lift: g.lift * peak, pitch, stance: false, s: u };
}

/**
 * Builds a sampler (layout, t, duration) → pose for a gait moving in `dirDeg` (body frame).
 * Root motion is in place; the clip reports its root velocity so a controller can translate.
 */
export function gaitSampler(kind, dirDeg) {
  const g = GAITS[kind];
  const dir = dirDeg * DEG;
  const move = new THREE.Vector3(Math.sin(dir), 0, Math.cos(dir));
  const sample = (L, t, duration) => {
    const k = L.measures.height / 1.78;
    const energy = L.measures.energy ?? 1;
    const span = spanScale(dir) * k * (0.9 + energy * 0.1);
    const phase = (((t / duration) % 1) + 1) % 1;
    const rigs = Object.fromEntries(SIDES.map((s) => [s, legRig(L, s)]));
    const restHips = L.world.Hips;
    const states = {};
    const targets = {};
    for (const [i, side] of SIDES.entries()) {
      const st = footState(g, (phase + i * 0.5) % 1, span, dir);
      const rig = rigs[side];
      const lateral = (side === 'Left' ? 1 : -1) * Math.abs(Math.sin(dir)) * (0.04 * k + g.F * span * Math.abs(Math.sin(dir)) * 0.9);
      const { offset, rot } = rolledAnkle(rig, st.pitch);
      targets[side] = rig.ankle.clone()
        .addScaledVector(move, st.along)
        .add(new THREE.Vector3(lateral, st.lift, 0))
        .add(offset);
      states[side] = { ...st, rot };
    }

    const yaw = -Math.sin(phase * TAU) * 6 * Math.cos(dir) * DEG;
    const lean = g.lean * Math.max(0, Math.cos(dir)) * DEG;
    const hipsRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), lean));
    const hipPos = (side, off) => rigs[side].hip.clone().sub(restHips).applyQuaternion(hipsRot).add(restHips).add(off);
    const bobPhase = kind === 'run' ? Math.cos(phase * TAU * 2) : -Math.cos(phase * TAU * 2);
    const offset = new THREE.Vector3(0, -g.drop * k + g.bob * k * bobPhase, 0);
    for (const side of SIDES) {
      const maxReach = (rigs[side].thigh + rigs[side].shin) * 0.985;
      const h = hipPos(side, new THREE.Vector3());
      const horiz = Math.hypot(targets[side].x - h.x, targets[side].z - h.z);
      const allowed = targets[side].y + Math.sqrt(Math.max(0, maxReach ** 2 - horiz ** 2)) - h.y;
      if (states[side].stance || kind === 'walk') offset.y = Math.min(offset.y, allowed);
    }

    const p = createPose();
    p.bones.Hips = hipsRot.clone();
    p.hips.copy(offset);
    const hipsInv = hipsRot.clone().invert();
    for (const side of SIDES) {
      const st = states[side];
      const pole = new THREE.Vector3(0, 0, 1).applyQuaternion(hipsRot);
      const sol = solveLeg3D(rigs[side], hipPos(side, offset), targets[side], st.rot, pole);
      p.bones[`${side}UpLeg`] = hipsInv.clone().multiply(sol.thigh);
      p.bones[`${side}Leg`] = sol.thigh.clone().invert().multiply(sol.shin);
      p.bones[`${side}Foot`] = sol.shin.clone().invert().multiply(sol.foot);
      if (st.pitch < 0) p.bones[`${side}ToeBase`] = sol.foot.clone().invert();
    }

    const armDirs = { Left: L.measures.armDir.clone(), Right: L.measures.armDir.clone().setX(-L.measures.armDir.x) };
    const fwd = Math.cos(dir);
    const side = Math.sin(dir);
    for (const [i, s] of SIDES.entries()) {
      const legPhase = (phase + i * 0.5) % 1;
      const c = Math.cos(legPhase * TAU);
      const swing = (c > 0 ? c * 1.25 : c * 0.65) * g.arm * energy;
      Pose.elbowFlex(p, s, armDirs[s], g.elbow + Math.max(0, -swing) * (kind === 'run' ? 0.15 : 0.4));
      Pose.armAbduct(p, s, -21 + (kind === 'run' ? 6 : 0));
      Pose.armFlex(p, s, -swing * (0.35 + 0.65 * Math.abs(fwd)) - g.lean * 0.6);
    }
    rotate(p, 'Spine', new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw * 0.6));
    rotate(p, 'Spine1', new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw * 0.9));
    Pose.spineFlex(p, 'Spine', g.lean * 0.25 * fwd);
    Pose.spineSide(p, 'Spine1', -side * 4);
    Pose.headNod(p, 2 - g.lean * 0.9 * Math.max(0, fwd));
    rotate(p, 'Head', new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yaw * 0.5));
    const posture = L.measures.posture ?? 0;
    if (posture > 0) {
      Pose.spineFlex(p, 'Spine2', posture * 8);
      Pose.headNod(p, -posture * 10);
    }
    return p;
  };
  return {
    duration: g.cycle,
    loop: true,
    sample,
    meta: (L) => {
      const k = L.measures.height / 1.78;
      const span = spanScale(dir) * k * (0.9 + (L.measures.energy ?? 1) * 0.1);
      const speed = ((g.F + g.B) * span) / (g.duty * g.cycle);
      return {
        rootVelocity: move.clone().multiplyScalar(speed).toArray(),
        speed,
        events: SIDES.map((s, i) => ({ name: 'footstep', side: s, time: ((1 - i * 0.5) % 1) * g.cycle })),
        syncGroup: kind,
      };
    },
  };
}
