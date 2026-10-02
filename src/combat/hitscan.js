import * as THREE from 'three';
import { pointInPoly, surfaceHeight } from '../world/physics/collision.js';

/**
 * Hitscan: one bullet is a ray. Every source answers "first hit along (origin, unit dir) within max"
 * and the nearest answer wins:
 *   world  static collision solids (walls, furniture colliders, door leaves), the kit's AABB
 *          occluders (slabs, ceilings, furniture without a character collider) and walkable floors;
 *   prop   the physics workstream's rigid bodies (game.physics.raycast, contracts §8);
 *   npc    the NPC manager's hitTest (contracts §6) or the fallback body volumes (hit-volumes.js).
 * Hits are plain objects { kind, point: Vector3, normal: Vector3, distance, ... } so tests and FX
 * don't depend on which source produced them.
 */
export const SHOT = Object.freeze({
  /** Longest shot (m). */
  range: 80,
  /** The camera ray skips this much past the player before it may hit (the player isn't a target). */
  cameraSkip: 0.4,
  /** Closer than this to the muzzle the aim point is ignored and the camera direction is used (m). */
  minConverge: 0.6,
});

const EPS = 1e-4;
const toV = (p) => (p?.isVector3 ? p.clone() : Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p.x, p.y, p.z));
const arr = (v) => (v.isVector3 ? [v.x, v.y, v.z] : v);

/** Static = a decal can stay on it (door leaves and props move). */
export const isStaticSolid = (s) => !!s && !s.door && s.tag !== 'door' && s.tag !== 'prop' && !s.prop && !s.dynamic;

/** Outward normal of a collision solid at a hit point (side faces from the polygon, caps ±Y). */
export function solidNormal(solid, point, dir) {
  if (Math.abs(point.y - solid.y1) < 2e-3 && dir.y < 0) return new THREE.Vector3(0, 1, 0);
  if (Math.abs(point.y - solid.y0) < 2e-3 && dir.y > 0) return new THREE.Vector3(0, -1, 0);
  let best = null;
  const poly = solid.poly;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax;
    const ez = bz - az;
    const len2 = ex * ex + ez * ez || 1e-12;
    const t = Math.max(0, Math.min(1, ((point.x - ax) * ex + (point.z - az) * ez) / len2));
    const d = Math.hypot(point.x - (ax + ex * t), point.z - (az + ez * t));
    if (!best || d < best.d) best = { d, ex, ez, i, t };
  }
  const len = Math.hypot(best.ex, best.ez) || 1;
  const n = new THREE.Vector3(best.ez / len, 0, -best.ex / len);
  if (n.x * dir.x + n.z * dir.z > 0) n.negate();
  return n;
}

/** Ray vs AABB with the entry face normal: { t, normal } or null (origin inside → null). */
export function rayBoxNormal(o, d, b) {
  let t0 = -Infinity;
  let t1 = Infinity;
  let axis = -1;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b.min[a] || o[a] > b.max[a]) return null;
      continue;
    }
    let ta = (b.min[a] - o[a]) / d[a];
    let tb = (b.max[a] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) {
      t0 = ta;
      axis = a;
    }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (t0 <= 0 || axis < 0) return null;
  const normal = new THREE.Vector3();
  normal.setComponent(axis, -Math.sign(d[axis]));
  return { t: t0, normal };
}

/**
 * The static world as a ray target: collision solids + occluder boxes + walkable floors.
 * raycast(origin, dir, max) → { kind: 'world', point, normal, distance, solid?, box?, floor?, static } | null.
 */
export class WorldRay {
  constructor({ collision = null, occluders = [] } = {}) {
    this.collision = collision;
    this.boxes = occluders.filter((o) => o?.min && o?.max);
    this.cells = new Map();
    this.boxes.forEach((b, i) => {
      for (let x = Math.floor(b.min[0] / 2); x <= Math.floor(b.max[0] / 2); x++) {
        for (let z = Math.floor(b.min[2] / 2); z <= Math.floor(b.max[2] / 2); z++) {
          const k = `${x},${z}`;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(i);
        }
      }
    });
  }

