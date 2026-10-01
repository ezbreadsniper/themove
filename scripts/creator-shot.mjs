import { ensureServer, openPage } from './lib/browser.mjs';

const [,, out = 'docs/evidence/tmp-creator.png', path = '/'] = process.argv;
const stop = await ensureServer();
const { browser, page, errors } = await openPage(path, { width: 1280, height: 720 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
stop();
