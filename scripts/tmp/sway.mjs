import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { attachWeapon } from '../../src/weapons/model.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { CharacterController } from '../../src/game/character-controller.js';
import { weaponContact } from '../../src/anim/weapon-audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
for (const w of ['pistol', 'rifle']) {
  const c = buildCharacter(trial); attachWeapon(c, [w], { drawn: null });
  const root = new THREE.Group(); root.add(c);
  const ctl = new CharacterController(c, bakeAllClips(c.userData.layout, { weapons: [w] }), { root });
  const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, weapon: w, aim: false };
  for (let i = 0; i < 75; i++) ctl.update(input, 1/30);
  Object.assign(input, { aim: true, move: { x: 0, z: 0.5 } });
  for (let i = 0; i < 30; i++) ctl.update(input, 1/30);
  let minY = 9, maxY = -9, maxAng = 0, maxL = 0; const f0 = new THREE.Vector3();
  for (let i = 0; i < 60; i++) {
    ctl.update(input, 1/30);
    const k = weaponContact(c);
    const dir = k.forward.clone().applyQuaternion(root.quaternion.clone().invert());
    if (i === 0) f0.copy(dir);
    maxAng = Math.max(maxAng, THREE.MathUtils.radToDeg(dir.angleTo(new THREE.Vector3(0, 0, 1))));
    maxL = Math.max(maxL, k.left); if (w === 'pistol' && i % 6 === 0) console.log(i, (k.left*1000).toFixed(1), 'ik', ctl.animator.supportIK?.toFixed(2), 'upper', ctl.animator.upperName, 'loco', ctl.state.locomotion);
  }
  console.log(w, 'muzzle off-axis max', maxAng.toFixed(1), 'deg; left contact max', (maxL*1000).toFixed(1), 'mm');
}
