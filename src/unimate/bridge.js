import * as THREE from 'three';
import { CORE_JOINTS as JOINTS, JOINT_INDEX } from '../rig/skeleton.js';

/**
 * UniMate ↔ our rig.
 *
 * UniMate's humanoid ("mixamo" object type) works on the 22-joint Mixamo core with a T-pose rest
 * and T-pose-relative rotations. tools/unimate_export_motion.py decodes a generated .npy into:
 *
 *   { format: 'unimate-global-v1', fps, joints: ['Hips', ...22], parents: [-1, 0, ...],
 *     restPositions: [[x,y,z] × 22]  (source T-pose, world),
 *     globalRotations: [frame][joint][x,y,z,w]  (world rotation relative to that T-pose),
 *     rootPositions: [frame][x,y,z] }
 *
 * Our bones rest at identity in an A-pose, so for each joint we find the rotation A that turns our
 * rest bone direction into the source rest direction, then G_ours = G_src · A and
 * local = G_ours(parent)⁻¹ · G_ours.
 */

const PRIMARY_CHILD = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};

const PARENT = Object.fromEntries(JOINTS.map(([name, parent]) => [name, parent]));

export function validateUnimateMotion(motion) {
  const problems = [];
  if (!motion || motion.format !== 'unimate-global-v1') problems.push('format must be unimate-global-v1');
  const names = motion?.joints ?? [];
  for (const [name] of JOINTS) if (!names.includes(name)) problems.push(`missing joint ${name}`);
  const frames = motion?.globalRotations?.length ?? 0;
  if (!frames) problems.push('no frames');
  if (motion?.rootPositions?.length !== frames) problems.push('rootPositions length differs from globalRotations');
  if (!(motion?.fps > 0 && motion.fps <= 240)) problems.push('fps must be in (0, 240]');
  return problems;
}

/** Rotations that align our rest bone directions with the source rest bone directions. */
function alignment(layout, restPositions, index) {
  const out = {};
  for (const [name] of JOINTS) {
    const child = PRIMARY_CHILD[name];
    if (!child) continue;
    const ours = layout.world[child].clone().sub(layout.world[name]).normalize();
    const src = new THREE.Vector3(...restPositions[index[child]]).sub(new THREE.Vector3(...restPositions[index[name]])).normalize();
    out[name] = new THREE.Quaternion().setFromUnitVectors(ours, src);
  }
  for (const [name] of JOINTS) {
    if (!out[name]) out[name] = out[PARENT[name]].clone();
  }
  return out;
}

/** Converts decoded UniMate motion into an AnimationClip for a character built by buildCharacter. */
export function clipFromUnimateMotion(motion, layout, { name = 'unimate', prefix = '' } = {}) {
  const problems = validateUnimateMotion(motion);
  if (problems.length) throw new Error(`Invalid UniMate motion: ${problems.join('; ')}`);
  const index = Object.fromEntries(motion.joints.map((n, i) => [n, i]));
  const align = alignment(layout, motion.restPositions, index);
  const frames = motion.globalRotations.length;
  const times = new Float32Array(frames);
  const values = Object.fromEntries(JOINTS.map(([j]) => [j, new Float32Array(frames * 4)]));
  const hipValues = new Float32Array(frames * 3);
  const srcHipHeight = motion.restPositions[index.Hips][1];
  const scale = layout.world.Hips.y / srcHipHeight;
  const root0 = motion.rootPositions[0];
  const global = {};
  const local = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    times[f] = f / motion.fps;
    for (const [j] of JOINTS) {
      const src = new THREE.Quaternion(...motion.globalRotations[f][index[j]]);
      global[j] = src.multiply(align[j]);
      const parent = PARENT[j];
      local.copy(parent ? global[parent].clone().invert().multiply(global[j]) : global[j]);
      local.toArray(values[j], f * 4);
    }
    const root = motion.rootPositions[f];
    hipValues[f * 3] = (root[0] - root0[0]) * scale;
    hipValues[f * 3 + 1] = root[1] * scale;
    hipValues[f * 3 + 2] = (root[2] - root0[2]) * scale;
  }
  const tracks = JOINTS.map(([j]) => new THREE.QuaternionKeyframeTrack(`${prefix}${j}.quaternion`, times, values[j]));
  tracks.push(new THREE.VectorKeyframeTrack(`${prefix}Hips.position`, times, hipValues));
  return new THREE.AnimationClip(name, frames > 1 ? times[frames - 1] : 0, tracks);
}

