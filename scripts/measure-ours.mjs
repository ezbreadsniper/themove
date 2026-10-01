/** Slices our bare trial body (bind pose) with the same contour slicer as the reference. */
import { createServer } from 'vite';
import { sliceStats } from './measure-reference.mjs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { buildCharacter } = await server.ssrLoadModule('/src/character/build.js');
const body = JSON.parse(process.argv[2] ?? '{}');
const g = buildCharacter({ id: 'bare', seed: 'bare', body: { height: 1.776, ...body }, shoes: { type: 'barefoot' }, hair: { style: 'bald' } });
const meshes = [];
g.traverse((o) => { if (o.isMesh && (o.name === 'body' || o.name === 'head')) meshes.push({ name: o.name, pos: o.geometry.attributes.position.array, index: o.geometry.index.array, tris: o.geometry.index.count / 3 }); });
const H = 1.776;
console.log(`ours: ${meshes.map((m) => `${m.name}(${m.tris})`).join(' + ')}`);
for (let f = 0.03; f < 1; f += 0.05) {
  const parts = meshes.flatMap((m) => sliceStats(m.pos, m.index, f * H)).sort((a, b) => a.cx - b.cx);
  console.log(`${(f * 100).toFixed(0).padStart(3)}%  ${parts.map((p) => `[x${p.cx.toFixed(2)} ${(p.w * 100).toFixed(0)}x${(p.d * 100).toFixed(0)}]`).join(' ')}`);
}
await server.close();
