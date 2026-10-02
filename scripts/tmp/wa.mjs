import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { attachWeapon } from '../../src/weapons/model.js';
import { bakeClip, WEAPON_CLIP_NAMES, samplePose } from '../../src/anim/clips.js';
import { weaponContact } from '../../src/anim/weapon-audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const names = process.argv[2] ? process.argv[2].split(',') : WEAPON_CLIP_NAMES;
for (const name of names) {
  const type = name.split('_')[0];
  const c = buildCharacter(trial); attachWeapon(c, type);
  const clip = bakeClip(c.userData.layout, name);
  const mixer = new THREE.AnimationMixer(c); mixer.clipAction(clip).play();
  let worstR = 0, worstL = 0, unreach = 0, n = 0;
  for (let t = 0; t <= clip.duration + 1e-6; t += 1 / 30) {
    mixer.setTime(Math.min(t, clip.duration - 1e-4));
    const p = samplePose(c.userData.layout, name, Math.min(t, clip.duration - 1e-4));
    worstR = Math.max(worstR, p.hold.Right); worstL = Math.max(worstL, p.hold.Left); if (!p.hold.reachable) unreach++; n++;
  }
  console.log(name.padEnd(24), clip.duration.toFixed(2) + 's', 'ikR', (worstR*1000).toFixed(1), 'ikL', (worstL*1000).toFixed(1), 'mm  unreachable', unreach + '/' + n);
}
