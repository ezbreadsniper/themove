import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { buildFxTextures, BLOOD } from './textures.js';
import { DecalSystem, DECAL } from './decals.js';
import { ParticlePool } from './particles.js';

export { DecalSystem, DECAL, fitOnSurface, floorClear, poolRadii } from './decals.js';
export { ParticlePool } from './particles.js';

/**
 * Combat FX: muzzle flashes, bullet impacts (hole decal on static surfaces, dust puff, sparks),
 * blood (mist burst, spatter projected on whatever is behind the victim, falling drops that land
 * as floor drips, stains on clothing parented to the hit bone), blood trails while a wounded NPC
 * moves, and a pool that spreads under a body over ~10 s.
 *
 * new FxSystem({ scene, collision, worldRay, seed }) ; update(dt) every frame.
 * worldRay.raycast(origin, dir, max) → surface hit (src/combat/hitscan.js WorldRay).
 */
export const FX = Object.freeze({
  spatterRange: 3,
  flashTime: 0.05,
  flashLight: { color: '#ffb469', intensity: 9, distance: 7 },
  trailStep: 0.38,
  poolDelay: 1.6,
  poolGrow: 10,
});

const col = (hex) => new THREE.Color(hex);
const MIST = [col('#8c1012'), col('#6e0b0d'), col('#a01416'), col('#5a0709')];
const DUST = [col('#8a8070'), col('#6e675c'), col('#a09888')];
const SPARK = [col('#ffe7a0'), col('#ffc65a'), col('#ffffff')];

export class FxSystem {
  constructor({ scene, collision = null, worldRay = null, seed = 'fx' } = {}) {
    this.scene = scene;
    this.collision = collision;
    this.worldRay = worldRay;
    this.rng = createRng(`fx:${seed}`);
    this.tex = buildFxTextures(seed);
    this.decals = new DecalSystem({ scene, collision, textures: this.tex, seed });
    this.mist = new ParticlePool({ scene, count: 320, size: 0.035, texture: this.tex.dot, gravity: 3.5, drag: 5, name: 'fx-mist' });
    this.drops = new ParticlePool({ scene, count: 160, size: 0.022, texture: this.tex.dot, gravity: 9.8, drag: 0.6, name: 'fx-drops' });
    this.dust = new ParticlePool({ scene, count: 160, size: 0.09, texture: this.tex.puff, opacity: 0.55, gravity: -0.25, drag: 3.2, name: 'fx-dust', alphaTest: 0.05 });
    this.sparks = new ParticlePool({ scene, count: 120, size: 0.03, texture: this.tex.dot, blending: THREE.AdditiveBlending, gravity: 9.8, drag: 1.2, name: 'fx-sparks' });
    // The flash light lives in the scene from the start (adding a light later recompiles every shader).
    const fl = FX.flashLight;
    this.light = new THREE.PointLight(fl.color, 0, fl.distance, 2);
    this.light.name = 'fx-muzzle-light';
    scene?.add(this.light);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.flash.name = 'fx-muzzle-flash';
    this.flash.visible = false;
    this.flash.renderOrder = 4;
    scene?.add(this.flash);
    this.flashT = 0;
    this.wounded = new Map();
    this.bodies = [];
    this.stats = { holes: 0, splats: 0, drips: 0, stains: 0, pools: 0 };
  }

  r() {
    return this.rng.next();
  }

  pick(list) {
    return list[Math.floor(this.r() * list.length)];
  }

  /** Random unit vector biased toward `dir` within roughly `cone` radians. */
  jitter(dir, cone) {
    const v = new THREE.Vector3(this.r() * 2 - 1, this.r() * 2 - 1, this.r() * 2 - 1).multiplyScalar(Math.tan(cone));
    return dir.clone().add(v).normalize();
  }

  floorBelow(p, reach = 3) {
    return this.collision?.groundAt(p.x, p.z, p.y + 0.05, 0.1)?.y ?? this.collision?.groundAt(p.x, p.z, p.y, reach)?.y ?? null;
  }

  // --- muzzle flash ------------------------------------------------------------------------------

