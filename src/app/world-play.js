import * as THREE from 'three';
import { Stage } from '../render/stage.js';
import { buildCharacter, rasterToTexture } from '../character/build.js';
import { PRESETS_BY_ID } from '../character/presets/index.js';
import { attachWeapon } from '../weapons/model.js';
import { bakeAllClips } from '../anim/clips.js';
import { updateCorrectives } from '../garment/correctives.js';
import { SmokeEmitter } from '../render/smoke.js';
import { Raster } from '../tex/raster.js';
import { createRng } from '../core/rng.js';
import { World } from '../world/world.js';
import { CharacterMotor } from '../world/physics/kcc.js';
import { PropSystem } from '../world/physics/props.js';
import { InteractionSystem } from '../world/interaction/index.js';
import { CharacterController } from '../game/character-controller.js';
import { SeatAction, seatSpec } from '../game/seat.js';
import { ThirdPersonCamera, CameraProbe } from '../game/camera.js';
import { GameInput } from '../game/input.js';
import { EventBus } from '../game/events.js';

/**
 * Playable world: the player character in the Foundry St. location with the kinematic controller,
 * physical doors and props, interactions, a spring-arm camera and the retro render pipeline.
 * URL: ?id=<preset> &spawn=<marker> &preset=ps2|ps1|clean &scripted (tests step the clock).
 * window.game = { world, player, controller, npcs, dialogue, events, input, step(dt), advance(s), ... }.
 */
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? 'trial-default';
const scripted = params.has('scripted');
const container = document.getElementById('view');
const stage = new Stage(container, { width: window.innerWidth, height: window.innerHeight });
stage.setPreset(params.get('preset') ?? 'ps2');
stage.renderer.shadowMap.enabled = true;
stage.lights.visible = false;

// --- world -----------------------------------------------------------------------------------------
const world = new World({ rays: Number(params.get('rays') ?? 20) });
world.attach(stage.scene);
const camera = stage.camera;
camera.near = 0.05;
camera.far = 450;
camera.fov = 62;
camera.updateProjectionMatrix();

// --- player ----------------------------------------------------------------------------------------
const weapons = ['pistol', 'rifle', 'smg'];
const character = buildCharacter(PRESETS_BY_ID[id] ?? PRESETS_BY_ID['trial-default']);
attachWeapon(character, weapons, { drawn: null });
const holder = new THREE.Group();
holder.name = 'player';
holder.add(character);
holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
stage.scene.add(holder);
const clips = bakeAllClips(character.userData.layout, { weapons });
const smoke = character.userData.cigaretteTip ? new SmokeEmitter(stage.scene, character) : null;

const spawn = world.markers[params.get('spawn') ?? 'spawn'] ?? world.markers.spawn;
const events = new EventBus();
const motor = new CharacterMotor(world.collision, { x: spawn.pos[0], y: spawn.pos[1] + 0.05, z: spawn.pos[2] });
const controller = new CharacterController(character, clips, { root: holder, motor, events });
controller.facing = spawn.yaw ?? 0;
holder.rotation.y = controller.facing;

// --- physics props ---------------------------------------------------------------------------------
const props = new PropSystem(world.collision, { dynamics: world.data.dynamics });
if (!props.props.length) spawnTestCrates();

function crateMaterial(seed) {
  const r = new Raster(32, 32);
  const rng = createRng(`crate-${seed}`);
  r.fill('#a07a4c');
  r.grain(rng, 0.12);
  r.rect(0, 0, 32, 2, '#6e5232');
  r.rect(0, 30, 32, 2, '#6e5232');
  r.rect(0, 0, 2, 32, '#6e5232');
  r.rect(30, 0, 2, 32, '#6e5232');
  r.rect(13, 0, 6, 32, '#c9b48a', 0.85);
  r.rect(3, 4, 8, 4, '#3a2a1a', 0.6);
  return new THREE.MeshLambertMaterial({ map: rasterToTexture(r, `crate-${seed}`) });
}

