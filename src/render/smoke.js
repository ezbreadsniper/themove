import * as THREE from 'three';
import { Raster } from '../tex/raster.js';
import { rasterToTexture } from '../character/build.js';

const POOL = 48;

function puffTexture() {
  const r = new Raster(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      const a = Math.max(0, 1 - d) ** 1.4;
      const step = Math.round(a * 4) / 4;
      r.data.set([214, 216, 220, Math.round(step * 200)], (y * 16 + x) * 4);
    }
  }
  return rasterToTexture(r, 'smokePuff');
}

/**
 * Pixel smoke for a character holding a cigarette: a thin wisp from the tip all the time, plus a
 * bigger exhale cloud from the mouth when the clip fires an 'exhale' event. Sprites are pooled.
 */
export class SmokeEmitter {
  constructor(scene, character) {
    this.character = character;
    this.tip = character.userData.cigaretteTip ?? null;
    this.mouth = character.userData.mouthOffset ?? null;
    this.material = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, fog: true });
    this.sprites = Array.from({ length: POOL }, () => {
      const s = new THREE.Sprite(this.material.clone());
      s.visible = false;
      scene.add(s);
      return { s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 0 };
    });
    this.timer = 0;
    this.scene = scene;
  }

  worldPoint(boneName, offset) {
    const bone = this.character.userData.rig.byName[boneName];
    bone.updateWorldMatrix(true, false);
    return offset.clone().applyMatrix4(bone.matrixWorld);
  }

  spawn(pos, { vel, size, life, grow }) {
    const p = this.sprites.find((q) => q.life <= 0);
    if (!p) return;
    p.s.position.copy(pos);
    p.s.scale.setScalar(size);
    p.s.visible = true;
    p.life = life;
    p.max = life;
    p.vel.copy(vel);
    p.grow = grow;
  }

  exhale() {
    if (!this.mouth) return;
    const mouth = this.worldPoint('Head', this.mouth);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.character.getWorldQuaternion(new THREE.Quaternion()));
    for (let i = 0; i < 14; i++) {
      const vel = fwd.clone().multiplyScalar(0.35 + Math.random() * 0.25).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.05 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12));
      this.spawn(mouth, { vel, size: 0.03, life: 1.6 + Math.random() * 0.8, grow: 0.16 });
    }
  }

  update(dt) {
    if (this.tip) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0.12;
        const tip = this.worldPoint('RightHand', this.tip);
        this.spawn(tip, { vel: new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.18 + Math.random() * 0.06, (Math.random() - 0.5) * 0.03), size: 0.012, life: 1.8, grow: 0.05 });
      }
    }
    for (const p of this.sprites) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.9);
      p.vel.y += dt * 0.05;
      p.s.scale.addScalar(p.grow * dt);
      p.s.material.opacity = Math.min(1, p.life / p.max * 1.4) * 0.8;
    }
  }

  dispose() {
    for (const p of this.sprites) this.scene.remove(p.s);
  }
}
