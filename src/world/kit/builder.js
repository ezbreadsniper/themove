import * as THREE from 'three';
import { decalUV } from './decal-atlas.js';

/**
 * Kit: the world-building context. Primitives are appended into per-(bucket, material) buffers in
 * world space; a transform stack (translation + yaw) places prefabs. Physics and lighting data
 * (solids, walkables, AO occluders, lights, markers) are registered alongside the geometry so a
 * piece is authored once and carries its own collision.
 *
 * UV modes: 'box' projects frame-local coordinates per face (textures continue across pieces built
 * in the same frame), 'world' projects world coordinates, 'fit' maps 0..1 per face, 'raw' keeps the
 * primitive's own UVs scaled by `uvScale`.
 */
const FACES = {
  pz: { o: (a, b) => [a[0], a[1], b[2]], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], su: 0, sv: 1 },
  nz: { o: (a, b) => [b[0], a[1], a[2]], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1], su: 0, sv: 1 },
  px: { o: (a, b) => [b[0], a[1], b[2]], u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0], su: 2, sv: 1 },
  nx: { o: (a, b) => [a[0], a[1], a[2]], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0], su: 2, sv: 1 },
  py: { o: (a, b) => [a[0], b[1], b[2]], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0], su: 0, sv: 2 },
  ny: { o: (a, b) => [a[0], a[1], a[2]], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], su: 0, sv: 2 },
};

/** Box-projection UV for a frame-local point and normal (matches the FACES orientation). */
export function projectUV(p, n, tile) {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  let u;
  let v;
  if (ay >= ax && ay >= az) {
    u = p[0];
    v = n[1] > 0 ? -p[2] : p[2];
  } else if (ax >= az) {
    u = n[0] > 0 ? -p[2] : p[2];
    v = p[1];
  } else {
    u = n[2] > 0 ? p[0] : -p[0];
    v = p[1];
  }
  return [u / tile[0], v / tile[1]];
}

class Accum {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.idx = [];
    this.emit = [];
  }

  get count() {
    return this.pos.length / 3;
  }
}

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpNM = new THREE.Matrix3();

export class Kit {
  constructor(lib) {
    this.lib = lib;
    this.stack = [new THREE.Matrix4()];
    this.bucketName = 'default';
    this.buckets = new Map();
    this.solids = [];
    this.walkables = [];
    this.occluders = [];
    this.lights = [];
    this.markers = new Map();
    this.dynamics = new Map();
    this.dynamic = null;
    this.flags = new Map();
    this.layers = new Map();
    this.emitLayer = -1;
    this.interactables = [];
  }

  get m() {
    return this.stack[this.stack.length - 1];
  }

  push(x = 0, y = 0, z = 0, rotY = 0) {
    const t = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    this.stack.push(this.m.clone().multiply(t));
    return this;
  }

  pop() {
    if (this.stack.length === 1) throw new Error('Kit.pop without push');
    this.stack.pop();
    return this;
  }

  /** Runs fn inside a pushed frame. */
  at(x, y, z, rotY, fn) {
    this.push(x, y, z, rotY);
    try {
      fn(this);
    } finally {
      this.pop();
    }
    return this;
  }

  bucket(name) {
    this.bucketName = name;
    return this;
  }

  /** Mesh flags for a bucket: { cast, receive, cullDistance }. */
  bucketFlags(name, flags) {
    this.flags.set(name, { ...(this.flags.get(name) ?? {}), ...flags });
    return this;
  }

  accum(mat) {
    this.lib.def(mat);
    const key = this.dynamic ? `dyn:${this.dynamic.name}` : this.bucketName;
    if (!this.buckets.has(key)) this.buckets.set(key, new Map());
    const b = this.buckets.get(key);
    if (!b.has(mat)) b.set(mat, new Accum());
    return b.get(mat);
  }

  toWorld(p) {
    return tmpV.set(p[0], p[1], p[2]).applyMatrix4(this.m).toArray();
  }

