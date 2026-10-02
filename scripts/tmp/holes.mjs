import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
const p = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json','utf8'));
const o = JSON.parse(process.argv[2] ?? '{}');
const c = buildCharacter({ ...p, ...o, body: { ...p.body, ...(o.body ?? {}) } });
const g = c.getObjectByName('body').geometry; const P = g.attributes.position; const I = g.index.array;
const key = (i) => [P.getX(i),P.getY(i),P.getZ(i)].map(v => Math.round(v*1e4)).join(',');
const edges = new Map();
for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
  const a = key(I[t+e]), b = key(I[t+(e+1)%3]); if (a === b) continue;
  const k = a < b ? a + '|' + b : b + '|' + a; edges.set(k, (edges.get(k) ?? 0) + 1);
}
const open = [...edges].filter(([, n]) => n === 1).map(([k]) => k);
const yOf = (s) => +s.split(',')[1] / 1e4;
const xOf = (s) => +s.split(',')[0] / 1e4;
const inPelvis = open.filter(k => k.split('|').some(v => yOf(v) > 0.6 && yOf(v) < 0.9 && Math.abs(xOf(v)) < 0.3));
console.log('open edges', open.length, 'pelvis', inPelvis.length); console.log(inPelvis.slice(0, 30).join('\n'));
