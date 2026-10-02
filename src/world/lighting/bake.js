import * as THREE from 'three';

/**
 * Per-vertex light bake ("prelit" vertex colours, the PS2 way).
 *  - Sky + AO: a fixed set of cosine-distributed rays per vertex is traced against AABB occluders.
 *    Escaping rays gather the dusk sky gradient, blocked rays gather a dim bounce that fades to
 *    black for very close hits (contact occlusion). Interiors therefore only see sky through their
 *    openings, so window walls glow and deep corners stay dark without any per-room tuning.
 *  - Static lights: windowed inverse-square point/spot lights with a shadow ray each.
 * The same sampler drives the runtime light probe that tints characters.
 */
const GRID = 2;

function hemisphereDirs(count) {
  const dirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt((i + 0.5) / count);
    const a = i * golden;
    dirs.push([r * Math.cos(a), Math.sqrt(Math.max(0, 1 - r * r)), r * Math.sin(a)]);
  }
  return dirs;
}

export class OccluderGrid {
  constructor(boxes) {
    this.boxes = boxes.map((b, i) => ({ min: b.min, max: b.max, id: i }));
    this.cells = new Map();
    this.stamp = new Uint32Array(this.boxes.length);
    this.pass = 0;
    for (const b of this.boxes) {
      for (let i = Math.floor(b.min[0] / GRID); i <= Math.floor(b.max[0] / GRID); i++) {
        for (let j = Math.floor(b.min[2] / GRID); j <= Math.floor(b.max[2] / GRID); j++) {
          const k = i * 73856093 ^ j * 19349663;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(b);
        }
      }
    }
  }

  /** First hit distance along a unit ray, or Infinity. Boxes containing the origin are ignored. */
  trace(o, d, maxDist) {
    this.pass = (this.pass + 1) >>> 0;
    let best = maxDist;
    let i = Math.floor(o[0] / GRID);
    let j = Math.floor(o[2] / GRID);
    const stepI = d[0] > 0 ? 1 : -1;
    const stepJ = d[2] > 0 ? 1 : -1;
    const tDeltaI = Math.abs(d[0]) > 1e-9 ? GRID / Math.abs(d[0]) : Infinity;
    const tDeltaJ = Math.abs(d[2]) > 1e-9 ? GRID / Math.abs(d[2]) : Infinity;
    let tMaxI = Math.abs(d[0]) > 1e-9 ? ((d[0] > 0 ? (i + 1) * GRID - o[0] : o[0] - i * GRID) / Math.abs(d[0])) : Infinity;
    let tMaxJ = Math.abs(d[2]) > 1e-9 ? ((d[2] > 0 ? (j + 1) * GRID - o[2] : o[2] - j * GRID) / Math.abs(d[2])) : Infinity;
    let t = 0;
    while (t < best) {
      const list = this.cells.get(i * 73856093 ^ j * 19349663);
      if (list) {
        for (const b of list) {
          if (this.stamp[b.id] === this.pass) continue;
          this.stamp[b.id] = this.pass;
          const hit = rayBox(o, d, b.min, b.max);
          if (hit < best) best = hit;
        }
      }
      if (tMaxI < tMaxJ) {
        t = tMaxI;
        tMaxI += tDeltaI;
        i += stepI;
      } else {
        t = tMaxJ;
        tMaxJ += tDeltaJ;
        j += stepJ;
      }
      if (t === Infinity) break;
    }
    return best < maxDist ? best : Infinity;
  }
}

function rayBox(o, d, min, max) {
  let tNear = -Infinity;
  let tFar = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < min[a] || o[a] > max[a]) return Infinity;
      continue;
    }
    let t0 = (min[a] - o[a]) / d[a];
    let t1 = (max[a] - o[a]) / d[a];
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tNear) tNear = t0;
    if (t1 < tFar) tFar = t1;
    if (tNear > tFar) return Infinity;
  }
  return tNear > 1e-3 ? tNear : Infinity;
}

const toRgb = (c) => {
  const col = new THREE.Color(c);
  return [col.r, col.g, col.b];
};

export class LightBaker {
  /**
   * sky = { zenith, horizon, horizonAway, ground, intensity, sunDir: [x,y,z] }
   * zones = [{ min, max, ambient: '#hex', bounce }] give interiors a floor of light.
   */
  constructor({ occluders, lights, sky, zones = [], rays = 20, maxDist = 30, bounce = 0.16 }) {
    this.grid = new OccluderGrid(occluders);
    this.lights = lights.filter((l) => !l.bakeSkip).map((l) => ({ ...l, rgb: toRgb(l.color) }));
    this.sky = { ...sky, zenithRgb: toRgb(sky.zenith), horizonRgb: toRgb(sky.horizon), awayRgb: toRgb(sky.horizonAway), groundRgb: toRgb(sky.ground) };
    this.zones = zones.map((z) => ({ ...z, rgb: toRgb(z.ambient) }));
    this.dirs = hemisphereDirs(rays);
    this.maxDist = maxDist;
    this.bounce = bounce;
  }

