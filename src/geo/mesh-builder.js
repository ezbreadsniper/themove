import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Orthonormal ring frame for a loft travelling along `dir`; guarantees outward winding. */
export function frameFor(dir, forwardHint = V(0, 0, 1)) {
  const d = dir.clone().normalize();
  let x = d.clone().cross(forwardHint);
  if (x.lengthSq() < 1e-8) x = d.clone().cross(V(0, 1, 0));
  x.normalize();
  const z = x.clone().cross(d).normalize();
  return { d, x, z };
}

/** Superellipse ring radius at angle θ, with separate front/back depth. */
export function ringRadius(ring, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const rz = c >= 0 ? ring.rzF ?? ring.rz ?? ring.r : ring.rzB ?? ring.rz ?? ring.r;
  const rx = ring.rx ?? ring.r;
  const n = ring.n ?? 2;
  const r = 1 / Math.pow(Math.pow(Math.abs(c) / rz, n) + Math.pow(Math.abs(s) / rx, n), 1 / n);
  return ring.shape ? r * ring.shape(theta, c, s) : r;
}

function normalizeWeights(list) {
  const merged = new Map();
  for (const [bone, w] of list) if (w > 0) merged.set(bone, (merged.get(bone) || 0) + w);
  const top = [...merged.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
  const total = top.reduce((s, [, w]) => s + w, 0) || 1;
  const idx = [0, 0, 0, 0];
  const wts = [0, 0, 0, 0];
  top.forEach(([b, w], i) => {
    idx[i] = b;
    wts[i] = w / total;
  });
  return { idx, wts };
}

export class MeshBuilder {
  constructor(name = 'part') {
    this.name = name;
    this.positions = [];
    this.uvs = [];
    this.skinIndex = [];
    this.skinWeight = [];
    this.indices = [];
    this.hardEdgeGroups = [];
    this.group = 0;
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  /** Vertices in different smoothing groups never share normals (hard edges between groups). */
  newSmoothingGroup() {
    this.group += 1;
    return this;
  }

  addVertex(p, uv, weights) {
    const { idx, wts } = normalizeWeights(weights);
    this.positions.push(p.x, p.y, p.z);
    this.uvs.push(uv[0], uv[1]);
    this.skinIndex.push(...idx);
    this.skinWeight.push(...wts);
    this.hardEdgeGroups.push(this.group);
    return this.vertexCount - 1;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  /**
   * Sweeps rings into a tube.
   * ring: { c, x, z, rx, rzF, rzB, n, shape(θ), offset(θ)->Vector3, v, w: [[bone, w]] | (θ, p) => [[bone, w]] }
   * opts: { sides, uv: [u0, v0, u1, v1], capStart, capEnd, uOffset, uScale }
   */
  loft(rings, opts = {}) {
    const sides = opts.sides ?? 8;
    const [u0, v0, u1, v1] = opts.uv ?? [0, 0, 1, 1];
    const uOffset = opts.uOffset ?? 0;
    const arc = opts.arc ?? [0, 1];
    const closed = arc[0] === 0 && arc[1] === 1;
    const starts = [];
    rings.forEach((ring, ri) => {
      starts.push(this.vertexCount);
      const vv = ring.v ?? ri / Math.max(1, rings.length - 1);
      for (let k = 0; k <= sides; k++) {
        const u = arc[0] + (arc[1] - arc[0]) * (k / sides);
        const theta = (u + uOffset - 0.5) * Math.PI * 2;
        const r = ringRadius(ring, theta);
        const p = ring.c.clone()
          .addScaledVector(ring.z, Math.cos(theta) * r)
          .addScaledVector(ring.x, Math.sin(theta) * r);
        if (ring.offset) p.add(ring.offset(theta, p));
        const weights = typeof ring.w === 'function' ? ring.w(theta, p) : ring.w;
        this.addVertex(p, [u0 + (u1 - u0) * u, v0 + (v1 - v0) * vv], weights);
      }
    });
    for (let ri = 0; ri < rings.length - 1; ri++) {
      const a0 = starts[ri];
      const b0 = starts[ri + 1];
      for (let k = 0; k < sides; k++) this.quad(a0 + k, a0 + k + 1, b0 + k + 1, b0 + k);
    }
    const capUv = opts.capUv ?? [(u0 + u1) / 2, v0];
    if (opts.capStart && closed) this.cap(rings[0], starts[0], sides, capUv, false, opts.capStart);
    if (opts.capEnd && closed) {
      const endUv = opts.capEndUv ?? [(u0 + u1) / 2, v1];
      this.cap(rings[rings.length - 1], starts[rings.length - 1], sides, endUv, true, opts.capEnd);
    }
    return { starts, sides };
  }

  cap(ring, start, sides, uv, isEnd, bulge) {
    const center = ring.c.clone();
    const dir = ring.x.clone().cross(ring.z).multiplyScalar(-1);
    if (typeof bulge === 'number') center.addScaledVector(dir, isEnd ? bulge : -bulge);
    const w = typeof ring.w === 'function' ? ring.w(0, center) : ring.w;
    const c = this.addVertex(center, uv, w);
    for (let k = 0; k < sides; k++) {
      if (isEnd) this.tri(c, start + k, start + k + 1);
      else this.tri(c, start + k + 1, start + k);
    }
  }

  /** Axis-aligned box with its own UV rect, used for soles, clogs, brims, lenses. */
  box(center, size, uv, weights, { taperTop = 1, frame } = {}) {
    const f = frame ?? { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };
    const [sx, sy, sz] = size.map((s) => s / 2);
    const corner = (ix, iy, iz) => {
      const t = iy > 0 ? taperTop : 1;
      return center.clone()
        .addScaledVector(f.x, ix * sx * t)
        .addScaledVector(f.y, iy * sy)
        .addScaledVector(f.z, iz * sz * t);
    };
    const faces = [
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
      [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],
      [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],
      [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
    ];
    const [u0, v0, u1, v1] = uv;
    for (const face of faces) {
      this.newSmoothingGroup();
      const ids = face.map(([ix, iy, iz], i) => {
        const cu = i === 0 || i === 3 ? u0 : u1;
        const cv = i < 2 ? v0 : v1;
        return this.addVertex(corner(ix, iy, iz), [cu, cv], weights);
      });
      this.quad(...ids);
    }
    this.newSmoothingGroup();
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));
    g.setIndex(this.indices);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.smoothNormals(), 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.name = this.name;
    return g;
  }

  /** Area-weighted normals shared across UV seams (same position + same smoothing group). */
  smoothNormals() {
    const pos = this.positions;
    const count = this.vertexCount;
    const key = (i) => `${this.hardEdgeGroups[i]}|${Math.round(pos[i * 3] * 1e4)}|${Math.round(pos[i * 3 + 1] * 1e4)}|${Math.round(pos[i * 3 + 2] * 1e4)}`;
    const acc = new Map();
    const a = V();
    const b = V();
    const c = V();
    for (let t = 0; t < this.indices.length; t += 3) {
      const [i0, i1, i2] = [this.indices[t], this.indices[t + 1], this.indices[t + 2]];
      a.fromArray(pos, i0 * 3);
      b.fromArray(pos, i1 * 3);
      c.fromArray(pos, i2 * 3);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      for (const i of [i0, i1, i2]) {
        const k = key(i);
        const cur = acc.get(k) ?? V();
        acc.set(k, cur.add(n));
      }
    }
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const n = (acc.get(key(i)) ?? V(0, 1, 0)).clone().normalize();
      out[i * 3] = n.x;
      out[i * 3 + 1] = n.y;
      out[i * 3 + 2] = n.z;
    }
    return Array.from(out);
  }
}

export { V };
