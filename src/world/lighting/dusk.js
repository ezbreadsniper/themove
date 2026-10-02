import * as THREE from 'three';

/**
 * Late-dusk ("blue hour") lighting shared by every exterior location: the sun has just set, so it
 * is a weak orange grazing light (still the only live shadowed light on world geometry), the sky is
 * a deep blue gradient with a last orange band toward the sun that feeds the bake, haze fog is cool
 * and close, and practical lights (streetlights, windows, lamps) carry the scene. NIGHT is the
 * fully dark variant; World.setTimeOfDay(k) blends the live parts (sky dome, fog, sun, baked sky
 * scale) between them without re-baking.
 */
export const DUSK = Object.freeze({
  sky: { zenith: '#1a2346', horizon: '#c0704e', horizonAway: '#4c4d6e', ground: '#2c2824', intensity: 0.85 },
  sunDir: new THREE.Vector3(0.42, 0.07, -0.88).normalize().toArray(),
  sunColor: '#ff8a52',
  sunIntensity: 1.35,
  fog: { color: '#4c4a62', near: 22, far: 130 },
  below: '#2a2430',
  glow: 0.8,
  skyScale: 1,
  exposure: 1.0,
});

export const NIGHT = Object.freeze({
  sky: { zenith: '#05070f', horizon: '#2a1f2a', horizonAway: '#11131f', ground: '#100f0d', intensity: 0.3 },
  sunDir: DUSK.sunDir,
  sunColor: '#7d8fc0',
  sunIntensity: 0.12,
  fog: { color: '#14141d', near: 16, far: 110 },
  below: '#0c0b10',
  glow: 0.1,
  skyScale: 0.28,
  exposure: 1.0,
});

/** Blend of two presets (k = 0 → a, 1 → b) for the live, non-baked parts. */
export function blendPresets(a, b, k) {
  const c = (x, y) => '#' + new THREE.Color(x).lerp(new THREE.Color(y), k).getHexString();
  const n = (x, y) => x + (y - x) * k;
  return {
    sky: { zenith: c(a.sky.zenith, b.sky.zenith), horizon: c(a.sky.horizon, b.sky.horizon), horizonAway: c(a.sky.horizonAway, b.sky.horizonAway), ground: c(a.sky.ground, b.sky.ground), intensity: n(a.sky.intensity, b.sky.intensity) },
    sunDir: a.sunDir,
    sunColor: c(a.sunColor, b.sunColor),
    sunIntensity: n(a.sunIntensity, b.sunIntensity),
    fog: { color: c(a.fog.color, b.fog.color), near: n(a.fog.near, b.fog.near), far: n(a.fog.far, b.fog.far) },
    below: c(a.below, b.below),
    glow: n(a.glow, b.glow),
    skyScale: n(a.skyScale, b.skyScale),
  };
}

export function bakeSky(preset = DUSK) {
  return { ...preset.sky, sunDir: preset.sunDir };
}

/** Gradient sky dome with a sun glow, unlit and fog-free. */
export function createSkyDome(preset = DUSK, radius = 380) {
  const g = new THREE.SphereGeometry(radius, 32, 16);
  const pos = g.attributes.position;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.name = 'sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  paintSkyDome(mesh, preset);
  return mesh;
}

/** (Re)colours a sky dome for a preset: horizon band toward the sun, zenith above, sun afterglow. */
export function paintSkyDome(mesh, preset) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const colors = g.attributes.color.array;
  const zen = new THREE.Color(preset.sky.zenith);
  const hor = new THREE.Color(preset.sky.horizon);
  const away = new THREE.Color(preset.sky.horizonAway);
  const below = new THREE.Color(preset.below ?? '#2a2430');
  const sun = new THREE.Vector3(...preset.sunDir);
  const d = new THREE.Vector3();
  const c = new THREE.Color();
  const glowK = preset.glow ?? 1;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const facing = Math.max(0, new THREE.Vector2(d.x, d.z).normalize().dot(new THREE.Vector2(sun.x, sun.z).normalize()));
    const horizon = away.clone().lerp(hor, facing ** 3);
    if (d.y < 0) c.copy(horizon).lerp(below, Math.min(1, -d.y * 4));
    else c.copy(horizon).lerp(zen, Math.pow(d.y, 0.45));
    const glow = (Math.pow(Math.max(0, d.dot(sun)), 48) * 0.6 + Math.pow(Math.max(0, d.dot(sun)), 5) * 0.18) * glowK;
    c.r += glow;
    c.g += glow * 0.55;
    c.b += glow * 0.3;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.attributes.color.needsUpdate = true;
}

/** Directional sun with a shadow frustum covering `bounds` (world XZ box). */
export function createSun(bounds, preset = DUSK) {
  const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const target = new THREE.Object3D();
  target.position.set(cx, 0, cz);
  sun.target = target;
  sun.position.set(cx + preset.sunDir[0] * 80, preset.sunDir[1] * 80, cz + preset.sunDir[2] * 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const half = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.42;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 220 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  return { sun, target };
}

/**
 * Character light probe: a hemisphere light whose sky/ground colours come from the bake sampler
 * at the character's position, so characters darken indoors and pick up window/lamp tint.
 */
export class CharacterProbe {
  /** options() → baker.sample options (current layer scales, sky scale, direct-light share). */
  constructor(baker, options = () => ({})) {
    this.baker = baker;
    this.options = options;
    this.light = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.timer = 0;
    this.sky = new THREE.Color();
    this.ground = new THREE.Color();
  }

  update(position, dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.2;
    const p = [position.x, position.y + 1.2, position.z];
    const o = this.options();
    const up = this.baker.sample(p, [0, 1, 0], o);
    const side = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((n) => this.baker.sample(p, n, o));
    const down = this.baker.sample(p, [0, -1, 0], o);
    const avg = side.reduce((a, s) => a.map((v, i) => v + s[i] / 4), [0, 0, 0]);
    const k = Math.PI * 0.9;
    this.sky.setRGB((up[0] + avg[0]) * 0.5 * k, (up[1] + avg[1]) * 0.5 * k, (up[2] + avg[2]) * 0.5 * k);
    this.ground.setRGB((down[0] + avg[0]) * 0.5 * k, (down[1] + avg[1]) * 0.5 * k, (down[2] + avg[2]) * 0.5 * k);
    this.light.color.lerp(this.sky, 0.5);
    this.light.groundColor.lerp(this.ground, 0.5);
  }
}