/**
 * The reverse direction: expresses one of our clips as UniMate global motion on a Mixamo-style
 * T-pose. Used to produce test fixtures and to feed our procedural motion to UniMate's
 * in-betweening / editing modes as ground truth.
 */
export function unimateMotionFromClip(clip, layout, tposeRest, { fps = 30 } = {}) {
  const index = Object.fromEntries(JOINTS.map(([n], i) => [n, i]));
  const align = alignment(layout, tposeRest, index);
  const tracks = Object.fromEntries(clip.tracks.map((t) => [t.name.split('.')[0] + (t.name.endsWith('position') ? '#pos' : ''), t]));
  const frames = Math.max(1, Math.round(clip.duration * fps) + 1);
  const globalRotations = [];
  const rootPositions = [];
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    const global = {};
    const row = [];
    for (const [j, parent] of JOINTS) {
      const track = tracks[j];
      const q = track ? sampleQuaternion(track, t) : new THREE.Quaternion();
      global[j] = parent ? global[parent].clone().multiply(q) : q;
      row.push(global[j].clone().multiply(align[j].clone().invert()).toArray());
    }
    globalRotations.push(row);
    const hp = tracks['Hips#pos'];
    const p = hp ? sampleVector(hp, t) : layout.world.Hips.clone();
    const s = tposeRest[index.Hips][1] / layout.world.Hips.y;
    rootPositions.push([p.x * s, p.y * s, p.z * s]);
  }
  return {
    format: 'unimate-global-v1',
    fps,
    joints: JOINTS.map(([n]) => n),
    parents: JOINTS.map(([, p]) => (p ? JOINT_INDEX[p] : -1)),
    restPositions: tposeRest,
    globalRotations,
    rootPositions,
  };
}

function sampleQuaternion(track, t) {
  const interp = track.createInterpolant();
  return new THREE.Quaternion().fromArray(interp.evaluate(t));
}

function sampleVector(track, t) {
  const interp = track.createInterpolant();
  return new THREE.Vector3().fromArray(interp.evaluate(t));
}

/** A Mixamo-proportioned T-pose (world positions, metres) for fixtures and tests. */
export function mixamoTPose(height = 1.8) {
  const k = height / 1.8;
  const p = {
    Hips: [0, 1.0, 0], Spine: [0, 1.1, 0], Spine1: [0, 1.22, 0], Spine2: [0, 1.36, 0], Neck: [0, 1.5, 0], Head: [0, 1.58, 0.01],
    LeftShoulder: [0.06, 1.44, 0], LeftArm: [0.18, 1.44, 0], LeftForeArm: [0.46, 1.44, 0], LeftHand: [0.72, 1.44, 0],
    RightShoulder: [-0.06, 1.44, 0], RightArm: [-0.18, 1.44, 0], RightForeArm: [-0.46, 1.44, 0], RightHand: [-0.72, 1.44, 0],
    LeftUpLeg: [0.09, 0.95, 0], LeftLeg: [0.09, 0.52, 0], LeftFoot: [0.09, 0.09, 0], LeftToeBase: [0.09, 0.02, 0.13],
    RightUpLeg: [-0.09, 0.95, 0], RightLeg: [-0.09, 0.52, 0], RightFoot: [-0.09, 0.09, 0], RightToeBase: [-0.09, 0.02, 0.13],
  };
  return JOINTS.map(([n]) => p[n].map((v) => v * k));
}
