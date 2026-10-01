/**
 * Slices a body mesh with horizontal planes and reports each connected contour (torso, legs, arms)
 * as width × depth. Usage: node scripts/measure-reference.mjs <file.glb|preset:id> [meshNameFilter]
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function sliceStats(positions, index, y) {
  const tri = index ? index.length / 3 : positions.length / 9;
  const P = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const key = (i, j) => (i < j ? `${i}_${j}` : `${j}_${i}`);
  const vkey = (i) => P(i).map((v) => v.toFixed(5)).join(',');
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { parent.set(find(a), find(b)); };
  const pointOf = new Map();
  for (let t = 0; t < tri; t++) {
    const ids = index ? [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2];
    const hits = [];
    for (let e = 0; e < 3; e++) {
      const i = ids[e];
      const j = ids[(e + 1) % 3];
      const a = P(i);
      const b = P(j);
      if ((a[1] - y) * (b[1] - y) < 0) {
        const k = key(vkey(i), vkey(j));
        const s = (y - a[1]) / (b[1] - a[1]);
        pointOf.set(k, [a[0] + (b[0] - a[0]) * s, a[2] + (b[2] - a[2]) * s]);
        if (!parent.has(k)) parent.set(k, k);
        hits.push(k);
      }
    }
    if (hits.length === 2) union(hits[0], hits[1]);
  }
  const groups = new Map();
  for (const k of parent.keys()) {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(pointOf.get(k));
  }
  return [...groups.values()].filter((g) => g.length >= 3).map((pts) => {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return { cx: (Math.max(...xs) + Math.min(...xs)) / 2, w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs), zc: (Math.max(...zs) + Math.min(...zs)) / 2, n: pts.length };
  });
}

async function loadMeshes(file, filter) {
  const buf = readFileSync(file);
  const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const out = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh || (filter && !o.name.includes(filter))) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    out.push({ name: o.name, pos: g.attributes.position.array, index: g.index?.array, tris: (g.index ? g.index.count : g.attributes.position.count) / 3 });
  });
  return out;
}

if (process.argv[1].endsWith('measure-reference.mjs')) {
  const [,, file, filter] = process.argv;
  const meshes = await loadMeshes(file, filter);
  const all = meshes.flatMap((m) => Array.from(m.pos));
  let minY = Infinity;
  let maxY = -Infinity;
  meshes.forEach((m) => { for (let i = 1; i < m.pos.length; i += 3) { minY = Math.min(minY, m.pos[i]); maxY = Math.max(maxY, m.pos[i]); } });
  const H = maxY - minY;
  console.log(`${meshes.map((m) => `${m.name}(${m.tris})`).join(' + ')}  H=${H.toFixed(3)}  total tris=${meshes.reduce((s, m) => s + m.tris, 0)}`);
  void all;
  for (let f = 0.03; f < 1; f += 0.05) {
    const y = minY + f * H;
    const parts = meshes.flatMap((m) => sliceStats(m.pos, m.index, y)).sort((a, b) => a.cx - b.cx);
    console.log(`${(f * 100).toFixed(0).padStart(3)}%  ${parts.map((p) => `[x${p.cx.toFixed(2)} ${(p.w * 100).toFixed(0)}x${(p.d * 100).toFixed(0)}]`).join(' ')}`);
  }
}
