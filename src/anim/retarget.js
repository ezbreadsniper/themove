import * as THREE from 'three';
import { CORE_JOINTS, JOINT_INDEX } from '../rig/skeleton.js';
import { clipFromUnimateMotion } from '../unimate/bridge.js';
import { worldPose } from './fk.js';
import { createPose, relaxHands } from './pose.js';
import { HAND_JOINTS } from '../rig/skeleton.js';

/**
 * Retargeting of external motion (licensed Mixamo / pack / mocap clips, UniMate output) onto the
 * canonical rig. Every source goes through the same steps:
 *   1. bone names → canonical joints (RETARGET_PROFILES)
 *   2. sample the source clip at the canonical frame rate on its own skeleton
 *   3. express every joint as a world rotation relative to the source's bind pose
 *   4. align source rest bone directions with ours (T-pose / A-pose differences) and rebuild local
 *      rotations on our rest (clipFromUnimateMotion: the 'canonical global motion' interchange)
 *   5. clean-up: hip height scaled to the character, root drift removed for in-place clips (the
 *      velocity is kept in userData), feet kept above the ground, provenance recorded
 */
export const CANONICAL = { fps: 30, up: 'Y', forward: '+Z', unit: 'metre', rootMotion: 'in-place', prefix: 'mixamorig:' };

const MIXAMO = Object.fromEntries(CORE_JOINTS.map(([n]) => [n, n]));

/** Source naming schemes → canonical joints. Names are matched after stripping a namespace prefix. */
export const RETARGET_PROFILES = {
  mixamo: { strip: /^mixamorig\d*[:_]?/i, map: MIXAMO },
  unimate: { strip: /^/, map: MIXAMO },
  /** Common game-engine humanoid naming (Unreal-style mannequin). */
  mannequin: {
    strip: /^/,
    map: {
      pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
      clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
      clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
      thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
      thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
    },
  },
};

export function canonicalJoint(name, profile = 'mixamo') {
  const p = RETARGET_PROFILES[profile];
  return p.map[name.replace(p.strip, '')] ?? null;
}

/** Maps a source skeleton's bones to canonical joints; reports what is missing. */
export function mapSkeleton(bones, profile = 'mixamo') {
  const byJoint = {};
  for (const bone of bones) {
    const joint = canonicalJoint(bone.name, profile);
    if (joint && !byJoint[joint]) byJoint[joint] = bone;
  }
  const missing = CORE_JOINTS.map(([n]) => n).filter((n) => !byJoint[n]);
  return { byJoint, missing };
}

/**
 * Track names like 'mixamorig:Hips.quaternion' cannot bind ('.' ':' '/' '[' ']' are reserved in
 * property paths), and loaders sanitise them differently; tracks are matched to bones by exact or
 * sanitised name and rebound by uuid.
 */
