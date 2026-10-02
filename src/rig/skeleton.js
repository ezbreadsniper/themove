import * as THREE from 'three';

export const RIG_PREFIX = 'mixamorig:';

/** Mixamo 22-joint humanoid core, in bind order. Identical to UniMate's MIXAMO_CORE_JOINTS. */
export const CORE_JOINTS = [
  ['Hips', null],
  ['Spine', 'Hips'],
  ['Spine1', 'Spine'],
  ['Spine2', 'Spine1'],
  ['Neck', 'Spine2'],
  ['Head', 'Neck'],
  ['LeftShoulder', 'Spine2'],
  ['LeftArm', 'LeftShoulder'],
  ['LeftForeArm', 'LeftArm'],
  ['LeftHand', 'LeftForeArm'],
  ['RightShoulder', 'Spine2'],
  ['RightArm', 'RightShoulder'],
  ['RightForeArm', 'RightArm'],
  ['RightHand', 'RightForeArm'],
  ['LeftUpLeg', 'Hips'],
  ['LeftLeg', 'LeftUpLeg'],
  ['LeftFoot', 'LeftLeg'],
  ['LeftToeBase', 'LeftFoot'],
  ['RightUpLeg', 'Hips'],
  ['RightLeg', 'RightUpLeg'],
  ['RightFoot', 'RightLeg'],
  ['RightToeBase', 'RightFoot'],
];

/**
 * Hand joints (per side): a two-segment thumb (Mixamo names) and a two-segment four-finger block. The
 * PS2 mitten hand has no separate fingers, so the block stands in for Mixamo's Index..Pinky chains.
 */
export const HAND_JOINTS = ['Left', 'Right'].flatMap((side) => [
  [`${side}HandThumb1`, `${side}Hand`],
  [`${side}HandThumb2`, `${side}HandThumb1`],
  [`${side}HandFingers1`, `${side}Hand`],
  [`${side}HandFingers2`, `${side}HandFingers1`],
]);

/** Full game rig: the UniMate core, a jaw for talking, then the hands (extras always come after the core). */
export const JOINTS = [...CORE_JOINTS, ['Jaw', 'Head'], ...HAND_JOINTS];

export const JOINT_INDEX = Object.fromEntries(JOINTS.map(([name], i) => [name, i]));

/** Bind pose arm angle, measured from straight down. Low enough that relaxed poses barely deform the shoulder. */
export const A_POSE_DEGREES = 32;

export const DEFAULT_PROPORTIONS = {
  height: 1.78,
  build: 0.5,
  shoulders: 1,
  hips: 1,
  legLength: 1,
  armLength: 1,
  headSize: 1,
  neckLength: 1,
  age: 28,
  muscle: 0.4,
  feminine: 0,
  bust: 0,
  waist: 1,
  butt: 0.3,
  thighs: 1,
};

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Rest frame of a hand: fingers along the rest arm, palm facing the body side (where the fingers curl),
 * forward is the thumb side, thumb points along fingers, forward and palm (as the mesh is built).
 */
export function handFrame(armDir, s) {
  const fingers = armDir.clone().setX(armDir.x * s).normalize();
  const side = fingers.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
  const palm = side.clone().multiplyScalar(s);
  const forward = side.clone().cross(fingers).normalize();
  const thumb = fingers.clone().multiplyScalar(0.8).addScaledVector(forward, 0.4).addScaledVector(palm, 0.4).normalize();
  return { fingers, palm, forward, thumb };
}

/** 0..1 weights for how far past young adulthood (older) or before it (young) an age is. */
export function ageFactors(age = 28) {
  return { older: smoothstep(38, 75, age), young: smoothstep(24, 14, age) };
}

/**
 * Computes world-space joint positions for the bind pose (A-pose, facing +Z, Y up, feet at y = 0).
 * Left is +X. Also returns derived body measurements that part builders need.
 */