  raycast(origin, direction, max = SHOT.range) {
    const o = arr(origin);
    const d = arr(direction);
    let best = null;
    const c = this.collision;
    if (c) {
      const r = c.raycastHit(o, d, max);
      if (r.solid && r.dist > EPS) {
        const point = new THREE.Vector3(o[0] + d[0] * r.dist, o[1] + d[1] * r.dist, o[2] + d[2] * r.dist);
        best = { kind: 'world', distance: r.dist, point, normal: solidNormal(r.solid, point, new THREE.Vector3(...d)), solid: r.solid, static: isStaticSolid(r.solid) };
      }
      const floor = this.floor(o, d, best?.distance ?? max);
      if (floor) best = floor;
    }
    const lim = best?.distance ?? max;
    const ex = o[0] + d[0] * lim;
    const ez = o[2] + d[2] * lim;
    const seen = new Set();
    for (let x = Math.floor(Math.min(o[0], ex) / 2); x <= Math.floor(Math.max(o[0], ex) / 2); x++) {
      for (let z = Math.floor(Math.min(o[2], ez) / 2); z <= Math.floor(Math.max(o[2], ez) / 2); z++) {
        for (const i of this.cells.get(`${x},${z}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const h = rayBoxNormal(o, d, this.boxes[i]);
          if (h && h.t < (best?.distance ?? max)) {
            best = { kind: 'world', distance: h.t, point: new THREE.Vector3(o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t), normal: h.normal, box: this.boxes[i], static: true };
          }
        }
      }
    }
    return best;
  }

  /** First walkable surface the ray comes down onto (flat and planar walkables; stair helices sampled). */
  floor(o, d, max) {
    if (d[1] > -1e-4 || !this.collision?.walkHash) return null;
    const ex = o[0] + d[0] * max;
    const ez = o[2] + d[2] * max;
    let best = null;
    for (const w of this.collision.walkHash.query(Math.min(o[0], ex), Math.min(o[2], ez), Math.max(o[0], ex), Math.max(o[2], ez))) {
      let t;
      if (w.plane) {
        // y(t) = y0 + (x(t) - x0) gx + (z(t) - z0) gz = o.y + d.y t
        const p = w.plane;
        const denom = d[1] - d[0] * p.gx - d[2] * p.gz;
        if (Math.abs(denom) < 1e-9) continue;
        t = (p.y0 + (o[0] - p.x0) * p.gx + (o[2] - p.z0) * p.gz - o[1]) / denom;
      } else if (w.helix) {
        t = null;
        for (let s = 0.05; s < max; s += 0.05) {
          const x = o[0] + d[0] * s;
          const z = o[2] + d[2] * s;
          if (pointInPoly(x, z, w.poly) && o[1] + d[1] * s <= surfaceHeight(w, x, z)) {
            t = s;
            break;
          }
        }
        if (t === null) continue;
      } else {
        t = (w.y - o[1]) / d[1];
      }
      if (!(t > EPS) || t >= max || (best && t >= best.distance)) continue;
      const x = o[0] + d[0] * t;
      const z = o[2] + d[2] * t;
      if (!pointInPoly(x, z, w.poly)) continue;
      const normal = w.plane ? new THREE.Vector3(-w.plane.gx, 1, -w.plane.gz).normalize() : new THREE.Vector3(0, 1, 0);
      best = { kind: 'world', distance: t, point: new THREE.Vector3(x, o[1] + d[1] * t, z), normal, floor: w, static: true };
    }
    return best;
  }
}

/**
 * Nearest hit among the sources. sources: { world, props, npcs } — each (origin, dir, max) → hit | null
 * (prop hits may be the physics workstream's shape { body, point, normal, distance, material }).
 */
export function castShot({ origin, dir, maxDist = SHOT.range, world = null, props = null, npcs = null }) {
  const o = toV(origin);
  const d = toV(dir).normalize();
  let best = null;
  const consider = (kind, fn) => {
    if (!fn) return;
    let h = null;
    try {
      h = fn(o.clone(), d.clone(), best?.distance ?? maxDist);
    } catch (err) {
      console.warn(`hitscan ${kind}: ${err.message}`);
      return;
    }
    if (!h) return;
    const point = h.point ? toV(h.point) : o.clone().addScaledVector(d, h.distance);
    const distance = h.distance ?? point.distanceTo(o);
    if (!(distance >= 0) || distance > (best?.distance ?? maxDist)) return;
    best = { ...h, kind, point, distance, normal: h.normal ? toV(h.normal).normalize() : d.clone().negate() };
  };
  consider('world', world);
  consider('prop', props);
  consider('npc', npcs);
  if (best) best.dir = d;
  return best;
}

/**
 * Camera-centre convergence: the bullet leaves the muzzle toward what the crosshair covers. The
 * crosshair point comes from a ray along the camera's view (starting level with the player, so
 * nothing between camera and player counts); the shot direction is muzzle → that point.
 */
export function convergeAim({ muzzle, cameraPos, cameraDir, playerPos, cast, maxDist = SHOT.range }) {
  const cd = toV(cameraDir).normalize();
  const cp = toV(cameraPos);
  const along = playerPos ? Math.max(0, toV(playerPos).sub(cp).dot(cd)) + SHOT.cameraSkip : SHOT.cameraSkip;
  const start = cp.clone().addScaledVector(cd, along);
  const hit = cast ? cast(start, cd, maxDist) : null;
  const target = hit ? hit.point.clone() : start.clone().addScaledVector(cd, maxDist);
  const m = toV(muzzle);
  const dir = target.clone().sub(m);
  if (dir.length() < SHOT.minConverge || dir.clone().normalize().dot(cd) < 0.2) return { dir: cd, target };
  return { dir: dir.normalize(), target };
}

/** A direction jittered inside a cone of half-angle `spread` (rad) by two uniforms in [0, 1). */
export function spreadDir(dir, spread, u1, u2) {
  if (!(spread > 0)) return dir.clone();
  const d = dir.clone().normalize();
  const helper = Math.abs(d.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const a = new THREE.Vector3().crossVectors(d, helper).normalize();
  const b = new THREE.Vector3().crossVectors(d, a);
  const r = Math.tan(spread) * Math.sqrt(u1);
  const th = u2 * Math.PI * 2;
  return d.addScaledVector(a, Math.cos(th) * r).addScaledVector(b, Math.sin(th) * r).normalize();
}
