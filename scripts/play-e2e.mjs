/**
 * Gameplay end-to-end: drives /play.html like a player (fixed-step), checks the controller state after
 * every step, screenshots each step into docs/evidence/animation/gameplay-<id>.png, fails on any
 * browser error or wrong state.
 * usage: node scripts/play-e2e.mjs [presetId]
 */
import { writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const id = process.argv[2] ?? 'trial-default';
const stop = await ensureServer();
const { browser, page, errors } = await openPage(`/play.html?scripted&id=${id}&preset=clean`, { width: 480, height: 400 });

const set = (patch) => page.evaluate((p) => {
  const i = window.play.input;
  Object.assign(i, p.move ? { ...p, move: { ...i.move, ...p.move } } : p);
}, patch);
const advance = (s) => page.evaluate((x) => window.play.advance(x), s);

const steps = [
  ['walk forward', { move: { x: 0, z: 0.5 } }, 1.5, (s) => s.locomotion === 'walk' && s.position[2] > 0.5],
  ['draw pistol while walking', { weapon: 'pistol' }, 1.6, (s) => s.weapon === 'pistol' && s.upper === 'pistol_idleTwoHand'],
  ['stop and aim', { move: { x: 0, z: 0 }, aim: true }, 0.8, (s) => s.locomotion === 'idle' && s.upper === 'pistol_aimIdle'],
  ['fire three', { fire: true }, 0.7, (s) => s.ammo === 12],
  ['reload', { fire: false, reload: true }, 0.2, (s) => s.upper === 'pistol_reload' && s.locked],
  ['reload completes', { reload: false }, 1.8, (s) => s.upper === 'pistol_aimIdle' && !s.locked && s.ammo === 15],
  ['strafe left aiming', { move: { x: 1, z: 0 } }, 1.2, (s) => s.locomotion === 'walk_W' && s.upper === 'pistol_aimIdle'],
  ['sprint', { aim: false, sprint: true, move: { x: 0, z: 1 } }, 1.2, (s) => s.locomotion === 'sprint' && s.upper === 'pistol_sprint'],
  ['switch to rifle', { sprint: false, move: { x: 0, z: 0 }, weapon: 'rifle' }, 2.2, (s) => s.weapon === 'rifle' && s.upper === 'rifle_idle'],
  ['rifle aim, fire to empty', { aim: true, fire: true }, 4.6, (s) => s.ammo === 0 && ['rifle_aimIdle', 'rifle_dryFire'].includes(s.upper)],
  ['empty reload (pressed during the dry-fire click, buffered)', { fire: false, reload: true }, 0.6, (s) => s.upper === 'rifle_reloadEmpty'],
  ['empty reload completes', { reload: false }, 2.4, (s) => s.ammo === 30 && s.upper === 'rifle_aimIdle'],
  ['crouch walk aiming', { crouch: true, move: { x: 0, z: 0.5 } }, 1.4, (s) => s.locomotion === 'crouchWalk_N' && s.upper === 'rifle_crouchAim'],
  ['stand, switch to smg', { crouch: false, aim: false, move: { x: 0, z: 0 }, weapon: 'smg' }, 2.2, (s) => s.weapon === 'smg' && s.upper === 'smg_idle'],
  ['holster', { weapon: null }, 1.4, (s) => s.weapon === null && s.upper === null],
];

const shots = [];
const failures = [];
for (const [label, patch, seconds, ok] of steps) {
  await set(patch);
  const state = await advance(seconds);
  if (!ok(state)) failures.push(`${label}: ${JSON.stringify(state)}`);
  shots.push({ label, url: await page.evaluate(() => document.querySelector('#view canvas').toDataURL('image/png')) });
}

const sheet = await page.evaluate(async (list) => {
  const imgs = await Promise.all(list.map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s.url; })));
  const cols = 5;
  const w = 320;
  const h = Math.round((imgs[0].height / imgs[0].width) * w);
  const c = document.createElement('canvas');
  c.width = cols * w;
  c.height = Math.ceil(imgs.length / cols) * h;
  const ctx = c.getContext('2d');
  imgs.forEach((img, i) => {
    ctx.drawImage(img, (i % cols) * w, Math.floor(i / cols) * h, w, h);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#000';
    ctx.fillText(list[i].label, (i % cols) * w + 7, Math.floor(i / cols) * h + 17);
    ctx.fillStyle = '#fff';
    ctx.fillText(list[i].label, (i % cols) * w + 6, Math.floor(i / cols) * h + 16);
  });
  return c.toDataURL('image/png');
}, shots);
writeFileSync(`docs/evidence/animation/gameplay-${id}.png`, Buffer.from(sheet.split(',')[1], 'base64'));
await browser.close();
stop();
if (errors.length) failures.push(`browser errors: ${errors.join(' | ')}`);
if (failures.length) {
  console.error(`FAIL ${id}\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`PASS ${id}: ${steps.length} gameplay steps`);
