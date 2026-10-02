import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { attachWeapon } from '../../src/weapons/model.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { CharacterController } from '../../src/game/character-controller.js';
import { weaponContact } from '../../src/anim/weapon-audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
for (const w of ['pistol','rifle','smg']) {
  const c = buildCharacter(trial); attachWeapon(c, [w]);
  const root = new THREE.Group(); root.add(c);
  const ctl = new CharacterController(c, bakeAllClips(c.userData.layout, { weapons: [w] }), { root });
  const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, weapon: w, aim: false };
  for (let i = 0; i < 70; i++) ctl.update(input, 1/30);
  const out = [];
  for (const [yaw, pitch] of [[0,0],[20,0],[-30,0],[44,0],[-44,0],[0,20],[0,-25],[30,30],[-40,-35]]) {
    Object.assign(input, { aim: true, cameraYaw: THREE.MathUtils.degToRad(yaw), aimPitch: pitch });
    for (let i = 0; i < 25; i++) ctl.update(input, 1/30);
    const k = weaponContact(c);
    out.push(`${yaw}/${pitch}: L${(k.left*1000).toFixed(0)} R${(k.right*1000).toFixed(0)}`);
  }
  console.log(w, out.join('  '));
}
