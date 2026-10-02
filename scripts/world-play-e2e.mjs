// In-world gameplay run: spawn on Foundry St., push through the street door, walk the hall and the
// corridor, push open the loft door, climb the spiral stair, come back down and sit on the sofa.
// Asserts movement / door / seat state at each stage and saves screenshots to docs/game/evidence/.
// Usage: node scripts/world-play-e2e.mjs [presetId]   (THEMOVE_URL to reuse a running dev server)
import { mkdirSync, writeFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';

const id = process.argv[2] ?? 'trial-default';
const OUT = 'docs/game/evidence';
mkdirSync(OUT, { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage(`/world.html?scripted&id=${id}&rays=12`, { width: 960, height: 540 });

const g = (fn, ...args) => page.evaluate(fn, ...args);
const failures = [];
const log = [];
const check = (label, ok, state) => {
  log.push(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(`${label}: ${JSON.stringify(state)}`);
};
const shot = async (name) => {
  await g(() => window.game.step(1 / 30));
  const url = await g(() => document.querySelector('#view canvas').toDataURL('image/png'));
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
};
/** Runs the autopilot until it finishes (or `seconds` pass), sampling `probe` every 0.25 s. */
const walk = async (points, { speed = 1, seconds = 30, probe = null, until = null } = {}) => {
  await g(([p, s]) => window.game.autopilot(p, { speed: s }), [points, speed]);
  const samples = [];
  for (let t = 0; t < seconds; t += 0.25) {
    const s = await g(() => window.game.advance(0.25));
    if (probe) samples.push(await g(probe));
    if (until && (await g(until))) break;
    if (s.autopilot === 'done' || s.autopilot.startsWith('stuck')) return { s, samples };
  }
  return { s: await g(() => window.game.snapshot()), samples };
};
const doorAngle = (name) => `Math.abs(window.game.door('${name}').angle)`;

// 1. Spawn on the sidewalk.
let s = await g(() => window.game.advance(0.5));
check('spawned grounded on the sidewalk', s.grounded && Math.abs(s.feet[1]) < 0.02, s);
await shot('01-street-spawn');

// 2. Walk into the street door: the leaf is pushed open by contact (no E), the player ends up in the hall.
let r = await walk([[4.6, 0, -0.9], [4.6, 0.1, 0.25]], { probe: new Function(`return ${doorAngle('door-street')}`) });
await shot('02-pushing-street-door');
r = await walk([[4.6, 0.1, 2.2]], { probe: new Function(`return ${doorAngle('door-street')}`) });
check('street door swung open from the push', Math.max(...r.samples) > 0.9, r.samples);
check('through the street door into the hall', r.s.feet[2] > 1.8 && Math.abs(r.s.feet[1] - 0.1) < 0.02, r.s);
await g(() => window.game.advance(5));
check('street door swung back and latched', (await g(() => window.game.door('door-street'))).latched, await g(() => window.game.door('door-street')));

// 3. Hall → corridor → loft door (walking pace), pushing it open.
r = await walk([[4.6, 0.1, 12.4], [11.75, 0.1, 12.45], [11.75, 0.1, 11.9]], { speed: 0.5 });
check('reached the loft door along the corridor', r.s.autopilot === 'done', r.s);
r = await walk([[11.75, 0.1, 11.2]], { speed: 0.5, probe: new Function(`return ${doorAngle('door-unit')}`) });
await shot('03-loft-door');
r = await walk([[11.75, 0.1, 10.2], [12.0, 0.1, 7.6], [12.0, 0.1, 6.85]], { speed: 0.5, probe: new Function(`return ${doorAngle('door-unit')}`) });
check('loft door pushed open at walking pace', Math.max(...r.samples) > 0.7, r.samples);
check('in the loft at the stair foot', r.s.autopilot === 'done' && r.s.feet[2] < 7.2, r.s);

// 4. Spiral stair: climb toward the mezzanine on the helix.
const helix = (from, to, step, radius = 0.6) => {
  const pts = [];
  for (let a = from; step < 0 ? a >= to : a <= to; a += step) {
    const rad = (a * Math.PI) / 180;
    pts.push([11.4 + Math.cos(rad) * radius, 0, 6.5 + Math.sin(rad) * radius]);
  }
  return pts;
};
r = await walk(helix(-12, -232, -22), { speed: 0.5, probe: () => window.game.snapshot().feet[1] });
check('climbed the spiral stair (feet above 2.3 m)', r.s.feet[1] > 2.3, r.s);
const ys = r.samples;
const drops = ys.slice(1).filter((y, i) => y < ys[i] - 0.05).length;
check('stair climb is monotonic (no fall-backs)', drops === 0, ys);
await shot('04-spiral-stair');
// Is the landing reachable? (geometry note: see docs/game/README.md)
const top = await walk([...helix(-245, -262, -17), [11.95, 3.1, 7.25], [11.95, 3.1, 8.4]], { speed: 0.4, seconds: 8 });
log.push(`info stair top: ${top.s.autopilot} feet ${top.s.feet}`);

// 5. Back down and over to the sofa.
const down = helix(Math.round((Math.atan2(top.s.feet[2] - 6.5, top.s.feet[0] - 11.4) * 180) / Math.PI) - 360, -12, 22).filter((p) => p);
r = await walk([...down, [12.1, 0.1, 6.9], [12.85, 0.1, 6.8], [12.85, 0.1, 5.0], [13.1, 0.1, 4.0], [13.35, 0.1, 2.6]], { speed: 0.5, seconds: 40 });
check('came back down to the loft floor', Math.abs(r.s.feet[1] - 0.1) < 0.02, r.s);
await g(() => window.game.look(Math.PI * 0.95, 0.25));
s = await g(() => window.game.advance(0.3));
check('sofa seat in focus with a Sit prompt', s.focus?.kind === 'seat' && s.focus.prompt === 'Sit', s);
await g(() => { window.game.input.interact = true; });
s = await g(() => window.game.advance(3.5));
check('seated on the sofa', s.seated === 'seated', s);
await g(() => window.game.look(window.game.controller.facing + Math.PI - 0.55, 0.18));
await g(() => window.game.advance(0.6));
await shot('05-seated-sofa');
await g(() => { window.game.input.interact = true; });
s = await g(() => window.game.advance(2));
check('stood back up and can move', s.seated === null && s.grounded, s);

// 6. Jump: leaves the ground and lands.
await g(() => { window.game.input.jump = true; });
const air = await g(() => window.game.advance(0.25));
s = await g(() => window.game.advance(1.2));
check('jump leaves the ground and lands', !air.grounded && s.grounded, { air, s });

const events = await g(() => window.game.events.log.map((e) => e.type));
check('perception events emitted (interact, collide)', events.includes('player:interact') && events.includes('player:collide'), [...new Set(events)]);
if (errors.filter((e) => !/404/.test(e)).length) failures.push(`browser errors: ${errors.join(' | ')}`);
await browser.close();
stop();
console.log(log.join('\n'));
if (failures.length) {
  console.error(`FAIL ${id}\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`PASS ${id}: world walk-through`);
