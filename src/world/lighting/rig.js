import * as THREE from 'three';
import { flickerLevel } from './flicker.js';

/**
 * Runtime side of the world's lights.
 *
 * Logical lights (kit.light entries) are many; real three.js lights are a small fixed pool so the
 * shader light count never changes (no recompiles) and frame cost is bounded:
 *  - `points` unshadowed PointLights light characters near the focus (player or camera),
 *  - `spots` shadow-casting SpotLights (low-res retro maps) sit on the best `shadow: true` lights
 *    near the focus. World materials do not add their light (it is baked); instead each spot slot
 *    subtracts its own baked layer where its shadow map is blocked, so a character standing under
 *    a pendant throws a real shadow on the floor without double lighting.
 * Layer scales (switch state × flicker) drive the prelit shader and every emissive glowing on that
 * layer, so switching a lamp darkens the room, its bulb and its pooled light together.
 */
const CHAR_K = Math.PI * 0.55;
const REASSIGN = 0.25;

export class LightRig {
  constructor({ lights, layers, uniforms, points = 4, spots = 2, shadowSize = 256 }) {
    this.uniforms = uniforms;
    this.layers = layers;
    this.lights = lights.map((def) => ({ name: def.name, def, on: def.on !== false, level: 1, layer: def.layer ?? -1 }));
    this.lightsByName = new Map(this.lights.map((l) => [l.name, l]));
    this.layersByName = new Map(layers.map((l) => [l.name, l]));
    this.layerScale = new Array(uniforms.uLayerScale.value.length).fill(1);
    for (const layer of layers) {
      const c = new THREE.Color(layer.color ?? '#ffffff');
      uniforms.uLayerColor.value[layer.index].set(c.r, c.g, c.b);
    }
    this.group = new THREE.Group();
    this.group.name = 'light-rig';
    this.points = Array.from({ length: points }, (_, i) => {
      const p = new THREE.PointLight('#ffffff', 0, 6, 2);
      p.name = `rig-point-${i}`;
      this.group.add(p);
      return { light: p, src: null };
    });
    this.spots = Array.from({ length: spots }, (_, i) => {
      const s = new THREE.SpotLight('#ffffff', 0, 8, 1.2, 0.6, 2);
      s.name = `rig-spot-${i}`;
      s.castShadow = true;
      s.shadow.mapSize.set(shadowSize, shadowSize);
      s.shadow.bias = -0.0012;
      s.shadow.normalBias = 0.025;
      s.shadow.camera.near = 0.15;
      s.shadow.autoUpdate = false;
      this.group.add(s, s.target);
      return { light: s, src: null };
    });
    this.timer = 0;
    this.time = 0;
    this.shadows = true;
    this.updateScales();
  }

  /** Turns a light, or every light of a layer / circuit, on or off. Returns false if unknown. */
  setLight(name, on) {
    const l = this.lightsByName.get(name);
    const targets = l ? [l] : this.lightsByName.size && this.layersByName.has(name) ? this.layersByName.get(name).lights.map((n) => this.lightsByName.get(n)) : [];
    if (!targets.length) return false;
    for (const t of targets) t.on = !!on;
    this.updateScales();
    this.timer = 0;
    return true;
  }

  isOn(name) {
    const l = this.lightsByName.get(name);
    if (l) return l.on;
    const layer = this.layersByName.get(name);
    return layer ? layer.lights.some((n) => this.lightsByName.get(n).on) : false;
  }

  /** Effective output of a logical light (0..1): switch × flicker. */
  output(l) {
    return l.on ? l.level : 0;
  }

  updateScales() {
    const sums = new Map();
    for (const l of this.lights) {
      if (l.layer < 0) continue;
      const s = sums.get(l.layer) ?? [0, 0];
      s[0] += this.output(l);
      s[1] += 1;
      sums.set(l.layer, s);
    }
    const u = this.uniforms.uLayerScale.value;
    for (const [i, [sum, n]] of sums) {
      this.layerScale[i] = sum / n;
      u[i] = sum / n;
    }
  }

  /**
   * Per frame: flicker levels, layer scales, and (every REASSIGN s or on a switch) which logical
   * lights the pooled point / shadowed spot lights represent around `focus` (Vector3).
   */
  update(dt, { focus = null, zone = null } = {}) {
    this.time += dt;
    for (const l of this.lights) if (l.def.flicker) l.level = flickerLevel(l.def.flicker, this.time);
    this.updateScales();
    this.timer -= dt;
    if (focus && this.timer <= 0) {
      this.timer = REASSIGN;
      this.assign(focus, zone);
    }
    for (const slot of this.points) this.drive(slot);
    for (const slot of this.spots) this.drive(slot);
  }

  assign(focus, zone) {
    const scored = [];
    for (const l of this.lights) {
      const d = l.def;
      if (!d.dynamic && !d.shadow) continue;
      const out = this.output(l) || (d.flicker && l.on ? 0.5 : 0);
      if (out <= 0.02) continue;
      const dist = Math.hypot(d.pos[0] - focus.x, d.pos[1] - focus.y, d.pos[2] - focus.z);
      if (dist > d.range * 1.6) continue;
      const same = !zone || !d.zone || d.zone === zone ? 1 : 0.3;
      scored.push({ l, score: (d.intensity * out * same) / (1 + dist * dist) });
    }
    scored.sort((a, b) => b.score - a.score);
    const used = new Set();
    this.spots.forEach((slot, i) => {
      const pick = this.shadows ? scored.find((s) => !used.has(s.l) && s.l.def.shadow && s.l.layer >= 0) : null;
      slot.src = pick?.l ?? null;
      if (pick) used.add(pick.l);
      this.configureSpot(slot);
      this.uniforms.uSlotLayer.value[i] = slot.src ? slot.src.layer : -1;
    });
    for (const slot of this.points) {
      const pick = scored.find((s) => !used.has(s.l));
      slot.src = pick?.l ?? null;
      if (pick) {
        used.add(pick.l);
        slot.light.position.fromArray(pick.l.def.pos);
        slot.light.distance = pick.l.def.range * 1.2;
        slot.light.color.set(pick.l.def.color);
      }
    }
  }

  configureSpot(slot) {
    const s = slot.light;
    const l = slot.src;
    s.shadow.autoUpdate = !!l;
    if (!l) return;
    const d = l.def;
    s.position.fromArray(d.pos);
    const dir = d.dir ?? [0, -1, 0];
    s.target.position.set(d.pos[0] + dir[0], d.pos[1] + dir[1], d.pos[2] + dir[2]);
    s.target.updateMatrixWorld();
    s.angle = d.cone ? Math.min(1.35, Math.acos(d.cone) + 0.1) : 1.3;
    s.distance = d.range * 1.2;
    s.color.set(d.color);
    s.shadow.needsUpdate = true;
  }

  drive(slot) {
    slot.light.intensity = slot.src ? slot.src.def.intensity * this.output(slot.src) * CHAR_K : 0;
  }

  /** Debug / budget info. */
  stats() {
    return { logical: this.lights.length, layers: this.layers.length, points: this.points.length, spots: this.spots.length, activeSpots: this.spots.filter((s) => s.src).map((s) => s.src.name) };
  }
}
