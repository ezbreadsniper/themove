import { buildCharacter } from '../../src/character/build.js';
import { readFileSync } from 'node:fs';
const trial = JSON.parse(readFileSync('../../src/character/presets/trial-default.json','utf8'));
const which = process.argv[2] ?? 'jeans';
const C = {
  straight: { type: 'pants', kind: 'twill', fit: 0.45, cut: 'straight', stack: 0.3 },
  jeans: { type: 'jeans', kind: 'denim', fit: 0.55, stack: 1 },
  wide: { type: 'pants', kind: 'twill', fit: 0.9, cut: 'wide', stack: 0.4 },
  jogger: { type: 'pants', kind: 'fleece', fit: 0.6, cinch: true, stack: 0 },
};
globalThis.__drapeLog = [];
buildCharacter({ ...trial, bottom: { length: 'full', ...C[which] }, socks: { color: '#ddd', height: 0.16 } });
const { sim, rows, length } = globalThis.__drapeLog[0];
console.log('length', length.toFixed(3), 'rows', sim.rows, 'ds', sim.ds.toFixed(4));
for (let i = 0; i < sim.rows; i++) {
  const ys = []; const cs = [];
  for (let j = 0; j < sim.sides; j += 5) { const p = sim.at(i, j); ys.push(p.y.toFixed(3)); cs.push(sim.contactAt(i,j) ?? '-'); }
  console.log(i, ys.join(' '), cs.join(','), 'strain', sim.strain[i].around.toFixed(3), sim.strain[i].down.toFixed(3));
}
console.log('picked rows', rows.map(r=>r.row).join(','));