  skyRadiance(d) {
    const s = this.sky;
    if (d[1] < 0) return s.groundRgb;
    const sunH = Math.hypot(s.sunDir[0], s.sunDir[2]) || 1;
    const dh = Math.hypot(d[0], d[2]) || 1;
    const facing = Math.max(0, (d[0] * s.sunDir[0] + d[2] * s.sunDir[2]) / (sunH * dh));
    const horizon = s.awayRgb.map((v, i) => v + (s.horizonRgb[i] - v) * facing ** 2);
    const t = Math.sqrt(d[1]);
    return horizon.map((v, i) => (v + (s.zenithRgb[i] - v) * t) * s.intensity);
  }

  zoneAt(p) {
    for (const z of this.zones) {
      if (p[0] >= z.min[0] && p[0] <= z.max[0] && p[1] >= z.min[1] && p[1] <= z.max[1] && p[2] >= z.min[2] && p[2] <= z.max[2]) return z;
    }
    return null;
  }

  /** Irradiance-like RGB at point p with unit normal n. */
  sample(p, n, { skyOnly = false } = {}) {
    const o = [p[0] + n[0] * 0.03, p[1] + n[1] * 0.03, p[2] + n[2] * 0.03];
    const up = Math.abs(n[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    const t1 = normalize(cross(up, n));
    const t2 = cross(n, t1);
    const out = [0, 0, 0];
    let open = 0;
    const zone = this.zoneAt(o);
    for (const h of this.dirs) {
      const d = [t1[0] * h[0] + n[0] * h[1] + t2[0] * h[2], t1[1] * h[0] + n[1] * h[1] + t2[1] * h[2], t1[2] * h[0] + n[2] * h[1] + t2[2] * h[2]];
      const hit = this.grid.trace(o, d, this.maxDist);
      if (hit === Infinity) {
        const s = this.skyRadiance(d);
        out[0] += s[0];
        out[1] += s[1];
        out[2] += s[2];
        open++;
      } else {
        const k = this.bounce * Math.min(1, hit / 1.2);
        const g = zone ? zone.rgb : this.sky.groundRgb;
        out[0] += g[0] * k;
        out[1] += g[1] * k;
        out[2] += g[2] * k;
      }
    }
    const inv = 1 / this.dirs.length;
    out[0] *= inv;
    out[1] *= inv;
    out[2] *= inv;
    if (zone) {
      const ao = 0.35 + 0.65 * Math.min(1, (open * inv) * 4 + 0.6);
      out[0] += zone.rgb[0] * zone.floor * ao;
      out[1] += zone.rgb[1] * zone.floor * ao;
      out[2] += zone.rgb[2] * zone.floor * ao;
    }
    if (skyOnly) return out;
    for (const l of this.lights) this.addLight(out, o, n, l);
    return out;
  }

  addLight(out, o, n, l) {
    const lx = l.pos[0] - o[0];
    const ly = l.pos[1] - o[1];
    const lz = l.pos[2] - o[2];
    const dist = Math.hypot(lx, ly, lz);
    if (dist >= l.range || dist < 1e-4) return;
    const L = [lx / dist, ly / dist, lz / dist];
    const ndl = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
    if (ndl <= 0) return;
    let spot = 1;
    if (l.dir && l.cone !== null && l.cone !== undefined) {
      const c = -(L[0] * l.dir[0] + L[1] * l.dir[1] + L[2] * l.dir[2]);
      if (c <= l.cone) return;
      spot = Math.min(1, (c - l.cone) / 0.12);
    }
    const win = Math.max(0, 1 - (dist / l.range) ** 4) ** 2;
    const atten = (win / (dist * dist + 1)) * l.intensity * ndl * spot;
    if (atten < 0.002) return;
    if (this.grid.trace(o, L, dist - 0.08) !== Infinity) return;
    out[0] += l.rgb[0] * atten;
    out[1] += l.rgb[1] * atten;
    out[2] += l.rgb[2] * atten;
  }

  /** Fills the `bake` attribute of every prelit mesh in `meshes` ([THREE.Mesh]). */
  bakeMeshes(meshes) {
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    let vertices = 0;
    for (const mesh of meshes) {
      if (!mesh.material.userData.prelit) continue;
      mesh.updateWorldMatrix(true, false);
      nm.getNormalMatrix(mesh.matrixWorld);
      const pos = mesh.geometry.attributes.position;
      const nrm = mesh.geometry.attributes.normal;
      const bake = mesh.geometry.attributes.bake;
      const skyOnly = mesh.userData.skyOnly;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
        const c = this.sample([p.x, p.y, p.z], [n.x, n.y, n.z], { skyOnly });
        bake.setXYZ(i, Math.min(3, c[0]), Math.min(3, c[1]), Math.min(3, c[2]));
      }
      bake.needsUpdate = true;
      vertices += pos.count;
    }
    return vertices;
  }
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
