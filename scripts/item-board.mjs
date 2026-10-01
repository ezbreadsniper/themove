/**
 * Clothing review board: node scripts/item-board.mjs <out.png> '<json variants>' [zone] [yaws]
 * Each variant is a partial definition merged onto the trial character.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const [,, out, json, zone = '', yawsArg = '0,40,180', clip = 'idle'] = process.argv;
const variants = JSON.parse(json);
const yaws = yawsArg.split(',').map(Number);
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const rows = [];
for (const camYaw of yaws) {
  const frames = variants.map((v) => ({ chars: [{ ...trial, ...v, body: { ...trial.body, ...(v.body ?? {}) } }], camYaw, clip, time: 1, ...(zone ? { zone } : {}) }));
  rows.push(await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: zone ? 260 : 220, height: zone ? 260 : 440, labels: variants.map((v) => `${v.label ?? ''} ${camYaw}°`) }]));
}
const bufs = rows.map((u) => Buffer.from(u.split(',')[1], 'base64'));
bufs.forEach((b, i) => writeFileSync(out.replace('.png', `-${i}.png`), b));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
stop();
