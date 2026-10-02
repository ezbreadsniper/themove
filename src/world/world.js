import * as THREE from 'three';
import { MaterialLibrary } from './kit/materials.js';
import { CollisionWorld } from './physics/collision.js';
import { LightBaker } from './lighting/bake.js';
import { DUSK, bakeSky, createSkyDome, createSun, CharacterProbe } from './lighting/dusk.js';
import { DoorSystem } from './doors.js';
import { buildFoundry, FOUNDRY } from './locations/foundry/index.js';

/**
 * A loaded location: meshes, baked lighting, collision, doors, sky/sun and the character probe.
 * `attach(scene)` / `detach()` let the creator switch between the character stage and the world.
 */
export class World {
  constructor({ location = FOUNDRY, build = buildFoundry, rays = 20 } = {}) {
    this.location = location;
    this.lib = new MaterialLibrary();
    const t0 = performance.now();
    this.data = build(this.lib);
    this.buildMs = performance.now() - t0;
    this.root = this.data.root;
    this.baker = new LightBaker({ occluders: this.data.occluders, lights: this.data.lights, sky: bakeSky(DUSK), zones: location.zones, rays });
    const t1 = performance.now();
    const meshes = [];
    this.root.traverse((o) => o.isMesh && meshes.push(o));
    this.vertices = this.baker.bakeMeshes(meshes);
    this.bakeMs = performance.now() - t1;
    this.collision = new CollisionWorld({ solids: this.data.solids, walkables: this.data.walkables });
    this.doors = new DoorSystem(this.data.dynamics, this.collision);
    this.sky = createSkyDome(DUSK);
    const { sun, target } = createSun(location.bounds, DUSK);
    this.sun = sun;
    this.sunTarget = target;
    this.probe = new CharacterProbe(this.baker);
    this.dynamicLights = this.data.lights.filter((l) => l.dynamic).map((l) => {
      const light = new THREE.PointLight(l.color, l.intensity * 0.6, l.range, 2);
      light.position.fromArray(l.pos);
      light.name = l.name;
      return light;
    });
    this.group = new THREE.Group();
    this.group.name = `location:${location.id}`;
    this.group.add(this.root, this.sky, this.sun, this.sunTarget, this.probe.light, ...this.dynamicLights);
  }

  get markers() {
    return this.data.markers;
  }

  stats() {
    return { ...this.data.stats, vertices: this.vertices, buildMs: Math.round(this.buildMs), bakeMs: Math.round(this.bakeMs), solids: this.collision.solids.length, walkables: this.collision.walkables.length, lights: this.data.lights.length };
  }

  attach(scene) {
    this.scene = scene;
    this.saved = { fog: scene.fog, background: scene.background };
    this.fog = new THREE.Fog(DUSK.fog.color, DUSK.fog.near, DUSK.fog.far);
    scene.fog = this.fog;
    scene.background = new THREE.Color(DUSK.fog.color);
    scene.add(this.group);
  }

  detach() {
    if (!this.scene) return;
    this.scene.remove(this.group);
    this.scene.fog = this.saved.fog;
    this.scene.background = this.saved.background;
    this.scene = null;
  }

  /** Per-frame: doors react to `actor` (player or camera), probe follows `actor`, sky follows camera. */
  update(dt, { actor, camera }) {
    this.doors.update(dt, actor);
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
