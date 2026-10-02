import * as THREE from 'three';
import { Stage } from '../render/stage.js';
import { buildCharacter } from '../character/build.js';
import { PRESETS_BY_ID } from '../character/presets/index.js';
import { attachWeapon } from '../weapons/model.js';
import { bakeAllClips } from '../anim/clips.js';
import { SEATS } from '../anim/action-clips.js';
import { CharacterController } from '../game/character-controller.js';
import { SmokeEmitter } from '../render/smoke.js';

/**
 * Animation playground: one character, all three weapons, the gameplay controller and a follow camera.
 * window.play exposes the input and a fixed-step clock so tests drive it like a player.
 *
 * PlayController shows how the new clips hook into the gameplay controller without changing it (the
 * game's controller should grow the same hooks): one-time actions arrive as input.action and map to
 * upper-body one-shots (Animator.play) or full-body one-shots (Animator.oneShot); smoking and sitting
 * are states that change what locomotionFor / upperFor return.
 */
class PlayController extends CharacterController {
  constructor(...args) {
    super(...args);
    this.smoking = false;
    this.seat = null;
    this.punch = 0;
  }

  locomotionFor(input) {
    if (this.seat) return this.seat === 'chair' ? 'sitIdle' : `sitIdle_${this.seat}`;
    const loco = super.locomotionFor(input);
    // Standing still with a cigarette: the full-body smoking loop (weight shifts, breathing).
    return this.smoking === true && !this.weapon && loco === 'idle' ? 'smoke' : loco;
  }

  upperFor(input) {
    // Walking with a cigarette: the smoking arm over the gait.
    if (this.smoking === true && !this.weapon && this.state.locomotion !== 'smoke' && !this.seat) return 'smoke';
    return super.upperFor(input);
  }

  /** Base loop change outside update() (sit / stand), keeping the controller's bookkeeping in step. */
  setBase(name) {
    this.state.locomotion = name;
    this.animator.locomotion(name);
  }

  action(name) {
    const a = this.animator;
    if (a.locked || a.full) return false;
    const w = this.weapon;
    if (name === 'inspect' && w) return !!a.play(`${w}_inspect`);
    if (name === 'melee') {
      if (w) return !!a.play(`${w}_melee`);
      this.punch = (this.punch + 1) % 2;
      return !!a.play(this.punch ? 'melee_jab' : 'melee_cross', { then: null });
    }
    if (name === 'kick' && !w) return !!a.oneShot('melee_kick');
    if (name === 'smoke' && !w && !this.seat) {
      if (!this.smoking) {
        this.smoking = 'lighting';
        a.play('smoke_light', { then: null });
      } else if (this.smoking === true) {
        this.smoking = false;
        a.play('smoke_flick', { then: null });
      }
      return true;
    }
    if (name === 'smokeDrop' && this.smoking === true) {
      this.smoking = false;
      a.play('smoke_drop', { then: null });
      return true;
    }
    if (name === 'sit' || name === 'sitSofa') {
      if (this.seat) {
        const stand = this.seat === 'chair' ? 'standUp' : `standUp_${this.seat}`;
        this.seat = null;
        this.setBase('idle');
        a.oneShot(stand);
      } else if (!w) {
        this.smoking = false;
        this.seat = name === 'sit' ? 'chair' : 'sofa';
        if (a.upper) a.release();
        const sfx = this.seat === 'chair' ? '' : `_${this.seat}`;
        this.setBase(`sitIdle${sfx}`);
        a.oneShot(`sitDown${sfx}`);
      }
      return true;
    }
    const upper = { switch: 'pressSwitch', door: 'pushDoor' }[name];
    if (upper && !w) return !!a.play(upper, { then: null });
    const full = { pickup: 'pickUp', landSoft: 'land_soft', landHard: 'land_hard' }[name];
    if (full) return !!a.oneShot(full);
    if (name === 'look' && !w) return !!a.play('lookAround', { then: null });
    return false;
  }

