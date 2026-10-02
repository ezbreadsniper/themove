import { PLAYER } from '../units.js';

/**
 * Static collision for walking characters.
 *  solids:    XZ polygon prisms with a vertical span [y0, y1]; they block a capsule whose span
 *             [feet + stepUp, feet + height] overlaps theirs (so steps and curbs are climbed, not hit).
 *  walkables: surfaces the feet can stand on: flat ({ y }), planar ramps ({ plane }) and helical
 *             spiral-stair wedges ({ helix }).
 * A uniform spatial hash keeps queries local.
 */
const CELL = 2;
const key = (i, j) => `${i},${j}`;

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Closest point on the polygon boundary to (x, z): { x, z, d }. */
export function closestOnPoly(x, z, poly) {
  let best = { x: poly[0][0], z: poly[0][1], d: Infinity };
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const ex = bx - ax;
    const ez = bz - az;
    const len2 = ex * ex + ez * ez || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
    const px = ax + ex * t;
    const pz = az + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { x: px, z: pz, d };
  }
  return best;
}

function bounds(poly) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

export function surfaceHeight(w, x, z) {
  if (w.plane) return w.plane.y0 + (x - w.plane.x0) * w.plane.gx + (z - w.plane.z0) * w.plane.gz;
  if (w.helix) {
    const h = w.helix;
    let a = (Math.atan2(z - h.cz, x - h.cx) - h.a0) * (h.dir ?? 1);
    a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (a > h.span + 1e-6) a = a > Math.PI + h.span / 2 ? 0 : h.span;
    return h.y0 + a * h.dyda;
  }
  return w.y;
}

class SpatialHash {
  constructor() {
    this.cells = new Map();
  }

  insert(item) {
    const b = item.aabb;
    item.cells = [];
    for (let i = Math.floor(b.minX / CELL); i <= Math.floor(b.maxX / CELL); i++) {
      for (let j = Math.floor(b.minZ / CELL); j <= Math.floor(b.maxZ / CELL); j++) {
        const k = key(i, j);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(item);
        item.cells.push(k);
      }
    }
  }

  remove(item) {
    for (const k of item.cells ?? []) {
      const list = this.cells.get(k);
      const at = list.indexOf(item);
      if (at >= 0) list.splice(at, 1);
    }
    item.cells = [];
  }

  query(minX, minZ, maxX, maxZ) {
    const out = new Set();
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
      for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
        for (const item of this.cells.get(key(i, j)) ?? []) out.add(item);
      }
    }
    return out;
  }
}

export class CollisionWorld {
  constructor({ solids = [], walkables = [] } = {}, player = PLAYER) {
    this.player = player;
    this.solidHash = new SpatialHash();
    this.walkHash = new SpatialHash();
    this.solids = [];
    this.walkables = [];
    solids.forEach((s) => this.addSolid(s));
    walkables.forEach((w) => this.addWalkable(w));
  }

  addSolid(s) {
    const item = { ...s, enabled: s.enabled ?? true, aabb: bounds(s.poly) };
    this.solids.push(item);
    this.solidHash.insert(item);
    return item;
  }

  /** Replaces a solid's polygon (moving doors). */
  updateSolid(item, poly) {
    this.solidHash.remove(item);
    item.poly = poly;
    item.aabb = bounds(poly);
    this.solidHash.insert(item);
  }

  addWalkable(w) {
    const item = { ...w, aabb: bounds(w.poly) };
    this.walkables.push(item);
    this.walkHash.insert(item);
    return item;
  }

  /** Highest surface under (x, z) that the feet at feetY can reach (≤ feetY + stepUp). */
  groundAt(x, z, feetY, stepUp = this.player.stepUp) {
    let best = null;
    for (const w of this.walkHash.query(x, z, x, z)) {
      if (!pointInPoly(x, z, w.poly)) continue;
      const y = surfaceHeight(w, x, z);
      if (y > feetY + stepUp + 1e-6) continue;
      if (!best || y > best.y) best = { y, surface: w };
    }
    return best;
  }

  /** All surface heights under (x, z) (multi-level navigation). */
  surfacesAt(x, z) {
    const out = [];
    for (const w of this.walkHash.query(x, z, x, z)) if (pointInPoly(x, z, w.poly)) out.push(surfaceHeight(w, x, z));
    return out;
  }

  blocking(s, feetY, height, stepUp) {
    return s.enabled && s.y1 > feetY + stepUp + 1e-4 && s.y0 < feetY + height - 1e-4;
  }

