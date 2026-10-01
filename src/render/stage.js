import * as THREE from 'three';
import { RetroPipeline } from './retro-pipeline.js';
import { Raster } from '../tex/raster.js';
import { createRng } from '../core/rng.js';
import { rasterToTexture } from '../character/build.js';
import { bakeAllClips } from '../anim/clips.js';
import { SmokeEmitter } from './smoke.js';

/** Lighting and atmosphere presets derived from the reference set (lighting only, no set dressing). */
export const BACKDROPS = {
  sheet: { bg: '#c4c4c4', fog: null, hemi: ['#f2f2f2', '#6d6a66', 1.5], key: ['#fff6ea', 2.0, [1.5, 3, 4]], fill: ['#dfe6ff', 0.5, [-3, 2, 1]], ground: null },
  menu: { bg: '#1616d0', fog: null, hemi: ['#e8ecff', '#303060', 1.45], key: ['#ffffff', 2.1, [1, 2.5, 4]], fill: ['#8aa0ff', 0.8, [-3, 1, 2]], ground: null, gradient: ['#0a0aa8', '#2a2af0'] },
  street: { bg: '#a9c6d8', fog: ['#b7c8cf', 9, 40], hemi: ['#dcecff', '#6a6e58', 1.3], key: ['#fff1d6', 2.4, [3, 5, 2]], fill: ['#b0c8ff', 0.35, [-2, 2, -3]], ground: 'gravel' },
  store: { bg: '#d4d8d2', fog: ['#d4d8d2', 7, 22], hemi: ['#f4f7ff', '#8a8578', 1.7], key: ['#f2fbff', 1.4, [0, 6, 1]], fill: ['#fff4e0', 0.5, [2, 2, 3]], ground: 'tile' },
  dusk: { bg: '#27301f', fog: ['#27301f', 4, 14], hemi: ['#a6b58a', '#1c1a12', 0.9], key: ['#ffc98a', 1.9, [0.5, 3, 1.5]], fill: ['#6f8a78', 0.3, [-2, 1, -2]], ground: 'carpet' },
};

function groundRaster(kind, rng) {
  const r = new Raster(64, 64);
  if (kind === 'gravel') {
    r.fill('#8c8f86');
    for (let i = 0; i < 700; i++) r.rect(rng.next() * 64, rng.next() * 64, 1 + rng.next() * 2, 1 + rng.next() * 2, rng.chance(0.5) ? '#b3b5ab' : '#5f6259', 0.8);
  } else if (kind === 'tile') {
    r.fill('#c9c3b2');
    for (let i = 0; i < 64; i += 16) {
      r.rect(i, 0, 1, 64, '#9b9585');
      r.rect(0, i, 64, 1, '#9b9585');
    }
    for (let i = 0; i < 300; i++) r.plot(rng.next() * 64, rng.next() * 64, '#8e8878', 0.6);
  } else {
    r.fill('#4a2e22');
    for (let y = 0; y < 64; y += 2) for (let x = (y / 2) % 2; x < 64; x += 2) r.plot(x, y, '#5c3a2a', 0.8);
  }
  r.grain(rng, 0.08);
  return r;
}

function blobShadow() {
  const r = new Raster(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 15.5;
      const a = Math.max(0, 1 - d) ** 1.2;
      r.data.set([0, 0, 0, Math.round(a * 150)], (y * 32 + x) * 4);
    }
  }
  const tex = rasterToTexture(r, 'blobShadow');
  tex.magFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  mesh.renderOrder = -1;
  return mesh;
}