export function computeJointLayout(input = {}) {
  const p = { ...DEFAULT_PROPORTIONS, ...input };
  const H = p.height;
  const leg = p.legLength;
  const bulk = 0.8 + p.build * 0.5;
  const belly = Math.max(0, Math.min(1, (p.build - 0.45) / 0.55)) ** 1.3;
  const k = H / 1.78;
  const { older, young } = ageFactors(p.age);
  const mus = p.muscle * (1 - young * 0.5) * (1 - older * 0.3);

  const hipsY = H * (0.53 + (leg - 1) * 0.08);
  const ankleY = H * 0.048;
  const kneeY = ankleY + (hipsY - H * 0.035 - ankleY) * 0.52;
  const hipJointY = hipsY - H * 0.035;
  const hipHalf = H * 0.06 * p.hips * (0.9 + p.build * 0.2) * (1 + (p.feminine ?? 0) * 0.06);

  const torsoTop = hipsY + (H * 0.83 - hipsY) * 1;
  const spine = (t) => hipsY + (torsoTop - hipsY) * t;
  const neckY = H * 0.835;
  const headY = neckY + H * 0.042 * p.neckLength;
  const fem = p.feminine;
  const shoulderHalf = (1 - fem * 0.1) * H * 0.106 * p.shoulders * (0.91 + p.build * 0.18) * (0.97 + mus * 0.06) * (1 - young * 0.06);
  const shoulderY = H * 0.8;

  const upperArm = H * 0.17 * p.armLength;
  const foreArm = H * 0.152 * p.armLength;
  const a = THREE.MathUtils.degToRad(A_POSE_DEGREES);
  const armDir = new THREE.Vector3(Math.sin(a), -Math.cos(a), 0);

  const world = {};
  world.Hips = new THREE.Vector3(0, hipsY, 0);
  world.Spine = new THREE.Vector3(0, spine(0.22), -0.005);
  world.Spine1 = new THREE.Vector3(0, spine(0.47), -0.01);
  world.Spine2 = new THREE.Vector3(0, spine(0.72), -0.01);
  world.Neck = new THREE.Vector3(0, neckY, -0.012);
  world.Head = new THREE.Vector3(0, headY, 0.0);
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    world[`${side}Shoulder`] = new THREE.Vector3(s * H * 0.02, shoulderY + H * 0.012, -0.01);
    const shoulder = new THREE.Vector3(s * shoulderHalf, shoulderY, -0.012);
    world[`${side}Arm`] = shoulder;
    const dir = armDir.clone().setX(armDir.x * s);
    world[`${side}ForeArm`] = shoulder.clone().addScaledVector(dir, upperArm);
    world[`${side}Hand`] = world[`${side}ForeArm`].clone().addScaledVector(dir, foreArm);
    world[`${side}UpLeg`] = new THREE.Vector3(s * hipHalf, hipJointY, 0);
    world[`${side}Leg`] = new THREE.Vector3(s * hipHalf * 1.02, kneeY, 0.012);
    world[`${side}Foot`] = new THREE.Vector3(s * hipHalf * 1.05, ankleY, -0.012);
    world[`${side}ToeBase`] = new THREE.Vector3(s * hipHalf * 1.08, H * 0.012, H * 0.074);
  }

  {
    const hh = (H / 7.4) * p.headSize * (1 + young * 0.05);
    const kk = hh / 0.254;
    world.Jaw = new THREE.Vector3(0, H - hh + 0.094 * kk, 0.004 * kk);
  }
  const handLength = H * 0.1 * (1 - fem * 0.08);
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    const f = handFrame(armDir, s);
    const wrist = world[`${side}Hand`];
    world[`${side}HandFingers1`] = wrist.clone().addScaledVector(f.fingers, handLength * 0.55);
    world[`${side}HandFingers2`] = wrist.clone().addScaledVector(f.fingers, handLength * 0.78);
    world[`${side}HandThumb1`] = wrist.clone().addScaledVector(f.fingers, handLength * 0.14).addScaledVector(f.forward, 0.028 * k).addScaledVector(f.palm, 0.008 * k);
    world[`${side}HandThumb2`] = world[`${side}HandThumb1`].clone().addScaledVector(f.thumb, 0.03 * k);
  }
  const measures = {
    height: H,
    bulk,
    belly,
    build: p.build,
    age: p.age,
    older,
    young,
    posture: older,
    energy: 1 - older * 0.35 + young * 0.1,
    feminine: fem,
    bust: p.bust,
    butt: p.butt,
    headHeight: (H / 7.4) * p.headSize * (1 + young * 0.05) * (1 - fem * 0.02),
    headWidth: H * 0.086 * p.headSize,
    neckRadius: 0.058 * k * (0.86 + p.build * 0.3) * (0.95 + mus * 0.1) * (1 - fem * 0.16),
    chestHalfWidth: 0.172 * k * p.shoulders * Math.sqrt(bulk) * (0.97 + mus * 0.06) * (1 - young * 0.05) * (1 - fem * 0.11),
    chestDepth: 0.132 * k * bulk * (0.95 + mus * 0.1 + older * 0.03) * (1 - fem * 0.12),
    waistHalfWidth: 0.158 * k * bulk * (0.94 + p.hips * 0.06) * (1.02 - mus * 0.05) * (1 + older * 0.1) * (1 - fem * 0.13) * p.waist,
    hipHalfWidth: 0.19 * k * p.hips * Math.sqrt(bulk) * (1 + older * 0.03) * (1 + fem * 0.04),
    thighRadius: 0.1 * k * bulk * (0.95 + mus * 0.1) * (1 + fem * 0.06) * p.thighs,
    calfRadius: 0.072 * k * bulk * (0.95 + mus * 0.1) * (1 - fem * 0.04) * (0.9 + p.thighs * 0.1),
    ankleRadius: 0.044 * k * (1 - fem * 0.1),
    upperArmRadius: 0.058 * k * bulk * (0.88 + mus * 0.26 - older * 0.04) * (1 - fem * 0.16),
    foreArmRadius: 0.05 * k * bulk * (0.92 + mus * 0.16) * (1 - fem * 0.15),
    wristRadius: 0.031 * k * (1 - fem * 0.14),
    handLength,
    footLength: H * 0.15,
    armDir,
    upperArm,
    foreArm,
    shoulderY,
    shoulderHalf,
    hipsY,
    kneeY,
    ankleY,
    neckY,
    headY,
  };
  return { world, measures, proportions: p };
}

/** Builds a THREE.Skeleton whose bones have identity rest rotations and parent-space offsets. */
export function createSkeleton(layout, { prefix = '' } = {}) {
  const bones = [];
  const byName = {};
  for (const [name, parent] of JOINTS) {
    const bone = new THREE.Bone();
    bone.name = `${prefix}${name}`;
    bone.userData.joint = name;
    const pos = layout.world[name].clone();
    if (parent) pos.sub(layout.world[parent]);
    bone.position.copy(pos);
    if (parent) byName[parent].add(bone);
    bones.push(bone);
    byName[name] = bone;
  }
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { bones, byName, root: bones[0], skeleton };
}
