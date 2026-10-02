import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { CIGARETTE, cigarettePoints } from '../anim/cigarette.js';
import { handGripOffset, handRestFrame } from '../anim/arm-ik.js';

/**
 * Cigarette smoke and its props, in the retro style: pixel puffs (posterised alpha, whole-pixel point
 * sizes, nearest-filtered) with modern behaviour.
 *   ember     glow on the lit tip, idling dim and flaring while the clip's `inhale` event runs
 *   wisp      a thin column from the tip: laminar for the first few centimetres, then it breaks into
 *             curls (a divergence-free swirl field that grows with age), thinned while drawing
 *   exhale    a plume from the mouth along the head's forward direction: fast at the lips, slowed by
 *             drag, buoyant, expanding and fading; afterwards a weak trail drifts from the nose
 *   ash       flakes that fall and flutter on the clip's `ash` taps (and a spark or two)
 *   butt      `toss` / `drop` throw the butt with the hand's velocity: it falls, bounces, smoulders,
 *             and `grind` puts it out in a puff of ash
 *   lighter   a lighter in the left hand (`lighterShow` / `lighterHide`) with a flickering flame
 *             (`lighterOn` / `lighterOff`); `lit` lights the cigarette, `cigShow` puts a fresh one in
 * Events come from the playing clip: sync(clip, time) (one action) or syncActions([...]) (an Animator's
 * layers) fire every event crossed since the previous call, wrap-around included.
 */

const SMOKE_POOL = 256;
const GLOW_POOL = 24;
const SMOKE_COLOR = new THREE.Color('#c9ccd2');
const NOSE_COLOR = new THREE.Color('#b9bcc2');
const ASH_COLOR = new THREE.Color('#4a4846');
const EMBER_DIM = new THREE.Color('#d2400e');
const EMBER_HOT = new THREE.Color('#ffb04a');
const FLAME = new THREE.Color('#ffd27a');
const SMOKE_EVENTS = new Set(['inhale', 'exhale', 'ash', 'lit', 'cigShow', 'lighterShow', 'lighterOn', 'lighterOff', 'lighterHide', 'toss', 'drop', 'grind']);

/** 16 px irregular puff (three overlapping lobes), alpha in 4 steps; rotated per particle. */
function puffTexture() {
  const n = 16;
  const data = new Uint8Array(n * n * 4);
  const lobes = [[7.5, 7.5, 6.2], [5.2, 9.4, 4.0], [10.2, 6.0, 4.2]];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let a = 0;
      for (const [cx, cy, r] of lobes) a = Math.max(a, 1 - Math.hypot(x - cx, y - cy) / r);
      a = Math.round(Math.min(1, Math.max(0, a) * 1.6) ** 1.2 * 4) / 4;
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** 4 px square-ish glow dot (a pixel cross with a hot centre). */
function glowTexture() {
  const n = 4;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const edge = (x === 0 || x === 3) + (y === 0 || y === 3);
      data.set([255, 255, 255, [255, 150, 0][edge]], (y * n + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const VERTEX = /* glsl */ `
attribute float size;
attribute float alpha;
attribute float spin;
attribute vec3 tint;
uniform float pxScale;
varying float vAlpha;
varying float vSpin;
varying vec3 vTint;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = alpha <= 0.0 ? 0.0 : max(1.0, floor(size * pxScale / -mvPosition.z + 0.5));
  vAlpha = alpha;
  vSpin = spin;
  vTint = tint;
  #include <fog_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float steps;
varying float vAlpha;
varying float vSpin;
varying vec3 vTint;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vSpin), k = cos(vSpin);
  vec2 uv = vec2(k * c.x - s * c.y, s * c.x + k * c.y) + 0.5;
  float a = texture2D(map, clamp(uv, 0.0, 1.0)).a * vAlpha;
  a = floor(a * steps + 0.5) / steps;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vTint, a);
  #include <fog_fragment>
}`;

function pointsLayer(count, map, { additive = false, steps = 5 } = {}) {
  const geometry = new THREE.BufferGeometry();
  const attr = (name, size) => geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size).setUsage(THREE.DynamicDrawUsage));
  attr('position', 3);
  attr('size', 1);
  attr('alpha', 1);
  attr('spin', 1);
  attr('tint', 3);
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map }, pxScale: { value: 500 }, steps: { value: steps } }]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = additive ? 11 : 10;
  // Point sizes are in pixels of whatever target is being drawn (the retro pipeline renders low-res).
  points.onBeforeRender = (renderer, scene, camera) => {
    const target = renderer.getRenderTarget();
    const h = target ? target.height : renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    material.uniforms.pxScale.value = (h * camera.projectionMatrix.elements[5]) / 2;
  };
  return { points, geometry, material, count };
}

