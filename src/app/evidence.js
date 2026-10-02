import * as THREE from 'three';
import { Stage } from '../render/stage.js';
import { buildCharacter, disposeCharacter } from '../character/build.js';
import { PRESETS_BY_ID } from '../character/presets/index.js';
import { exportCharacterGLB } from '../export/gltf.js';
import { bakeClip } from '../anim/clips.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { attachWeapon } from '../weapons/model.js';

const TURNAROUND_YAWS = [0, 90, 35, 180];

/** Close-up camera zones computed from the character's own measurements. */
const ZONES = {
  head: (m) => ({ y: m.height - 0.12, h: 0.36 }),
  shoulders: (m) => ({ y: m.shoulderY, h: 0.55 }),
  torso: (m) => ({ y: (m.hipsY + m.shoulderY) / 2, h: 0.85 }),
  hips: (m) => ({ y: m.hipsY - 0.05, h: 0.55 }),
  handL: (m, w) => ({ x: w.LeftHand.x, y: w.LeftHand.y - 0.05, h: 0.4 }),
  feet: () => ({ y: 0.09, h: 0.42, pitch: 18 }),
  ankles: (m) => ({ y: 0.115 * (m.height / 1.78), h: 0.36 * (m.height / 1.78), pitch: 8 }),
  legs: (m) => ({ y: m.kneeY * 0.62, h: m.kneeY * 1.45, pitch: 6 }),
};

const container = document.getElementById('view');
const stage = new Stage(container, { width: window.innerWidth, height: window.innerHeight });
function character(id) {
  let def = typeof id === 'string' ? PRESETS_BY_ID[id] : id;
  if (def && def.__preset) def = { ...PRESETS_BY_ID[def.__preset], body: { ...PRESETS_BY_ID[def.__preset].body, ...def.body } };
  if (!def) throw new Error(`Unknown preset ${id}`);
  return buildCharacter(def);
}

const SILHOUETTE = new THREE.MeshBasicMaterial({ color: 0x000000 });
const WIRE = new THREE.MeshBasicMaterial({ color: 0x101018, wireframe: true });
const CLAY = new THREE.MeshLambertMaterial({ color: 0xb8b4ac });

/** Review views: 'silhouette' (flat black), 'clay' (untextured grey), 'wire' (wireframe overlay on the shaded meshes). */
function applyView(character, view) {
  if (!view || view === 'shaded') return;
  const meshes = [];
  character.traverse((o) => { if (o.isSkinnedMesh && o.visible) meshes.push(o); });
  for (const mesh of meshes) {
    if (view === 'silhouette') mesh.material = SILHOUETTE;
    if (view === 'clay') mesh.material = CLAY;
    if (view === 'wire') {
      const wire = new THREE.SkinnedMesh(mesh.geometry, WIRE);
      wire.frustumCulled = false;
      wire.bind(mesh.skeleton, mesh.bindMatrix);
      mesh.parent.add(wire);
    }
  }
}

/**
 * layout: 'turnaround' (one character, 4 views), 'lineup' (several characters), 'single'.
 * framing: 'full' | 'close' | 'bust'. clip + time freeze an animation frame.
 */
