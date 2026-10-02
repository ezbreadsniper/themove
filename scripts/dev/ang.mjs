import { computeJointLayout } from '../../src/rig/skeleton.js';
import { samplePose } from '../../src/anim/clips.js';
const L = computeJointLayout({ feminine: 1, height: 1.66, hips: 1.1 });
const deg = (q) => (2 * Math.atan2(q.x, q.w) * 180 / Math.PI).toFixed(0);
for (const [c, t] of [['sit', 1], ['crouch', 1.2], ['run', 0.1], ['run', 0.3], ['walk', 0.35], ['jump', 1.3]]) {
  const p = samplePose(L, c, t);
  console.log(c, t, ['LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'].map((b) => `${b}:${p.bones[b] ? deg(p.bones[b]) : 0}`).join(' '));
}
