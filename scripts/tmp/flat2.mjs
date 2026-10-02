import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { bakeClip } from '../../src/anim/clips.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const c1 = buildCharacter(trial), c2 = buildCharacter(trial);
const t1 = bakeClip(c1.userData.layout, 'idle').tracks.find(t => t.name === 'LeftHandThumb1.quaternion');
const t2 = bakeClip(c2.userData.layout, 'idle').tracks.find(t => t.name === 'LeftHandThumb1.quaternion');
console.log('baked equal', Array.from(t1.values).every((v, i) => v === t2.values[i]), Array.from(t1.values.slice(0, 4)));
const b1 = c1.userData.rig.bones.find(b => b.name.endsWith('LeftHandThumb1')), b2 = c2.userData.rig.bones.find(b => b.name.endsWith('LeftHandThumb1'));
console.log('rest', b1.quaternion.toArray(), b2.quaternion.toArray(), b1.position.toArray(), b2.position.toArray());
for (const [c, clip] of [[c1, bakeClip(c1.userData.layout, 'idle')], [c2, bakeClip(c2.userData.layout, 'idle')]]) {
  const m = new THREE.AnimationMixer(c); m.clipAction(clip).play(); m.update(1/30); m.update(1/30);
  console.log('after', c.userData.rig.bones.find(b => b.name.endsWith('LeftHandThumb1')).quaternion.toArray().map(v => v.toFixed(6)).join(','));
}
