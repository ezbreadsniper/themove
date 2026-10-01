import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
const p = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json','utf8'));
const o = JSON.parse(process.argv[2] ?? '{}');
const c = buildCharacter({ ...p, ...o, body: { ...p.body, ...(o.body ?? {}) } });
const body = c.getObjectByName('body');
const pos = body.geometry.attributes.position;
const bins = {};
for (let i = 0; i < pos.count; i++) {
  const y = Math.round(pos.getY(i) * 100) / 100, x = pos.getX(i), z = pos.getZ(i);
  if (y < 0.55 || y > 1.0 || x < 0) continue;
  const b = bins[y] ??= { maxX: -9, minZ: 9, maxZ: -9, n: 0 };
  b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); b.n++;
}
for (const y of Object.keys(bins).sort((a,b)=>b-a)) { const b = bins[y]; console.log(y, 'x', b.maxX.toFixed(3), 'front', b.maxZ.toFixed(3), 'back', b.minZ.toFixed(3), b.n); }
