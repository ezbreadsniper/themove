import * as THREE from 'three';
import { Stage } from '../render/stage.js';
import { World } from '../world/world.js';
import { buildCharacter } from '../character/build.js';
import { PRESETS_BY_ID } from '../character/presets/index.js';
import { attachWeapon } from '../weapons/model.js';
import { CharacterController } from '../game/character-controller.js';
import { NpcManager } from '../npc/manager.js';
import { EventBus } from '../npc/events.js';
import { DialogueDirector } from '../dialogue/director.js';

/**
 * NPC & dialogue test harness: the Foundry St. world, the NPC cast (markers or fallback spawns), a
 * keyboard-driven armed player stand-in that emits the contract §4 events on a bus, and the
 * DialogueDirector on E. `?scripted` freezes the clock so scripts drive it through window.npcDemo.
 */
const params = new URLSearchParams(location.search);
const container = document.getElementById('view');
const stage = new Stage(container, { width: window.innerWidth, height: window.innerHeight });
stage.setPreset(params.get('preset') ?? 'ps2');
const world = new World();
world.attach(stage.scene);
stage.lights.visible = false;
if (stage.ground) stage.ground.visible = false;
stage.camera.near = 0.05;
stage.camera.far = 450;
stage.camera.fov = 60;
stage.camera.updateProjectionMatrix();

// --- player stand-in ----------------------------------------------------------------------
const spawn = world.markers.spawn;
const character = buildCharacter(PRESETS_BY_ID[params.get('player') ?? 'sheet-02-denim-vest']);
attachWeapon(character, ['pistol'], { drawn: null });
const entry = stage.add(character, { x: spawn.pos[0], z: spawn.pos[2], yaw: spawn.yaw ?? 0 });
const root = entry.holder;
root.position.y = spawn.pos[1];
const collision = world.collision;
const ground = (x, z) => collision.groundAt(x, z, root.position.y + 0.4)?.y ?? null;
const controller = new CharacterController(character, entry.clips, { root, ground });
controller.facing = spawn.yaw ?? 0;
const body = { vy: 0 };

// --- NPCs and dialogue ---------------------------------------------------------------------
const bus = new EventBus();
const globals = { cash: 30 };
const director = new DialogueDirector({ camera: stage.camera, scene: stage.scene, hud: document.body, player: root, events: bus, globals, stats: { persuade: 2, intimidate: 1 }, collision });
const manager = new NpcManager({ world, scene: stage.scene, player: root, events: bus, dialogue: director });
manager.spawnFromMarkers();
bus.on('dialogue:holster', () => { input.weapon = null; });

// --- input ---------------------------------------------------------------------------------
const input = { move: { x: 0, z: 0 }, cameraYaw: Math.PI, aimPitch: 0, sprint: false, crouch: false, aim: false, fire: false, reload: false, weapon: null };
const keys = new Set();
const camera = { yaw: (spawn.yaw ?? 0) + 0.6, pitch: 10, dist: 3.6, height: 1.45, shoulder: 0.45 };
let debug = params.has('debug');

