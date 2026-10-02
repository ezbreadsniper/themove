import { auditLegwear, BODY_VARIANTS } from '../../src/garment/audit.js';
import { readFileSync } from 'node:fs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json','utf8'));
for (const style of (process.argv[2] ?? 'pencil,aLine,flared,pleated').split(','))
for (const len of (process.argv[3] ?? '0.3,0.55,0.8').split(',').map(Number)) {
  const r = auditLegwear({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[process.argv[4] ?? 'woman'] }, bottom: { type: 'skirt', kind: 'cotton', skirtStyle: style, skirtLength: len }, socks: { color: '#ddd', height: 0.16 } });
  console.log(style, len, r.rows.map(x => `${x.clip}${x.time}:${(x.poke.ratio*100).toFixed(0)}%/${x.poke.checked}/s${(x.shoe.maxDepth*100).toFixed(1)}`).join(' '));
}