async function render(opts) {
  const {
    chars = ['sheet-01-black-tee'], layout = 'single', yaw = 0, framing = 'full', clip = 'neutral', time = 0,
    backdrop = 'sheet', preset = 'ps2', width = window.innerWidth, height = window.innerHeight, camYaw = 0, spacing = 0.95, hide = [],
  } = opts;
  stage.setSize(width, height);
  stage.setBackdrop(backdrop);
  stage.setPreset(preset);
  stage.entries.forEach((e) => disposeCharacter(e.character));
  stage.clear();
  const placements = [];
  if (layout === 'turnaround') {
    TURNAROUND_YAWS.forEach((y, i) => placements.push({ id: chars[0], x: (i - 1.5) * spacing, yaw: y }));
  } else {
    chars.forEach((id, i) => placements.push({ id, x: (i - (chars.length - 1) / 2) * spacing, yaw }));
  }
  const stats = [];
  for (const p of placements) {
    const c = character(p.id);
    c.traverse((o) => { if (o.isMesh && hide.includes(o.name)) o.visible = false; });
    if (opts.weapon) attachWeapon(c, opts.weapon);
    applyView(c, opts.view);
    const entry = stage.add(c, { x: p.x, yaw: THREE.MathUtils.degToRad(p.yaw) });
    stage.play(entry, clip, { time: opts.simulate ? 0 : time });
    stats.push({ id: c.name, ...c.userData.stats, errors: c.userData.errors });
  }
  if (opts.simulate) {
    const steps = Math.round(time * 30);
    for (let i = 0; i < steps; i++) stage.update(1 / 30);
  } else stage.update(0);
  const span = placements.length > 1 ? (placements.length - 1) * spacing + 0.9 : 0.9;
  const aspect = width / height;
  const zone = opts.zone && ZONES[opts.zone];
  if (zone) {
    const { measures: m, world } = stage.entries[0].character.userData.layout;
    const z = zone(m, world);
    // Body zones follow the pelvis when a clip lowers or moves it (sit, crouch); feet zones stay on the ground.
    const ch = stage.entries[0].character;
    const hips = ch.userData.rig.bones.find((b) => b.name === 'Hips');
    const posed = new THREE.Vector3();
    hips.getWorldPosition(posed);
    ch.parent.worldToLocal(posed);
    const follow = ['hips', 'torso', 'shoulders', 'legs'].includes(opts.zone) ? posed.y - world.Hips.y : 0;
    const fz = ['hips', 'torso', 'shoulders', 'legs'].includes(opts.zone) ? posed.z - world.Hips.z : 0;
    stage.frame({ target: new THREE.Vector3(placements[0].x + (z.x ?? 0), z.y + follow * (opts.zone === 'legs' ? 0.5 : 1), fz), height: z.h, yaw: camYaw, pitch: opts.pitch ?? z.pitch ?? 3 });
  } else if (framing === 'full') {
    const tall = clip === 'jump' || clip === 'cheer' ? 1.25 : 1;
    const h = Math.max(2.05 * tall, span / aspect * 1.05);
    stage.frame({ target: new THREE.Vector3(0, 0.93 * tall, 0), height: h, yaw: camYaw, pitch: opts.pitch ?? 3 });
  } else if (framing === 'close') {
    const headY = stage.entries[0].character.userData.layout.measures.height - 0.13;
    stage.frame({ target: new THREE.Vector3(placements[0].x, headY, 0), height: 0.42, yaw: camYaw, pitch: 2 });
  } else if (framing === 'bust') {
    const hy = stage.entries[0].character.userData.layout.measures.height - 0.35;
    stage.frame({ target: new THREE.Vector3(placements[0].x, hy, 0), height: 0.9, yaw: camYaw, pitch: 2 });
  }
  stage.render();
  return stats;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function exportGLB(id) {
  const glb = await exportCharacterGLB(character(id));
  return toBase64(glb);
}

/** Loads a GLB back through GLTFLoader, renders it next to the procedural original, reports structure. */
async function reimport(id, b64, { width = 900, height = 700 } = {}) {
  const gltf = await new GLTFLoader().parseAsync(fromBase64(b64), '');
  stage.setSize(width, height);
  stage.setBackdrop('sheet');
  stage.setPreset('ps2');
  stage.clear();
  const original = stage.add(character(id), { x: -0.5 });
  stage.play(original, 'walk', { time: 0.3 });
  const holder = new THREE.Group();
  holder.position.x = 0.5;
  holder.add(gltf.scene);
  stage.scene.add(holder);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const walk = gltf.animations.find((a) => a.name === 'walk');
  mixer.clipAction(walk).play();
  mixer.setTime(0.3);
  stage.update(0);
  stage.frame({ target: new THREE.Vector3(0, 0.93, 0), height: 2.1 });
  stage.render();
  const skinned = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  const report = {
    skinnedMeshes: skinned.length,
    bones: skinned[0]?.skeleton.bones.map((b) => b.name) ?? [],
    sharedSkeleton: skinned.every((m) => m.skeleton.bones.length === 23),
    animations: gltf.animations.map((a) => a.name),
    texturesNearest: skinned.every((m) => !m.material.map || m.material.map.magFilter === THREE.NearestFilter),
  };
  stage.scene.remove(holder);
  return report;
}

/** Renders several frames (each an options object) side by side and returns a PNG data URL. */
async function strip(frames, { width = 480, height = 640, labels = [] } = {}) {
  const out = document.createElement('canvas');
  out.width = width * frames.length;
  out.height = height;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < frames.length; i++) {
    await render({ ...frames[i], width, height });
    ctx.drawImage(stage.renderer.domElement, i * width, 0, width, height);
    if (labels[i]) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#000';
      ctx.fillText(labels[i], i * width + 9, 21);
      ctx.fillStyle = '#fff';
      ctx.fillText(labels[i], i * width + 8, 20);
    }
  }
  return out.toDataURL('image/png');
}