  /** Deepest overlap of a capsule footprint with solids (0 when free). */
  penetration(x, z, feetY, radius = this.player.radius, height = this.player.height, stepUp = this.player.stepUp) {
    let worst = 0;
    for (const s of this.solidHash.query(x - radius, z - radius, x + radius, z + radius)) {
      if (!this.blocking(s, feetY, height, stepUp)) continue;
      const c = closestOnPoly(x, z, s.poly);
      const depth = pointInPoly(x, z, s.poly) ? radius + c.d : radius - c.d;
      if (depth > worst) worst = depth;
    }
    return worst;
  }

  /** Pushes pos ({x, y, z}, y = feet) out of blocking solids. Returns the solids touched. */
  resolve(pos, radius = this.player.radius, height = this.player.height, stepUp = this.player.stepUp) {
    const touched = new Set();
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const s of this.solidHash.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius)) {
        if (!this.blocking(s, pos.y, height, stepUp)) continue;
        const c = closestOnPoly(pos.x, pos.z, s.poly);
        const inside = pointInPoly(pos.x, pos.z, s.poly);
        if (!inside && c.d >= radius) continue;
        let nx;
        let nz;
        if (c.d < 1e-6) {
          nx = 1;
          nz = 0;
        } else if (inside) {
          nx = (c.x - pos.x) / c.d;
          nz = (c.z - pos.z) / c.d;
        } else {
          nx = (pos.x - c.x) / c.d;
          nz = (pos.z - c.z) / c.d;
        }
        pos.x = c.x + nx * (radius + 1e-4);
        pos.z = c.z + nz * (radius + 1e-4);
        touched.add(s);
        moved = true;
      }
      if (!moved) break;
    }
    return touched;
  }

  /**
   * Moves a character from `from` by (dx, dz) with sliding, stepping and gravity.
   * state = { x, y, z, vy }. Returns the new state plus { grounded, surface }.
   */
  move(state, dx, dz, dt, { gravity = 18 } = {}) {
    const p = this.player;
    const next = { x: state.x + dx, y: state.y, z: state.z + dz, vy: state.vy ?? 0 };
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (p.radius * 0.5)));
    let px = state.x;
    let pz = state.z;
    for (let i = 1; i <= steps; i++) {
      const probe = { x: px + dx / steps, y: next.y, z: pz + dz / steps };
      this.resolve(probe);
      const g = this.groundAt(probe.x, probe.z, next.y);
      if (g && g.y > next.y && g.y - next.y <= p.stepUp) next.y = g.y;
      px = probe.x;
      pz = probe.z;
    }
    next.x = px;
    next.z = pz;
    const g = this.groundAt(next.x, next.z, next.y);
    let grounded = false;
    if (g && next.y - g.y <= p.snapDown && next.vy <= 0) {
      next.y = g.y;
      next.vy = 0;
      grounded = true;
    } else {
      next.vy -= gravity * dt;
      next.y += next.vy * dt;
      const land = this.groundAt(next.x, next.z, next.y + Math.max(0, -next.vy * dt), 0);
      if (land && next.y <= land.y) {
        next.y = land.y;
        next.vy = 0;
        grounded = true;
      }
    }
    return { ...next, grounded, surface: g?.surface ?? null };
  }

  /** Distance along the ray (origin, unit dir) to the first solid, or maxDist. */
  raycast(o, d, maxDist) {
    const ex = o[0] + d[0] * maxDist;
    const ez = o[2] + d[2] * maxDist;
    let best = maxDist;
    for (const s of this.solidHash.query(Math.min(o[0], ex), Math.min(o[2], ez), Math.max(o[0], ex), Math.max(o[2], ez))) {
      if (!s.enabled || s.noCamera) continue;
      if (pointInPoly(o[0], o[2], s.poly) && o[1] >= s.y0 && o[1] <= s.y1) return 0;
      for (let i = 0; i < s.poly.length; i++) {
        const [ax, az] = s.poly[i];
        const [bx, bz] = s.poly[(i + 1) % s.poly.length];
        const t = segIntersect(o[0], o[2], d[0] * maxDist, d[2] * maxDist, ax, az, bx - ax, bz - az);
        if (t === null) continue;
        const dist = t * maxDist;
        const y = o[1] + d[1] * dist;
        if (y >= s.y0 && y <= s.y1 && dist < best) best = dist;
      }
      if (Math.abs(d[1]) > 1e-6) {
        for (const yPlane of [s.y0, s.y1]) {
          const dist = (yPlane - o[1]) / d[1];
          if (dist <= 0 || dist >= best) continue;
          if (pointInPoly(o[0] + d[0] * dist, o[2] + d[2] * dist, s.poly)) best = dist;
        }
      }
    }
    return best;
  }
}

function segIntersect(px, pz, rx, rz, qx, qz, sx, sz) {
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((qx - px) * sz - (qz - pz) * sx) / denom;
  const u = ((qx - px) * rz - (qz - pz) * rx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
