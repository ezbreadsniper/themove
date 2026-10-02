import * as THREE from 'three';

/**
 * Pixel particles: one THREE.Points per effect (blood mist, dust, sparks) with a fixed ring of slots,
 * CPU-integrated (gravity, drag, floor). Points are drawn as square nearest-filtered sprites, which
 * is exactly the PS2-era look. Dead slots park far below the world. `onLand(p)` lets the owner turn
 * a falling drop into a floor decal.
 */
const PARK = -9999;

export class ParticlePool {
  constructor({ scene = null, count = 256, size = 0.05, texture = null, blending = THREE.NormalBlending, opacity = 1, gravity = 9.8, drag = 1.5, name = 'particles', alphaTest = 0.5 } = {}) {
    this.count = count;
    this.gravity = gravity;
    this.drag = drag;
    this.pos = new Float32Array(count * 3).fill(PARK);
    this.col = new Float32Array(count * 3).fill(1);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.age = new Float32Array(count);
    this.floor = new Float32Array(count).fill(-Infinity);
    this.tag = new Array(count).fill(null);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.PointsMaterial({
      size, map: texture, vertexColors: true, transparent: blending !== THREE.NormalBlending || opacity < 1, opacity,
      blending, depthWrite: blending === THREE.NormalBlending && opacity >= 1, alphaTest: blending === THREE.NormalBlending ? alphaTest : 0, sizeAttenuation: true, fog: true,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.name = name;
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene?.add(this.points);
    this.alive = 0;
  }

  /** Spawns one particle: p, v (Vector3 or arrays), colour, life (s), floor height (lands there). */
  emit(p, v, color, life, { floor = -Infinity, tag = null } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    const o = i * 3;
    this.pos[o] = p.x;
    this.pos[o + 1] = p.y;
    this.pos[o + 2] = p.z;
    this.vel[o] = v.x;
    this.vel[o + 1] = v.y;
    this.vel[o + 2] = v.z;
    this.col[o] = color.r;
    this.col[o + 1] = color.g;
    this.col[o + 2] = color.b;
    this.life[i] = life;
    this.age[i] = 0;
    this.floor[i] = floor;
    this.tag[i] = tag;
    return i;
  }

  update(dt, onLand = null) {
    let alive = 0;
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      const o = i * 3;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      this.vel[o] *= damp;
      this.vel[o + 2] *= damp;
      this.vel[o + 1] = this.vel[o + 1] * damp - this.gravity * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] <= this.floor[i]) {
        this.pos[o + 1] = this.floor[i];
        onLand?.({ x: this.pos[o], y: this.floor[i], z: this.pos[o + 2], tag: this.tag[i] });
        this.kill(i);
        continue;
      }
      // Fade out over the last third by darkening toward black (works for additive sparks too).
      const k = this.age[i] / this.life[i];
      if (k > 0.66 && this.material.blending === THREE.AdditiveBlending) {
        const f = 1 - (k - 0.66) * 2.9 * dt * 6;
        this.col[o] *= f;
        this.col[o + 1] *= f;
        this.col[o + 2] *= f;
      }
      alive++;
    }
    this.alive = alive;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  kill(i) {
    this.life[i] = 0;
    this.pos[i * 3 + 1] = PARK;
  }
}
