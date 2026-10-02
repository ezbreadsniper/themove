import * as THREE from 'three';

/**
 * Dusk lighting setup shared by every exterior location: a low warm sun (the only live shadowed
 * light on world geometry), a cool sky gradient that feeds the bake, haze fog, and the character
 * light probe. Values chosen against the reference photos (warm window light, cool ambient).
 */
export const DUSK = Object.freeze({
  sky: { zenith: '#34406e', horizon: '#f2a066', horizonAway: '#9d8fa6', ground: '#4a4339', intensity: 1.0 },
  sunDir: new THREE.Vector3(0.42, 0.2, -0.88).normalize().toArray(),
  sunColor: '#ffb070',
  sunIntensity: 4.2,
  fog: { color: '#b49488', near: 30, far: 150 },
  exposure: 1.0,
});

export function bakeSky(preset = DUSK) {
  return { ...preset.sky, sunDir: preset.sunDir };
}

/** Gradient sky dome with a sun glow, unlit and fog-free. */
export function createSkyDome(preset = DUSK, radius = 380) {
  const g = new THREE.SphereGeometry(radius, 32, 16);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zen = new THREE.Color(preset.sky.zenith);
  const hor = new THREE.Color(preset.sky.horizon);
  const away = new THREE.Color(preset.sky.horizonAway);
  const below = new THREE.Color('#5a4c48');
  const sun = new THREE.Vector3(...preset.sunDir);
  const d = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const facing = Math.max(0, new THREE.Vector2(d.x, d.z).normalize().dot(new THREE.Vector2(sun.x, sun.z).normalize()));
    const horizon = away.clone().lerp(hor, facing ** 2);
    if (d.y < 0) c.copy(horizon).lerp(below, Math.min(1, -d.y * 4));
    else c.copy(horizon).lerp(zen, Math.pow(d.y, 0.55));
    const glow = Math.pow(Math.max(0, d.dot(sun)), 64) * 1.4 + Math.pow(Math.max(0, d.dot(sun)), 6) * 0.25;
    c.r += glow;
    c.g += glow * 0.75;
    c.b += glow * 0.45;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.name = 'sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
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
  constructor(baker) {
    this.baker = baker;
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
    const up = this.baker.sample(p, [0, 1, 0]);
    const side = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((n) => this.baker.sample(p, n));
    const down = this.baker.sample(p, [0, -1, 0]);
    const avg = side.reduce((a, s) => a.map((v, i) => v + s[i] / 4), [0, 0, 0]);
    const k = Math.PI * 0.9;
    this.sky.setRGB((up[0] + avg[0]) * 0.5 * k, (up[1] + avg[1]) * 0.5 * k, (up[2] + avg[2]) * 0.5 * k);
    this.ground.setRGB((down[0] + avg[0]) * 0.5 * k, (down[1] + avg[1]) * 0.5 * k, (down[2] + avg[2]) * 0.5 * k);
    this.light.color.lerp(this.sky, 0.5);
    this.light.groundColor.lerp(this.ground, 0.5);
  }
}
