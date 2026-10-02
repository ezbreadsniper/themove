import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { Animator } from '../../src/anim/animator.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const th = (c) => c.userData.rig.bones.find(b => b.name.endsWith('LeftHandThumb1')).quaternion.toArray().map(v => v.toFixed(5)).join(',');
function stand() { const c = buildCharacter(trial); const a = new Animator(c, bakeAllClips(c.userData.layout)); a.locomotion('idle'); const seq = []; for (let i = 0; i < 40; i++) { a.update(1/30); if (i % 8 === 0 || i === 39) seq.push(i + ':' + th(c)); } console.log(seq.join('  ')); return c; }
stand(); stand();
