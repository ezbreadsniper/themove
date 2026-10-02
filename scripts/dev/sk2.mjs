import { auditLegwear, BODY_VARIANTS } from '../../src/garment/audit.js';
import { readFileSync } from 'node:fs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json','utf8'));
const [style, len, clip, time, v] = process.argv.slice(2);
const r = auditLegwear({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[v ?? 'woman'] }, bottom: { type: 'skirt', kind: 'cotton', skirtStyle: style, skirtLength: +len } }, { poses: [[clip, +time]] });
console.log(r.rows[0].poke);
