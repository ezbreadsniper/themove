import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const [,, id = 'sheet-02-denim-vest', out = 'docs/evidence/tmp-skin.rgba'] = process.argv;
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
const { buildCharacter } = await server.ssrLoadModule('/src/character/build.js');
const { PRESETS_BY_ID } = await server.ssrLoadModule('/src/character/presets/index.js');
const group = buildCharacter(PRESETS_BY_ID[id]);
let raster = null;
group.traverse((o) => { if (o.isMesh && o.name === 'body') raster = o.userData.raster; });
writeFileSync(out, Buffer.from(raster.data.buffer));
console.log(raster.width, raster.height);
await server.close();
