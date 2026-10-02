import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/world/world.js';
import { MATERIALS } from '../src/world/kit/materials.js';
import { DECALS, TEXT_DECALS, decalUV } from '../src/world/kit/decal-atlas.js';
import { flickerLevel } from '../src/world/lighting/flicker.js';
import * as interiorProps from '../src/world/props/interior-props.js';
import * as streetProps from '../src/world/props/street-props.js';
import { UNIT } from '../src/world/locations/foundry/layout.js';
import { FURNITURE, PLAYER } from '../src/world/units.js';

/**
 * Content checks for the Foundry St. location (workstream D): gameplay data (contracts §2),
 * the lighting API, debris/props hygiene, signage orientation, geometry sanity and budgets.
 */
let world;
beforeAll(() => {
  world = new World();
}, 120000);

const KINDS = new Set(['seat', 'switch', 'door', 'lamp', 'tv', 'item', 'container', 'npc']);
const meshes = () => {
  const out = [];
  world.root.traverse((o) => o.isMesh && out.push(o));
  return out;
};

describe('placeholders removed', () => {
  it('has no cars (geometry, materials, collision)', () => {
    expect(streetProps.car).toBeUndefined();
    expect(world.collision.solids.some((s) => s.tag === 'car')).toBe(false);
    for (const k of ['carRed', 'carBlue', 'carWhite', 'carWindow', 'tire']) expect(MATERIALS[k]).toBeUndefined();
    expect(meshes().some((m) => /^car[A-Z]|^tire$/.test(m.userData.material))).toBe(false);
  });

  it('has no decorative pillows', () => {
    expect(interiorProps.pillow).toBeUndefined();
    for (const k of ['rainbow', 'kilim', 'stripeBW']) expect(MATERIALS[k]).toBeUndefined();
  });
});

describe('interactables (contracts §2)', () => {
  it('are well formed and uniquely named', () => {
    const ids = new Set();
    expect(world.interactables.length).toBeGreaterThan(20);
    for (const it of world.interactables) {
      expect(ids.has(it.id), it.id).toBe(false);
      ids.add(it.id);
      expect(KINDS.has(it.kind), it.kind).toBe(true);
      expect(it.pos).toHaveLength(3);
      expect(it.pos.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(it.yaw)).toBe(true);
      expect(it.radius).toBeGreaterThan(0.3);
      expect(typeof it.prompt).toBe('string');
    }
  });

  it('seats sit over walkable floor at their seat height, with a clear exit', () => {
    const seats = world.interactables.filter((i) => i.kind === 'seat');
    expect(seats.length).toBeGreaterThanOrEqual(9);
    for (const s of seats) {
      const { seatHeight, variant, exit } = s.data;
      expect(['chair', 'sofa', 'stool', 'bed', 'stair'], s.id).toContain(variant);
      expect(seatHeight, s.id).toBeGreaterThan(0.35);
      expect(seatHeight, s.id).toBeLessThan(0.85);
      const floor = world.collision.groundAt(s.pos[0], s.pos[2], s.pos[1] - seatHeight + 0.05);
      expect(floor, `${s.id} floor`).toBeTruthy();
      expect(Math.abs(s.pos[1] - seatHeight - floor.y), `${s.id} height`).toBeLessThan(0.06);
      expect(exit, s.id).toHaveLength(3);
      const g = world.collision.groundAt(exit[0], exit[2], floor.y + 0.05);
      expect(g, `${s.id} exit floor`).toBeTruthy();
      expect(Math.abs(g.y - floor.y), `${s.id} exit level`).toBeLessThan(0.05);
      expect(world.collision.penetration(exit[0], exit[2], g.y), `${s.id} exit clear`).toBeLessThan(0.05);
    }
    expect(seats.filter((s) => s.data.variant === 'sofa').length).toBe(7);
    expect(seats.find((s) => s.data.variant === 'sofa').data.seatHeight).toBeCloseTo(0.45, 2);
    expect(seats.find((s) => s.data.variant === 'chair').data.seatHeight).toBeGreaterThanOrEqual(FURNITURE.seat - 0.01);
  });

  it('switches, lamps and the TV reference existing lights', () => {
    const lit = world.interactables.filter((i) => ['switch', 'lamp', 'tv'].includes(i.kind));
    expect(lit.filter((i) => i.kind === 'switch').length).toBeGreaterThanOrEqual(6);
    for (const i of lit) {
      expect(i.data.lights.length, i.id).toBeGreaterThan(0);
      for (const n of i.data.lights) expect(world.lightsByName.has(n), `${i.id} → ${n}`).toBe(true);
      expect(typeof i.data.on).toBe('boolean');
    }
  });

  it('every door dynamic has a door interactable, and doors carry a swing', () => {
    const doors = Object.values(world.data.dynamics).filter((d) => d.data?.door);
    const hooks = world.interactables.filter((i) => i.kind === 'door');
    for (const h of hooks) expect(world.data.dynamics[h.data.door]?.data?.door, h.id).toBe(true);
    for (const d of doors) {
      expect(hooks.some((h) => h.data.door === d.name), d.name).toBe(true);
      expect(['both', 'pos', 'neg']).toContain(d.data.swing);
    }
  });

  it('physical props are dynamics with a shape, mass and collider', () => {
    const phys = Object.values(world.data.dynamics).filter((d) => d.data?.physical);
    expect(phys.length).toBeGreaterThanOrEqual(8);
    for (const p of phys) {
      const { shape, mass } = p.data.physical;
      expect(['box', 'cylinder', 'sphere']).toContain(shape);
      expect(mass).toBeGreaterThan(0);
      if (shape === 'box') expect(p.data.physical.size).toHaveLength(3);
      else expect(p.data.physical.radius).toBeGreaterThan(0);
      expect(p.solids.length).toBeGreaterThanOrEqual(1);
      expect(p.group.children.length).toBeGreaterThan(0);
    }
  });
});

