import { readFileSync, readdirSync } from 'node:fs';
const root = process.argv[2];
const { buildCharacter } = await import(root + '/src/character/build.js');
for (const f of readdirSync(root + '/src/character/presets').filter((f) => f.endsWith('.json') && f !== 'meta.json').sort()) {
  const p = JSON.parse(readFileSync(root + '/src/character/presets/' + f, 'utf8'));
  const g = buildCharacter(p); const s = g.userData.stats;
  console.log(f.padEnd(34), s.triangles, 'bottom', s.perPart.bottom, 'top', s.perPart.top, 'outer', s.perPart.outer ?? '-');
}