  /** Appends frame-local triangles. verts: [{p:[x,y,z], n:[x,y,z], uv?:[u,v]}], tris: index triples. */
  append(mat, verts, tris, { uv = 'box', uvScale = [1, 1], uvOffset = [0, 0] } = {}) {
    const a = this.accum(mat);
    const base = a.count;
    const tile = this.lib.tile(mat);
    tmpNM.getNormalMatrix(this.m);
    for (const vert of verts) {
      tmpV.set(vert.p[0], vert.p[1], vert.p[2]).applyMatrix4(this.m);
      tmpN.set(vert.n[0], vert.n[1], vert.n[2]).applyMatrix3(tmpNM).normalize();
      a.pos.push(tmpV.x, tmpV.y, tmpV.z);
      a.nrm.push(tmpN.x, tmpN.y, tmpN.z);
      let t;
      if (uv === 'box') t = projectUV(vert.p, vert.n, tile);
      else if (uv === 'world') t = projectUV([tmpV.x, tmpV.y, tmpV.z], [tmpN.x, tmpN.y, tmpN.z], tile);
      else t = [vert.uv[0] * uvScale[0], vert.uv[1] * uvScale[1]];
      a.uv.push(t[0] + uvOffset[0], t[1] + uvOffset[1]);
      a.emit.push(this.emitLayer);
    }
    for (const i of tris) a.idx.push(base + i);
    return this;
  }