  update(input, dt) {
    if (input.action) {
      this.action(input.action);
      input.action = null;
    }
    // Lighting finished: the loop takes over from its first frame.
    if (this.smoking === 'lighting' && !this.animator.locked) this.smoking = true;
    if (this.seat) input = { ...input, move: { x: 0, z: 0 }, sprint: false, crouch: false, aim: false, fire: false };
    super.update(input, dt);
  }
}

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? 'trial-default';
const container = document.getElementById('view');
const stage = new Stage(container, { width: window.innerWidth, height: window.innerHeight });
stage.setBackdrop('street');
stage.setPreset(params.get('preset') ?? 'ps2');

// The player carries a cigarette (shown only while smoking) and all three weapons.
const def = PRESETS_BY_ID[id];
const character = buildCharacter({ ...def, accessories: [...def.accessories.filter((a) => a.type !== 'cigarette'), { type: 'cigarette' }] });
const weapons = ['pistol', 'rifle', 'smg'];
attachWeapon(character, weapons, { drawn: null });
const entry = stage.add(character);
// The stage would drive its own emitter from its own mixer; the game drives this one from the Animator.
entry.smoke?.dispose();
entry.smoke = null;
const clips = bakeAllClips(character.userData.layout, { weapons });
/**
 * Test course: a 15 cm step (z 3..6), a ramp rising 0.6 m (z 8..12) and a raised pad beside the start
 * (x 1.2..2.4, 0.3 m). ground(x, z) is what the controller and foot IK stand on.
 */
const COURSE = [
  { box: [-1.5, 3, 1.5, 6], y: 0.15 },
  { ramp: [-1.5, 8, 1.5, 12], y0: 0, y1: 0.6 },
  { box: [-1.5, 12, 1.5, 15], y: 0.6 },
  { box: [1.2, -1, 2.4, 1], y: 0.3 },
];
function ground(x, z) {
  let h = 0;
  for (const c of COURSE) {
    const [x0, z0, x1, z1] = c.box ?? c.ramp;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    h = Math.max(h, c.box ? c.y : c.y0 + ((z - z0) / (z1 - z0)) * (c.y1 - c.y0));
  }
  return h;
}
for (const c of COURSE) {
  const [x0, z0, x1, z1] = c.box ?? c.ramp;
  const mat = new THREE.MeshLambertMaterial({ color: c.box ? '#8d8a80' : '#7d8a86' });
  if (c.box) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, c.y, z1 - z0), mat);
    mesh.position.set((x0 + x1) / 2, c.y / 2, (z0 + z1) / 2);
    stage.scene.add(mesh);
  } else {
    const len = Math.hypot(z1 - z0, c.y1 - c.y0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.04, len), mat);
    mesh.position.set((x0 + x1) / 2, (c.y0 + c.y1) / 2 - 0.02, (z0 + z1) / 2);
    mesh.rotation.x = -Math.atan2(c.y1 - c.y0, z1 - z0);
    stage.scene.add(mesh);
  }
}
const controller = new PlayController(character, clips, { root: entry.holder, ground });
const smoke = new SmokeEmitter(stage.scene, character, { autoHide: true, animator: controller.animator });

/** A seat appears under the character when it sits (chair: a stool; sofa: a seat block with a back). */
const seatMesh = new THREE.Group();
stage.scene.add(seatMesh);
function placeSeat() {
  seatMesh.clear();
  if (!controller.seat) return;
  const s = SEATS[controller.seat];
  const k = character.userData.layout.measures.height / 1.78;
  const mat = new THREE.MeshLambertMaterial({ color: controller.seat === 'chair' ? '#6b4f36' : '#3d3f52' });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, s.height, 0.45), mat);
  seat.position.set(0, s.height / 2, -s.hipsBack * k - 0.03);
  seatMesh.add(seat);
  if (controller.seat === 'sofa') {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.18), mat);
    back.position.set(0, 0.4, -s.hipsBack * k - 0.3);
    seatMesh.add(back);
  }
  seatMesh.position.copy(entry.holder.position);
  seatMesh.rotation.y = controller.facing;
}

