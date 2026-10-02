/**
 * Contact sheet of several clips, one row each (weapon clips get their weapon attached):
 *   node scripts/clip-rows.mjs <out.png> <presetId> <clip[@camYaw]>,... [frames]
 * e.g. node scripts/clip-rows.mjs docs/evidence/animation/actions.png trial-default sitDown@60,pickUp@50,melee_cross@40 8
 */
import { writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const [,, out, id = 'trial-default', list = 'idle', count = '8'] = process.argv;
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const rows = [];
for (const spec of list.split(',')) {
  const [clip, yaw = '60'] = spec.split('@');
  const dur = await page.evaluate(([i, c]) => window.evidence.clipDuration(window.evidence.presets[i], c), [id, clip]);
  const n = +count;
  const weapon = ['pistol', 'rifle', 'smg'].find((w) => clip.startsWith(`${w}_`));
  const frames = Array.from({ length: n }, (_, i) => ({ chars: [id], clip, time: (i / n) * dur, camYaw: +yaw, ...(weapon ? { weapon } : {}) }));
  rows.push(await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: 200, height: 380, labels: frames.map((f) => `${clip} ${f.time.toFixed(2)}s`) }]));
}
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
