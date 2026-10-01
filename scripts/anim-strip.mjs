/** Filmstrips of clips: node scripts/anim-strip.mjs <out.png> <presetId> <clip> [camYaw] [frames] */
import { writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const [,, out, id, clip, camYaw = '90', count = '8', body = '{}'] = process.argv;
const stop = await ensureServer();
const { browser, page } = await openPage('/evidence.html', { width: 1400, height: 800 });
const dur = await page.evaluate(([i, c, b]) => {
  const p = { ...window.evidence.presets[i] };
  p.body = { ...p.body, ...b };
  return window.evidence.clipDuration(p, c);
}, [id, clip, JSON.parse(body)]);
const n = +count;
const frames = Array.from({ length: n }, (_, i) => ({ chars: [{ __preset: id, body: JSON.parse(body) }], clip, time: (i / n) * dur, camYaw: +camYaw }));
const url = await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: 220, height: 420, labels: frames.map((f) => `${clip} ${f.time.toFixed(2)}s`) }]);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
stop();
