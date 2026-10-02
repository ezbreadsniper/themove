import * as THREE from 'three';
import { pointInPoly } from '../world/physics/collision.js';
import { createRng } from '../core/rng.js';

/**
 * Surface decals (bullet holes, blood spatter, drips, pools): flat quads laid on the surface a ray
 * found, a few millimetres off it with a polygon offset, never floating. Each quad is shrunk until
 * it fits on the face it was placed on (wall face, furniture top, box face, floor not covered by
 * furniture), and pools are radial fans whose every spoke stops where the walkable floor stops.
 * Materials multiply the surface colour (premultiplied alpha), so a stain takes the light the
 * surface already has. Per-kind budgets recycle the oldest decal.
 */
export const DECAL = Object.freeze({
  /** Gap above the surface (m) — well under the 2 cm "floating" limit; the polygon offset hides z-fight. */
  lift: 0.004,
  poolLift: 0.0025,
  minHalf: 0.012,
  budget: { hole: 64, splat: 48, drop: 90, stain: 24, pool: 8 },
  pool: { spokes: 24, step: 0.03 },
});

const UP = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** Is (x, z) visible floor at height y: a walkable surface there at y, not covered by a solid standing on it. */
export function floorClear(collision, x, z, y) {
  if (!collision) return true;
  const g = collision.groundAt(x, z, y + 0.03, 0.06);
  if (!g || Math.abs(g.y - y) > 0.012) return false;
  return collision.penetration(x, z, y, 0.001, 0.05, 0.005) <= 0;
}

/** Tangent basis (u, v) on a surface with normal n; v points "up the wall" (or +z on floors). */
export function surfaceBasis(n) {
  const ref = Math.abs(n.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : UP;
  const u = new THREE.Vector3().crossVectors(ref, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { u, v };
}

/**
 * Largest half-size ≤ half that keeps a square decal at `surface.point` on its face. surface: a hit
 * from WorldRay ({ point, normal, solid | box | floor }). Returns 0 when not even the minimum fits.
 */
export function fitOnSurface(surface, half, collision = null) {
  const p = surface.point;
  const n = surface.normal;
  const { u, v } = surfaceBasis(n);
  const corners = (h) => [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => p.clone().addScaledVector(u, a * h).addScaledVector(v, b * h));
  let test = null;
  if (n.y > 0.9 && (surface.floor || (!surface.solid && !surface.box))) {
    test = (q) => floorClear(collision, q.x, q.z, p.y);
  } else if (surface.solid && Math.abs(n.y) > 0.9) {
    test = (q) => pointInPoly(q.x, q.z, surface.solid.poly);
  } else if (surface.solid) {
    // Side face: stay between the face's vertical span and the ends of the polygon edge it lies on.
    const s = surface.solid;
    const lim = Math.min(p.y - s.y0, s.y1 - p.y);
    let along = Infinity;
    for (let i = 0; i < s.poly.length; i++) {
      const [ax, az] = s.poly[i];
      const [bx, bz] = s.poly[(i + 1) % s.poly.length];
      const ex = bx - ax;
      const ez = bz - az;
      const len = Math.hypot(ex, ez);
      if (len < 1e-6) continue;
      const t = ((p.x - ax) * ex + (p.z - az) * ez) / len;
      const off = Math.abs((p.x - ax) * ez - (p.z - az) * ex) / len;
      if (off < 0.01 && t >= -1e-3 && t <= len + 1e-3) along = Math.min(along, Math.max(t, 0), Math.max(len - t, 0));
    }
    half = Math.min(half, lim, along === Infinity ? half : along);
  } else if (surface.box) {
    const b = surface.box;
    const axis = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
    for (let a = 0; a < 3; a++) {
      if (a === axis) continue;
      const pc = p.getComponent(a);
      half = Math.min(half, pc - b.min[a], b.max[a] - pc);
    }
  }
  if (test) {
    for (let i = 0; i < 8 && half >= DECAL.minHalf; i++) {
      if (corners(half).every(test)) break;
      half *= 0.72;
    }
    if (!corners(half).every(test)) return 0;
  }
  return half >= DECAL.minHalf ? half : 0;
}

/**
 * Pool outline: for each of `spokes` directions, how far (≤ maxR) the floor at height y stays clear
 * walking out from the centre. A spoke stops at the first blocked sample (walls, furniture feet,
 * stairs, the edge of the walkable).
 */
export function poolRadii(collision, center, maxR, { spokes = DECAL.pool.spokes, step = DECAL.pool.step } = {}) {
  const radii = new Float32Array(spokes);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const sx = Math.cos(a);
    const sz = Math.sin(a);
    let r = 0;
    for (let d = step; d <= maxR + 1e-6; d += step) {
      if (!floorClear(collision, center.x + sx * d, center.z + sz * d, center.y)) break;
      r = d;
    }
    radii[i] = r;
  }
  return radii;
}

function decalMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map, transparent: true, premultipliedAlpha: true, blending: THREE.MultiplyBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, fog: false, side: THREE.DoubleSide,
  });
}

