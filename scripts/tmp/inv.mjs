import { CLIP_NAMES, WEAPON_CLIP_NAMES, clipsForWeapon } from '../../src/anim/clips.js';
console.log('base', CLIP_NAMES.length); console.log(CLIP_NAMES.join(', '));
for (const w of ['pistol','rifle','smg']) console.log(w, clipsForWeapon(w).length);