function gradientTexture(top, bottom) {
  const r = new Raster(4, 64);
  r.verticalGradient(0, 64, top, bottom);
  const tex = rasterToTexture(r, 'bg');
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export class Stage {
  constructor(container, { width, height, preset = 'ps2', backdrop = 'sheet', preserveDrawingBuffer = true } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(25, 1, 0.05, 80);
    this.pipeline = new RetroPipeline(this.renderer, preset);
    this.clock = new THREE.Clock();
    this.entries = [];
    this.lights = new THREE.Group();
    this.scene.add(this.lights);
    this.setSize(width ?? container.clientWidth, height ?? container.clientHeight);
    this.setBackdrop(backdrop);
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.renderer.domElement.style.imageRendering = 'pixelated';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline.resize();
  }

  setPreset(name) {
    this.pipeline.setPreset(name);
  }

  setBackdrop(name) {
    const b = BACKDROPS[name];
    this.backdropName = name;
    this.lights.clear();
    if (this.ground) this.scene.remove(this.ground);
    this.ground = null;
    this.scene.background = b.gradient ? gradientTexture(b.gradient[1], b.gradient[0]) : new THREE.Color(b.bg);
    this.scene.fog = b.fog ? new THREE.Fog(b.fog[0], b.fog[1], b.fog[2]) : null;
    const hemi = new THREE.HemisphereLight(b.hemi[0], b.hemi[1], b.hemi[2]);
    const key = new THREE.DirectionalLight(b.key[0], b.key[1]);
    key.position.set(...b.key[2]);
    const fill = new THREE.DirectionalLight(b.fill[0], b.fill[1]);
    fill.position.set(...b.fill[2]);
    this.lights.add(hemi, key, fill);
    if (b.ground) {
      const tex = rasterToTexture(groundRaster(b.ground, createRng(name)), 'ground');
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(40, 40);
      this.ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ map: tex }));
      this.ground.rotation.x = -Math.PI / 2;
      this.scene.add(this.ground);
    }
  }

  /** Adds a character (THREE.Group from buildCharacter). Returns an entry with mixer and clips. */
  add(character, { x = 0, z = 0, yaw = 0 } = {}) {
    const holder = new THREE.Group();
    holder.position.set(x, 0, z);
    holder.rotation.y = yaw;
    holder.add(character);
    const shadow = blobShadow();
    holder.add(shadow);
    this.scene.add(holder);
    const clips = bakeAllClips(character.userData.layout);
    const mixer = new THREE.AnimationMixer(character);
    const entry = { holder, character, mixer, clips, action: null, clipName: null, smoke: character.userData.cigaretteTip ? new SmokeEmitter(this.scene, character) : null, lastTime: 0 };
    this.entries.push(entry);
    return entry;
  }

  remove(entry) {
    entry.mixer.stopAllAction();
    entry.smoke?.dispose();
    this.scene.remove(entry.holder);
    this.entries = this.entries.filter((e) => e !== entry);
  }

  clear() {
    [...this.entries].forEach((e) => this.remove(e));
  }

  play(entry, name, { time = null, fade = 0.2 } = {}) {
    const clip = entry.clips[name];
    if (!clip) throw new Error(`Unknown clip ${name}`);
    const next = entry.mixer.clipAction(clip);
    if (entry.action && entry.action !== next && fade > 0 && time === null) {
      next.reset().play();
      entry.action.crossFadeTo(next, fade, false);
    } else {
      entry.mixer.stopAllAction();
      next.reset().play();
    }
    entry.action = next;
    entry.clipName = name;
    if (time !== null) {
      entry.mixer.setTime(time);
    }
  }

  /** Frames a list of points (world) so the full body or face fills the view. */
  frame({ target = new THREE.Vector3(0, 0.9, 0), height = 2.0, yaw = 0, pitch = 4, fov = 25 } = {}) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    const dist = (height / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const y = THREE.MathUtils.degToRad(yaw);
    const p = THREE.MathUtils.degToRad(pitch);
    this.camera.position.set(
      target.x + Math.sin(y) * Math.cos(p) * dist,
      target.y + Math.sin(p) * dist,
      target.z + Math.cos(y) * Math.cos(p) * dist,
    );
    this.camera.lookAt(target);
  }

  update(dt = this.clock.getDelta()) {
    for (const e of this.entries) {
      e.mixer.update(dt);
      if (!e.smoke) continue;
      const clip = e.action?.getClip();
      const t = e.action ? e.action.time : 0;
      for (const ev of clip?.userData?.events ?? []) {
        if (ev.name === 'exhale' && ((e.lastTime <= ev.time && t > ev.time) || (t < e.lastTime && ev.time < t))) e.smoke.exhale();
      }
      e.lastTime = t;
      e.smoke.update(dt);
    }
  }

  render() {
    this.pipeline.render(this.scene, this.camera);
  }
}
