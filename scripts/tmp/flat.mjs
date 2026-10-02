import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { Animator } from '../../src/anim/animator.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
function stand(ground) { const c = buildCharacter(trial); const root = new THREE.Group(); root.add(c); const a = new Animator(c, bakeAllClips(c.userData.layout)); a.locomotion('idle'); if (ground) a.setGround(ground); for (let i = 0; i < 40; i++) a.update(1/30); return c; }
const a = stand(() => 0), b = stand(null);
a.userData.rig.bones.forEach((x, i) => { const d = x.quaternion.angleTo(b.userData.rig.bones[i].quaternion); if (d > 1e-7) console.log(x.name, d); });
