import { readFileSync } from 'node:fs';
import { auditLegwear, BODY_VARIANTS } from '../../src/garment/audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const r = auditLegwear({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[process.argv[2] ?? 'base'] }, bottom: { type: 'leggings', length: 'full', color: '#18181b', kind: 'jersey' }, socks: { color: '#dddddd', height: 0.16 } });
for (const row of r.rows) if (row.poke.ratio > 0) console.log(row.clip, row.time, row.poke.ratio.toFixed(3), row.poke.checked, JSON.stringify(row.poke.offenders?.slice(0, 6)));
