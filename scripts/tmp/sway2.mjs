import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../../src/character/build.js';
import { attachWeapon } from '../../src/weapons/model.js';
import { bakeAllClips } from '../../src/anim/clips.js';
import { CharacterController } from '../../src/game/character-controller.js';
import { weaponContact } from '../../src/anim/weapon-audit.js';
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
const c = buildCharacter(trial); attachWeapon(c, ['pistol'], { drawn: null });
const root = new THREE.Group(); root.add(c);
const ctl = new CharacterController(c, bakeAllClips(c.userData.layout, { weapons: ['pistol'] }), { root });
const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, weapon: 'pistol', aim: false };
for (let i = 0; i < 75; i++) ctl.update(input, 1/30);
Object.assign(input, { aim: true, move: { x: 0, z: 0.5 } });
for (let i = 0; i < 90; i++) { ctl.update(input, 1/30); if (i % 15 === 0) console.log(i, (weaponContact(c).left*1000).toFixed(1), 'facing', ctl.facing.toFixed(3), 'compass', ctl.moveCompass); }
