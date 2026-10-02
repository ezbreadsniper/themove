import { buildCharacter } from '../../src/character/build.js';
import { meshNamed, poseGroup } from '../../src/garment/audit.js';
import { readFileSync } from 'node:fs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json','utf8'));
const g = buildCharacter({ ...trial, body: { ...trial.body, feminine: 1, bust: 0.6, hips: 1.1, butt: 0.6, waist: 0.9, height: 1.66 }, bottom: { type: 'skirt', kind: 'cotton', skirtStyle: 'flared', skirtLength: 0.3 } });
const m = meshNamed(g, 'bottom'); const pos = m.geometry.attributes.position;
poseGroup(g, 'run', 0.1);
console.log(m.morphTargetInfluences.map((x) => x.toFixed(2)).join(' '));
const top = meshNamed(g, 'top');
console.log('top hem y min', Math.min(...Array.from({length: top.geometry.attributes.position.count}, (_, i) => top.geometry.attributes.position.getY(i))).toFixed(3));
for (const a of m.geometry.morphAttributes.position) { let mx = 0; for (let i = 0; i < a.count; i++) if (pos.getY(i) > 0.8) mx = Math.max(mx, Math.hypot(a.getX(i), a.getY(i), a.getZ(i))); console.log(a.name, 'max delta above 0.80:', mx.toFixed(3)); }
