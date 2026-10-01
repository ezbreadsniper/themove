import * as THREE from 'three';
import { hashBytes } from '../src/core/rng.js';

/** Stable hash over every geometry attribute and texture byte of a built character. */
export function characterHash(group) {
  let h = 2166136261;
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
      const arr = o.geometry.attributes[name].array;
      h = hashBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), h);
    }
    const idx = o.geometry.index.array;
    h = hashBytes(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength), h);
    if (o.material.map) h = hashBytes(o.material.map.image.data, h);
  });
  return h;
}

/** World-space skinned vertex positions of a mesh for the skeleton's current pose. */
export function skinnedPositions(mesh) {
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const pos = mesh.geometry.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

export function meshByName(group, name) {
  let found = null;
  group.traverse((o) => { if (o.isMesh && o.name === name) found = o; });
  return found;
}
