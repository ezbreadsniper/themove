import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
const p = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json','utf8'));
const o = JSON.parse(process.argv[2] ?? '{}');
const c = buildCharacter({ ...p, ...o, body: { ...p.body, ...(o.body ?? {}) } });
const g = c.getObjectByName('body').geometry; const P = g.attributes.position, N = g.attributes.normal;
const rows = [];
for (let i = 0; i < P.count; i++) { const x=P.getX(i), y=P.getY(i), z=P.getZ(i); if (Math.abs(z - 0.03) < 0.03 && x > 0.05 && x < 0.2 && y > 0.7 && y < 0.9) rows.push([y,x,z,N.getX(i),N.getY(i),N.getZ(i)]); }
rows.sort((a,b)=>b[0]-a[0]); for (const r of rows) console.log(r.map(v=>v.toFixed(3)).join(' '));
