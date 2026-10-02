import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { attachWeapon } from '../../src/weapons/model.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { Animator } from '../../src/anim/animator.js';
import { weaponContact } from '../../src/anim/weapon-audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const W = process.argv[2] ?? 'pistol';
const c = buildCharacter(trial); attachWeapon(c, W);
const clips = bakeAllClips(c.userData.layout, { weapons: [W] });
const anim = new Animator(c, clips);
const bones = c.userData.rig.bones;
const prev = bones.map((b) => b.quaternion.clone());
const P = W === 'pistol' ? { draw: 'pistol_draw', aim: 'pistol_aimIdle', ready: 'pistol_idleTwoHand', walkAim: 'pistol_walkAim', reload: 'pistol_reload', recoil: 'pistol_recoil', stow: 'pistol_unequip', sprint: 'pistol_sprint' }
  : { draw: `${W}_equip`, aim: `${W}_aimIdle`, ready: `${W}_idle`, walkAim: `${W}_walkAim`, reload: `${W}_reload`, recoil: `${W}_recoil`, stow: `${W}_unequip`, sprint: `${W}_sprint` };
const script = [
  [0, (a) => a.locomotion('idle')],
  [1, (a) => a.locomotion('walk')],
  [2, (a) => a.play(P.draw, { then: P.aim })],
  [3.4, (a) => a.additive(P.recoil)], [3.6, (a) => a.additive(P.recoil)], [3.8, (a) => a.additive(P.recoil)],
  [4.2, (a) => a.play(P.reload)],
  [4.6, (a) => ({ ignored: !a.additive(P.recoil) })],
  [6.2, (a) => a.play(P.walkAim)],
  [7.5, (a) => a.locomotion('run')],
  [8.5, (a) => { a.locomotion('sprint'); a.play(P.sprint); }],
  [9.5, (a) => a.locomotion('walk')],
  [9.6, (a) => a.play(P.stow, { then: null })],
  [11, (a) => a.locomotion('idle')],
];
const dt = 1 / 30;
let worstJump = 0, worstAt = 0, worstBone = '';
const contact = { maxL: 0, maxR: 0, at: 0 };
let si = 0;
for (let t = 0; t < 12.5; t += dt) {
  while (si < script.length && script[si][0] <= t + 1e-9) { const r = script[si][1](anim); if (r?.ignored !== undefined) console.log('fire during reload ignored:', r.ignored); si++; }
  anim.update(dt);
  { const wl = anim.mixer._actions.find(a=>a.getClip().name==='walk@lower'); if (wl) { const w = wl.getEffectiveWeight(); if (globalThis.__lw !== undefined && Math.abs(w-globalThis.__lw) > 0.2) console.log('walk@lower', globalThis.__lw.toFixed(2),'->',w.toFixed(2),'at',t.toFixed(2)); globalThis.__lw = w; } }
  c.updateMatrixWorld(true);
  bones.forEach((b, i) => {
    const d = THREE.MathUtils.radToDeg(b.quaternion.angleTo(prev[i]));
    if (t > dt && d > worstJump) { worstJump = d; worstAt = t; worstBone = b.name; }
    prev[i].copy(b.quaternion);
  });
  const twoHand = anim.upperName && !/sprint|unequip|switch/.test(anim.upperName) && anim.upper?.getEffectiveWeight() === 1 && !anim.locked;
  if (twoHand) {
    const k = weaponContact(c);
    if (k.left > 0.05 && !contact.dumped) { contact.dumped = true; console.log('t', t.toFixed(2), anim.mixer._actions.filter(a=>a.isRunning()||a.getEffectiveWeight()>0).map(a=>`${a.getClip().name} w${a.getEffectiveWeight().toFixed(2)} t${a.time.toFixed(2)} run${a.isRunning()}`).join(' | ')); }
    if (k.left > contact.maxL) { contact.maxL = k.left; contact.at = t; contact.clip = anim.upperName; }
    contact.maxR = Math.max(contact.maxR, k.right);
  }
}
console.log(`${W}: worst per-frame joint change ${worstJump.toFixed(1)} deg at ${worstAt.toFixed(2)}s (${worstBone}); settled two-hand contact L ${(contact.maxL*1000).toFixed(1)} mm (${contact.clip} @${contact.at.toFixed(2)}) R ${(contact.maxR*1000).toFixed(1)} mm; final upper=${anim.upperName}`);
