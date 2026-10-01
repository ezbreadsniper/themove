import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildCharacter } from '../src/character/build.js';
import { PRESETS } from '../src/character/presets/index.js';
import { characterHash } from './helpers.js';

const BUDGET = { triangles: 9000, drawCalls: 12, textureBytes: 1.6 * 1024 * 1024 };

describe.each(PRESETS)('$id', (preset) => {
  const group = buildCharacter(preset);
  const meshes = [];
  group.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });

  test('stays inside the PS2 budget', () => {
    const s = group.userData.stats;
    expect(s.triangles).toBeLessThanOrEqual(BUDGET.triangles);
    expect(s.drawCalls).toBeLessThanOrEqual(BUDGET.drawCalls);
    expect(s.textureBytes).toBeLessThanOrEqual(BUDGET.textureBytes);
  });

  test('every part shares the single canonical skeleton', () => {
    const skeleton = group.userData.rig.skeleton;
    for (const m of meshes) expect(m.skeleton).toBe(skeleton);
  });

  test('skin weights are normalized, finite and reference real bones', () => {
    for (const m of meshes) {
      const w = m.geometry.attributes.skinWeight.array;
      const idx = m.geometry.attributes.skinIndex.array;
      for (let i = 0; i < w.length; i += 4) {
        const sum = w[i] + w[i + 1] + w[i + 2] + w[i + 3];
        expect(Math.abs(sum - 1), `${m.name} vertex ${i / 4}`).toBeLessThan(1e-4);
      }
      expect(Math.max(...idx)).toBeLessThan(23);
      expect(m.geometry.attributes.position.array.every(Number.isFinite)).toBe(true);
      expect(m.geometry.attributes.normal.array.every(Number.isFinite)).toBe(true);
    }
  });

  test('bind-pose bounds sit on the floor within the character height', () => {
    const box = new THREE.Box3();
    for (const m of meshes) box.union(m.geometry.boundingBox);
    expect(box.min.y).toBeGreaterThan(-0.005);
    expect(box.min.y).toBeLessThan(0.01);
    expect(box.max.y).toBeLessThan(preset.body.height + 0.08);
    expect(box.max.y).toBeGreaterThan(preset.body.height - 0.02);
  });

  test('head and torso normals point outward (winding is not inverted)', () => {
    const { world, measures } = group.userData.layout;
    for (const name of ['head', 'body']) {
      const mesh = meshes.find((m) => m.name === name);
      const pos = mesh.geometry.attributes.position;
      const nrm = mesh.geometry.attributes.normal;
      const center = name === 'head' ? world.Head : world.Spine2;
      let outward = 0;
      let counted = 0;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - center.x;
        const dz = pos.getZ(i) - center.z;
        const inTorso = Math.abs(pos.getX(i)) < measures.chestHalfWidth * 0.7 && pos.getY(i) > measures.neckY - 0.1;
        if (name === 'body' && !inTorso) continue;
        counted += 1;
        if (dx * nrm.getX(i) + dz * nrm.getZ(i) > 0) outward += 1;
      }
      if (name === 'body' && counted === 0) continue;
      expect(outward / counted, name).toBeGreaterThan(0.9);
    }
  });
});

describe('determinism', () => {
  test('the same definition rebuilds byte-identical geometry and textures', () => {
    for (const preset of PRESETS) {
      expect(characterHash(buildCharacter(preset))).toBe(characterHash(buildCharacter(JSON.parse(JSON.stringify(preset)))));
    }
  });

  test('changing only the seed changes textures but not the skeleton', () => {
    const a = buildCharacter(PRESETS[0]);
    const b = buildCharacter({ ...PRESETS[0], seed: 'another-seed' });
    expect(characterHash(a)).not.toBe(characterHash(b));
    const posA = a.userData.rig.bones.map((x) => x.position.toArray());
    const posB = b.userData.rig.bones.map((x) => x.position.toArray());
    expect(posA).toEqual(posB);
  });

  test('distinct presets produce distinct silhouettes', () => {
    const boxes = PRESETS.map((p) => {
      const box = new THREE.Box3();
      buildCharacter(p).traverse((o) => { if (o.isMesh) box.union(o.geometry.boundingBox); });
      return box.getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(3)).join();
    });
    expect(new Set(boxes).size).toBe(PRESETS.length);
  });
});