function bindByUuid(clip, bones) {
  const sanitize = THREE.PropertyBinding.sanitizeNodeName;
  const byName = new Map();
  for (const b of bones) {
    byName.set(b.name, b);
    byName.set(sanitize(b.name), b);
  }
  const tracks = [];
  for (const t of clip.tracks) {
    const cut = t.name.lastIndexOf('.');
    const bone = byName.get(t.name.slice(0, cut)) ?? byName.get(sanitize(t.name.slice(0, cut)));
    if (!bone) continue;
    const copy = t.clone();
    copy.name = `${bone.uuid}${t.name.slice(cut)}`;
    tracks.push(copy);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Samples a source clip on its skeleton into canonical global motion ('unimate-global-v1').
 * root: the Object3D the clip animates (the skeleton's root or the loaded scene). The source's bind
 * pose is the skeleton's current pose when this is called.
 */
export function sourceToGlobalMotion(root, bones, clip, { profile = 'mixamo', fps = CANONICAL.fps, metresPerUnit = 1 } = {}) {
  const { byJoint, missing } = mapSkeleton(bones, profile);
  if (missing.length) throw new Error(`Source skeleton lacks ${missing.join(', ')} (profile ${profile})`);
  root.updateMatrixWorld(true);
  const order = CORE_JOINTS.map(([n]) => n);
  const restWorld = order.map((j) => byJoint[j].getWorldQuaternion(new THREE.Quaternion()));
  const restPositions = order.map((j) => byJoint[j].getWorldPosition(new THREE.Vector3()).multiplyScalar(metresPerUnit).toArray());
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(bindByUuid(clip, bones));
  // Play once and clamp: a looping action wraps t = duration back to frame 0.
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const frames = Math.max(1, Math.round(clip.duration * fps) + 1);
  const globalRotations = [];
  const rootPositions = [];
  const q = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    mixer.setTime(Math.min(clip.duration, f / fps));
    root.updateMatrixWorld(true);
    globalRotations.push(order.map((j, i) => byJoint[j].getWorldQuaternion(q).multiply(restWorld[i].clone().invert()).toArray()));
    rootPositions.push(byJoint.Hips.getWorldPosition(new THREE.Vector3()).multiplyScalar(metresPerUnit).toArray());
  }
  action.stop();
  mixer.uncacheRoot(root);
  return {
    format: 'unimate-global-v1',
    fps,
    joints: order,
    parents: CORE_JOINTS.map(([, p]) => (p ? JOINT_INDEX[p] : -1)),
    restPositions,
    globalRotations,
    rootPositions,
  };
}

/**
 * Clean-up on a retargeted clip: in-place root (horizontal drift → userData.rootVelocity), and a
 * ground check that lifts the hips when a foot would sink below the floor.
 */
export function cleanRetargetedClip(clip, layout, { inPlace = true } = {}) {
  const hips = clip.tracks.find((t) => t.name.endsWith('Hips.position'));
  const n = hips.times.length;
  const first = new THREE.Vector3().fromArray(hips.values, 0);
  const last = new THREE.Vector3().fromArray(hips.values, (n - 1) * 3);
  const travel = last.clone().sub(first).setY(0);
  const duration = clip.duration || 1;
  if (inPlace) {
    for (let f = 0; f < n; f++) {
      const t = hips.times[f] / duration;
      hips.values[f * 3] -= first.x + travel.x * t;
      hips.values[f * 3 + 2] -= first.z + travel.z * t;
    }
  }
  const quats = clip.tracks.filter((t) => t.name.endsWith('.quaternion'));
  const floor = layout.measures.ankleY * 0.85;
  let lifted = 0;
  for (let f = 0; f < n; f++) {
    const pose = createPose();
    for (const tr of quats) pose.bones[tr.name.split('.')[0].replace(/^.*:/, '')] = new THREE.Quaternion().fromArray(tr.values, f * 4);
    pose.hips.fromArray(hips.values, f * 3).sub(layout.world.Hips);
    const fk = worldPose(layout, pose);
    const lowest = Math.min(fk.pos.LeftFoot.y, fk.pos.RightFoot.y);
    if (lowest < floor) {
      hips.values[f * 3 + 1] += floor - lowest;
      lifted = Math.max(lifted, floor - lowest);
    }
  }
  clip.userData = { ...clip.userData, rootVelocity: travel.clone().divideScalar(duration).toArray(), inPlace, groundLift: lifted };
  return clip;
}

/**
 * Full pipeline for one source clip. source = { root, bones, clip, profile, metresPerUnit,
 * license: { source, author, licence, url } } — a licence record is required: unlicensed motion is
 * refused.
 */
export function retargetClip(source, layout, { name, prefix = '', inPlace = true } = {}) {
  if (!source.license?.licence) throw new Error('Refusing to import motion without a licence record');
  const motion = sourceToGlobalMotion(source.root, source.bones, source.clip, { profile: source.profile, metresPerUnit: source.metresPerUnit ?? 1 });
  const clip = clipFromUnimateMotion(motion, layout, { name: name ?? `${source.license.source}_${source.clip.name}`, prefix });
  cleanRetargetedClip(clip, layout, { inPlace });
  // Finger chains are not retargeted yet: imported clips carry a relaxed hand so nothing stays curled.
  const hands = relaxHands(createPose(), layout);
  const times = [0, clip.duration];
  for (const [joint] of HAND_JOINTS) clip.tracks.push(new THREE.QuaternionKeyframeTrack(`${prefix}${joint}.quaternion`, times, [...hands.bones[joint].toArray(), ...hands.bones[joint].toArray()]));
  clip.userData = { ...clip.userData, loop: source.loop ?? false, provenance: { ...source.license, profile: source.profile, retargetedAt: CANONICAL } };
  return clip;
}
