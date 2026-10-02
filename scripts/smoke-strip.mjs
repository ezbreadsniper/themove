/**
 * Filmstrip of a smoking clip with simulated smoke, one row per camera angle:
 *   node scripts/smoke-strip.mjs [out.png] [presetId] [clip] [camYaws] [times] [framing]
 * e.g. node scripts/smoke-strip.mjs docs/evidence/animation/smoke-loop.png trial-default smoke 30,-60 0.3,1.6,2.4,3.3,4.2,7.1 bust
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const [,, out = 'docs/evidence/smoke-strip.png', id = 'trial-default', clip = 'smoke', yaws = '30', timeList = '0.3,1.6,2.4,3.3,3.9,4.5,7.0', framing = 'bust'] = process.argv;
const def = JSON.parse(readFileSync(`src/character/presets/${id}.json`, 'utf8'));
def.accessories = [...def.accessories.filter((a) => a.type !== 'cigarette'), { type: 'cigarette' }];
const times = timeList.split(',').map(Number);
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const rows = [];
for (const camYaw of yaws.split(',').map(Number)) {
  const frames = times.map((time) => ({ chars: [def], clip, time, simulate: true, camYaw, framing, backdrop: 'sheet' }));
  const size = framing === 'full' ? { width: 220, height: 420 } : { width: 240, height: 300 };
  rows.push(await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { ...size, labels: times.map((t) => `${clip} ${t}s ${camYaw}°`) }]));
}
// Stack the rows into one image.
const url = await page.evaluate(async (urls) => {
  const imgs = await Promise.all(urls.map((u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; })));
  const c = document.createElement('canvas');
  c.width = Math.max(...imgs.map((i) => i.width));
  c.height = imgs.reduce((h, i) => h + i.height, 0);
  let y = 0;
  for (const i of imgs) { c.getContext('2d').drawImage(i, 0, y); y += i.height; }
  return c.toDataURL('image/png');
}, rows);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
stop();
