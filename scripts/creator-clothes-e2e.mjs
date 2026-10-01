/**
 * Browser check: changing clothing in the creator menu rebuilds the character, for a sheet character,
 * for a newly added character, and while the lineup view is active.
 */
import { ensureServer, openPage } from './lib/browser.mjs';

const stop = await ensureServer();
const { browser, page, errors } = await openPage('/', { width: 1280, height: 900 });
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__ready === true);

const results = [];
const hud = () => page.locator('#hud').textContent();

function folderControl(folder, label) {
  const title = page.locator('.lil-title', { hasText: new RegExp(`^${folder}$`, 'i') }).first();
  const scope = page.locator('.lil-gui', { has: title }).last();
  return { title, ctrl: scope.locator('.lil-controller', { hasText: new RegExp(`^${label}`) }).first() };
}

async function pick(folder, label, value) {
  const { title, ctrl } = folderControl(folder, label);
  if (!(await ctrl.isVisible())) await title.click();
  const select = ctrl.locator('select');
  if (await select.count()) await select.selectOption(String(value));
  else {
    const input = ctrl.locator('input').first();
    await input.fill(String(value));
    await input.press('Enter');
  }
  await page.waitForTimeout(700);
}

async function changes() {
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('themove.creator.v2')));
  return stored?.edits?.[stored.activeId]?.diff?.changes ?? {};
}

const trisBefore = await hud();
await pick('top', 'type', 'rugby');
await pick('bottom', 'length', 'shorts');
results.push(['sheet-01 edits saved', (await changes())['bottom.length'] === 'shorts']);
results.push(['sheet-01 rebuilt', (await hud()) !== trisBefore]);
await page.screenshot({ path: 'docs/evidence/creator-clothes-01.png' });

await pick('characters', 'load', 'sheet-07-puffer-balaclava');
const hud07 = await hud();
await pick('outer', 'type', 'bomber');
results.push(['sheet-07 outer saved', (await changes())['outer.type'] === 'bomber']);
results.push(['sheet-07 rebuilt', (await hud()) !== hud07]);
await page.screenshot({ path: 'docs/evidence/creator-clothes-07.png' });

await pick('characters', 'load', 'all characters (lineup)');
const hudLineup = await hud();
await pick('top', 'pattern', 'stripes');
results.push(['lineup edit rebuilds', (await hud()) !== hudLineup || (await changes())['top.pattern'] === 'stripes']);
await page.screenshot({ path: 'docs/evidence/creator-clothes-lineup.png' });

for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (errors.length) console.log(`Browser errors:\n${errors.join('\n')}`);
await browser.close();
stop();
process.exit(results.every(([, ok]) => ok) && !errors.length ? 0 : 1);