/** Two cardboard boxes on the sidewalk by the spawn (stand-ins until the dressing marks props physical). */
function spawnTestCrates() {
  [[7.3, -0.7, 0.55, 0.45, 0.5, 12, 0.2], [8.1, -0.75, 0.5, 0.5, 0.45, 9, -0.35]].forEach(([x, z, w, h, d, mass, yaw], i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMaterial(i));
    mesh.geometry.translate(0, h / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `crate-${i}`;
    stage.scene.add(mesh);
    props.add({ name: `crate-${i}`, shape: 'box', size: [w, h, d], mass, pos: [x, 0, z], yaw, object: mesh });
  });
}

// --- camera, interaction, HUD ----------------------------------------------------------------------
const probe = new CameraProbe({ collision: world.collision, occluders: world.data.occluders });
const cam = new ThirdPersonCamera(camera, probe);
cam.yaw = controller.facing;
cam.reset(holder.position);
const interaction = new InteractionSystem({ world, events });
const input = new GameInput(stage.renderer.domElement, { onLook: (dy, dp) => cam.look(dy, dp) });
input.scripted = scripted;

const hud = {
  prompt: document.getElementById('prompt'),
  crosshair: document.getElementById('crosshair'),
  info: document.getElementById('hud'),
  subtitle: document.getElementById('subtitle'),
  setPrompt(text) {
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    this.prompt.style.display = text ? 'block' : 'none';
  },
  show(text) {
    this.subtitle.textContent = text ?? '';
    this.subtitle.style.display = text ? 'block' : 'none';
  },
  hide() {
    this.show('');
  },
};

// --- optional NPCs and dialogue (workstream B): run without them --------------------------------------
let npcs = null;
let dialogue = null;
const npcModules = import.meta.glob('../npc/*.js');
const dialogueModules = import.meta.glob('../dialogue/*.js');
async function findExport(mods, name) {
  for (const load of Object.values(mods)) {
    try {
      const m = await load();
      if (m[name]) return m[name];
    } catch (err) {
      console.warn(`optional module failed: ${err.message}`);
    }
  }
  return null;
}
const player = {
  root: holder, character, controller, events,
  get position() { return holder.position; },
  get body() { return controller.body(); },
};
async function wireOptional() {
  try {
    const NpcManager = await findExport(npcModules, 'NpcManager');
    if (NpcManager) {
      npcs = new NpcManager({ world, scene: stage.scene, player, clipsFor: (c) => bakeAllClips(c.userData.layout), events });
      npcs.spawnFromMarkers?.();
      interaction.addSource(() => npcs.interactables?.() ?? []);
    }
  } catch (err) {
    console.warn(`NPCs unavailable: ${err.message}`);
    npcs = null;
  }
  try {
    const DialogueDirector = await findExport(dialogueModules, 'DialogueDirector');
    if (DialogueDirector) dialogue = new DialogueDirector({ camera, scene: stage.scene, hud, events });
  } catch (err) {
    console.warn(`dialogue unavailable: ${err.message}`);
    dialogue = null;
  }
  game.npcs = npcs;
  game.dialogue = dialogue;
}