  /** Subdivided rectangle from origin o along axes u (length lu) and v (length lv). */
  grid(mat, o, u, v, lu, lv, n, opts = {}) {
    const seg = opts.seg ?? 1.0;
    const nu = Math.max(1, Math.ceil(lu / seg - 1e-6));
    const nv = Math.max(1, Math.ceil(lv / seg - 1e-6));
    const verts = [];
    const tris = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const s = (i / nu) * lu;
        const t = (j / nv) * lv;
        verts.push({ p: [o[0] + u[0] * s + v[0] * t, o[1] + u[1] * s + v[1] * t, o[2] + u[2] * s + v[2] * t], n, uv: [i / nu, j / nv] });
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i;
        tris.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
      }
    }
    return this.append(mat, verts, tris, opts);
  }

  /**
   * Axis-aligned (in frame) box from min corner a to max corner b.
   * opts: faces {pz:false,...}, seg, uv, collide, walk, occlude, tag.
   */
  box(mat, a, b, opts = {}) {
    const size = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    if (size.some((s) => s <= 0)) throw new Error(`Kit.box ${mat}: non-positive size ${size}`);
    for (const [key, f] of Object.entries(FACES)) {
      if (opts.faces && opts.faces[key] === false) continue;
      this.grid(mat, f.o(a, b), f.u, f.v, size[f.su], size[f.sv], f.n, opts);
    }
    const poly = [[a[0], a[2]], [b[0], a[2]], [b[0], b[2]], [a[0], b[2]]];
    if (opts.collide) this.solid(poly, a[1], b[1], opts.tag);
    if (opts.walk) this.walkable(poly, b[1], opts.tag);
    if (opts.occlude ?? Math.max(...size) > 0.25) this.occluder(a, b);
    return this;
  }

  /** Box from centre and size. */
  boxC(mat, c, s, opts) {
    return this.box(mat, [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2], [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2], opts);
  }

  /** Single quad through four frame-local points (counter-clockwise seen from the front). */
  quad(mat, p0, p1, p2, p3, opts = {}) {
    const e1 = new THREE.Vector3().fromArray(p1).sub(new THREE.Vector3().fromArray(p0));
    const e2 = new THREE.Vector3().fromArray(p3).sub(new THREE.Vector3().fromArray(p0));
    const n = e1.clone().cross(e2).normalize().toArray();
    const uvs = opts.uvs ?? [[0, 0], [1, 0], [1, 1], [0, 1]];
    const verts = [p0, p1, p2, p3].map((p, i) => ({ p, n, uv: uvs[i] }));
    return this.append(mat, verts, [0, 1, 2, 0, 2, 3], { uv: 'raw', ...opts });
  }

  /**
   * Flat decal/sign rectangle centred at c, size [w, h], facing one of +x -x +y -y +z -z.
   * `rot` spins it in its own plane (radians). UVs fit 0..1 unless opts.uv says otherwise.
   */
  panel(mat, c, [w, h], facing = '+z', opts = {}) {
    const rot = opts.rot ?? 0;
    const axes = {
      '+z': [[1, 0, 0], [0, 1, 0]], '-z': [[-1, 0, 0], [0, 1, 0]],
      '+x': [[0, 0, -1], [0, 1, 0]], '-x': [[0, 0, 1], [0, 1, 0]],
      '+y': [[1, 0, 0], [0, 0, -1]], '-y': [[1, 0, 0], [0, 0, 1]],
    }[facing];
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const u = axes[0].map((x, i) => x * cr + axes[1][i] * sr);
    const v = axes[1].map((x, i) => -axes[0][i] * sr + x * cr);
    const corner = (su, sv) => c.map((x, i) => x + u[i] * su * w / 2 + v[i] * sv * h / 2);
    return this.quad(mat, corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), opts);
  }

  /**
   * Atlas decal (see decal-atlas.js): a panel mapped onto the named atlas cell. Place it 3-5 mm off
   * the surface it marks; the decal material's polygon offset handles the rest. opts.cut uses the
   * alpha-tested variant (upright cards), opts.flip mirrors it, opts.rot spins it in-plane.
   */
  decal(name, c, size, facing = '+z', opts = {}) {
    const [u0, v0, u1, v1] = decalUV(name);
    const uvs = opts.flip ? [[u1, v0], [u0, v0], [u0, v1], [u1, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    return this.panel(opts.cut ? 'decalsCut' : 'decals', c, size, facing, { ...opts, uvs });
  }

  /** Appends a THREE.BufferGeometry transformed by `matrix` (frame-local). */
  geometry(mat, geom, matrix = null, opts = {}) {
    const g = geom.index ? geom : geom;
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const uvA = g.attributes.uv;
    const nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
    const verts = [];
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      if (matrix) {
        p.applyMatrix4(matrix);
        n.applyMatrix3(nm).normalize();
      }
      verts.push({ p: p.toArray(), n: n.toArray(), uv: uvA ? [uvA.getX(i), uvA.getY(i)] : [0, 0] });
    }
    const tris = g.index ? Array.from(g.index.array) : verts.map((_, i) => i);
    geom.dispose();
    return this.append(mat, verts, tris, { uv: opts.uv ?? 'raw', uvScale: opts.uvScale ?? [1, 1], ...opts });
  }

  /** Vertical cylinder standing on base centre c. */
  cylinder(mat, c, radius, height, opts = {}) {
    const sides = opts.sides ?? 10;
    const g = new THREE.CylinderGeometry(opts.radiusTop ?? radius, radius, height, sides, opts.rings ?? 1, !!opts.open);
    const m = new THREE.Matrix4().makeTranslation(c[0], c[1] + height / 2, c[2]);
    const circ = 2 * Math.PI * radius;
    this.geometry(mat, g, m, { uv: 'raw', uvScale: [circ / this.lib.tile(mat)[0], height / this.lib.tile(mat)[1]], ...opts });
    if (opts.collide) {
      const poly = Array.from({ length: 8 }, (_, i) => [c[0] + Math.cos((i / 8) * Math.PI * 2) * radius, c[2] - Math.sin((i / 8) * Math.PI * 2) * radius]);
      this.solid(poly, c[1], c[1] + height, opts.tag);
    }
    if (opts.occlude) this.occluder([c[0] - radius, c[1], c[2] - radius], [c[0] + radius, c[1] + height, c[2] + radius]);
    return this;
  }

  sphere(mat, c, radius, opts = {}) {
    const g = opts.detail !== undefined ? new THREE.IcosahedronGeometry(radius, opts.detail) : new THREE.SphereGeometry(radius, opts.w ?? 8, opts.h ?? 6);
    const s = opts.scale ?? [1, 1, 1];
    const m = new THREE.Matrix4().makeScale(...s).setPosition(c[0], c[1], c[2]);
    return this.geometry(mat, g, m, { uv: opts.uv ?? 'raw', uvScale: opts.uvScale ?? [2, 1], ...opts });
  }

  /** Circular tube through frame-local points (pipes, rails, ducts, wires). */
  tube(mat, points, radius, opts = {}) {
    const sides = opts.sides ?? 6;
    const verts = [];
    const tris = [];
    const pts = points.map((p) => new THREE.Vector3().fromArray(p));
    let len = 0;
    let prevSide = null;
    for (let i = 0; i < pts.length; i++) {
      const dir = (i < pts.length - 1 ? pts[i + 1].clone().sub(pts[i]) : pts[i].clone().sub(pts[i - 1])).normalize();
      if (i > 0 && i < pts.length - 1) dir.add(pts[i].clone().sub(pts[i - 1]).normalize()).normalize();
      if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
      let side = prevSide ? prevSide.clone().sub(dir.clone().multiplyScalar(prevSide.dot(dir))).normalize() : new THREE.Vector3(0, 1, 0).cross(dir);
      if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0).cross(dir);
      side.normalize();
      prevSide = side;
      const up = dir.clone().cross(side).normalize();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const n = side.clone().multiplyScalar(Math.cos(a)).add(up.clone().multiplyScalar(Math.sin(a)));
        verts.push({ p: pts[i].clone().add(n.clone().multiplyScalar(radius)).toArray(), n: n.toArray(), uv: [s / sides, len] });
      }
    }
    const ring = sides + 1;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = i * ring + s;
        tris.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
      }
    }
    const tile = this.lib.tile(mat);
    return this.append(mat, verts, tris, { uv: 'raw', uvScale: [(2 * Math.PI * radius) / tile[0], 1 / tile[1]], ...opts });
  }

  /** Vertical prism over a convex or concave XZ polygon (counter-clockwise seen from above). */
  prism(mat, poly, y0, y1, opts = {}) {
    const verts = [];
    const tris = [];
    const ccw = signedArea(poly) < 0 ? poly : [...poly].reverse();
    const top = ccw.map(([x, z]) => ({ p: [x, y1, z], n: [0, 1, 0] }));
    const triTop = earcut(ccw);
    if (!opts.noTop) {
      verts.push(...top);
      tris.push(...triTop);
    }
    if (!opts.noBottom) {
      const b = verts.length;
      verts.push(...ccw.map(([x, z]) => ({ p: [x, y0, z], n: [0, -1, 0] })));
      for (let i = 0; i < triTop.length; i += 3) tris.push(b + triTop[i], b + triTop[i + 2], b + triTop[i + 1]);
    }
    for (let i = 0; i < ccw.length; i++) {
      const [ax, az] = ccw[i];
      const [bx, bz] = ccw[(i + 1) % ccw.length];
      const n = new THREE.Vector3(bz - az, 0, -(bx - ax)).normalize().negate().toArray();
      const b = verts.length;
      verts.push({ p: [ax, y0, az], n }, { p: [bx, y0, bz], n }, { p: [bx, y1, bz], n }, { p: [ax, y1, az], n });
      tris.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    this.append(mat, verts, tris, opts);
    if (opts.collide) this.solid(ccw, y0, y1, opts.tag);
    if (opts.walk) this.walkable(ccw, y1, opts.tag);
    return this;
  }

  /** Revolved profile [[r, y], ...] around a vertical axis at c. */
  lathe(mat, c, profile, opts = {}) {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), opts.sides ?? 10);
    return this.geometry(mat, g, new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]), { uv: 'raw', uvScale: [1, 1], ...opts });
  }

  // --- physics, lighting and markers (all take frame-local coordinates) ---

  polyToWorld(poly) {
    return poly.map(([x, z]) => {
      tmpV.set(x, 0, z).applyMatrix4(this.m);
      return [tmpV.x, tmpV.z];
    });
  }

  yToWorld(y) {
    return y + this.m.elements[13];
  }

  solid(poly, y0, y1, tag = null) {
    const target = this.dynamic ? this.dynamic.solids : this.solids;
    const p = this.dynamic ? poly.map((q) => [...q]) : this.polyToWorld(poly);
    const off = this.dynamic ? 0 : this.m.elements[13];
    target.push({ poly: p, y0: y0 + off, y1: y1 + off, tag });
    return this;
  }

  walkable(poly, y, tag = null) {
    if (this.dynamic) throw new Error('walkables cannot live on dynamic objects');
    this.walkables.push({ poly: this.polyToWorld(poly), y: this.yToWorld(y), tag });
    return this;
  }

  /**
   * Sloped walkable in a translation-only frame: { plane: { x0, z0, y0, gx, gz } } or
   * { helix: { cx, cz, a0, dir, span, y0, dyda } } (frame-local, angles from atan2(z, x)).
   */
  walkableSurface(poly, spec, tag = null) {
    const e = this.m.elements;
    if (Math.abs(e[8]) > 1e-9 || Math.abs(e[0] - 1) > 1e-9) throw new Error('sloped walkables need an unrotated frame');
    const [ox, oy, oz] = [e[12], e[13], e[14]];
    const out = { poly: poly.map(([x, z]) => [x + ox, z + oz]), y: 0, tag };
    if (spec.plane) out.plane = { ...spec.plane, x0: spec.plane.x0 + ox, z0: spec.plane.z0 + oz, y0: spec.plane.y0 + oy };
    if (spec.helix) out.helix = { ...spec.helix, cx: spec.helix.cx + ox, cz: spec.helix.cz + oz, y0: spec.helix.y0 + oy };
    this.walkables.push(out);
    return this;
  }

  /** AABB occluder for the light bake (world space AABB of the frame-local box). */
  occluder(a, b) {
    if (this.dynamic) return this;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) {
      const w = this.toWorld([x, y, z]);
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], w[i]);
        max[i] = Math.max(max[i], w[i]);
      }
    }
    this.occluders.push({ min, max });
    return this;
  }

  /**
   * Light source. Static lights are baked into vertices; `dynamic: true` lights may also be lit at
   * runtime by the light rig's pool (they light characters). dir + cone (cosine of half-angle) make
   * a spot. Lights that are `switchable`, `flicker` or name a `layer` bake into a runtime-scalable
   * light layer instead of the static bake (several lights may share a layer = one circuit);
   * `shadow: true` makes the light a candidate for the rig's shadowed spot pool (it needs a layer
   * of its own). `fill` scales the light's crude same-zone bounce; `on: false` starts it off.
   */
  light({ name, pos, color = '#ffd8a0', intensity = 1, range = 6, dir = null, cone = null, dynamic = false, zone = null, switchable = false, flicker = null, layer = null, shadow = false, fill = 1, on = true }) {
    const p = this.toWorld(pos);
    let d = null;
    if (dir) {
      tmpN.set(dir[0], dir[1], dir[2]).applyMatrix3(tmpNM.getNormalMatrix(this.m)).normalize();
      d = tmpN.toArray();
    }
    if (this.lights.some((l) => l.name === name)) throw new Error(`duplicate light ${name}`);
    const layerName = layer ?? (switchable || flicker || shadow ? name : null);
    const layerIndex = layerName ? this.layerIndex(layerName, color) : -1;
    if (layerName) this.layers.get(layerName).lights.push(name);
    this.lights.push({ name, pos: p, color, intensity, range, dir: d, cone, dynamic, zone, switchable: !!switchable, flicker, layer: layerIndex, layerName, shadow, fill, on });
    return this;
  }

  /** Index of the named light layer (created on first use; colour from its first light). */
  layerIndex(name, color = null) {
    if (!this.layers.has(name)) this.layers.set(name, { name, index: this.layers.size, color, lights: [] });
    const layer = this.layers.get(name);
    if (!layer.color && color) layer.color = color;
    return layer.index;
  }

  /** Emissive geometry built inside fn glows with light layer `layerName` (dims when it is off). */
  glow(layerName, fn) {
    const saved = this.emitLayer;
    this.emitLayer = this.layerIndex(layerName);
    try {
      fn(this);
    } finally {
      this.emitLayer = saved;
    }
    return this;
  }

  /**
   * Gameplay hook (docs/INTEGRATION_CONTRACTS.md §2). pos and data.exit are frame-local; yaw is the
   * facing the player takes (forward = (sin yaw, 0, cos yaw)), relative to the frame.
   */
  interactable({ id, kind, pos, yaw = 0, radius = 1.2, prompt = 'Use', data = {} }) {
    if (this.interactables.some((i) => i.id === id)) throw new Error(`duplicate interactable ${id}`);
    const out = { id, kind, pos: this.toWorld(pos), yaw: yaw + this.frameYaw(), radius, prompt, data: { ...data } };
    if (data.exit) out.data.exit = this.toWorld(data.exit);
    this.interactables.push(out);
    return this;
  }

  frameYaw() {
    return Math.atan2(this.m.elements[8], this.m.elements[0]);
  }

  /**
   * Loose prop simulated by the physics owner (contracts §3): geometry built in fn (local to `pos`,
   * y = 0 its base) becomes a dynamic with data.physical = { shape: 'box' | 'cylinder',
   * size: [w, h, d] | radius + height, mass }. A matching local solid is generated from the shape.
   */
  physical(name, pos, spec, fn, yaw = 0) {
    const physical = { shape: 'box', mass: 2, ...spec };
    this.beginDynamic(name, pos, yaw, { physical });
    fn(this);
    if (physical.shape === 'cylinder') {
      const r = physical.radius;
      this.solid(Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * r, -Math.sin((i / 8) * Math.PI * 2) * r]), 0, physical.height, 'prop');
    } else {
      const [w, h, d] = physical.size;
      this.solid([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0, h, 'prop');
    }
    this.endDynamic();
    return this;
  }

  marker(name, pos, data = {}) {
    const p = this.toWorld(pos);
    const yaw = data.yaw !== undefined ? data.yaw + this.frameYaw() : undefined;
    this.markers.set(name, { name, pos: p, ...data, yaw });
    return this;
  }

  /** Starts a moving object (door). Geometry and solids inside are stored relative to its pivot. */
  beginDynamic(name, pivot, rotY = 0, data = {}) {
    if (this.dynamic) throw new Error('nested dynamic objects are not supported');
    const pivotMatrix = this.m.clone().multiply(new THREE.Matrix4().makeRotationY(rotY).setPosition(pivot[0], pivot[1], pivot[2]));
    this.dynamic = { name, pivotMatrix, solids: [], data, savedStack: this.stack };
    this.stack = [new THREE.Matrix4()];
    return this;
  }

  endDynamic() {
    const d = this.dynamic;
    this.stack = d.savedStack;
    delete d.savedStack;
    this.dynamics.set(d.name, d);
    this.dynamic = null;
    return this;
  }

  /** Builds meshes. Returns { root, buckets, dynamics, solids, walkables, occluders, lights, markers, stats }. */
  finish() {
    const root = new THREE.Group();
    root.name = 'world';
    const buckets = {};
    const dynamics = {};
    let triangles = 0;
    let drawCalls = 0;
    for (const [key, mats] of this.buckets) {
      const group = new THREE.Group();
      group.name = key;
      const flags = this.flags.get(key) ?? {};
      for (const [matName, a] of mats) {
        if (!a.idx.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
        g.setAttribute('bake', new THREE.Float32BufferAttribute(new Float32Array(a.count * 3).fill(0.5), 3));
        g.setAttribute('bakeStatic', new THREE.Float32BufferAttribute(new Float32Array(a.count * 3), 3));
        g.setAttribute('bakeLayer', new THREE.Float32BufferAttribute(new Float32Array(a.count * 4).fill(-1), 4));
        g.setAttribute('bakeLayerW', new THREE.Float32BufferAttribute(new Float32Array(a.count * 4), 4));
        if (['emissive', 'beam'].includes(this.lib.def(matName).kind)) g.setAttribute('emit', new THREE.Float32BufferAttribute(a.emit, 1));
        g.setIndex(a.count > 65535 ? new THREE.Uint32BufferAttribute(a.idx, 1) : new THREE.Uint16BufferAttribute(a.idx, 1));
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const material = this.lib.get(matName);
        const mesh = new THREE.Mesh(g, material);
        mesh.name = `${key}:${matName}`;
        mesh.castShadow = (flags.cast ?? true) && material.userData.cast;
        mesh.receiveShadow = flags.receive ?? true;
        mesh.matrixAutoUpdate = false;
        mesh.userData = { bucket: key, material: matName };
        if (material.userData.kind === 'decal') mesh.renderOrder = 1;
        if (material.userData.kind === 'glass') mesh.renderOrder = 2;
        if (material.userData.kind === 'beam') mesh.renderOrder = 3;
        group.add(mesh);
        triangles += a.idx.length / 3;
        drawCalls++;
      }
      if (key.startsWith('dyn:')) {
        const d = this.dynamics.get(key.slice(4));
        d.pivotMatrix.decompose(group.position, group.quaternion, group.scale);
        dynamics[d.name] = { ...d, group, baseQuaternion: group.quaternion.clone() };
      } else {
        group.userData.flags = flags;
        buckets[key] = group;
      }
      root.add(group);
    }
    root.updateMatrixWorld(true);
    return {
      root, buckets, dynamics,
      solids: this.solids, walkables: this.walkables, occluders: this.occluders,
      lights: this.lights, layers: [...this.layers.values()], markers: Object.fromEntries(this.markers),
      interactables: this.interactables,
      stats: { triangles, drawCalls },
    };
  }
}

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

/** Ear-clipping triangulation of a simple polygon given in XZ (returns index triples). */
export function earcut(poly) {
  const flat = poly.flatMap(([x, z]) => [x, z]);
  return THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []).flatMap((t) => orient(t, flat));
}

/** Orders a triangle so it faces +Y with XZ vertices (y up means clockwise in x,z). */
function orient(t, flat) {
  const [a, b, c] = t;
  const cross = (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]);
  return cross < 0 ? [a, b, c] : [a, c, b];
}