describe('markers', () => {
  it('has spawn points and NPC markers with yaw + role over walkable ground', () => {
    for (const k of ['spawn', 'spawn_loft', 'spawn_corridor']) expect(world.markers[k], k).toBeTruthy();
    const npcs = Object.values(world.markers).filter((m) => m.name.startsWith('npc_'));
    expect(npcs.length).toBeGreaterThanOrEqual(4);
    expect(npcs.some((m) => m.name.startsWith('npc_corridor'))).toBe(true);
    expect(npcs.some((m) => m.name.startsWith('npc_stoop'))).toBe(true);
    expect(npcs.filter((m) => m.name.startsWith('npc_street')).length).toBeGreaterThanOrEqual(2);
    for (const m of npcs) {
      expect(typeof m.role).toBe('string');
      expect(Number.isFinite(m.yaw)).toBe(true);
      const g = world.collision.groundAt(m.pos[0], m.pos[2], m.pos[1] + 0.05);
      expect(g, m.name).toBeTruthy();
      expect(world.collision.penetration(m.pos[0], m.pos[2], g.y), m.name).toBeLessThan(0.05);
    }
  });

  it('the stair top lands on a clear mezzanine plate (capsule fits)', () => {
    const m = world.markers['stair-top'];
    const g = world.collision.groundAt(m.pos[0], m.pos[2], m.pos[1] + 0.05);
    expect(g.y).toBeCloseTo(UNIT.mezz.top, 2);
    expect(world.collision.penetration(m.pos[0], m.pos[2], g.y)).toBeLessThan(0.01);
    // the top tread's exit edge to the plate: a full capsule fits across it
    for (const [x, z] of [[11.75, 6.95], [12.0, 7.05], [11.6, 7.0]]) expect(world.collision.penetration(x, z, UNIT.mezz.top), `${x}, ${z}`).toBeLessThan(0.01);
  });
});

