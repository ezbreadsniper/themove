import { readFileSync } from 'node:fs';
import { auditLegwear, BODY_VARIANTS } from '../../src/garment/audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const r = auditLegwear({ ...trial, body: { ...trial.body }, bottom: { length: 'full', type: 'jeans', kind: 'denim', fit: 0.55, stack: 1 }, socks: { color: '#dddddd', height: 0.16 } });
console.log(trial.shoes, JSON.stringify(r.rows[0].shoe.worst));
