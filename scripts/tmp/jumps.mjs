import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { computeJointLayout } from '../../src/rig/skeleton.js';
import { bakeClip, WEAPON_CLIP_NAMES, CLIP_NAMES } from '../../src/anim/clips.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const L = computeJointLayout(trial.body);
const names = process.argv[2] === 'base' ? CLIP_NAMES : process.argv[2] ? process.argv[2].split(',') : WEAPON_CLIP_NAMES;
const rows = [];
for (const name of names) {
  const clip = bakeClip(L, name);
  let worst = 0, at = 0, bone = '';
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.quaternion')) continue;
    const v = tr.values; const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
    for (let f = 1; f < tr.times.length; f++) {
      q0.fromArray(v, (f - 1) * 4); q1.fromArray(v, f * 4);
      const d = THREE.MathUtils.radToDeg(q0.angleTo(q1));
      if (d > worst) { worst = d; at = tr.times[f]; bone = tr.name.split('.')[0]; }
    }
  }
  rows.push([worst, name, at, bone]);
}
rows.sort((a, b) => b[0] - a[0]);
for (const [w, n, at, b] of rows.slice(0, +(process.argv[3] ?? 25))) console.log(n.padEnd(24), w.toFixed(1).padStart(6), 'deg/frame', b.padEnd(14), '@', at.toFixed(2));