function npcBodies() {
  if (!npcs) return [];
  try {
    const list = npcs.bodies?.() ?? (npcs.npcs ?? []).map((n) => n.body).filter(Boolean);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// --- autopilot (scripted tests, demo): walks the input along waypoints ------------------------------
const autopilot = { points: [], i: 0, speed: 1, stuck: 0, best: Infinity, done: true, turnCamera: true };
function steer(s) {
  if (autopilot.done) return;
  const p = autopilot.points[autopilot.i];
  const pos = holder.position;
  const dx = p[0] - pos.x;
  const dz = p[2] - pos.z;
  const d = Math.hypot(dx, dz);
  const last = autopilot.i === autopilot.points.length - 1;
  if (d < (last ? 0.25 : 0.4)) {
    autopilot.i += 1;
    autopilot.best = Infinity;
    autopilot.stuck = 0;
    if (autopilot.i >= autopilot.points.length) {
      autopilot.done = true;
      s.move.x = 0;
      s.move.z = 0;
      return;
    }
    return steer(s);
  }
  if (d < autopilot.best - 0.05) {
    autopilot.best = d;
    autopilot.stuck = 0;
  }
  if (autopilot.stuck > 3) {
    autopilot.done = true;
    autopilot.failed = autopilot.i;
    s.move.x = 0;
    s.move.z = 0;
    return;
  }
  const yaw = Math.atan2(dx, dz);
  if (autopilot.turnCamera) cam.yaw += Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw)) * 0.08;
  const rel = yaw - cam.yaw;
  const k = last && d < 1 ? Math.max(0.5, autopilot.speed * d) : autopilot.speed;
  s.move.x = Math.sin(rel) * k;
  s.move.z = Math.cos(rel) * k;
}

// --- game step ---------------------------------------------------------------------------------------
const collideCooldown = new Map();
let time = 0;
let fps = 0;
const zones = world.location.zones ?? [];
const indoorAt = (p) => zones.some((z) => p.x >= z.min[0] && p.x <= z.max[0] && p.z >= z.min[2] && p.z <= z.max[2] && p.y >= z.min[1] - 0.5 && p.y <= z.max[1]);

function step(dt, { render = true } = {}) {
  time += dt;
  const s = input.read();
  if (scripted && !autopilot.done) steer(s);
  if (!autopilot.done) autopilot.stuck += dt;
  const talking = !!dialogue?.active;
  if (talking) {
    s.move.x = 0;
    s.move.z = 0;
  }
  if (s.shoulder) cam.swapShoulder();
  const pos = holder.position;
  const eye = pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  const focus = controller.seat || talking ? null : interaction.focus(pos, eye, cam.forward());
  if (s.interact && !controller.seat && !talking && focus) {
    interaction.interact({ controller, from: pos.clone(), dialogue, world, makeSeat: (item) => new SeatAction(controller, seatSpec(item, world.collision, (x, z, y) => motor.fits(x, z, y)), { events }) });
    s.interact = false;
  }
  s.cameraYaw = cam.yaw;
  s.aimPitch = THREE.MathUtils.clamp(-THREE.MathUtils.radToDeg(cam.pitch) + 8, -40, 40);
  s.indoor = indoorAt(pos);
  s.target = controller.weapon && s.aim ? cam.aimPoint().toArray() : null;

  controller.update(s, dt);

  const others = npcBodies();
  if (others.length) {
    for (const b of motor.separate(others)) bump(b.id ?? 'npc');
  }
  const bodies = [controller.body(), ...others];
  world.update(dt, { actor: holder.position, camera, bodies });
  for (const e of world.doors.events) events.emit(`door:${e.type}`, e);
  for (const t of props.update(dt, bodies)) if (t.by === 'player') bump(t.prop);
  for (const solid of controller.contacts ?? []) if (solid.tag === 'door' || solid.tag === 'prop') bump(solid.door ?? solid.prop);
  try {
    npcs?.update?.(dt, { player, camera, events, world, dt });
    dialogue?.update?.(dt);
  } catch (err) {
    console.warn(err);
    npcs = null;
  }
  updateCorrectives(character);
  smoke?.update(dt);

  const seated = !!controller.seat?.seated;
  if (!talking) cam.update(dt, { target: holder.position, aim: !!controller.weapon && s.aim, crouch: controller.flags.crouch, seated });
  hud.setPrompt(controller.seat?.phase === 'seated' ? '[E] Stand up' : focus ? `[E] ${interaction.prompt(focus)}` : '');
  hud.crosshair.style.display = controller.weapon && s.aim ? 'block' : 'none';
  input.consume();
  if (render) {
    stage.render();
    const st = controller.state;
    hud.info.textContent = `${id}  ${fps ? `${fps} fps` : ''}\nlocomotion ${st.locomotion}${st.airborne ? ' (air)' : ''}${st.tight ? ' (tight)' : ''}\nupper      ${st.upper ?? '-'}\nweapon     ${controller.weapon ?? '-'}${controller.weapon ? ` ${controller.ammo[controller.weapon]}` : ''}\nspeed      ${(st.speed ?? 0).toFixed(2)} m/s${s.indoor ? '  indoor' : ''}\npos        ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)}`;
  }
}

