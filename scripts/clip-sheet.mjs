/**
 * Clip contact sheet: one row per clip, N evenly spaced frames from one camera.
 * usage: node scripts/clip-sheet.mjs <out.png> <presetId> <clip,clip,...> [--weapon=pistol,rifle] [--yaw=30] [--frames=6] [--zone=torso] [--preset=clean]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const [out, id, clipList] = args;
const def = JSON.parse(readFileSync(`src/character/presets/${id}.json`, 'utf8'));
const weapon = flag('weapon', undefined)?.split(',');
const yaw = +flag('yaw', 30);
const count = +flag('frames', 6);
const zone = flag('zone', undefined);
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const rows = [];
for (const clip of clipList.split(',')) {
  const duration = await page.evaluate(([d, c, w]) => window.evidence.clipDuration(d, c, w), [def, clip, weapon]);
  const times = Array.from({ length: count }, (_, i) => (duration * i) / (count - 1) * 0.999);
  const frames = times.map((time) => ({ chars: [def], clip, time, camYaw: yaw, zone, backdrop: 'sheet', preset: flag('preset', 'clean'), weapon }));
  const size = zone ? { width: 260, height: 260 } : { width: 220, height: 400 };
  rows.push(await page.evaluate(([f, s]) => window.evidence.strip(f, s), [frames, { ...size, labels: times.map((t, i) => (i ? `${t.toFixed(2)}s` : `${clip} 0s`)) }]));
}
const sheet = await page.evaluate(async (urls) => {
  const imgs = await Promise.all(urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; })));
  const c = document.createElement('canvas');
  c.width = Math.max(...imgs.map((i) => i.width));
  c.height = imgs.reduce((h, i) => h + i.height, 0);
  let y = 0;
  for (const i of imgs) { c.getContext('2d').drawImage(i, 0, y); y += i.height; }
  return c.toDataURL('image/png');
}, rows);
writeFileSync(out, Buffer.from(sheet.split(',')[1], 'base64'));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
stop();