addEventListener('keydown', (e) => {
  if (director.active) return;
  keys.add(e.code);
  if (e.code === 'KeyC') {
    input.crouch = !input.crouch;
    bus.emit('player:crouch', { on: input.crouch });
  }
  if (e.code === 'Digit1') input.weapon = 'pistol';
  if (e.code === 'Digit0') input.weapon = null;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyV') melee();
  if (e.code === 'Tab') {
    debug = !debug;
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousedown', (e) => { if (e.button === 2) input.aimMouse = true; if (e.button === 0 && !director.active) input.fireMouse = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) input.aimMouse = false; if (e.button === 0) input.fireMouse = false; });
addEventListener('mousemove', (e) => {
  if (!e.buttons || director.active) return;
  camera.yaw -= e.movementX * 0.005;
  camera.pitch = THREE.MathUtils.clamp(camera.pitch + e.movementY * 0.15, -20, 45);
});
addEventListener('resize', () => stage.setSize(window.innerWidth, window.innerHeight));

function readKeys() {
  if (window.npcDemo?.scripted) return;
  input.move.x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  input.move.z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  input.sprint = keys.has('ShiftLeft');
  input.aim = keys.has('KeyF') || !!input.aimMouse;
  input.fire = keys.has('Space') || !!input.fireMouse;
  input.cameraYaw = camera.yaw;
}

/** Nearest NPC in front of the player within reach. */
function facingNpc(reach = 2.6) {
  const p = root.position;
  return manager.nearest(p, reach, (n) => {
    if (['flee', 'cower', 'handsUp', 'confront', 'combat'].includes(n.brain.state)) return false;
    const a = Math.atan2(n.pos.x - p.x, n.pos.z - p.z);
    return Math.abs(Math.atan2(Math.sin(a - controller.facing), Math.cos(a - controller.facing))) < 1.3;
  });
}

function interact() {
  const npc = facingNpc();
  if (npc) bus.emit('player:interact', { id: `npc:${npc.id}` });
}

function melee() {
  const f = controller.facing;
  const p = root.position;
  bus.emit('player:melee', { pos: { x: p.x + Math.sin(f) * 0.8, y: p.y, z: p.z + Math.cos(f) * 0.8 } });
  controller.animator.play(controller.clips.push ? 'push' : 'interact');
}

// --- bus emission from the controller's state ------------------------------------------------
const emitted = { weapon: null, shot: null, aimT: 0, sprintT: 0 };
function emitPlayerEvents(dt) {
  const p = root.position;
  if (input.weapon !== emitted.weapon) {
    if (input.weapon) bus.emit('player:draw', { weapon: input.weapon });
    else bus.emit('player:holster', {});
    emitted.weapon = input.weapon;
  }
  emitted.aimT -= dt;
  if (input.aim && input.weapon && emitted.aimT <= 0) {
    emitted.aimT = 0.25;
    bus.emit('player:aim', { weapon: input.weapon, target: null });
  }
  if (controller.lastShot && controller.lastShot !== emitted.shot) {
    emitted.shot = controller.lastShot;
    const f = controller.facing;
    bus.emit('player:fire', { pos: { x: p.x, y: p.y + 1.4, z: p.z }, dir: { x: Math.sin(f), y: 0, z: Math.cos(f) }, weapon: controller.lastShot.weapon });
    flash = 0.06;
  }
  emitted.sprintT -= dt;
  const moving = Math.hypot(input.move.x, input.move.z) > 0.2;
  if (input.sprint && moving && emitted.sprintT <= 0) {
    emitted.sprintT = 0.3;
    bus.emit('player:sprint', {});
  }
}

// --- camera, HUD -----------------------------------------------------------------------------
function frameCamera() {
  const target = root.position.clone().add(new THREE.Vector3(0, camera.height, 0));
  const yaw = camera.yaw;
  const shoulder = new THREE.Vector3(-camera.shoulder, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const back = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(camera.dist * Math.cos(THREE.MathUtils.degToRad(camera.pitch)));
  const cam = stage.camera;
  cam.position.copy(target).add(back).add(shoulder).setY(target.y + Math.sin(THREE.MathUtils.degToRad(camera.pitch)) * camera.dist);
  // Keep the follow camera out of walls.
  const eye = target.clone().add(shoulder);
  const dir = cam.position.clone().sub(eye);
  const len = dir.length();
  const hit = collision.raycast(eye.toArray(), dir.normalize().toArray(), len);
  if (hit < len) cam.position.copy(eye).addScaledVector(dir, Math.max(0.3, hit - 0.15));
  if (cam.fov !== 60) {
    cam.fov = 60;
    cam.updateProjectionMatrix();
  }
  cam.lookAt(eye);
}

const hud = document.getElementById('hud');
const prompt = document.getElementById('prompt');
const debugGroup = new THREE.Group();
stage.scene.add(debugGroup);
let flash = 0;

function drawDebug() {
  debugGroup.clear();
  if (!debug) return;
  const pts = [];
  const cols = [];
  for (const n of manager.npcs) {
    if (n.lod.tier === 'far') continue;
    const p = n.perception;
    const half = THREE.MathUtils.degToRad(p.fov / 2);
    const y = n.pos.y + 0.05;
    const c = new THREE.Color(n.perception.level === 'aware' ? '#ff5a4a' : n.perception.level === 'suspicious' ? '#ffd34a' : '#4aff8a');
    for (const s of [-1, 1]) {
      const a = n.facing + s * half;
      pts.push(n.pos.x, y, n.pos.z, n.pos.x + Math.sin(a) * p.sightRange * 0.4, y, n.pos.z + Math.cos(a) * p.sightRange * 0.4);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const m = n.perception.strongest(0);
    if (m) {
      pts.push(n.pos.x, n.pos.y + 1.7, n.pos.z, m.pos.x, (m.pos.y ?? 0) + 0.1, m.pos.z);
      cols.push(1, 0.5, 0, 1, 0.5, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  debugGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, fog: false })));
}

const pct = (v) => String(Math.round(v * 100)).padStart(3);
function updateHud() {
  document.body.classList.toggle('cine', director.active);
  const lines = manager.npcs.map((n) => {
    const d = Math.hypot(n.pos.x - root.position.x, n.pos.z - root.position.z);
    return `${n.name.padEnd(10)} ${String(n.brain.state).padEnd(11)} ${n.rank().padEnd(10)} ${String(Math.round(n.disposition())).padStart(4)}  fear${pct(n.drives.fear)} ang${pct(n.drives.anger)} alr${pct(n.drives.alarm)} aw${pct(n.perception.awareness)}  ${n.lod.tier.padEnd(4)} ${d.toFixed(1)}m`;
  });
  const w = controller.weapon;
  hud.textContent = `player  ${w ?? 'unarmed'}${input.aim && w ? ' AIM' : ''}${input.crouch ? ' CROUCH' : ''}${input.sprint ? ' SPRINT' : ''}   cash $${globals.cash}\n\nNPC        state       rank        disp  drives                       lod  dist\n${lines.join('\n')}`;
  const near = !director.active && facingNpc();
  prompt.style.display = near ? 'block' : 'none';
  if (near) prompt.textContent = `[E] ${near.personality.dialogue ? `Talk to ${near.name}` : `Greet ${near.name}`}`;
  // Barks float over heads.
  const w2 = stage.width;
  const h2 = stage.height;
  director.hud?.showBarks(director.active ? [] : manager.speeches().map(({ npc, text, head }) => {
    const v = new THREE.Vector3(head.x, head.y + 0.42, head.z).project(stage.camera);
    return { id: npc.id, name: npc.name, text, x: (v.x * 0.5 + 0.5) * w2, y: (-v.y * 0.5 + 0.5) * h2, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }));
  stage.renderer.domElement.style.filter = flash > 0 ? 'brightness(1.6)' : '';
}

// --- frame -----------------------------------------------------------------------------------
function step(dt) {
  readKeys();
  if (director.active) {
    // Conversation: no movement; face the NPC.
    input.move.x = 0;
    input.move.z = 0;
    input.fire = false;
    input.aim = false;
    const f = director.playerFacing;
    if (f !== null) controller.facing += Math.atan2(Math.sin(f - controller.facing), Math.cos(f - controller.facing)) * Math.min(1, dt * 6);
  }
  const before = root.position.clone();
  controller.update(input, dt);
  const s = collision.move({ x: before.x, y: before.y, z: before.z, vy: body.vy }, root.position.x - before.x, root.position.z - before.z, dt);
  root.position.set(s.x, s.y, s.z);
  body.vy = s.vy;
  emitPlayerEvents(dt);
  const player = { pos: root.position, facing: controller.facing, weapon: controller.weapon, aiming: !!(input.aim && controller.weapon), sprint: input.sprint && Math.hypot(input.move.x, input.move.z) > 0.2, crouch: input.crouch };
  manager.update(dt, { player, camera: stage.camera });
  world.update(dt, { actor: root.position, camera: stage.camera, bodies: [{ x: root.position.x, y: root.position.y, z: root.position.z, vx: 0, vz: 0, radius: 0.3, height: 1.8, mass: 80 }, ...manager.bodies()] });
  stage.update(dt);
  frameCamera();
  director.update(dt);
  flash -= dt;
  drawDebug();
  updateHud();
  stage.render();
}

// The first RAF timestamp can precede the time the (slow) setup finished, so time starts on the
// first frame and every step is clamped to (0, 50 ms].
let last = null;
function loop(now) {
  const dt = last === null ? 1 / 60 : Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    if (!window.npcDemo.scripted && dt > 0) step(dt);
  } catch (err) {
    console.error(err);
    hud.textContent = `step failed: ${err.message}`;
  }
  requestAnimationFrame(loop);
}

window.npcDemo = {
  stage, world, manager, director, bus, input, controller, camera, globals, player: root,
  scripted: params.has('scripted'),
  /** Advances the simulation by `seconds` at a fixed step. */
  advance(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds - 1e-9; t += dt) step(dt);
    return this.summary();
  },
  teleport(x, z, yaw = controller.facing) {
    const g = collision.groundAt(x, z, root.position.y + 1);
    root.position.set(x, g?.y ?? root.position.y, z);
    controller.facing = yaw;
  },
  talk(id) {
    return manager.requestTalk(manager.get(id));
  },
  setDebug(on) {
    debug = on;
  },
  summary() {
    return manager.npcs.map((n) => ({ id: n.id, state: n.brain.state, rank: n.rank(), pos: [n.pos.x, n.pos.y, n.pos.z].map((v) => +v.toFixed(2)), speech: n.speech?.text ?? null }));
  },
};
document.getElementById('loading').remove();
window.__ready = true;
requestAnimationFrame(loop);
