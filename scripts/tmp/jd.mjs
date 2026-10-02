import { readFileSync } from 'node:fs';
import { auditLegwear, BODY_VARIANTS } from '../../src/garment/audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
for (const v of ['base','slim','woman']) {
const r = auditLegwear({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[v] }, bottom: { length: 'full', type: 'jeans', kind: 'denim', fit: 0.55, stack: 1 }, socks: { color: '#dddddd', height: 0.16 } });
console.log(v, r.rows.map(r => `${r.clip}@${r.time}:${(r.shoe.maxDepth*1000).toFixed(1)}`).join(' '));
}
import { shoeContact } from '../../src/garment/audit.js';
