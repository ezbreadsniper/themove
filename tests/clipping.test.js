import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildCharacter } from '../src/character/build.js';
import { PRESETS } from '../src/character/presets/index.js';
import { meshByName } from './helpers.js';

/**
 * Skin poke-through: for every body vertex, cast outward from the limb/torso axis and require that a
 * covering garment surface is further out. Uses raycasts against the bind-pose garment meshes.
 */
function pokeThrough(group, garmentName, filter) {
  const body = meshByName(group, 'body');
  const garment = meshByName(group, garmentName);
  if (!garment) return 0;
  const gMesh = new THREE.Mesh(garment.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const pos = body.geometry.attributes.position;
  const nrm = body.geometry.attributes.normal;
  const ray = new THREE.Raycaster();
  let checked = 0;
  let out = 0;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 2) {
    p.fromBufferAttribute(pos, i);
    if (!filter(p)) continue;
    n.fromBufferAttribute(nrm, i);
    ray.set(p.clone().addScaledVector(n, -0.03), n);
    ray.far = 0.03;
    const hits = ray.intersectObject(gMesh);
    checked += 1;
    if (hits.length) out += 1;
  }
  return checked ? out / checked : 0;
}

describe.each(PRESETS.map((p) => [p.id, p]))('%s skin stays under clothes', (id, preset) => {
  test.each([0, 0.5, 1])('trousers at fit %s', (fit) => {
    if (!preset.bottom) return;
    const def = { ...preset, bottom: { ...preset.bottom, fit } };
    const group = buildCharacter(def);
    const hemY = group.userData.layout.measures.kneeY - 0.15;
    const ratio = pokeThrough(group, 'bottom', (v) => v.y > hemY + 0.04 && v.y < group.userData.layout.measures.hipsY - 0.04);
    expect(ratio, `${id} fit ${fit}`).toBeLessThan(0.02);
  });
});