  muzzleFlash(pos, dir, { size = 0.24 } = {}) {
    this.flash.position.copy(pos).addScaledVector(dir, size * 0.35);
    this.flash.scale.setScalar(size * (0.8 + this.r() * 0.4));
    this.flash.material.rotation = this.r() * Math.PI * 2;
    this.flash.visible = true;
    this.light.position.copy(pos).addScaledVector(dir, 0.1);
    this.light.intensity = FX.flashLight.intensity;
    this.flashT = FX.flashTime;
    // A few hot sparks out of the barrel.
    for (let i = 0; i < 3; i++) this.sparks.emit(pos, this.jitter(dir, 0.25).multiplyScalar(5 + this.r() * 4), this.pick(SPARK), 0.05 + this.r() * 0.06);
  }

  // --- impacts -----------------------------------------------------------------------------------

  /** Bullet hitting the world or a prop: hole decal only on static surfaces, dust and sparks always. */
  impact(hit, dir, { decal = true, material = null } = {}) {
    const n = hit.normal;
    const p = hit.point;
    if (decal) {
      const m = this.decals.place('hole', hit, 0.028 + this.r() * 0.01, { texture: this.pick(this.tex.holes) });
      if (m) this.stats.holes++;
    }
    const reflect = dir.clone().reflect(n);
    const dusty = material !== 'metal' && material !== 'glass';
    if (dusty) {
      for (let i = 0; i < 7; i++) {
        const v = this.jitter(n.clone().lerp(reflect, 0.3).normalize(), 0.6).multiplyScalar(0.6 + this.r() * 1.4);
        this.dust.emit(p.clone().addScaledVector(n, 0.02), v, this.pick(DUST), 0.45 + this.r() * 0.5);
      }
    }
    const sparks = material === 'metal' || material === 'electronics' ? 8 : material === 'glass' ? 2 : 3;
    for (let i = 0; i < sparks; i++) {
      this.sparks.emit(p.clone().addScaledVector(n, 0.01), this.jitter(reflect, 0.5).multiplyScalar(2.5 + this.r() * 4), this.pick(SPARK), 0.12 + this.r() * 0.2);
    }
  }

  // --- blood -------------------------------------------------------------------------------------

  /**
   * A round hitting a body: mist both ways, spatter on the surfaces behind (rays along the shot up to
   * 3 m), drops falling to the floor, a stain on the clothing at the wound.
   * opts: { character (posed), joint (rig joint hit), part, npc, exit: chance of an exit spray }
   */
  blood(hit, dir, { character = null, joint = null, part = 'torso', npc = null } = {}) {
    const p = hit.point.clone();
    const d = dir.clone().normalize();
    const heavy = part === 'head' ? 1.6 : 1;
    // Mist: a fine spray back toward the shooter and a heavier one out of the exit side.
    for (let i = 0; i < 26 * heavy; i++) {
      const forward = i % 3 !== 0;
      const v = this.jitter(forward ? d : d.clone().negate(), forward ? 0.45 : 0.7).multiplyScalar(forward ? 1.2 + this.r() * 2.6 : 0.4 + this.r() * 1.2);
      this.mist.emit(p, v, this.pick(MIST), 0.25 + this.r() * 0.45);
    }
    // Drops that fall and land as drips.
    const floor = this.floorBelow(p);
    for (let i = 0; i < 6 * heavy; i++) {
      const v = this.jitter(d, 0.6).multiplyScalar(0.6 + this.r() * 2.2);
      v.y += this.r() * 0.6;
      this.drops.emit(p, v, this.pick(MIST), 2.5, { floor: floor ?? -Infinity, tag: 'drop' });
    }
    // Spatter on what's behind.
    if (this.worldRay) {
      const rays = part === 'head' ? 4 : 3;
      for (let i = 0; i < rays; i++) {
        const rd = this.jitter(d, i === 0 ? 0.06 : 0.32);
        if (i > 0) rd.y -= 0.15 * this.r();
        rd.normalize();
        const h = this.worldRay.raycast(p.clone().addScaledVector(rd, 0.05), rd, FX.spatterRange);
        if (!h || !h.static) continue;
        const dist = h.distance;
        const half = (0.09 + dist * 0.06 + this.r() * 0.05) * (i === 0 ? 1.2 : 0.75) * (part === 'head' ? 1.15 : 1);
        const graze = 1 - Math.abs(rd.dot(h.normal));
        const m = this.decals.place('splat', h, half, { texture: this.pick(this.tex.splats), stretch: [1, 1 + graze * 0.8], up: rd });
        if (m) this.stats.splats++;
      }
    }
    if (character && joint) this.stain(character, joint, hit);
    if (npc) this.wound(npc);
  }

