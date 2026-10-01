/** Filmstrip of the smoking clip with simulated smoke: node scripts/smoke-strip.mjs <presetId> [camYaw] */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const [,, id = 'trial-default', camYaw = '30'] = process.argv;
const def = JSON.parse(readFileSync(`src/character/presets/${id}.json`, 'utf8'));
def.accessories = [...def.accessories.filter((a) => a.type !== 'cigarette'), { type: 'cigarette' }];
const times = [0.3, 0.9, 1.5, 2.2, 2.6, 3.0, 4.2];
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const frames = times.map((time) => ({ chars: [def], clip: 'smoke', time, simulate: true, camYaw: +camYaw, framing: 'bust' }));
const url = await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: 260, height: 300, labels: times.map((t) => `smoke ${t}s`) }]);
writeFileSync('docs/evidence/smoke-strip.png', Buffer.from(url.split(',')[1], 'base64'));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
stop();
