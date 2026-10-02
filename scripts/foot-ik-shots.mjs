/**
 * Foot IK evidence: the character straddling the 15 cm step edge and standing on the ramp in the
 * playground, with and without foot IK. Output: docs/evidence/animation/foot-ik.png
 */
import { writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const stop = await ensureServer();
const { browser, page, errors } = await openPage('/play.html?scripted&preset=clean', { width: 420, height: 420 });
const shots = [];
for (const [label, setup] of [
  ['step edge, foot IK', { x: 0, z: 2.97, facing: Math.PI / 2, camYaw: -Math.PI / 2, ik: true }],
  ['step edge, no IK', { x: 0, z: 2.97, facing: Math.PI / 2, camYaw: -Math.PI / 2, ik: false }],
  ['ramp, foot IK', { x: 0, z: 10, facing: 0, camYaw: Math.PI / 2, ik: true }],
  ['ramp, no IK', { x: 0, z: 10, facing: 0, camYaw: Math.PI / 2, ik: false }],
]) {
  await page.evaluate((s) => {
    const { controller, camera } = window.play;
    controller.root.position.set(s.x, 0, s.z);
    controller.facing = s.facing;
    camera.yaw = s.camYaw;
    camera.pitch = 4;
    camera.dist = 1.5;
    camera.height = 0.3;
    camera.shoulder = 0;
    controller.animator.setGround(s.ik ? controller.ground : null);
    controller.root.position.y = controller.ground(s.x, s.z);
  }, setup);
  await page.evaluate(() => window.play.advance(1.2));
  shots.push({ label, url: await page.evaluate(() => document.querySelector('#view canvas').toDataURL('image/png')) });
}
const sheet = await page.evaluate(async (list) => {
  const imgs = await Promise.all(list.map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s.url; })));
  const c = document.createElement('canvas');
  c.width = imgs.length * 420;
  c.height = 420;
  const ctx = c.getContext('2d');
  imgs.forEach((img, i) => {
    ctx.drawImage(img, i * 420, 0, 420, 420);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#000';
    ctx.fillText(list[i].label, i * 420 + 9, 21);
    ctx.fillStyle = '#fff';
    ctx.fillText(list[i].label, i * 420 + 8, 20);
  });
  return c.toDataURL('image/png');
}, shots);
writeFileSync('docs/evidence/animation/foot-ik.png', Buffer.from(sheet.split(',')[1], 'base64'));
if (errors.length) console.log(errors.join('\n'));
await browser.close();
stop();
