/**
 * Anatomy review strip: renders a preset (optionally with clothes/hair stripped and body overrides)
 * across yaws. usage: node scripts/body-strip.mjs <out.png> <presetId> [json overrides] [--zone=torso] [--clip=idle] [--yaws=0,90]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const [out, id, overrides = '{}'] = args;
const preset = JSON.parse(readFileSync(`src/character/presets/${id}.json`, 'utf8'));
const o = JSON.parse(overrides);
const def = { ...preset, ...o, body: { ...preset.body, ...(o.body ?? {}) } };
const yaws = flag('yaws', '0,45,90,135,180,270').split(',').map(Number);
const zone = flag('zone', undefined);
const clip = flag('clip', 'idle');
const time = +flag('time', 1);
const preset2 = flag('preset', 'ps2');
const variants = o.variants ?? [def];
const view = flag('view', undefined);
const hide = flag('hide', '').split(',').filter(Boolean);
const weapon = flag('weapon', undefined);

const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1400, height: 800 });
const frames = [];
const labels = [];
for (const [vi, v] of variants.entries()) {
  const d = vi === 0 && !o.variants ? def : { ...def, ...v, body: { ...def.body, ...(v.body ?? {}) } };
  for (const camYaw of yaws) {
    frames.push({ chars: [d], clip, time, camYaw, zone, backdrop: 'sheet', preset: preset2, view, hide, weapon, pitch: zone ? 3 : undefined });
    labels.push(`${v.label ?? ''} ${camYaw}°`);
  }
}
const size = zone ? { width: 300, height: 300 } : { width: 260, height: 520 };
const url = await page.evaluate(([f, s]) => window.evidence.strip(f, s), [frames, { ...size, labels }]);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
stop();
