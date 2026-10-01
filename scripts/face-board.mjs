/** Face board for every preset: node scripts/face-board.mjs <out.png> [yaws] [preset] */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
const [,, out = 'docs/evidence/face-board.png', yawsArg = '0,35,90', preset = 'ps2'] = process.argv;
const dir = 'src/character/presets';
const ids = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'meta.json').map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).id);
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const rows = [];
for (const camYaw of yawsArg.split(',').map(Number)) {
  const frames = ids.map((id) => ({ chars: [id], framing: 'close', camYaw, clip: 'neutral', preset, hide: ['hair', 'hairStrands', 'cap', 'beanie', 'shades', 'glasses'] }));
  rows.push(await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, { width: 260, height: 300, labels: ids.map((i) => `${i.slice(0, 8)} ${camYaw}°`) }]));
}
const tmp = rows.map((u, i) => { const p = out.replace('.png', `-${i}.png`); writeFileSync(p, Buffer.from(u.split(',')[1], 'base64')); return p; });
console.log(tmp.join('\n'));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
stop();
