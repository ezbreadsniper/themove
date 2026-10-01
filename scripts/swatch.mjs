/** Dumps every texture of one preset: node scripts/swatch.mjs <presetId> <out.png> */
import { writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const [,, id, out] = process.argv;
const stop = await ensureServer();
const { browser, page } = await openPage('/evidence.html', { width: 1000, height: 800 });
const url = await page.evaluate((i) => window.evidence.swatches(i, { cell: 256 }), id);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
stop();
