/** Large bare-body views for anatomy work: node scripts/body-views.mjs <out.png> '<body json>' '<face json>' */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const [,, out, body = '{}', face = '{}', extra = '{}'] = process.argv;
const def = { ...trial, body: { ...trial.body, ...JSON.parse(body) }, face: { ...trial.face, ...JSON.parse(face) }, top: null, bottom: null, shoes: { type: 'barefoot' }, ...JSON.parse(extra) };
const stop = await ensureServer();
const { browser, page } = await openPage('/evidence.html', { width: 1400, height: 900 });
const frames = [0, 45, 90, 180].map((camYaw) => ({ chars: [def], camYaw, clip: 'neutral', preset: 'clean' }));
const url = await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: 340, height: 640, labels: ['front', '3/4', 'side', 'back'] }]);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
stop();