export class DecalSystem {
  constructor({ scene = null, collision = null, textures, seed = 'decals', budget = DECAL.budget } = {}) {
    this.scene = scene;
    this.collision = collision;
    this.textures = textures;
    this.budget = budget;
    this.rng = createRng(`decals:${seed}`);
    this.group = new THREE.Group();
    this.group.name = 'decals';
    scene?.add(this.group);
    this.quad = new THREE.PlaneGeometry(1, 1);
    this.materials = new Map();
    this.live = Object.fromEntries(Object.keys(budget).map((k) => [k, []]));
    this.pools = [];
  }

  material(tex) {
    if (!this.materials.has(tex)) this.materials.set(tex, decalMaterial(tex));
    return this.materials.get(tex);
  }

  recycle(kind) {
    const list = this.live[kind];
    while (list.length >= this.budget[kind]) {
      const old = list.shift();
      old.removeFromParent();
      if (old.geometry !== this.quad) old.geometry.dispose();
    }
  }

  /**
   * Lays a square decal of half-size `half` on a surface hit. opts: { texture, roll (rad, default
   * random), stretch ([su, sv] aspect, e.g. elongated spatter), up (a direction the texture's +v
   * should follow, projected on the surface) }. Returns the mesh, or null when it doesn't fit.
   */
  place(kind, surface, half, { texture, roll = null, stretch = [1, 1], up = null } = {}) {
    const fit = fitOnSurface(surface, half * Math.max(stretch[0], stretch[1]), this.collision);
    if (!fit) return null;
    const k = fit / (half * Math.max(stretch[0], stretch[1]));
    this.recycle(kind);
    const n = surface.normal.clone().normalize();
    const mesh = new THREE.Mesh(this.quad, this.material(texture));
    mesh.name = `decal-${kind}`;
    mesh.quaternion.setFromUnitVectors(Z, n);
    let angle = roll ?? this.rng.next() * Math.PI * 2;
    if (up) {
      const t = up.clone().addScaledVector(n, -up.dot(n));
      if (t.lengthSq() > 1e-6) {
        // The quad's local +y after setFromUnitVectors, measured against the projected direction.
        const qy = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
        const qx = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
        angle = Math.atan2(-t.dot(qx), t.dot(qy));
      }
    }
    mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(Z, angle));
    mesh.scale.set(half * 2 * stretch[0] * k, half * 2 * stretch[1] * k, 1);
    mesh.position.copy(surface.point).addScaledVector(n, DECAL.lift);
    mesh.renderOrder = 2;
    mesh.userData.surface = { point: surface.point.clone(), normal: n };
    this.group.add(mesh);
    this.live[kind].push(mesh);
    return mesh;
  }

  /** A pool spreading on the floor around `center` (floor height in y) to maxR over `duration` s. */
  pool(center, { maxR = 0.62, duration = 10, delay = 0 } = {}) {
    const c = center.clone();
    const radii = poolRadii(this.collision, c, maxR);
    const spokes = radii.length;
    if (Math.max(...radii) < 0.05) return null;
    this.recycle('pool');
    const wobble = Array.from({ length: spokes }, () => 0.82 + this.rng.next() * 0.18);
    const pos = new Float32Array((spokes + 1) * 3);
    const uv = new Float32Array((spokes + 1) * 2);
    const index = [];
    for (let i = 0; i < spokes; i++) index.push(0, 1 + ((i + 1) % spokes), 1 + i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    const mesh = new THREE.Mesh(geo, this.material(this.textures.pool));
    mesh.name = 'decal-pool';
    mesh.position.set(c.x, c.y + DECAL.poolLift, c.z);
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    const pool = { mesh, radii, wobble, maxR, duration, t: -delay, center: c, spokes };
    this.layoutPool(pool, 0);
    this.group.add(mesh);
    this.live.pool.push(mesh);
    this.pools.push(pool);
    mesh.userData.pool = pool;
    return pool;
  }

  /** Current outline: every spoke grows with the ease-out spread and stops at its clip radius. */
  layoutPool(pool, k) {
    const geo = pool.mesh.geometry;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    const grow = pool.maxR * (1 - (1 - k) ** 2.2);
    pos.setXYZ(0, 0, 0, 0);
    uv.setXY(0, 0.5, 0.5);
    for (let i = 0; i < pool.spokes; i++) {
      const a = (i / pool.spokes) * Math.PI * 2;
      const r = Math.min(pool.radii[i], grow * pool.wobble[i]);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos.setXYZ(i + 1, x, 0, z);
      uv.setXY(i + 1, 0.5 + x / (2 * pool.maxR), 0.5 + z / (2 * pool.maxR));
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    pool.radius = grow;
  }

  update(dt) {
    for (const p of this.pools) {
      if (p.done) continue;
      p.t += dt;
      if (p.t < 0) continue;
      const k = Math.min(1, p.t / p.duration);
      this.layoutPool(p, k);
      if (k >= 1) p.done = true;
    }
    this.pools = this.pools.filter((p) => !p.done || p.mesh.parent);
  }

  count(kind) {
    return this.live[kind]?.length ?? 0;
  }
}