function bump(who) {
  const last = collideCooldown.get(who) ?? -Infinity;
  if (time - last < 1) return;
  collideCooldown.set(who, time);
  events.emit('player:collide', { who, pos: holder.position.toArray() });
}

let last = performance.now();
let frames = 0;
let fpsT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  fpsT += dt;
  if (fpsT > 1) {
    fps = frames;
    frames = 0;
    fpsT = 0;
  }
  if (!scripted) step(dt);
  requestAnimationFrame(loop);
}

addEventListener('resize', () => stage.setSize(window.innerWidth, window.innerHeight));
document.getElementById('click')?.addEventListener('click', () => {
  document.getElementById('click').style.display = 'none';
  try {
    stage.renderer.domElement.requestPointerLock()?.catch?.(() => {});
  } catch { /* no pointer lock */ }
});
if (scripted) document.getElementById('click')?.remove();

const game = {
  world, player, controller, motor, props, interaction, events, camera: cam, stage, npcs, dialogue,
  input: input.state,
  /** One fixed step of the whole game (input → controller → doors/props/NPCs → camera). */
  step(dt = 1 / 30, opts) {
    step(dt, opts);
    return this.snapshot();
  },
  /** Advances `seconds` at a fixed step; renders the last frame only. */
  advance(seconds, dt = 1 / 30) {
    const n = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < n; i++) step(dt, { render: i === n - 1 });
    return this.snapshot();
  },
  /** Walks the input along waypoints [[x, y, z], ...] (scripted mode). speed: stick magnitude. */
  autopilot(points, { speed = 1, turnCamera = true } = {}) {
    Object.assign(autopilot, { points, i: 0, speed, stuck: 0, best: Infinity, done: false, failed: null, turnCamera });
  },
  get autopilotDone() {
    return autopilot.done;
  },
  /** Moves the player (feet) and settles them on the ground. */
  teleport(x, y, z, yaw = controller.facing) {
    motor.teleport(x, y, z);
    controller.facing = yaw;
    controller.velocity.set(0, 0, 0);
    holder.position.set(motor.pos.x, motor.pos.y, motor.pos.z);
    cam.yaw = yaw;
    cam.reset(holder.position);
  },
  look(yaw, pitch = cam.pitch) {
    cam.yaw = yaw;
    cam.pitch = pitch;
  },
  door(name) {
    return world.doors.state(name);
  },
  snapshot() {
    const st = controller.state;
    return {
      pos: holder.position.toArray().map((v) => +v.toFixed(3)),
      feet: [motor.pos.x, motor.pos.y, motor.pos.z].map((v) => +v.toFixed(3)),
      facing: +controller.facing.toFixed(3),
      locomotion: st.locomotion, upper: st.upper, grounded: motor.grounded, airborne: !!st.airborne,
      seated: controller.seat?.phase ?? null, weapon: controller.weapon,
      speed: +(st.speed ?? 0).toFixed(2),
      focus: interaction.focused ? { id: interaction.focused.id, kind: interaction.focused.kind, prompt: interaction.prompt(interaction.focused) } : null,
      camera: { arm: +cam.state.arm.toFixed(2), pulled: cam.state.pulled, pos: camera.position.toArray().map((v) => +v.toFixed(2)) },
      autopilot: autopilot.failed !== null && autopilot.failed !== undefined ? `stuck@${autopilot.failed}` : autopilot.done ? 'done' : `${autopilot.i}/${autopilot.points.length}`,
    };
  },
};
window.game = game;
wireOptional().finally(() => {
  window.__ready = true;
  requestAnimationFrame(loop);
});
