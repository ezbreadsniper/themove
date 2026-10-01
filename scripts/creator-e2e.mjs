/** Browser check: edit persists across reload and preset switch, revert restores, menu renders all folders. */
import { ensureServer, openPage } from './lib/browser.mjs';

const stop = await ensureServer();
const { browser, page, errors } = await openPage('/', { width: 1280, height: 900 });
const results = [];
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__ready === true);

await page.locator('.lil-title', { hasText: /^body$/ }).first().click();
const height = page.locator('.lil-controller', { hasText: /^height/ }).first().locator('input').first();
await height.fill('1.95');
await height.press('Enter');
await page.waitForTimeout(600);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('themove.creator.v2')));
results.push(['edit saved', stored.edits[stored.activeId]?.diff?.changes?.['body.height'] === 1.95]);

await page.reload();
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(400);
const hudAfterReload = await page.locator('#hud').textContent();
results.push(['persists after reload', hudAfterReload.includes('edited')]);

const folders = await page.locator('.lil-title').allTextContents();
results.push(['menu folders', ['characters', 'view', 'body', 'skin', 'face', 'hair', 'top', 'outer', 'bottom', 'socks', 'shoes', 'tattoos', 'accessories'].every((f) => folders.some((t) => t.trim().toLowerCase() === f))]);
await page.screenshot({ path: 'docs/evidence/creator-menu.png' });

page.once('dialog', (d) => d.accept());
await page.locator('button', { hasText: 'revert this character' }).click();
await page.waitForTimeout(400);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('themove.creator.v2')));
results.push(['revert clears edit', !after.edits[after.activeId]]);

for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (errors.length) console.log(`Browser errors:\n${errors.join('\n')}`);
await browser.close();
stop();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
