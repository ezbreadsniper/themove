import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
const p = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json','utf8'));
const c = buildCharacter({ ...p, top: { type: 'tank', fit: 0.05, length: -0.12, color: '#d8396a', fabric: 'jersey' }, bottom: { type: 'leggings', length: 'cutoff', color: '#202022', kind: 'jersey' } });
c.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; console.log(o.name.padEnd(12), b.min.y.toFixed(3), b.max.y.toFixed(3), o.geometry.attributes.position.count); } });