/** Particle state for a pool. */
function pool(count) {
  return Array.from({ length: count }, () => ({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0, grow: 0, alpha: 0, drag: 0, lift: 0, gravity: 0, swirl: 0, spin: 0, spinRate: 0, color: SMOKE_COLOR, fadeIn: 0.1, age: 0 }));
}

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class SmokeEmitter {
  /**
   * opts.autoHide: show the cigarette only while a smoking clip plays (or a lit butt is out); the
   * game uses it, the evidence stage leaves the accessory always visible.
   */
  constructor(scene, character, { seed = character.name || 'smoke', autoHide = false } = {}) {
    this.scene = scene;
    this.character = character;
    this.rng = createRng(`smoke:${seed}`);
    this.autoHide = autoHide;
    const { layout, rig } = character.userData;
    this.layout = layout;
    this.k = layout.measures.height / 1.78;
    this.tip = character.userData.cigaretteTip ?? null;
    this.tipBone = rig.byName[CIGARETTE.bone] ?? rig.byName.RightHand;
    this.filter = cigarettePoints(layout).local.filter;
    this.mouth = character.userData.mouthOffset ?? null;
    this.head = rig.byName.Head;
    this.cigMesh = null;
    character.traverse((o) => { if (o.isMesh && o.name === 'cigarette') this.cigMesh = o; });
    this.smoke = pointsLayer(SMOKE_POOL, puffTexture(), { steps: 8 });
    this.glow = pointsLayer(GLOW_POOL, glowTexture(), { additive: true, steps: 3 });
    this.smokeP = pool(SMOKE_POOL);
    this.glowP = pool(GLOW_POOL);
    scene.add(this.smoke.points, this.glow.points);
    this.lit = true;
    this.held = true;
    this.draw = 0;
    this.drawTimer = 0;
    this.exhaleTimer = 0;
    this.exhaleDuration = 1;
    this.trailTimer = 0;
    this.wispClock = 0;
    this.exhaleClock = 0;
    this.time = 0;
    this.lastTip = null;
    this.tipVel = new THREE.Vector3();
    this.butt = null;
    this.flame = false;
    this.lighter = this.buildLighter(rig.byName.LeftHand);
    this.lastTimes = new Map();
    this.smokingActive = !autoHide;
  }

  /** Lighter in the left fist: centre at the palm grip, long axis along the thumb side. */
  buildLighter(hand) {
    const k = this.k;
    const g = new THREE.Group();
    g.name = 'lighter';
    const { fingers, palm } = handRestFrame(this.layout, 'Left');
    const forward = palm.clone().cross(fingers).normalize();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.022 * k, 0.058 * k, 0.012 * k), new THREE.MeshLambertMaterial({ color: '#b3262a' }));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.023 * k, 0.01 * k, 0.013 * k), new THREE.MeshLambertMaterial({ color: '#9a9ca2' }));
    cap.position.y = 0.032 * k;
    g.add(body, cap);
    g.position.copy(handGripOffset(this.layout, 'Left')).addScaledVector(palm, 0.006 * k);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward.clone().cross(palm).normalize(), forward, palm));
    g.userData.flameOffset = new THREE.Vector3(0, 0.05 * k, 0);
    g.visible = false;
    hand?.add(g);
    return g;
  }

  worldPoint(bone, offset, out = new THREE.Vector3()) {
    bone.updateWorldMatrix(true, false);
    return out.copy(offset).applyMatrix4(bone.matrixWorld);
  }

  /** Fires the smoke events of `clip` crossed between the previous call and `time`. */
  sync(clip, time, weight = 1) {
    if (!clip) return;
    const key = clip.uuid;
    // A clip seen for the first time just after it started fires its events from 0 (cigShow at 0).
    const seen = this.lastTimes.get(key);
    const last = seen === undefined && time <= 0.1 ? -1e-6 : seen;
    this.lastTimes.set(key, time);
    if (/^smoke/.test(clip.name.replace(/@.*/, '')) && weight > 0.3) this.smokingSeen = true;
    if (last === undefined || weight < 0.3) return;
    for (const ev of clip.userData?.events ?? []) {
      if (!SMOKE_EVENTS.has(ev.name)) continue;
      const crossed = time >= last ? ev.time > last && ev.time <= time : ev.time > last || ev.time <= time;
      if (crossed) this.event(ev);
    }
  }

  /** Same for every playing action of an Animator ([full, upper, base]). */
  syncActions(actions) {
    for (const a of actions) if (a && a.isRunning?.() !== false) this.sync(a.getClip(), a.time, a.getEffectiveWeight());
  }

  event(ev) {
    const name = typeof ev === 'string' ? ev : ev.name;
    if (name === 'inhale' && this.lit && this.held) this.drawTimer = ev.duration ?? 0.8;
    if (name === 'exhale' && this.mouth) {
      this.exhaleTimer = ev.duration ?? 1;
      this.exhaleDuration = this.exhaleTimer;
      this.trailTimer = 0;
    }
    if (name === 'ash' && this.lit && this.held) this.ash();
    if (name === 'lit') this.lit = true;
    if (name === 'cigShow') {
      this.held = true;
      this.lit = false;
    }
    if (name === 'lighterShow') this.lighter.visible = true;
    if (name === 'lighterHide') this.lighter.visible = false;
    if (name === 'lighterOn') this.flame = true;
    if (name === 'lighterOff') this.flame = false;
    if ((name === 'toss' || name === 'drop') && this.held) this.release(name === 'toss');
    if (name === 'grind') this.grind();
  }

  /** Legacy entry point (older stage code). */
  exhale() {
    this.event({ name: 'exhale', duration: 1 });
  }

  tipWorld(out = new THREE.Vector3()) {
    return this.worldPoint(this.tipBone, this.tip, out);
  }

  spawn(list, pos, o) {
    const p = list.find((q, i) => q.life <= 0 && (list !== this.glowP || i >= 3));
    if (!p) return null;
    p.pos.copy(pos);
    p.vel.copy(o.vel ?? new THREE.Vector3());
    p.life = o.life;
    p.max = o.life;
    p.age = 0;
    p.size = o.size;
    p.grow = o.grow ?? 0;
    p.alpha = o.alpha ?? 0.5;
    p.drag = o.drag ?? 0.8;
    p.lift = o.lift ?? 0;
    p.gravity = o.gravity ?? 0;
    p.swirl = o.swirl ?? 0;
    p.spin = this.rng.next() * Math.PI * 2;
    p.spinRate = this.rng.range(-1.5, 1.5);
    p.color = o.color ?? SMOKE_COLOR;
    p.fadeIn = o.fadeIn ?? 0.1;
    return p;
  }

  ash() {
    const tip = this.tipWorld();
    for (let i = 0; i < 3; i++) {
      this.spawn(this.smokeP, tip, { vel: new THREE.Vector3(this.rng.range(-0.15, 0.15), this.rng.range(-0.3, 0), this.rng.range(-0.15, 0.15)), life: 1.1, size: 0.007 * this.k, alpha: 0.95, gravity: 2.4, drag: 2.5, swirl: 0.6, color: ASH_COLOR, fadeIn: 0 });
    }
    this.spawn(this.glowP, tip, { vel: new THREE.Vector3(this.rng.range(-0.1, 0.1), -0.4, this.rng.range(-0.1, 0.1)), life: 0.35, size: 0.006 * this.k, alpha: 1, gravity: 3, drag: 1, color: EMBER_HOT, fadeIn: 0 });
  }

  /** The butt leaves the hand with the hand's velocity (plus a flick for `toss`). */
  release(flick) {
    const tip = this.tipWorld();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.character.getWorldQuaternion(tmpQ));
    const side = new THREE.Vector3(-1, 0, 0).applyQuaternion(tmpQ);
    const vel = this.tipVel.clone().clampLength(0, 4);
    if (flick) vel.addScaledVector(fwd, 2.2).addScaledVector(side, 0.8).add(new THREE.Vector3(0, 1.2, 0));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.008 * this.k, 0.008 * this.k, 0.05 * this.k), new THREE.MeshLambertMaterial({ color: '#e8e2d4' }));
    mesh.position.copy(tip);
    this.scene.add(mesh);
    this.butt = { mesh, vel, spin: new THREE.Vector3(this.rng.range(-14, 14), this.rng.range(-8, 8), this.rng.range(-14, 14)), smoulder: this.lit ? 7 : 0, rest: false, ground: this.character.getWorldPosition(new THREE.Vector3()).y };
    this.held = false;
    if (this.cigMesh) this.cigMesh.visible = false;
  }

  grind() {
    if (!this.butt) return;
    const at = this.butt.mesh.position;
    for (let i = 0; i < 4; i++) this.spawn(this.smokeP, at, { vel: new THREE.Vector3(this.rng.range(-0.25, 0.25), this.rng.range(0.05, 0.2), this.rng.range(-0.25, 0.25)), life: 0.9, size: 0.012 * this.k, grow: 0.05, alpha: 0.45, drag: 3, lift: 0.1, color: NOSE_COLOR });
    if (this.butt.smoulder > 0) for (let i = 0; i < 3; i++) this.spawn(this.glowP, at, { vel: new THREE.Vector3(this.rng.range(-0.4, 0.4), this.rng.range(0.1, 0.5), this.rng.range(-0.4, 0.4)), life: 0.3, size: 0.005 * this.k, alpha: 1, gravity: 4, color: EMBER_HOT, fadeIn: 0 });
    this.butt.smoulder = Math.min(this.butt.smoulder, 0);
    this.butt.flatten = true;
  }

  /** Swirl velocity (divergence-free in xz, from a moving stream function), strength 0..1. */
  swirl(p, t, out) {
    const x = p.x * 9;
    const y = p.y * 7;
    const z = p.z * 9;
    const a = Math.cos(z + t * 1.7 + y) * 0.6 + Math.cos(z * 1.9 - t * 1.1) * 0.4;
    const b = Math.sin(x - t * 1.3 + y * 0.7) * 0.6 + Math.sin(x * 2.1 + t * 0.9) * 0.4;
    return out.set(a, 0, -b);
  }

  updateParticles(list, layer, dt) {
    const g = layer.geometry.attributes;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.life > 0) {
        p.life -= dt;
        p.age += dt;
        if (p.swirl) {
          const strength = p.swirl * THREE.MathUtils.smoothstep(p.age, 0.25, 1.1) * 0.35;
          p.vel.addScaledVector(this.swirl(p.pos, this.time, tmpV), strength * dt * 4);
        }
        p.vel.y += (p.lift - p.gravity) * dt;
        p.vel.multiplyScalar(Math.exp(-p.drag * dt));
        p.pos.addScaledVector(p.vel, dt);
        p.size += p.grow * dt * Math.max(0.25, p.life / p.max);
        p.spin += p.spinRate * dt;
      }
      const live = p.life > 0;
      const fade = live ? Math.min(1, p.age / Math.max(1e-3, p.fadeIn)) * Math.min(1, (p.life / p.max) * 1.8) : 0;
      g.position.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      g.size.setX(i, p.size);
      g.alpha.setX(i, live ? p.alpha * fade : 0);
      g.spin.setX(i, p.spin);
      g.tint.setXYZ(i, p.color.r, p.color.g, p.color.b);
    }
    for (const name of ['position', 'size', 'alpha', 'spin', 'tint']) g[name].needsUpdate = true;
  }

  updateButt(dt) {
    const b = this.butt;
    if (!b) return;
    if (!b.rest) {
      b.vel.y -= 9.8 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      const floor = b.ground + 0.004 * this.k;
      if (b.mesh.position.y < floor) {
        b.mesh.position.y = floor;
        if (Math.abs(b.vel.y) < 0.6) {
          b.rest = true;
          b.mesh.rotation.set(0, b.mesh.rotation.y, 0);
        } else {
          b.vel.y *= -0.3;
          b.vel.x *= 0.55;
          b.vel.z *= 0.55;
          b.spin.multiplyScalar(0.5);
        }
      }
    }
    if (b.flatten) b.mesh.scale.set(1.6, 0.35, 0.8);
    b.smoulder -= dt;
    if (b.smoulder > 0) {
      b.clock = (b.clock ?? 0) - dt;
      if (b.clock <= 0) {
        b.clock = 0.14;
        this.spawn(this.smokeP, b.mesh.position, { vel: new THREE.Vector3(0, 0.08, 0), life: 2, size: 0.008 * this.k, grow: 0.03, alpha: 0.32 * Math.min(1, b.smoulder / 2), drag: 0.8, lift: 0.12, swirl: 1 });
      }
    }
    b.age = (b.age ?? 0) + dt;
    if (b.age > 30) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      this.butt = null;
    }
  }

  update(dt) {
    this.time += dt;
    if (this.autoHide && this.cigMesh) this.cigMesh.visible = this.held && !!this.smokingSeen;
    const smoking = !this.autoHide || this.smokingSeen;
    this.smokingSeen = false;
    const tip = this.tip && this.held ? this.tipWorld() : null;
    if (tip) {
      if (this.lastTip && dt > 0) this.tipVel.copy(tip).sub(this.lastTip).divideScalar(dt);
      this.lastTip = (this.lastTip ?? new THREE.Vector3()).copy(tip);
    }
    // Ember: dim idle glow, flaring through a drag.
    this.drawTimer -= dt;
    const drawing = this.drawTimer > 0;
    this.draw += ((drawing ? 1 : 0) - this.draw) * Math.min(1, dt * (drawing ? 5 : 1.6));
    const glowList = this.glowP;
    const showEmber = !!tip && this.lit && smoking;
    // Slot 0: ember, slot 1: lighter flame, slot 2: butt ember; the rest are sparks.
    const ember = glowList[0];
    ember.life = showEmber ? 1 : 0;
    ember.max = 1;
    ember.age = 1;
    if (showEmber) {
      ember.pos.copy(tip);
      const flicker = 0.85 + 0.15 * Math.sin(this.time * 23) * Math.sin(this.time * 7.3);
      ember.size = (0.011 + 0.01 * this.draw) * this.k;
      ember.alpha = (0.55 + 0.45 * this.draw) * flicker;
      ember.color = EMBER_DIM.clone().lerp(EMBER_HOT, this.draw);
    }
    const flame = glowList[1];
    flame.life = this.flame && this.lighter.visible ? 1 : 0;
    flame.max = 1;
    flame.age = 1;
    if (flame.life > 0) {
      this.worldPoint(this.lighter, this.lighter.userData.flameOffset, flame.pos);
      flame.size = (0.022 + 0.004 * Math.sin(this.time * 31)) * this.k;
      flame.alpha = 0.9;
      flame.color = FLAME;
    }
    const buttGlow = glowList[2];
    buttGlow.life = this.butt && this.butt.smoulder > 0 ? 1 : 0;
    buttGlow.max = 1;
    buttGlow.age = 1;
    if (buttGlow.life > 0) {
      buttGlow.pos.copy(this.butt.mesh.position);
      buttGlow.size = 0.009 * this.k;
      buttGlow.alpha = 0.7 * Math.min(1, this.butt.smoulder / 2);
      buttGlow.color = EMBER_DIM;
    }
    // Wisp from the tip: steady, thinned while drawing (the air goes in through the tip).
    if (showEmber) {
      this.wispClock -= dt;
      const interval = 0.035 + this.draw * 0.15;
      while (this.wispClock <= 0) {
        this.wispClock += interval;
        const jitter = new THREE.Vector3(this.rng.range(-0.004, 0.004), 0, this.rng.range(-0.004, 0.004));
        this.spawn(this.smokeP, tip.clone().add(jitter), { vel: new THREE.Vector3(0, 0.05, 0), life: 2.6, size: 0.006 * this.k, grow: 0.024 * this.k, alpha: 0.26, drag: 0.9, lift: 0.16, swirl: 1, fadeIn: 0.15 });
      }
    }
    this.updateExhale(dt);
    this.updateButt(dt);
    for (let i = 3; i < glowList.length; i++) if (glowList[i].life > 0) glowList[i].alpha *= Math.exp(-dt * 2);
    this.updateParticles(this.smokeP, this.smoke, dt);
    this.updateParticles(glowList, this.glow, dt);
  }

  /** Exhale plume (rate and speed fall off over the breath), then the nose trail. */
  updateExhale(dt) {
    if (!this.mouth || (this.exhaleTimer <= 0 && this.trailTimer <= 0)) return;
    const mouth = this.worldPoint(this.head, this.mouth);
    const headQ = this.head.getWorldQuaternion(tmpQ);
    if (this.exhaleTimer > 0) {
      const u = 1 - this.exhaleTimer / this.exhaleDuration;
      const dir = new THREE.Vector3(0.22, 0.12, 1).normalize().applyQuaternion(headQ);
      const rate = 85 * (1 - u) ** 0.6 + 8;
      this.exhaleClock -= dt;
      while (this.exhaleClock <= 0) {
        this.exhaleClock += 1 / rate;
        const spread = new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)).multiplyScalar(0.16);
        const speed = (1.65 - u * 0.9) * this.rng.range(0.85, 1.15);
        this.spawn(this.smokeP, mouth.clone().addScaledVector(dir, 0.015 * this.k), { vel: dir.clone().add(spread).normalize().multiplyScalar(speed), life: this.rng.range(1.2, 1.7), size: 0.02 * this.k, grow: 0.095 * this.k, alpha: 0.2 - u * 0.06, drag: 1.9, lift: 0.28, swirl: 0.8, fadeIn: 0.2 });
      }
      this.exhaleTimer -= dt;
      if (this.exhaleTimer <= 0) this.trailTimer = 1.1;
      return;
    }
    // The last of the breath: thin puffs from the nose, drifting down and forward before they rise.
    this.trailTimer -= dt;
    this.exhaleClock -= dt;
    const nose = mouth.clone().add(new THREE.Vector3(0, 0.024 * this.k, 0.006 * this.k).applyQuaternion(headQ));
    while (this.exhaleClock <= 0) {
      this.exhaleClock += 0.09;
      const dir = new THREE.Vector3(this.rng.range(-0.3, 0.3), -0.7, 0.6).normalize().applyQuaternion(headQ);
      this.spawn(this.smokeP, nose, { vel: dir.multiplyScalar(0.22), life: 1.8, size: 0.009 * this.k, grow: 0.05 * this.k, alpha: 0.26 * Math.max(0, this.trailTimer), drag: 2, lift: 0.12, swirl: 1, color: NOSE_COLOR });
    }
  }

  dispose() {
    this.scene.remove(this.smoke.points, this.glow.points);
    for (const l of [this.smoke, this.glow]) {
      l.geometry.dispose();
      l.material.dispose();
    }
    if (this.butt) this.scene.remove(this.butt.mesh);
    this.lighter.removeFromParent();
  }
}
