/**
 * Renders World bookmarks from the creator's world mode into docs/world/evidence/<pass>/<shot>.png
 * and a labelled contact sheet (contact.png). usage: node scripts/world-shots.mjs [pass-name] [shot filter]
 * Set THEMOVE_URL to point at an already running dev server (e.g. one per worktree).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const pass = process.argv[2] ?? 'latest';
const filter = process.argv[3] ?? '';
const outDir = `docs/world/evidence/${pass}`;
mkdirSync(outDir, { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/?mode=world', { width: 960, height: 640 });
await page.waitForFunction(() => window.worldViewer?.active, null, { timeout: 180000 });
await page.addStyleTag({ content: '.lil-gui, #hud { display: none !important; }' });
await page.waitForTimeout(1500);
const names = await page.evaluate(async (f) => {
  const { SHOTS } = await import('/src/world/viewer.js');
  return Object.keys(SHOTS).filter((n) => n.includes(f));
}, filter);
const shots = [];
for (const name of names) {
  await page.evaluate((n) => window.worldViewer.goTo(n), name);
  await page.waitForTimeout(700);
  const buf = await page.locator('#view canvas').screenshot();
  const file = `${outDir}/${name.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').toLowerCase()}.png`;
  writeFileSync(file, buf);
  shots.push({ name, data: buf.toString('base64') });
}
const sheet = await page.evaluate(async (list) => {
  const cols = 4;
  const w = 320;
  const h = 214;
  const c = document.createElement('canvas');
  c.width = cols * w;
  c.height = Math.ceil(list.length / cols) * (h + 16);
  const g = c.getContext('2d');
  g.fillStyle = '#111';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < list.length; i++) {
    const img = new Image();
    img.src = `data:image/png;base64,${list[i].data}`;
    await img.decode();
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * (h + 16);
    g.drawImage(img, x, y + 16, w, h);
    g.fillStyle = '#ddd';
    g.font = '11px monospace';
    g.fillText(list[i].name, x + 4, y + 12);
  }
  return c.toDataURL('image/png').split(',')[1];
}, shots);
if (!filter) writeFileSync(`${outDir}/contact.png`, Buffer.from(sheet, 'base64'));
const stats = await page.evaluate(() => window.worldViewer.world.stats());
console.log(JSON.stringify({ shots: shots.length, errors, stats }, null, 1));
await browser.close();
stop();