/** Frame-time benchmark: N copies of the presets animating, rendered through the retro pipeline. */
async function benchmark({ count = 30, frames = 120, width = 1280, height = 720 } = {}) {
  stage.setSize(width, height);
  stage.setBackdrop('street');
  stage.entries.forEach((e) => disposeCharacter(e.character));
  stage.clear();
  const ids = Object.keys(PRESETS_BY_ID);
  const buildStart = performance.now();
  for (let i = 0; i < count; i++) {
    const entry = stage.add(character(ids[i % ids.length]), { x: (i % 6 - 2.5) * 1.1, z: -Math.floor(i / 6) * 1.6 });
    stage.play(entry, ['idle', 'walk', 'wave'][i % 3], { time: i * 0.13 });
  }
  const buildMs = performance.now() - buildStart;
  stage.frame({ target: new THREE.Vector3(0, 1, -3), height: 5, pitch: 12 });
  const times = [];
  stage.renderer.info.autoReset = false;
  for (let f = 0; f < frames; f++) {
    stage.renderer.info.reset();
    const t0 = performance.now();
    stage.update(1 / 60);
    stage.render();
    stage.renderer.getContext().finish();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const info = { ...stage.renderer.info.render };
  stage.renderer.info.autoReset = true;
  return { count, buildMsPerCharacter: buildMs / count, medianFrameMs: times[Math.floor(times.length / 2)], p95FrameMs: times[Math.floor(times.length * 0.95)], drawCalls: info.calls, triangles: info.triangles };
}

/** Every material texture of a character laid out as labelled swatches (nearest-scaled). */
function swatches(id, { cell = 160 } = {}) {
  const c = character(id);
  const rasters = [];
  c.traverse((o) => {
    if (o.isMesh && o.userData.raster && !rasters.some((r) => r.raster === o.userData.raster)) rasters.push({ name: o.name, raster: o.userData.raster });
  });
  const cols = Math.min(5, rasters.length);
  const rows = Math.ceil(rasters.length / cols);
  const out = document.createElement('canvas');
  out.width = cols * cell;
  out.height = rows * (cell + 18);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#16161c';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = false;
  rasters.forEach(({ name, raster }, i) => {
    const tmp = document.createElement('canvas');
    tmp.width = raster.width;
    tmp.height = raster.height;
    const img = new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height);
    tmp.getContext('2d').putImageData(img, 0, 0);
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + 18);
    ctx.save();
    ctx.translate(x, y + 18 + cell);
    ctx.scale(1, -1);
    ctx.drawImage(tmp, 0, 0, cell, cell);
    ctx.restore();
    ctx.fillStyle = '#ddd';
    ctx.font = '12px monospace';
    ctx.fillText(`${name} ${raster.width}px`, x + 4, y + 13);
  });
  return out.toDataURL('image/png');
}

function clipDuration(def, name) {
  return bakeClip(character(def).userData.layout, name).duration;
}

window.evidence = { render, stage, exportGLB, reimport, strip, benchmark, swatches, clipDuration, presets: PRESETS_BY_ID };
window.__ready = true;
