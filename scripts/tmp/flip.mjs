import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { computeJointLayout } from '../../src/rig/skeleton.js';
import { samplePose } from '../../src/anim/clips.js';
import { worldPose } from '../../src/anim/fk.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const L = computeJointLayout(trial.body);
let prev = null;
for (let t = 0.2; t <= 0.6; t += 1/30) {
  const p = samplePose(L, 'rifle_equip', t);
  const fk = worldPose(L, p);
  const f = (v) => v.toArray().map(x=>x.toFixed(2)).join(',');
  const fa = p.bones.RightForeArm;
  console.log(t.toFixed(3), 'elbow', f(fk.pos.RightForeArm), 'wrist', f(fk.pos.RightHand), 'fore', fa.toArray().map(x=>x.toFixed(2)).join(','), prev ? THREE.MathUtils.radToDeg(prev.angleTo(fa)).toFixed(1) : '');
  prev = fa.clone();
}
