/**
 * Trial sheet for the neutral default character + body/age variant boards for every character.
 * Output: docs/evidence/trial/*.png and docs/evidence/variants/<id>.png
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const TRIAL = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const presetDir = 'src/character/presets';
const mains = readdirSync(presetDir).filter((f) => f.startsWith('sheet-') && f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${presetDir}/${f}`, 'utf8')));
const only = process.argv.includes('--trial-only');

mkdirSync('docs/evidence/trial', { recursive: true });
mkdirSync('docs/evidence/variants', { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });

const save = (path, url) => writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
const strip = async (path, frames, opts) => save(path, await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, opts]));
const withBody = (def, body, extra = {}) => ({ ...def, ...extra, body: { ...def.body, ...body } });

const T = { chars: [TRIAL], clip: 'idle', time: 1 };
await strip('docs/evidence/trial/views.png', [
  { ...T, camYaw: 0 }, { ...T, camYaw: 90 }, { ...T, camYaw: 180 }, { ...T, camYaw: 35 },
  { ...T, framing: 'close' }, { ...T, framing: 'close', camYaw: 35 },
], { width: 300, height: 520, labels: ['front', 'side', 'back', 'three-quarter', 'face', 'face 3/4'] });
await strip('docs/evidence/trial/poses.png', [
  { ...T, clip: 'neutral' }, { ...T, clip: 'aPose' }, { ...T, clip: 'walk', time: 0.28, camYaw: 60 },
  { ...T, clip: 'jump', time: 0.85, camYaw: 30 }, { ...T, clip: 'jump', time: 1.3, camYaw: 30 }, { ...T, clip: 'crouch', time: 1.2, camYaw: 40 },
], { width: 300, height: 560, labels: ['neutral', 'bind (A-pose)', 'walk', 'jump apex', 'landing', 'crouch'] });
await strip('docs/evidence/trial/body-range.png', [
  { b: { build: 0, muscle: 0.1 }, l: 'thin' }, { b: { build: 0.25 }, l: 'lean' }, { b: { build: 0.5 }, l: 'average' },
  { b: { build: 0.75, muscle: 0.6 }, l: 'stocky' }, { b: { build: 1, muscle: 0.5 }, l: 'heavy' }, { b: { muscle: 1, build: 0.6 }, l: 'muscular' },
  { b: { height: 1.56 }, l: 'short 1.56' }, { b: { height: 2.0 }, l: 'tall 2.00' },
].map(({ b }) => ({ ...T, chars: [withBody(TRIAL, b)] })), { width: 240, height: 520, labels: ['thin', 'lean', 'average', 'stocky', 'heavy', 'muscular', 'short 1.56', 'tall 2.00'] });
const ages = [15, 22, 32, 45, 58, 72];
await strip('docs/evidence/trial/age-range.png', ages.map((age) => ({ ...T, chars: [withBody(TRIAL, { age })] })), { width: 260, height: 520, labels: ages.map((a) => `age ${a}`) });
await strip('docs/evidence/trial/age-faces.png', ages.map((age) => ({ ...T, framing: 'close', chars: [withBody(TRIAL, { age })] })), { width: 260, height: 300, labels: ages.map((a) => `age ${a}`) });
const hair = ['crop', 'buzz', 'afro', 'curlyMop', 'messy', 'twists', 'locs', 'bald'];
await strip('docs/evidence/trial/hair-options.png', hair.map((style) => ({ ...T, framing: 'close', camYaw: 25, chars: [{ ...TRIAL, hair: { ...TRIAL.hair, style } }] })), { width: 220, height: 260, labels: hair });
const acc = [[], [{ type: 'cap' }], [{ type: 'glasses' }], [{ type: 'shades' }], [{ type: 'chains', count: 2 }], [{ type: 'cap' }, { type: 'glasses' }]];
await strip('docs/evidence/trial/accessory-options.png', acc.map((a) => ({ ...T, framing: 'bust', camYaw: 20, chars: [{ ...TRIAL, accessories: a }] })), { width: 240, height: 300, labels: ['none', 'cap', 'glasses', 'shades', 'chains', 'cap + glasses'] });
save('docs/evidence/trial/swatches.png', await page.evaluate((d) => window.evidence.swatches(d), TRIAL));
await strip('docs/evidence/trial/style-without-shader.png', [
  { ...T, preset: 'clean' }, { ...T, preset: 'clean', camYaw: 35 }, { ...T, preset: 'ps2' }, { ...T, preset: 'ps2', camYaw: 35 },
], { width: 320, height: 540, labels: ['clean (no retro)', 'clean 3/4', 'ps2 pipeline', 'ps2 3/4'] });
console.log('trial sheet written');

if (!only) {
  for (const def of mains) {
    const frames = [];
    const labels = [];
    for (const age of [18, 45, 72]) {
      for (const [name, body] of [['thin', { build: 0.05, muscle: 0.2 }], ['as authored', {}], ['heavy', { build: 1 }], ['tall', { height: 1.98 }]]) {
        frames.push({ chars: [withBody(def, { ...body, age })], clip: 'idle', time: 1 });
        labels.push(`${age} ${name}`);
      }
    }
    await strip(`docs/evidence/variants/${def.id}.png`, frames, { width: 200, height: 400, labels });
    console.log(`variants ${def.id}`);
  }
}
if (errors.length) console.log(`Browser errors:\n${errors.join('\n')}`);
await browser.close();
stop();