describe('lighting system', () => {
  it('setLight toggles a light, its layer scale and its rig output', () => {
    const u = world.lib.uniforms.uLayerScale.value;
    const orb = world.lightsByName.get('orb-low');
    expect(orb.layer).toBeGreaterThanOrEqual(0);
    expect(world.setLight('orb-low', false)).toBe(true);
    world.update(0.016, { camera: { position: new THREE.Vector3(12.5, 1.6, 4) } });
    expect(u[orb.layer]).toBe(0);
    expect(world.rig.isOn('orb-low')).toBe(false);
    world.setLight('orb-low', true);
    world.update(0.016, { camera: { position: new THREE.Vector3(12.5, 1.6, 4) } });
    expect(u[orb.layer]).toBe(1);
    expect(world.setLight('no-such-light', false)).toBe(false);
  });

  it('switching a circuit off really darkens the room (baked layer contribution)', () => {
    const p = [12.5, UNIT.floor + 0.05, 3.6];
    const lit = world.baker.sample(p, [0, 1, 0], { layerScale: world.rig.layerScale });
    for (const n of ['loft-track', 'orb-high', 'orb-low', 'floor-lamp']) world.setLight(n, false);
    const dark = world.baker.sample(p, [0, 1, 0], { layerScale: world.rig.layerScale });
    for (const n of ['loft-track', 'orb-high', 'orb-low', 'floor-lamp']) world.setLight(n, true);
    const sum = (c) => c[0] + c[1] + c[2];
    expect(sum(dark)).toBeLessThan(sum(lit) * 0.45);
  });

  it('flicker is deterministic, bounded and actually flickers', () => {
    const f = world.lightsByName.get('corridor-fl-14').def.flicker;
    expect(f).toBeTruthy();
    const a = Array.from({ length: 400 }, (_, i) => flickerLevel(f, i * 0.05));
    const b = Array.from({ length: 400 }, (_, i) => flickerLevel(f, i * 0.05));
    expect(a).toEqual(b);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(Math.min(...a)).toBeLessThan(0.7);
    expect(a.filter((v) => v > 0.9).length).toBeGreaterThan(200);
    const other = Array.from({ length: 400 }, (_, i) => flickerLevel({ ...f, seed: 'other' }, i * 0.05));
    expect(other).not.toEqual(a);
    expect(flickerLevel(null, 3)).toBe(1);
  });

  it('keeps layers within the shader budget and a fixed runtime light pool', () => {
    expect(world.data.layers.length).toBeLessThanOrEqual(32);
    expect(world.rig.points.length + world.rig.spots.length).toBeLessThanOrEqual(6);
    for (const l of world.data.lights) if (l.shadow) expect(l.layer, l.name).toBeGreaterThanOrEqual(0);
  });

  it('defaults to night (moon as the live light) and blends to dusk', () => {
    expect(world.timeOfDay).toBe(1);
    expect(world.lib.uniforms.uSkyScale.value).toBe(1);
    const moonY = world.sun.position.y;
    world.setTimeOfDay(0);
    expect(world.lib.uniforms.uSkyScale.value).toBeGreaterThan(1.5);
    expect(world.sun.position.y).toBeLessThan(moonY);
    world.setTimeOfDay(1);
    expect(world.sky.getObjectByName('moon').visible).toBe(true);
  });
});

