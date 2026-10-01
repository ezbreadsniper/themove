/** Every shoe type on the trial character, feet zone from 3 angles: docs/evidence/shoe-board.png */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const types = (process.argv[2] ?? 'canvasLow,slipOn,hiTopChunky,chunkyBoot,dress,clog,sandal').split(',');
const colors = { canvasHi: ['#8a1c1c', '#ecebe6'], runner: ['#2a3a5c', '#ecebe6'], skate: ['#3a3a3e', '#e8e0cc'], basketball: ['#ecebe6', '#1a1a1c'], workBoot: ['#c08a46', '#6a4a2a'], loafer: ['#3a1e12', '#1c1712'], slide: ['#141416', '#141416'], canvasLow: ['#1d1d20', '#ecebe6'], slipOn: ['#141416', '#ecebe6'], hiTopChunky: ['#1a1a1c', '#ecebe6'], chunkyBoot: ['#131315', '#141416'], dress: ['#121214', '#1c1712'], clog: ['#7a4f2c', '#c7a77a'], sandal: ['#6e4628', '#c9a476'] };
const stop = await ensureServer();
const { browser, page } = await openPage('/evidence.html', { width: 1400, height: 800 });
const rows = [];
for (const camYaw of [30, 90, 200]) {
  const frames = types.map((type) => ({ chars: [{ ...trial, bottom: { ...trial.bottom, length: 'cropped' }, shoes: { type, upper: colors[type][0], sole: colors[type][1], accent: '#ecebe6', size: 1 } }], zone: 'feet', camYaw, clip: 'neutral' }));
  rows.push(await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: 230, height: 230, labels: types.map((t) => `${t} ${camYaw}°`) }]));
}
rows.forEach((u, i) => writeFileSync(`docs/evidence/tmp-shoes-${i}.png`, Buffer.from(u.split(',')[1], 'base64')));
await browser.close();
stop();
