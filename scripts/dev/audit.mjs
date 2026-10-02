import { auditLegwear, BODY_VARIANTS } from '../../src/garment/audit.js';
import { readFileSync } from 'node:fs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json','utf8'));
const C = {
  straight: { type: 'pants', kind: 'twill', fit: 0.45, cut: 'straight', stack: 0.3 },
  jeans: { type: 'jeans', kind: 'denim', fit: 0.55, stack: 1 },
  wide: { type: 'pants', kind: 'twill', fit: 0.9, cut: 'wide', stack: 0.4 },
  jogger: { type: 'pants', kind: 'fleece', fit: 0.6, cinch: true, stack: 0 },
  slim: { type: 'pants', kind: 'twill', fit: 0.2, cut: 'skinny' },
  ankle: { type: 'pants', kind: 'cotton', fit: 0.4, length: 'ankle' },
  shorts: { type: 'shorts', kind: 'cotton', fit: 0.5, length: 'shorts' },
};
const variants = (process.argv[3] ?? 'base').split(',');
for (const name of (process.argv[2] ?? Object.keys(C).join(',')).split(',')) {
  for (const v of variants) {
    const r = auditLegwear({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[v] }, bottom: { length: 'full', ...C[name] }, socks: { color: '#ddd', height: 0.16 } });
    const worstShoe = r.rows.reduce((a, b) => (b.shoe.maxDepth > a.shoe.maxDepth ? b : a));
    const worstPoke = r.rows.reduce((a, b) => (b.poke.ratio > a.poke.ratio ? b : a));
    console.log(name.padEnd(9), v.padEnd(10), 'gap', r.frontGap.toFixed(3), 'shoe', worstShoe.shoe.maxDepth.toFixed(3), (worstShoe.shoe.ratio * 100).toFixed(1) + '%', worstShoe.clip, worstShoe.time, '| poke', (worstPoke.poke.ratio * 100).toFixed(1) + '%', worstPoke.clip, worstPoke.time, worstPoke.poke.checked, JSON.stringify(worstPoke.poke.offenders?.slice(0, 2)), 'tris', r.stats.perPart.bottom);
  }
}