  /** A small soaked spot on the clothing, parented to the bone the round hit. */
  stain(character, joint, hit) {
    const rig = character.userData?.rig;
    const bone = rig?.byName?.[joint] ?? rig?.bones?.find((b) => b.userData?.joint === joint);
    if (!bone) return null;
    this.decals.recycle('stain');
    const m = new THREE.Mesh(this.decals.quad, this.decals.material(this.tex.stain));
    m.name = 'fx-stain';
    const n = hit.normal.clone().normalize();
    const world = new THREE.Object3D();
    world.position.copy(hit.point).addScaledVector(n, 0.006);
    world.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    world.scale.setScalar(0.07 + this.r() * 0.03);
    bone.updateMatrixWorld(true);
    world.updateMatrix();
    m.matrixAutoUpdate = true;
    const local = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(world.matrix);
    local.decompose(m.position, m.quaternion, m.scale);
    m.renderOrder = 2;
    bone.add(m);
    this.decals.live.stain.push(m);
    this.stats.stains++;
    return m;
  }

  // --- trails & pools ----------------------------------------------------------------------------

  wound(npc) {
    const w = this.wounded.get(npc) ?? { wounds: 0, last: null };
    w.wounds++;
    this.wounded.set(npc, w);
  }

  /** Death: a pool spreads under the body's chest once it has settled on the floor. */
  bodyDown(npc, { delay = FX.poolDelay } = {}) {
    if (this.bodies.some((b) => b.npc === npc)) return;
    this.bodies.push({ npc, t: delay, started: false });
  }

  bodyCentre(npc) {
    const rig = npc.character?.userData?.rig;
    const at = (j) => {
      const b = rig?.byName?.[j] ?? rig?.bones?.find((x) => x.userData?.joint === j);
      return b ? b.getWorldPosition(new THREE.Vector3()) : null;
    };
    const spine = at('Spine1');
    const hips = at('Hips');
    if (spine && hips) return spine.lerp(hips, 0.35);
    const p = npc.pos ?? npc.holder?.position;
    return p ? new THREE.Vector3(p.x, p.y, p.z) : null;
  }

  startPool(npc) {
    const c = this.bodyCentre(npc);
    if (!c) return null;
    const y = this.floorBelow(c, 2);
    if (y === null) return null;
    const candidates = [c.clone().setY(y)];
    const p = npc.pos ?? npc.holder?.position;
    if (p) candidates.push(new THREE.Vector3(p.x, y, p.z));
    for (const at of candidates) {
      const pool = this.decals.pool(at, { maxR: 0.55 + this.r() * 0.15, duration: FX.poolGrow });
      if (pool) {
        this.stats.pools++;
        return pool;
      }
    }
    return null;
  }

  dripUnder(pos, spread = 0.18) {
    const x = pos.x + (this.r() * 2 - 1) * spread;
    const z = pos.z + (this.r() * 2 - 1) * spread;
    const y = this.collision?.groundAt(x, z, pos.y + 0.3, 0.6)?.y ?? (this.collision ? null : pos.y);
    if (y === null || y === undefined) return null;
    const m = this.decals.place('drop', { point: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(0, 1, 0), floor: true }, 0.025 + this.r() * 0.03, { texture: this.pick(this.tex.drops) });
    if (m) this.stats.drips++;
    return m;
  }

  update(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flash.visible = false;
        this.light.intensity = 0;
      }
    }
    this.mist.update(dt);
    this.dust.update(dt);
    this.sparks.update(dt);
    this.drops.update(dt, (p) => this.dripUnder(p, 0));
    // Blood trails: wounded NPCs on the move drip every trailStep metres.
    for (const [npc, w] of this.wounded) {
      if (npc.dead) continue;
      const p = npc.pos ?? npc.holder?.position;
      if (!p) continue;
      if (!w.last) w.last = { x: p.x, z: p.z };
      const moved = Math.hypot(p.x - w.last.x, p.z - w.last.z);
      if (moved > FX.trailStep / Math.min(2, w.wounds)) {
        w.last = { x: p.x, z: p.z };
        this.dripUnder({ x: p.x, y: p.y, z: p.z });
      }
    }
    for (const b of this.bodies) {
      if (b.started) continue;
      b.t -= dt;
      if (b.t <= 0) {
        b.started = true;
        b.pool = this.startPool(b.npc);
      }
    }
    this.decals.update(dt);
  }
}

export { BLOOD };
