/**
 * Hem / cuff board: every lower-body fit class on the trial character, feet zone, from front, side,
 * back and three-quarter, plus walk / run / crouch frames. Writes docs/evidence/clothing/cuffs-*.png.
 * usage: node scripts/cuff-board.mjs [tag] [classes]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const tag = process.argv[2] ?? 'now';
const CLASSES = {
  straight: { type: 'pants', kind: 'twill', color: '#3c3a34', fit: 0.45, cut: 'straight', stack: 0.3 },
  jeans: { type: 'jeans', kind: 'denim', color: '#4c6788', fit: 0.55, cut: 'straight', stack: 1 },
  wide: { type: 'pants', kind: 'twill', color: '#6a5a44', fit: 0.9, cut: 'wide', stack: 0.4 },
  jogger: { type: 'pants', kind: 'fleece', color: '#4a4c52', fit: 0.6, cinch: true, stack: 0 },
  slim: { type: 'pants', kind: 'twill', color: '#2a2a2e', fit: 0.2, cut: 'skinny', stack: 0 },
  ankle: { type: 'pants', kind: 'cotton', color: '#c8b48c', fit: 0.4, length: 'ankle', stack: 0 },
  cropped: { type: 'pants', kind: 'cotton', color: '#c8b48c', fit: 0.4, length: 'cropped', stack: 0 },
  skirt: { type: 'skirt', kind: 'cotton', color: '#2a2a40', skirtStyle: 'aLine', skirtLength: 0.8 },
};
const names = (process.argv[3] ?? Object.keys(CLASSES).join(',')).split(',');
const shoes = { type: 'canvasLow', upper: '#e8e6e0', sole: '#ecebe6', accent: '#ffffff', size: 1 };
const socks = { color: '#d8d6d0', height: 0.16 };
mkdirSync('docs/evidence/clothing', { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const views = [[0, 'front'], [35, '3/4'], [90, 'side'], [180, 'back']];
const poses = [['walk', 0.15], ['walk', 0.45], ['run', 0.1], ['crouch', 1.2], ['jump', 0.85], ['sit', 1]];
for (const name of names) {
  const bottom = { length: 'full', ...CLASSES[name] };
  const ch = { ...trial, id: `cuff-${name}`, bottom, socks, shoes };
  const frames = [
    ...views.map(([camYaw]) => ({ chars: [ch], zone: process.env.ZONE ?? 'ankles', camYaw, clip: 'neutral' })),
    ...poses.map(([clip, time]) => ({ chars: [ch], zone: clip === 'jump' || clip === 'sit' ? 'legs' : process.env.ZONE ?? 'ankles', camYaw: 70, clip, time })),
  ];
  // Gameplay distance: full body small (third-person camera ~3.2 m), shows what survives at play size.
  frames.push({ chars: [ch], framing: 'full', camYaw: 25, clip: 'walk', time: 0.3, pitch: 8 });
  const labels = [...views.map(([, v]) => `${name} ${v}`), ...poses.map(([c, t]) => `${c} ${t}`), 'gameplay'];
  const url = await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: 220, height: 240, labels }]);
  writeFileSync(`docs/evidence/clothing/cuffs-${tag}-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name);
}
if (errors.length) console.log('ERRORS', errors.join('\n'));
await browser.close();
stop();
