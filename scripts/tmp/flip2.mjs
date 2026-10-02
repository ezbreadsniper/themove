import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { computeJointLayout } from '../../src/rig/skeleton.js';
import { samplePose } from '../../src/anim/clips.js';
import { worldPose } from '../../src/anim/fk.js';
const L = computeJointLayout(JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8')).body);
const clip = process.argv[2] ?? 'rifle_equip';
let prev = null;
for (let t = 0.2; t <= 0.9; t += 1/30) {
  const p = samplePose(L, clip, t);
  const fk = worldPose(L, p);
  const f = (v) => v.toArray().map(x=>x.toFixed(2)).join(',');
  const cur = ['RightArm','RightForeArm','RightHand'].map(b => p.bones[b].clone());
  const d = prev ? cur.map((q,i)=>THREE.MathUtils.radToDeg(q.angleTo(prev[i])).toFixed(0)).join('/') : '';
  console.log(t.toFixed(3), 'elbow', f(fk.pos.RightForeArm), 'wrist', f(fk.pos.RightHand), 'd', d);
  prev = cur;
}