describe('decals and signage', () => {
  it('atlas cells stay inside the atlas and never overlap', () => {
    const used = new Set();
    for (const [name, d] of Object.entries(DECALS)) {
      const [w, h] = d.span ?? [1, 1];
      for (let x = d.at[0]; x < d.at[0] + w; x++) {
        for (let y = d.at[1]; y < d.at[1] + h; y++) {
          expect(x < 8 && y < 8, name).toBe(true);
          expect(used.has(`${x},${y}`), `${name} overlaps`).toBe(false);
          used.add(`${x},${y}`);
        }
      }
      const uv = decalUV(name);
      expect(uv[2]).toBeGreaterThan(uv[0]);
    }
  });

  it('text never renders mirrored (UV handedness matches the face winding)', () => {
    const textMats = new Set(['signExit', 'worldIsYours', 'houseNumber', 'signBuilding', 'signStop', 'signNoParking', 'signStreetName', 'signStreetName2', 'signOneWay', 'case48', 'mailboxes']);
    const textCells = [...TEXT_DECALS].map((n) => decalUV(n));
    let checked = 0;
    for (const mesh of meshes()) {
      const mat = mesh.userData.material;
      const isDecal = mat === 'decals';
      if (!textMats.has(mat) && !isDecal) continue;
      const pos = mesh.geometry.attributes.position;
      const uv = mesh.geometry.attributes.uv;
      const idx = mesh.geometry.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
        const pa = new THREE.Vector3().fromBufferAttribute(pos, a);
        const e1 = new THREE.Vector3().fromBufferAttribute(pos, b).sub(pa);
        const e2 = new THREE.Vector3().fromBufferAttribute(pos, c).sub(pa);
        const du1 = uv.getX(b) - uv.getX(a);
        const dv1 = uv.getY(b) - uv.getY(a);
        const du2 = uv.getX(c) - uv.getX(a);
        const dv2 = uv.getY(c) - uv.getY(a);
        if (isDecal) {
          const cu = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3;
          const cv = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
          if (!textCells.some(([u0, v0, u1, v1]) => cu > u0 && cu < u1 && cv > v0 && cv < v1)) continue;
        }
        // UV-space signed area vs geometric winding: equal sign = not mirrored
        const uvArea = du1 * dv2 - du2 * dv1;
        const n = e1.clone().cross(e2);
        const t = e1.clone().multiplyScalar(dv2).sub(e2.clone().multiplyScalar(dv1));
        const bt = e2.clone().multiplyScalar(du1).sub(e1.clone().multiplyScalar(du2));
        const handed = Math.sign(t.cross(bt).dot(n)) * Math.sign(uvArea);
        expect(handed, `${mat} triangle ${i / 3} mirrored`).toBeGreaterThanOrEqual(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('text-bearing emissive materials are single sided (no mirrored back faces)', () => {
    for (const k of ['signExit', 'worldIsYours', 'tv']) expect(world.lib.get(k).side).toBe(THREE.FrontSide);
  });
});

describe('geometry hygiene and budgets', () => {
  it('has no NaN attributes and almost no degenerate triangles', () => {
    let degenerate = 0;
    let tris = 0;
    for (const mesh of meshes()) {
      const g = mesh.geometry;
      for (const name of ['position', 'normal', 'uv', 'bake', 'bakeStatic', 'bakeLayerW']) {
        const arr = g.attributes[name].array;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error(`${mesh.name}.${name} has NaN at ${i}`);
      }
      const pos = g.attributes.position;
      const idx = g.index.array;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let i = 0; i < idx.length; i += 3) {
        a.fromBufferAttribute(pos, idx[i]);
        b.fromBufferAttribute(pos, idx[i + 1]);
        c.fromBufferAttribute(pos, idx[i + 2]);
        if (b.clone().sub(a).cross(c.clone().sub(a)).length() < 1e-9) degenerate++;
        tris++;
      }
    }
    expect(degenerate / tris).toBeLessThan(0.002);
  });

  it('stays within the frame budget', () => {
    const s = world.stats();
    expect(s.triangles).toBeLessThan(130000);
    // Every loose loft item is its own physical node now (contracts §8); batching them is open work.
    expect(s.drawCalls + s.dynamicDrawCalls).toBeLessThan(700);
    expect(s.shadowMaps).toBeLessThanOrEqual(3);
  });

  it('furniture is at character scale', () => {
    const sofa = world.interactables.find((i) => i.id === 'loft.sofa.a.seat1');
    expect(sofa.pos[1] - UNIT.floor).toBeCloseTo(0.45, 2);
    const bed = world.interactables.find((i) => i.id === 'loft.bed');
    expect(bed.pos[1] - UNIT.mezz.top).toBeCloseTo(FURNITURE.bed, 2);
    expect(PLAYER.height).toBeGreaterThan(1.7);
  });
});

describe('GLB export', () => {
  it('the built world root round-trips through GLTFExporter / GLTFLoader', async () => {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    // node has no FileReader / canvas: a minimal reader shim, and plain materials (maps are runtime rasters)
    globalThis.FileReader ??= class {
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); });
      }

      readAsDataURL(blob) {
        blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.(); });
      }
    };
    const root = world.root.clone(true);
    let sourceVerts = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshStandardMaterial({ name: o.userData.material, color: o.material.color });
      sourceVerts += o.geometry.attributes.position.count;
    });
    const glb = await new GLTFExporter().parseAsync(root, { binary: true });
    expect(glb.byteLength).toBeGreaterThan(1e6);
    const gltf = await new GLTFLoader().parseAsync(glb, '');
    let verts = 0;
    gltf.scene.traverse((o) => { if (o.isMesh) verts += o.geometry.attributes.position.count; });
    expect(verts).toBe(sourceVerts);
  }, 120000);
});
