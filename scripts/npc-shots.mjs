/**
 * NPC & dialogue evidence: drives npc.html (scripted) through an ambient view, a conversation
 * (two-shot, over-the-shoulder with choices, reverse shot) and weapon reactions, plus a contact sheet
 * of the npc_* social clips. Writes docs/npc/evidence/*.png.
 * usage: node scripts/npc-shots.mjs   (THEMOVE_URL / CHROMIUM_PATH as for the other scripts)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const outDir = 'docs/npc/evidence';
mkdirSync(outDir, { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/npc.html?scripted', { width: 960, height: 540 });
const shot = async (name) => {
  await page.waitForTimeout(600); // let the HUD's CSS transitions (letterbox) settle
  writeFileSync(`${outDir}/${name}.png`, await page.screenshot({ timeout: 120000 }));
};
const run = (fn, arg) => page.evaluate(fn, arg);
const states = () => run(() => window.npcDemo.summary().map((s) => `${s.id}:${s.state}`).join(' '));

// Ambient: scenario idles (wall lean, phone), a paired chat with barks.
await run(() => {
  const d = window.npcDemo;
  d.teleport(9.6, -4.4, 0.2);
  d.camera.yaw = 0.5;
  d.camera.dist = 4.4;
  d.camera.pitch = 12;
  d.advance(3);
});
await shot('01-ambient');
console.log('ambient', await states());

// Conversation with Dana: establishing two-shot → OTS with the choice list → reverse on the player.
await run(() => {
  const d = window.npcDemo;
  d.teleport(8.6, -2.2, 0);
  d.camera.yaw = -0.9;
  d.camera.dist = 3.6;
  d.advance(1.2);
  d.talk('dana');
  d.advance(1.6);
});
await shot('02-dialogue-two-shot');
await run(() => {
  const d = window.npcDemo;
  for (let i = 0; i < 200 && d.director.step?.kind !== 'choice'; i++) d.advance(0.1);
});
await shot('03-dialogue-ots-choices');
await run(() => {
  const d = window.npcDemo;
  d.director.choose(0);
  d.advance(0.9);
});
await shot('04-dialogue-reverse');
await run(() => {
  const d = window.npcDemo;
  for (let i = 0; i < 300 && d.director.step?.kind !== 'choice'; i++) d.advance(0.1);
  d.director.handleKey('KeyH');
  d.advance(0.2);
});
await shot('05-dialogue-hub-locked-log');
await run(() => {
  const d = window.npcDemo;
  d.director.handleKey('KeyH');
  d.director.stop({ reason: 'evidence' });
  d.advance(1.5);
});

// Reactions: draw near the chatting pair, aim (hands up), fire (flee / cower / crew squares up).
await run(() => {
  const d = window.npcDemo;
  d.teleport(10.4, -4.6, 0.15);
  d.camera.yaw = 0.55;
  d.camera.dist = 4.2;
  d.camera.pitch = 12;
  d.advance(1.5);
  d.input.weapon = 'pistol';
  d.advance(1.2);
  d.input.aim = true;
  d.input.cameraYaw = 0.12;
  d.advance(1.8);
});
await shot('06-reaction-aimed');
console.log('aimed', await states());
await run(() => {
  const d = window.npcDemo;
  d.input.fire = true;
  d.advance(0.25);
  d.input.fire = false;
  d.input.aim = false;
  d.camera.yaw = 0.3;
  d.camera.pitch = 28;
  d.camera.dist = 8;
  d.setDebug(true);
  d.advance(1.6);
});
await shot('07-reaction-gunfire-debug');
console.log('gunfire', await states());

// Social clip contact sheet (two frames per clip) rendered in an overlay stage.
const sheet = await run(async () => {
  const [{ Stage }, { buildCharacter }, { PRESETS_BY_ID }, social] = await Promise.all([
    import('/src/render/stage.js'), import('/src/character/build.js'), import('/src/character/presets/index.js'), import('/src/anim/social-clips.js'),
  ]);
  const W = 150;
  const H = 230;
  const div = document.createElement('div');
  div.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:99`;
  document.body.appendChild(div);
  const stage = new Stage(div, { width: W, height: H, backdrop: 'sheet', preset: 'ps2' });
  const ch = buildCharacter(PRESETS_BY_ID['sheet-05-curly-denim']);
  const e = stage.add(ch, { yaw: 0.45 });
  Object.assign(e.clips, social.bakeSocialClips(ch.userData.layout));
  const names = social.SOCIAL_CLIP_NAMES;
  const cols = 8;
  const rows = Math.ceil((names.length * 2) / cols);
  const c = document.createElement('canvas');
  c.width = W * cols;
  c.height = H * rows;
  const g = c.getContext('2d');
  g.font = '11px Courier New';
  let i = 0;
  for (const n of names) {
    const clip = e.clips[n];
    for (const f of [0.3, 0.62]) {
      stage.play(e, n, { time: clip.duration * f });
      stage.update(0);
      stage.frame({ height: 2.05, yaw: 0, pitch: 4 });
      stage.render();
      const x = (i % cols) * W;
      const y = Math.floor(i / cols) * H;
      g.drawImage(stage.renderer.domElement, x, y);
      g.fillStyle = '#000';
      g.fillText(`${n.replace('npc_', '')} ${f}`, x + 4, y + 12);
      i += 1;
    }
  }
  div.remove();
  return c.toDataURL('image/png');
});
writeFileSync(`${outDir}/08-social-clips.png`, Buffer.from(sheet.split(',')[1], 'base64'));
console.log(JSON.stringify({ errors: errors.filter((e) => !e.includes('404')) }));
await browser.close();
stop();
