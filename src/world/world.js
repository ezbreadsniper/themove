import * as THREE from 'three';
import { MaterialLibrary } from './kit/materials.js';
import { CollisionWorld } from './physics/collision.js';
import { LightBaker } from './lighting/bake.js';
import { LightRig } from './lighting/rig.js';
import { DUSK, NIGHT, bakeSky, blendPresets, createSkyDome, paintSkyDome, createSun, aimSun, CharacterProbe } from './lighting/dusk.js';
import { DoorSystem } from './doors.js';
import { buildFoundry, FOUNDRY } from './locations/foundry/index.js';

/**
 * A loaded location: meshes, baked lighting, collision, doors, sky/sun, the light rig and the
 * character probe. `attach(scene)` / `detach()` let the creator switch between the character
 * stage and the world.
 *
 * Lighting API (docs/world/pass03.md):
 *  - world.setLight(name, on): a light name or a layer / circuit name; returns false if unknown.
 *  - world.lightsByName: Map name → { name, def, on, level, layer }.
 *  - world.setTimeOfDay(k): 0 = blue-hour dusk (default), 1 = night.
 *  - world.interactables, world.markers: gameplay data (contracts §2).
 */
export class World {
  constructor({ location = FOUNDRY, build = buildFoundry, rays = 20, points = 4, spots = 2, shadowSize = 256 } = {}) {
    this.location = location;
    this.lib = new MaterialLibrary();
    const t0 = performance.now();
    this.data = build(this.lib);
    this.buildMs = performance.now() - t0;
    this.root = this.data.root;
    this.baker = new LightBaker({ occluders: this.data.occluders, lights: this.data.lights, layers: this.data.layers, sky: bakeSky(NIGHT), zones: location.zones, rays, bounce: 0.1 });
    const t1 = performance.now();
    const meshes = [];
    this.root.traverse((o) => o.isMesh && meshes.push(o));
    this.vertices = this.baker.bakeMeshes(meshes);
    this.bakeMs = performance.now() - t1;
    this.collision = new CollisionWorld({ solids: this.data.solids, walkables: this.data.walkables });
    this.doors = new DoorSystem(this.data.dynamics, this.collision);
    this.rig = new LightRig({ lights: this.data.lights, layers: this.data.layers, uniforms: this.lib.uniforms, points, spots, shadowSize });
    this.sky = createSkyDome(NIGHT);
    const { sun, target } = createSun(location.bounds, NIGHT);
    this.sun = sun;
    this.sunTarget = target;
    this.probe = new CharacterProbe(this.baker, () => ({ layerScale: this.rig.layerScale, skyScale: this.lib.uniforms.uSkyScale.value, direct: 0.55 }));
    this.group = new THREE.Group();
    this.group.name = `location:${location.id}`;
    this.group.add(this.root, this.sky, this.sun, this.sunTarget, this.probe.light, this.rig.group);
    this.fog = new THREE.Fog(NIGHT.fog.color, NIGHT.fog.near, NIGHT.fog.far);
    this.timeOfDay = 0;
    this.setTimeOfDay(1);
  }

  get markers() {
    return this.data.markers;
  }

  get interactables() {
    return this.data.interactables;
  }

  get lightsByName() {
    return this.rig.lightsByName;
  }

  /** Switches a light (or a whole layer / circuit) on or off; also updates its emissive and pool light. */
  setLight(name, on) {
    return this.rig.setLight(name, on);
  }

  /** 0 = blue-hour dusk, 1 = night (default). Blends sky dome, fog, sun/moon and the baked sky contribution. */
  setTimeOfDay(k) {
    this.timeOfDay = Math.max(0, Math.min(1, k));
    const p = blendPresets(DUSK, NIGHT, this.timeOfDay);
    paintSkyDome(this.sky, p);
    this.fog.color.set(p.fog.color);
    this.fog.near = p.fog.near;
    this.fog.far = p.fog.far;
    this.sun.color.set(p.sunColor);
    aimSun(this.sun, p.sunDir);
    this.sun.intensity = p.sunIntensity;
    this.sunBase = p.sunIntensity;
    this.lib.uniforms.uSkyScale.value = p.skyScale;
    if (this.scene?.background?.isColor) this.scene.background.set(p.fog.color);
    this.probe.timer = 0;
  }

  stats() {
    let dynDraws = 0;
    for (const d of Object.values(this.data.dynamics)) dynDraws += d.group.children.length;
    return {
      ...this.data.stats, dynamicDrawCalls: dynDraws, vertices: this.vertices, buildMs: Math.round(this.buildMs), bakeMs: Math.round(this.bakeMs),
      solids: this.collision.solids.length, walkables: this.collision.walkables.length, lights: this.data.lights.length, layers: this.data.layers.length,
      interactables: this.data.interactables.length, physical: Object.values(this.data.dynamics).filter((d) => d.data?.physical).length,
      runtimeLights: this.rig.points.length + this.rig.spots.length + 2, shadowMaps: this.rig.spots.length + 1,
    };
  }

  attach(scene) {
    this.scene = scene;
    this.saved = { fog: scene.fog, background: scene.background };
    scene.fog = this.fog;
    scene.background = new THREE.Color(this.fog.color);
    scene.add(this.group);
  }

  detach() {
    if (!this.scene) return;
    this.scene.remove(this.group);
    this.scene.fog = this.saved.fog;
    this.scene.background = this.saved.background;
    this.scene = null;
  }

  /**
   * Per-frame (contracts §3): doors react to `bodies` (or the single `actor`), the light rig
   * flickers / pools lights around the actor (or camera), the probe follows the actor, sky follows
   * the camera.
   */
  update(dt, { actor, camera, bodies } = {}) {
    this.doors.update(dt, bodies ?? (actor ? [actor] : []));
    const focus = actor ?? camera?.position ?? null;
    const zone = focus ? this.baker.zoneAt([focus.x, focus.y + 1, focus.z])?.name ?? 'street' : null;
    this.rig.update(dt, { focus, zone });
    if (actor) this.probe.update(actor, dt);
    if (camera) this.sky.position.copy(camera.position);
    const cullFrom = camera?.position;
    if (cullFrom) {
      for (const g of Object.values(this.data.buckets)) {
        const d = g.userData.flags?.cullDistance;
        if (d) g.visible = cullFrom.distanceTo(new THREE.Vector3(12.5, 2, 6)) < d + 20;
      }
    }
  }
}
