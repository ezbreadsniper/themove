/** One-off close-up strip: node scripts/closeup.mjs out.png '<json frames>' [w] [h] */
import { writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const [,, out, json, w = '420', h = '420'] = process.argv;
const frames = JSON.parse(json);
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 900 });
const url = await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: +w, height: +h, labels: frames.map((f) => f.label ?? '') }]);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
if (errors.length) console.log('ERRORS', errors.filter((e) => !e.includes('404')).join('\n'));
await browser.close();
stop();
