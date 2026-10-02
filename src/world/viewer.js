import * as THREE from 'three';
import { World } from './world.js';
import { bakeUniforms } from './kit/materials.js';

/**
 * Editor-style free camera for exploring a location inside the creator (View → mode → world).
 * No collision: the camera flies through walls. WASD move, Q/E down/up, Shift fast, right-drag
 * (or left-drag) to look, wheel changes fly speed. Bookmarks jump to reference-matched shots.
 */
/**
 * Camera bookmarks. Optional per shot: `night` (0 dusk .. 1 night), `off` (lights / circuits to
 * switch off; every other light returns to its default), `character` (show the stand-in).
 */
export const SHOTS = {
  'ref: entry view (6-IMG_4108)': { pos: [13.25, 1.45, 7.75], target: [12.0, 2.55, 0.4] },
  'ref: top-down from mezz (2)': { pos: [12.0, 5.35, 7.75], target: [12.6, 0.3, 2.3] },
  'corridor: pools of light': { pos: [5.0, 1.62, 12.75], target: [24.5, 1.25, 12.45] },
  'corridor: doors, east to west': { pos: [24.3, 1.62, 13.0], target: [4.5, 1.15, 12.0] },
  'corridor: loft door spill': { pos: [13.6, 1.4, 13.15], target: [11.4, 0.4, 11.7] },
  'loft: lamp-lit night': { pos: [13.7, 1.55, 6.6], target: [11.4, 1.05, 1.0], night: 1 },
  'loft: lights off, TV only': { pos: [13.9, 1.2, 5.6], target: [10.1, 1.6, 3.4], night: 1, off: ['loft-track', 'orb-high', 'orb-low', 'floor-lamp', 'kitchen', 'neon-sign'] },
  'close: sofa': { pos: [12.9, 1.05, 2.55], target: [13.9, 0.4, 0.9] },
  'close: console + TV': { pos: [11.65, 1.15, 3.6], target: [10.1, 0.75, 4.0] },
  'close: kitchen run': { pos: [11.9, 1.45, 9.4], target: [10.2, 0.95, 9.9] },
  'gameplay: loft 3rd person': { pos: [12.6, 1.7, 7.9], target: [12.3, 1.2, 3.0], character: true },
  'street (spawn)': { pos: [2.5, 1.7, -4.2], target: [12, 4, 2] },
  'street, wide': { pos: [-6, 2.0, -12.5], target: [15, 4.5, 4] },
  'corner (collage)': { pos: [34, 1.8, -11.5], target: [17, 4.5, 6] },
  'entry door': { pos: [4.6, 1.7, -3.8], target: [4.6, 1.6, 1] },
  'entry hall': { pos: [4.6, 1.6, 0.9], target: [4.6, 1.4, 11.5] },
  'corridor': { pos: [4.6, 1.6, 12.5], target: [24.5, 1.4, 12.5] },
  'loft door from corridor': { pos: [13.5, 1.6, 13.1], target: [11.75, 1.2, 11.5] },
  'ref: window wall (IMG_0483)': { pos: [13.9, 1.6, 6.2], target: [11.2, 1.7, 0.4] },
  'ref: top-down from mezz (IMG_0520)': { pos: [12.6, 4.9, 7.9], target: [12.4, 0.1, 1.6] },
  'ref: stair top (IMG_7900)': { pos: [11.7, 5.0, 7.3], target: [12.2, 0.1, 2.5] },
  'ref: TV wall from sofa (IMG_7363)': { pos: [13.9, 0.95, 2.6], target: [10.1, 2.4, 4.6] },
  'ref: pendants, low (IMG_0059)': { pos: [14.2, 0.7, 3.4], target: [10.5, 4.4, 5.6] },
  'ref: stair to window (523CF3C2)': { pos: [12.3, 0.9, 9.0], target: [12.4, 2.6, 0.4] },
  'kitchen': { pos: [12.6, 1.6, 7.9], target: [10.3, 1.3, 10.2] },
  'bathroom': { pos: [13.3, 1.6, 10.9], target: [14.6, 1.0, 9.2] },
  'mezzanine': { pos: [14.4, 4.7, 7.9], target: [11.0, 3.4, 10.8] },
  'empty apt 1A': { pos: [7.7, 1.6, 10.6], target: [7.7, 2.5, 0.4] },
  'empty apt 1C': { pos: [17.5, 1.6, 10.6], target: [17.5, 2.5, 0.4] },
  'empty apt 1D': { pos: [22.5, 1.6, 10.6], target: [22.5, 2.5, 0.4] },
  'roof': { pos: [-4, 15, -12], target: [14, 6, 7] },
  'back lot': { pos: [28.5, 1.7, 22], target: [15, 2.5, 13] },
};

const FLY_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'];

export class WorldViewer {
  constructor(stage) {
    this.stage = stage;
    this.world = null;
    this.active = false;
    this.cam = { pos: new THREE.Vector3(...SHOTS['street (spawn)'].pos), yaw: 0, pitch: 0, speed: 4 };
    this.lookAt(SHOTS['street (spawn)'].target);
    this.keys = new Set();
    this.drag = null;
    this.settings = { shot: 'street (spawn)', speed: 4, colliders: false, walkables: false, interactables: false, fog: true, bake: 1, sun: 1, night: 0, shadows: true, character: true };
    this.debug = new THREE.Group();
    this.bindInput();
  }

