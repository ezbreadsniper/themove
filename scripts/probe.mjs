import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { createContext } = await server.ssrLoadModule('/src/character/build.js');
const { torsoRings } = await server.ssrLoadModule('/src/geo/parts/body.js');
const bodies = process.argv[2] ? [JSON.parse(process.argv[2])] : [{}, { feminine: 1, bust: 0.7 }];
for (const body of bodies) {
  const c = createContext({ id: 'x', body });
  console.log(JSON.stringify(body));
  for (const r of torsoRings(c.layout)) {
    const backExtent = Math.max(...[2.4, 2.6, 2.8, 3.0, Math.PI].map((t) => r.rzB * (r.shape ? r.shape(t) : 1) * Math.abs(Math.cos(t)))) - (r.cz ?? 0);
    console.log(r.key.padEnd(11), r.y.toFixed(3), r.rx.toFixed(3), r.rzF.toFixed(3), r.rzB.toFixed(3), 'back', backExtent.toFixed(3));
  }
}
await server.close();
