/**
 * Renders the review evidence into docs/evidence/:
 *   turnaround-<id>.png     front / side / three-quarter / back (like the source sheets)
 *   closeup-<id>.png        face at close range + gameplay distance + three-quarter
 *   anim-<clip>.png         4-frame filmstrip of every preset for each clip
 *   stress-<id>.png         deformation stress poses (shoulders, elbows, hips, knees, neck)
 *   lighting-<id>.png       same character under each backdrop / post preset
 *   menu.png                character-select presentation
 *   benchmark.json          frame timing with 30 animated characters (see caveat in README)
 *   index.html              gallery page linking everything above
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const OUT = 'docs/evidence';
const presetDir = 'src/character/presets';
const ids = readdirSync(presetDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${presetDir}/${f}`, 'utf8')).id);
const only = process.argv.includes('--quick');

mkdirSync(OUT, { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 1376, height: 768 });
const written = [];

function savePng(name, dataUrl) {
  writeFileSync(`${OUT}/${name}`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  written.push(name);
}

async function stripTo(name, frames, opts) {
  savePng(name, await page.evaluate(([f, o]) => window.evidence.strip(f, o), [frames, opts]));
}

for (const id of ids) {
  await page.evaluate((o) => window.evidence.render(o), { chars: [id], layout: 'turnaround', width: 1376, height: 768 });
  await page.screenshot({ path: `${OUT}/turnaround-${id}.png` });
  written.push(`turnaround-${id}.png`);

  await stripTo(`closeup-${id}.png`, [
    { chars: [id], framing: 'close', clip: 'idle', time: 0.4 },
    { chars: [id], framing: 'close', clip: 'idle', time: 0.4, camYaw: 35 },
    { chars: [id], framing: 'close', clip: 'idle', time: 0.4, camYaw: 90 },
    { chars: [id], framing: 'full', clip: 'idle', time: 0.4, preset: 'ps2', backdrop: 'street' },
  ], { width: 420, height: 480, labels: ['close front', 'close 3/4', 'close side', 'gameplay distance'] });

  if (only) continue;
  await stripTo(`stress-${id}.png`, [
    { chars: [id], framing: 'full', clip: 'crouch', time: 1.2, camYaw: 30 },
    { chars: [id], framing: 'full', clip: 'cheer', time: 0.4, camYaw: 20 },
    { chars: [id], framing: 'full', clip: 'wave', time: 0.5, camYaw: -25 },
    { chars: [id], framing: 'full', clip: 'jump', time: 0.85, camYaw: 60 },
    { chars: [id], framing: 'full', clip: 'walk', time: 0.28, camYaw: 90 },
    { chars: [id], framing: 'full', clip: 'lookAround', time: 1, camYaw: 0 },
  ], { width: 360, height: 560, labels: ['crouch', 'cheer (arms up)', 'wave', 'jump apex', 'walk stride', 'head turn'] });

  await stripTo(`lighting-${id}.png`, [
    { chars: [id], backdrop: 'sheet', clip: 'idle', time: 1 },
    { chars: [id], backdrop: 'menu', preset: 'menu', clip: 'idle', time: 1 },
    { chars: [id], backdrop: 'street', clip: 'idle', time: 1, camYaw: 25 },
    { chars: [id], backdrop: 'store', clip: 'idle', time: 1, camYaw: 160 },
    { chars: [id], backdrop: 'dusk', clip: 'idle', time: 1, camYaw: -30 },
    { chars: [id], backdrop: 'street', preset: 'ps1', clip: 'idle', time: 1, camYaw: 25 },
  ], { width: 360, height: 560, labels: ['sheet', 'menu', 'street', 'store', 'dusk', 'ps1 preset'] });
}

if (!only) {
  const clips = { idle: [0, 1, 2, 3], walk: [0, 0.275, 0.55, 0.825], turn: [0.2, 0.6, 1.4, 2.6], crouch: [0, 0.5, 0.9, 1.6], jump: [0.25, 0.55, 0.85, 1.3], wave: [0, 0.25, 0.5, 0.75], shrug: [0, 0.5, 0.9, 1.4], cheer: [0, 0.2, 0.4, 0.6] };
  for (const [clip, times] of Object.entries(clips)) {
    await stripTo(`anim-${clip}.png`, times.map((time) => ({ chars: ids, layout: 'lineup', clip, time, camYaw: clip === 'walk' ? 30 : 0, spacing: ['jump', 'cheer'].includes(clip) ? 1.25 : 0.95 })), {
      width: 520, height: 420, labels: times.map((t) => `${clip} t=${t.toFixed(2)}s`),
    });
  }
  await page.evaluate((o) => window.evidence.render(o), { chars: [ids[0]], backdrop: 'menu', preset: 'menu', clip: 'idle', time: 1, width: 900, height: 900 });
  await page.screenshot({ path: `${OUT}/menu.png`, clip: { x: 0, y: 0, width: 900, height: 900 } });
  written.push('menu.png');

  const bench = await page.evaluate(() => window.evidence.benchmark({ count: 30 }));
  writeFileSync(`${OUT}/benchmark.json`, JSON.stringify({ ...bench, renderer: 'headless Chromium + SwiftShader (CPU); real GPUs are far faster' }, null, 2));
  console.log('benchmark', bench);
}

const images = readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('tmp'));
const html = `<!doctype html><meta charset="utf-8"><title>Character Evidence</title>
<style>body{background:#16161c;color:#ddd;font:14px monospace;margin:24px}img{max-width:100%;image-rendering:pixelated;display:block;margin:6px 0 28px;border:1px solid #333}h2{color:#e6d34a;font-size:15px}</style>
<h1>Character evidence — generated by scripts/render-evidence.mjs</h1>
${images.map((f) => `<h2>${f}</h2><img src="${f}" alt="${f}">`).join('\n')}`;
writeFileSync(`${OUT}/index.html`, html);
console.log(`wrote ${written.length} images to ${OUT}`);
if (errors.length) console.log(`Browser errors:\n${errors.join('\n')}`);
await browser.close();
stop();
