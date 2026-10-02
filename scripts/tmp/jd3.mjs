import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const g = buildCharacter({ ...trial, bottom: { length: 'full', type: 'jeans', kind: 'denim', fit: 0.55, stack: 1 }, socks: { color: '#dddddd', height: 0.16 } });
const m = g.getObjectByName('bottom'); const P = m.geometry.attributes.position; const I = m.geometry.index.array;
const t = [-0.134, 0.028, -0.074];
for (let i = 0; i < I.length; i += 3) for (const [wa,wb,wc] of [[1,0,0],[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5]]) {
  const p = [0,1,2].map(ax => P.getComponent(I[i],ax)*wa + P.getComponent(I[i+1],ax)*wb + P.getComponent(I[i+2],ax)*wc);
  if (Math.hypot(p[0]-t[0],p[1]-t[1],p[2]-t[2]) < 0.002) console.log(i/3, [wa,wb,wc].map(x=>x.toFixed(2)).join(','), [I[i],I[i+1],I[i+2]].map(v => [0,1,2].map(ax=>P.getComponent(v,ax).toFixed(3)).join(' ')).join(' | '));
}
console.log('verts', P.count, 'tris', I.length/3);
