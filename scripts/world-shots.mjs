/**
 * Renders World bookmarks from the creator's world mode into docs/world/evidence/<pass>/<shot>.png
 * and a contact sheet. usage: node scripts/world-shots.mjs [pass-name] [shot filter]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const pass = process.argv[2] ?? 'latest';
const filter = process.argv[3] ?? '';
const outDir = `docs/world/evidence/${pass}`;
mkdirSync(outDir, { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/?mode=world', { width: 960, height: 640 });
await page.waitForFunction(() => window.worldViewer?.active, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const names = await page.evaluate(async (f) => {
  const { SHOTS } = await import('/src/world/viewer.js');
  return Object.keys(SHOTS).filter((n) => n.includes(f));
}, filter);
const shots = [];
for (const name of names) {
  await page.waitForFunction(() => window.worldViewer?.active, null, { timeout: 120000 });
  await page.evaluate((n) => { window.worldViewer.goTo(n); }, name);
  await page.waitForTimeout(350);
  const buf = await page.locator('#view canvas').screenshot();
  const file = `${outDir}/${name.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').toLowerCase()}.png`;
  writeFileSync(file, buf);
  shots.push(file);
}
console.log(JSON.stringify({ shots: shots.length, errors }, null, 1));
await browser.close();
stop();
