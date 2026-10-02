import { buildCharacter } from '../../src/character/build.js';
import { meshNamed } from '../../src/garment/audit.js';
import { readFileSync } from 'node:fs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json','utf8'));
const g = buildCharacter({ ...trial, bottom: { type: 'skirt', kind: 'cotton', skirtStyle: 'aLine', skirtLength: 0.8 } });
const m = meshNamed(g, 'bottom'); const pos = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
const names = g.userData.rig.skeleton.bones.map(b=>b.name);
for (let i = 0; i < pos.count; i += 23) console.log([pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>v.toFixed(2)).join(','), [0,1,2,3].map(c=>`${names[si.getComponent(i,c)]}:${sw.getComponent(i,c).toFixed(2)}`).join(' '));
console.log(m.morphTargetDictionary);
for (const a of m.geometry.morphAttributes.position) { let mx=0, at=-1; for (let i=0;i<a.count;i++){const d=Math.hypot(a.getX(i),a.getY(i),a.getZ(i)); if(d>mx){mx=d;at=i;}} console.log(a.name, mx.toFixed(3), [pos.getX(at),pos.getY(at),pos.getZ(at)].map(v=>v.toFixed(2)).join(',')); }
