import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Kit } from '../src/world/kit/builder.js';
import { MaterialLibrary } from '../src/world/kit/materials.js';
import { CollisionWorld, surfaceHeight } from '../src/world/physics/collision.js';
import { PLAYER } from '../src/world/units.js';

const lib = new MaterialLibrary();
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

function faceNormalsPointOut(mesh, center) {
  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).divideScalar(3);
    if (n.dot(centroid.sub(center)) <= 0) return false;
  }
  return true;
}

describe('Kit primitives', () => {
  it('box faces wind outward and register collision, walkable and occluder', () => {
    const kit = new Kit(lib);
    kit.box('concreteRough', [0, 0, 0], [2, 1, 3], { collide: true, walk: true, seg: 0.5 });
    const out = kit.finish();
    const mesh = out.buckets.default.children[0];
    expect(faceNormalsPointOut(mesh, new THREE.Vector3(1, 0.5, 1.5))).toBe(true);
    expect(out.solids).toHaveLength(1);
    expect(out.walkables[0].y).toBe(1);
    expect(out.occluders).toHaveLength(1);
    expect(mesh.geometry.attributes.bake.count).toBe(mesh.geometry.attributes.position.count);
  });

  it('prism side and cap normals point out for either polygon winding', () => {
    for (const poly of [rect(0, 0, 1, 1), rect(0, 0, 1, 1).reverse()]) {
      const kit = new Kit(lib);
      kit.prism('steelBlack', poly, 0, 1);
      const mesh = kit.finish().buckets.default.children[0];
      expect(faceNormalsPointOut(mesh, new THREE.Vector3(0.5, 0.5, 0.5))).toBe(true);
    }
  });

  it('transform frames move geometry and collision together', () => {
    const kit = new Kit(lib);
    kit.at(10, 0, 5, Math.PI / 2, (k) => k.box('steelBlack', [0, 0, 0], [2, 1, 1], { collide: true }));
    const out = kit.finish();
    const xs = out.solids[0].poly.map((p) => p[0]);
    const zs = out.solids[0].poly.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(10, 5);
    expect(Math.max(...xs)).toBeCloseTo(11, 5);
    expect(Math.min(...zs)).toBeCloseTo(3, 5);
    expect(Math.max(...zs)).toBeCloseTo(5, 5);
  });

  it('projects brick UVs continuously across adjacent boxes in one frame', () => {
    const kit = new Kit(lib);
    kit.box('brick', [0, 0, 0], [1, 2, 0.3], { faces: { pz: true, nz: false, px: false, nx: false, py: false, ny: false }, seg: 10 });
    kit.box('brick', [1, 0, 0], [2, 2, 0.3], { faces: { pz: true, nz: false, px: false, nx: false, py: false, ny: false }, seg: 10 });
    const uv = kit.finish().buckets.default.children[0].geometry.attributes.uv;
    const tile = lib.tile('brick')[0];
    expect(uv.getX(1)).toBeCloseTo(1 / tile, 5);
    expect(uv.getX(4)).toBeCloseTo(1 / tile, 5);
  });
});

describe('CollisionWorld', () => {
  const floor = { poly: rect(-10, -10, 10, 10), y: 0 };

  it('pushes a capsule out of a wall and slides along it', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(1, -5, 1.2, 5), y0: 0, y1: 3 }], walkables: [floor] });
    const s = w.move({ x: 0, y: 0, z: 0, vy: 0 }, 1.0, 0.5, 1 / 30);
    expect(s.x).toBeLessThanOrEqual(1 - PLAYER.radius + 1e-3);
    expect(s.z).toBeCloseTo(0.5, 3);
  });

  it('steps up a curb but not onto a waist-high ledge', () => {
    const curb = { poly: rect(1, -5, 5, 5), y: 0.15 };
    const ledgeSolid = { poly: rect(1, -5, 5, 5), y0: 0, y1: 0.8 };
    const w1 = new CollisionWorld({ solids: [{ poly: rect(1, -5, 5, 5), y0: 0, y1: 0.15 }], walkables: [floor, curb] });
    let s = { x: 0, y: 0, z: 0, vy: 0 };
    for (let i = 0; i < 30; i++) s = w1.move(s, 0.05, 0, 1 / 30);
    expect(s.y).toBeCloseTo(0.15, 5);
    const w2 = new CollisionWorld({ solids: [ledgeSolid], walkables: [floor, { poly: rect(1, -5, 5, 5), y: 0.8 }] });
    s = { x: 0, y: 0, z: 0, vy: 0 };
    for (let i = 0; i < 30; i++) s = w2.move(s, 0.05, 0, 1 / 30);
    expect(s.y).toBe(0);
    expect(s.x).toBeLessThan(1);
  });

  it('climbs a straight flight of 0.2 m risers and falls off an open edge', () => {
    const walk = [floor];
    const solids = [];
    for (let i = 1; i <= 10; i++) {
      walk.push({ poly: rect(i * 0.28, -1, i * 0.28 + 0.28, 1), y: i * 0.2 });
      solids.push({ poly: rect(i * 0.28, -1, i * 0.28 + 0.28, 1), y0: i * 0.2 - 0.3, y1: i * 0.2 - 0.1 });
    }
    walk.push({ poly: rect(3.08, -1, 6, 1), y: 2.0 });
    const w = new CollisionWorld({ solids, walkables: walk });
    let s = { x: 0, y: 0, z: 0, vy: 0 };
    for (let i = 0; i < 120; i++) s = w.move(s, 0.04, 0, 1 / 30);
    expect(s.y).toBeCloseTo(2.0, 5);
    for (let i = 0; i < 60; i++) s = w.move(s, 0, 0.05, 1 / 30);
    expect(s.y).toBe(0);
  });

  it('helix walkable rises with angle', () => {
    const h = { poly: rect(-1, -1, 1, 1), helix: { cx: 0, cz: 0, a0: 0, dir: 1, span: Math.PI, y0: 1, dyda: 1 / Math.PI } };
    expect(surfaceHeight(h, 0.5, 0)).toBeCloseTo(1, 5);
    expect(surfaceHeight(h, 0, 0.5)).toBeCloseTo(1.5, 5);
  });

  it('raycast stops at the first wall', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(2, -5, 2.2, 5), y0: 0, y1: 3 }] });
    expect(w.raycast([0, 1, 0], [1, 0, 0], 10)).toBeCloseTo(2, 5);
    expect(w.raycast([0, 4, 0], [1, 0, 0], 10)).toBe(10);
  });
});