const input = { move: { x: 0, z: 0 }, cameraYaw: 0, aimPitch: 0, sprint: false, crouch: false, aim: false, fire: false, reload: false, weapon: null, action: null };
const keys = new Set();
const camera = { yaw: 0, pitch: 12, dist: 3.4, height: 1.45, shoulder: 0.45 };
const ACTION_KEYS = { KeyV: 'inspect', KeyQ: 'melee', KeyK: 'kick', KeyG: 'smoke', KeyH: 'smokeDrop', KeyE: 'sit', KeyB: 'sitSofa', KeyT: 'switch', KeyY: 'door', KeyP: 'pickup', KeyL: 'look', KeyJ: 'landSoft', KeyN: 'landHard' };

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyC') input.crouch = !input.crouch;
  if (e.code === 'Digit1') input.weapon = 'pistol';
  if (e.code === 'Digit2') input.weapon = 'rifle';
  if (e.code === 'Digit3') input.weapon = 'smg';
  if (e.code === 'Digit0') input.weapon = null;
  if (ACTION_KEYS[e.code] && !e.repeat) input.action = ACTION_KEYS[e.code];
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => { if (e.button === 2) input.aimMouse = true; if (e.button === 0) input.fireMouse = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) input.aimMouse = false; if (e.button === 0) input.fireMouse = false; });
addEventListener('mousemove', (e) => {
  if (!e.buttons) return;
  camera.yaw -= e.movementX * 0.005;
  camera.pitch = THREE.MathUtils.clamp(camera.pitch + e.movementY * 0.15, -20, 45);
});
addEventListener('resize', () => stage.setSize(window.innerWidth, window.innerHeight));

function readKeys() {
  if (window.play.scripted) return;
  input.move.x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  input.move.z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  input.sprint = keys.has('ShiftLeft');
  input.aim = keys.has('KeyF') || !!input.aimMouse;
  input.fire = keys.has('Space') || !!input.fireMouse;
  input.reload = keys.has('KeyR');
  input.cameraYaw = camera.yaw;
  input.aimPitch = -camera.pitch + 12;
}

const hud = document.getElementById('hud');
function frameCamera() {
  const target = entry.holder.position.clone().add(new THREE.Vector3(0, camera.height, 0));
  const yaw = camera.yaw;
  const shoulder = new THREE.Vector3(-camera.shoulder, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(camera.dist * Math.cos(THREE.MathUtils.degToRad(camera.pitch)));
  stage.camera.position.copy(target).add(back).add(shoulder).setY(target.y + Math.sin(THREE.MathUtils.degToRad(camera.pitch)) * camera.dist);
  stage.camera.lookAt(target.clone().add(shoulder));
}

function step(dt) {
  readKeys();
  const wasSeated = controller.seat;
  controller.update(input, dt);
  if (controller.seat !== wasSeated && controller.seat) placeSeat();
  if (!controller.seat && controller.state.locomotion !== 'idle') seatMesh.clear();
  const a = controller.animator;
  smoke.update(dt);
  stage.update(dt);
  frameCamera();
  stage.render();
  const s = controller.state;
  hud.textContent = `${id}\nlocomotion ${s.locomotion}\nupper      ${s.upper ?? '-'}${a.locked ? ' (locked)' : ''}${a.full ? `\nfull       ${a.full.getClip().name}` : ''}\nweapon     ${controller.weapon ?? '-'} ${controller.weapon ? `ammo ${controller.ammo[controller.weapon]}` : ''}${controller.smoking ? '\nsmoking' : ''}${controller.seat ? `\nseated (${controller.seat})` : ''}`;
}

let last = performance.now();
function loop(now) {
  if (!window.play.scripted) step(Math.min(0.05, (now - last) / 1000));
  last = now;
  requestAnimationFrame(loop);
}

window.play = {
  input,
  camera,
  controller,
  smoke,
  scripted: params.has('scripted'),
  /** Advances the game by `seconds` at a fixed step (scripted mode). */
  advance(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds - 1e-9; t += dt) step(dt);
    const a = controller.animator;
    return { ...controller.state, weapon: controller.weapon, ammo: controller.weapon ? controller.ammo[controller.weapon] : null, locked: !!a.locked, full: a.full ? a.full.getClip().name : null, smoking: controller.smoking, seat: controller.seat, held: smoke.held, position: entry.holder.position.toArray() };
  },
};
window.__ready = true;
requestAnimationFrame(loop);
