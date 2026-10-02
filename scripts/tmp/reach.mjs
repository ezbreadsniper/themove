import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { attachWeapon } from '../../src/weapons/model.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { CharacterController } from '../../src/game/character-controller.js';
import { weaponContact, handGripWorld } from '../../src/anim/weapon-audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const c = buildCharacter(trial); attachWeapon(c, ['pistol'], { drawn: null });
const root = new THREE.Group(); root.add(c);
const ctl = new CharacterController(c, bakeAllClips(c.userData.layout, { weapons: ['pistol'] }), { root });
const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, weapon: 'pistol', aim: false };
const report = (label) => {
  c.updateMatrixWorld(true);
  const b = (n) => c.userData.rig.bones.find((x) => x.name.endsWith(n)).getWorldPosition(new THREE.Vector3());
  const sup = c.userData.weapon.models.pistol.getObjectByName('socket_support').getWorldPosition(new THREE.Vector3());
  const L = c.userData.layout;
  console.log(label, 'shoulder->support', b('LeftArm').distanceTo(sup).toFixed(3), 'reach', (L.measures.upperArm + L.measures.foreArm).toFixed(3), 'contact', (weaponContact(c).left * 1000).toFixed(1), 'hips y', b('Hips').y.toFixed(3), 'shoulderL', b('LeftArm').toArray().map(v=>v.toFixed(3)).join(','));
};
for (let i = 0; i < 75; i++) ctl.update(input, 1/30);
Object.assign(input, { aim: true, move: { x: 0, z: 0.5 } });
for (let i = 0; i < 60; i++) { ctl.update(input, 1/30); if (i % 10 === 0) { report('t' + i); console.log('   upper', ctl.animator.upperName, 'locked', !!ctl.animator.locked, 'acts', ctl.animator.mixer._actions.filter(a=>a.getEffectiveWeight()>0.01).map(a=>a.getClip().name+':'+a.getEffectiveWeight().toFixed(2)).join(' ')); } }