  ensureWorld() {
    if (!this.world) this.world = new World();
    return this.world;
  }

  enter(entries) {
    const w = this.ensureWorld();
    this.active = true;
    w.attach(this.stage.scene);
    this.stage.scene.add(this.debug);
    this.stage.lights.visible = false;
    if (this.stage.ground) this.stage.ground.visible = false;
    this.stage.camera.near = 0.05;
    this.stage.camera.far = 450;
    this.stage.camera.fov = 60;
    this.stage.camera.updateProjectionMatrix();
    this.placeEntries(entries, w.markers.spawn.pos);
    this.applySettings();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.world.detach();
    this.stage.scene.remove(this.debug);
    this.stage.lights.visible = true;
    if (this.stage.ground) this.stage.ground.visible = true;
    this.stage.camera.far = 80;
    this.stage.camera.updateProjectionMatrix();
  }

  placeEntries(entries, pos) {
    entries.forEach((e, i) => {
      e.holder.position.set(pos[0] + i * 0.9, pos[1], pos[2]);
      e.holder.rotation.y = 0;
      e.holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      e.holder.visible = this.settings.character;
    });
    this.entries = entries;
  }

  /** Drops the characters on the floor under the point the camera looks at (or below the camera). */
  dropCharacterHere() {
    const fwd = this.forward();
    const c = this.world.collision;
    let p = this.cam.pos.clone().addScaledVector(new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), 2.5);
    const g = c.groundAt(p.x, p.z, this.cam.pos.y) ?? c.groundAt(this.cam.pos.x, this.cam.pos.z, this.cam.pos.y);
    if (!g) return;
    if (!c.groundAt(p.x, p.z, this.cam.pos.y)) p = this.cam.pos.clone();
    this.placeEntries(this.entries ?? [], [p.x, g.y, p.z]);
    this.entries?.forEach((e) => { e.holder.rotation.y = Math.atan2(-fwd.x, -fwd.z); });
  }

  lookAt(target) {
    const d = new THREE.Vector3(...target).sub(this.cam.pos).normalize();
    this.cam.yaw = Math.atan2(d.x, d.z);
    this.cam.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  }

  goTo(name) {
    const s = SHOTS[name];
    if (!s) return;
    this.cam.pos.set(...s.pos);
    this.lookAt(s.target);
    if (this.world) {
      this.settings.night = s.night ?? 0;
      this.world.setTimeOfDay(this.settings.night);
      for (const l of this.world.lightsByName.values()) this.world.setLight(l.name, l.def.on !== false);
      for (const n of s.off ?? []) this.world.setLight(n, false);
      this.nightCtrl?.updateDisplay();
    }
  }

  forward() {
    const cp = Math.cos(this.cam.pitch);
    return new THREE.Vector3(Math.sin(this.cam.yaw) * cp, Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * cp);
  }

  bindInput() {
    const typing = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName);
    addEventListener('keydown', (e) => {
      if (!this.active || typing(e)) return;
      if (FLY_KEYS.includes(e.code)) this.keys.add(e.code);
      if (e.code === 'KeyF') this.dropCharacterHere();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    const canvas = this.stage.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.drag = { x: e.clientX, y: e.clientY, yaw: this.cam.yaw, pitch: this.cam.pitch };
    });
    addEventListener('pointerup', () => { this.drag = null; });
    addEventListener('pointermove', (e) => {
      if (!this.active || !this.drag) return;
      this.cam.yaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.004;
      this.cam.pitch = THREE.MathUtils.clamp(this.drag.pitch - (e.clientY - this.drag.y) * 0.004, -1.55, 1.55);
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      this.settings.speed = THREE.MathUtils.clamp(this.settings.speed * (e.deltaY > 0 ? 0.85 : 1.18), 0.3, 40);
      this.speedCtrl?.updateDisplay();
    }, { passive: true });
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    const fwd = this.forward();
    const right = new THREE.Vector3(-Math.cos(this.cam.yaw), 0, Math.sin(this.cam.yaw));
    const move = new THREE.Vector3();
    if (k.has('KeyW')) move.add(fwd);
    if (k.has('KeyS')) move.sub(fwd);
    if (k.has('KeyD')) move.add(right);
    if (k.has('KeyA')) move.sub(right);
    if (k.has('KeyE')) move.y += 1;
    if (k.has('KeyQ')) move.y -= 1;
    if (move.lengthSq() > 0) {
      const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1;
      this.cam.pos.addScaledVector(move.normalize(), this.settings.speed * fast * dt);
    }
    const cam = this.stage.camera;
    cam.position.copy(this.cam.pos);
    cam.lookAt(this.cam.pos.clone().add(fwd));
    const actor = this.entries?.[0]?.holder.position ?? null;
    this.world.update(dt, { actor: this.settings.character && actor ? actor : this.cam.pos, camera: cam });
  }

  applySettings() {
    if (!this.world) return;
    const s = this.settings;
    this.stage.scene.fog = s.fog ? this.world.fog : null;
    bakeUniforms.uBakeScale.value = s.bake;
    this.world.setTimeOfDay(s.night);
    this.world.sun.intensity = this.world.sunBase * s.sun;
    this.world.rig.shadows = s.shadows;
    this.world.rig.timer = 0;
    this.entries?.forEach((e) => { e.holder.visible = s.character; });
    this.rebuildDebug();
  }

  rebuildDebug() {
    this.debug.clear();
    const c = this.world.collision;
    if (this.settings.colliders) {
      const pts = [];
      for (const s of c.solids) {
        if (!s.enabled) continue;
        for (let i = 0; i < s.poly.length; i++) {
          const [ax, az] = s.poly[i];
          const [bx, bz] = s.poly[(i + 1) % s.poly.length];
          pts.push(ax, s.y0, az, bx, s.y0, bz, ax, s.y1, az, bx, s.y1, bz, ax, s.y0, az, ax, s.y1, az);
        }
      }
      this.debug.add(lines(pts, '#ff3b6b'));
    }
    if (this.settings.walkables) {
      const pts = [];
      for (const w of c.walkables) {
        for (let i = 0; i < w.poly.length; i++) {
          const [ax, az] = w.poly[i];
          const [bx, bz] = w.poly[(i + 1) % w.poly.length];
          const ya = w.helix || w.plane ? surfaceY(w, ax, az) : w.y;
          const yb = w.helix || w.plane ? surfaceY(w, bx, bz) : w.y;
          pts.push(ax, ya + 0.02, az, bx, yb + 0.02, bz);
        }
      }
      this.debug.add(lines(pts, '#3bff8a'));
    }
    if (this.settings.interactables) {
      const pts = [];
      const colors = { seat: '#40c0ff', switch: '#ffd040', door: '#ff8040', lamp: '#fff080', tv: '#c080ff', item: '#80ff80', container: '#80ffc0' };
      const byKind = {};
      for (const it of this.world.interactables) {
        const [x, y, z] = it.pos;
        const f = [Math.sin(it.yaw) * 0.3, Math.cos(it.yaw) * 0.3];
        (byKind[it.kind] ??= []).push(x - 0.08, y, z, x + 0.08, y, z, x, y - 0.08, z, x, y + 0.08, z, x, y, z, x + f[0], y, z + f[1]);
        if (it.data.exit) byKind[it.kind].push(x, y, z, ...it.data.exit);
      }
      for (const [k, p] of Object.entries(byKind)) this.debug.add(lines(p, colors[k] ?? '#ffffff'));
      void pts;
    }
  }

  /** lil-gui folder with bookmarks, toggles and stats. */
  buildFolder(gui) {
    const f = gui.addFolder('World');
    const s = this.settings;
    f.add(s, 'shot', Object.keys(SHOTS)).name('camera bookmark').onChange((n) => this.goTo(n));
    this.speedCtrl = f.add(s, 'speed', 0.3, 40, 0.1).name('fly speed (wheel)');
    f.add({ drop: () => this.dropCharacterHere() }, 'drop').name('drop character here (F)');
    f.add(s, 'character').name('show character').onChange(() => this.applySettings());
    f.add(s, 'colliders').name('show colliders').onChange(() => this.applySettings());
    f.add(s, 'walkables').name('show walkable surfaces').onChange(() => this.applySettings());
    f.add(s, 'interactables').name('show interactables').onChange(() => this.applySettings());
    f.add(s, 'fog').onChange(() => this.applySettings());
    f.add(s, 'bake', 0, 2, 0.05).name('baked light').onChange(() => this.applySettings());
    f.add(s, 'sun', 0, 2, 0.05).name('sun').onChange(() => this.applySettings());
    this.nightCtrl = f.add(s, 'night', 0, 1, 0.05).name('dusk → night').onChange(() => this.applySettings());
    f.add(s, 'shadows').name('lamp shadows').onChange(() => this.applySettings());
    const lf = f.addFolder('Lights (circuits)');
    const circuits = {};
    for (const layer of this.world.data.layers) circuits[layer.name] = this.world.rig.isOn(layer.name);
    for (const name of Object.keys(circuits)) lf.add(circuits, name).onChange((v) => this.world.setLight(name, v)).listen();
    this.circuits = circuits;
    lf.close();
    const st = this.world.stats();
    f.add({ v: `${Math.round(st.triangles / 1000)}k tris · ${st.drawCalls}+${st.dynamicDrawCalls} draws · bake ${st.bakeMs} ms` }, 'v').name('stats').disable();
    f.open();
    return f;
  }
}

function surfaceY(w, x, z) {
  if (w.plane) return w.plane.y0 + (x - w.plane.x0) * w.plane.gx + (z - w.plane.z0) * w.plane.gz;
  const h = w.helix;
  let a = (Math.atan2(z - h.cz, x - h.cx) - h.a0) * (h.dir ?? 1);
  a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return h.y0 + Math.min(a, h.span) * h.dyda;
}

function lines(pts, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8, fog: false }));
}
