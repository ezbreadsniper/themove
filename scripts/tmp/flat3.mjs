import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { Animator } from '../../src/anim/animator.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const mk = () => { const c = buildCharacter(trial); const a = new Animator(c, bakeAllClips(c.userData.layout)); a.locomotion('idle'); return [c, a]; };
const [c1, a1] = mk(); const [c2, a2] = mk();
const th = (c) => c.userData.rig.bones.find(b => b.name.endsWith('LeftHandThumb1')).quaternion.toArray().map(v => v.toFixed(5)).join(',');
for (let i = 0; i < 4; i++) { a1.update(1/30); a2.update(1/30); console.log(i, th(c1), '|', th(c2)); }
const clipThumb = (a) => a.clips.idle.tracks.find(t=>t.name==='LeftHandThumb1.quaternion').values.slice(0,4);
console.log(Array.from(clipThumb(a1)), Array.from(clipThumb(a2)));
