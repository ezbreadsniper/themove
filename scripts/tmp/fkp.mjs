import { readFileSync } from 'node:fs';
import { computeJointLayout } from '../../src/rig/skeleton.js';
import { samplePose } from '../../src/anim/clips.js';
import { worldPose } from '../../src/anim/fk.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const L = computeJointLayout(trial.body);
const p = samplePose(L, process.argv[2] ?? 'pistol_aim', 0);
const fk = worldPose(L, p);
for (const j of ['RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand','Head']) console.log(j.padEnd(13), fk.pos[j].toArray().map(v=>v.toFixed(3)).join(' '));
