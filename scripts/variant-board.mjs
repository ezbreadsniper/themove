/**
 * Renders one base preset with a list of overrides side by side, each from two yaws, so a whole
 * option family (beards, pants cuts, skirts, shoes...) can be judged in one image.
 *   node scripts/variant-board.mjs <out.png> <presetId> <zone> '<[{label, patch}]>' [yawA] [yawB]
 * patch is deep-merged into the preset (arrays replace).
 */
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const [,, out, presetId, zone = 'head', json = '[]', yawA = '20', yawB = '90'] = process.argv;
const presetDir = 'src/character/presets';
const file = readdirSync(presetDir).find((f) => f.endsWith('.json') && JSON.parse(readFileSync(`${presetDir}/${f}`, 'utf8')).id === presetId);
const base = JSON.parse(readFileSync(`${presetDir}/${file}`, 'utf8'));
const merge = (a, b) => {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const outObj = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) outObj[k] = merge(outObj[k], v);
  return outObj;
};
const variants = JSON.parse(json);
const frames = [];
const labels = [];
for (const { label, patch } of variants) {
  const def = merge(base, patch);
  for (const camYaw of [+yawA, +yawB]) {
    frames.push({ chars: [def], clip: 'idle', time: 1, backdrop: 'sheet', camYaw, ...(zone === 'full' ? {} : { zone }) });
    labels.push(`${label} ${camYaw}°`);
  }
}
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const size = zone === 'full' ? { width: 220, height: 440 } : { width: 220, height: 220 };
const url = await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { ...size, labels }]);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
if (errors.length) console.log(`Browser errors:\n${errors.join('\n')}`);
await browser.close();
stop();
