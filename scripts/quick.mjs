import { ensureServer, openPage } from './lib/browser.mjs';

const [,, out, json = '{}', w = '1280', h = '720'] = process.argv;
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: +w, height: +h });
const opts = JSON.parse(json);
const stats = await page.evaluate((o) => window.evidence.render(o), { ...opts, width: +w, height: +h });
await page.screenshot({ path: out });
console.log(JSON.stringify(stats.map((s) => ({ id: s.id, tris: s.triangles, draws: s.drawCalls, errors: s.errors }))));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
stop();
