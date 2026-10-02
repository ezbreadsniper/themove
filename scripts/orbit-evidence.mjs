/**
 * Multi-angle review rig: for every preset (or the ids passed as arguments) renders strips of
 * 8 camera yaws around the full body and around each body zone, plus low/high elevation passes.
 * Output: docs/evidence/orbit/<id>-<zone>.png
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const OUT = 'docs/evidence/orbit';
const YAWS = [0, 45, 90, 135, 180, 225, 270, 315];
const presetDir = 'src/character/presets';
const all = readdirSync(presetDir).filter((f) => f.endsWith('.json') && f !== 'meta.json').map((f) => JSON.parse(readFileSync(`${presetDir}/${f}`, 'utf8')).id);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = args.length ? args : all;
const zoneArg = process.argv.find((a) => a.startsWith('--zones='));
const zones = zoneArg ? zoneArg.slice(8).split(',') : ['full', 'head', 'shoulders', 'hips', 'feet', 'elevation'];

mkdirSync(OUT, { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });

async function strip(name, frames, size) {
  const url = await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, size]);
  writeFileSync(`${OUT}/${name}`, Buffer.from(url.split(',')[1], 'base64'));
}

for (const id of ids) {
  const base = { chars: [id], clip: 'idle', time: 1, backdrop: 'sheet' };
  for (const zone of zones) {
    if (zone === 'full') {
      await strip(`${id}-full.png`, YAWS.map((camYaw) => ({ ...base, camYaw })), { width: 260, height: 520, labels: YAWS.map((y) => `${y}°`) });
    } else if (zone === 'elevation') {
      const frames = [[-12, 0], [-12, 150], [35, 30], [35, 210], [60, 0], [8, 90]].map(([pitch, camYaw]) => ({ ...base, pitch, camYaw }));
      await strip(`${id}-elevation.png`, frames, { width: 300, height: 520, labels: ['low front', 'low back', 'high 3/4', 'high back', 'top down', 'side'] });
    } else {
      await strip(`${id}-${zone}.png`, YAWS.map((camYaw) => ({ ...base, zone, camYaw })), { width: 240, height: 240, labels: YAWS.map((y) => `${zone} ${y}°`) });
    }
  }
  console.log(`orbit ${id}: ${zones.join(', ')}`);
}
if (errors.length) console.log(`Browser errors:\n${errors.join('\n')}`);
await browser.close();
stop();
