/**
 * Reusable architecture pieces. All functions author in the kit's current frame.
 *
 * Walls run along local +X from 0 to `length`; local z = 0 is the outer face (the face seen from
 * the -Z side) and z = thickness the inner face. Push a frame with the right yaw to place a wall on
 * any side of a building (see docs/world/README.md "Wall frames").
 */

/** Splits a wall span around rectangular openings into solid rectangles [{x0, x1, y0, y1}]. */
export function wallPieces(length, y0, y1, openings = []) {
  for (const o of openings) if (o.x0 < -1e-6 || o.x1 > length + 1e-6 || o.x1 <= o.x0) throw new Error(`opening ${o.x0}..${o.x1} outside wall`);
  const edges = [...new Set([0, length, ...openings.flatMap((o) => [o.x0, o.x1])].map((v) => Math.round(v * 1e5) / 1e5))].sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const xa = edges[i];
    const xb = edges[i + 1];
    const spans = openings.filter((o) => o.x0 <= xa + 1e-6 && o.x1 >= xb - 1e-6).sort((a, b) => a.y0 - b.y0);
    let y = y0;
    for (const o of spans) {
      if (o.y0 < y - 1e-6) throw new Error(`openings overlap at x ${xa}`);
      if (o.y0 > y + 1e-6) pieces.push({ x0: xa, x1: xb, y0: y, y1: o.y0 });
      y = o.y1;
    }
    if (y < y1 - 1e-6) pieces.push({ x0: xa, x1: xb, y0: y, y1 });
  }
  return pieces;
}

/**
 * Layered wall with openings. layers: [{ mat, t }] from outer to inner face.
 * opts: { y0, y1, openings, collide (default true), seg, faceUV: 'box' }
 */
export function wall(kit, length, layers, { y0 = 0, y1 = 3, openings = [], collide = true, seg = 0.6, tag = 'wall' } = {}) {
  const pieces = wallPieces(length, y0, y1, openings);
  let z = 0;
  for (const layer of layers) {
    for (const p of pieces) kit.box(layer.mat, [p.x0, p.y0, z], [p.x1, p.y1, z + layer.t], { seg, occlude: true });
    z += layer.t;
  }
  if (collide) for (const p of pieces) if (p.y1 - p.y0 > 0.05) kit.solid([[p.x0, 0], [p.x1, 0], [p.x1, z], [p.x0, z]], p.y0, p.y1, tag);
  return pieces;
}

/** Horizontal slab (floor/roof) with walkable top and solid body. */
export function slab(kit, mat, [x0, z0], [x1, z1], yTop, thickness = 0.2, { walk = true, collide = true, seg = 1.0, faces, tag = 'floor' } = {}) {
  kit.box(mat, [x0, yTop - thickness, z0], [x1, yTop, z1], { seg, walk, collide, faces, tag });
}

/**
 * Picket railing along a frame-local polyline at floor height y: posts, top rail, pickets.
 * Registers a thin solid per segment (blocks walking through, not climbable).
 */
export function railing(kit, points, y, { height = 1.0, mat = 'steelBlack', railMat = mat, picket = 0.12, postEvery = 1.6, solid = true, bottomRail = true } = {}) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / picket));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const isPost = k === 0 || k === n || (k % Math.max(1, Math.round(postEvery / picket))) === 0;
      const r = isPost ? 0.025 : 0.009;
      kit.box(mat, [x - r, y, z - r], [x + r, y + height, z + r], { seg: 9, occlude: false });
    }
    kit.tube(railMat, [[ax, y + height, az], [bx, y + height, bz]], 0.022, { sides: 5 });
    if (bottomRail) kit.tube(mat, [[ax, y + 0.1, az], [bx, y + 0.1, bz]], 0.012, { sides: 4 });
    if (solid) {
      const nx = -(bz - az) / len * 0.04;
      const nz = (bx - ax) / len * 0.04;
      kit.solid([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], y, y + height, 'railing');
    }
  }
}

/** Rain streak + base grime decals on a wall face (frame-local wall: outer face z = 0). */
export function weatherWall(kit, length, height, rng, { streaksAt = [], grime = true, offset = -0.004 } = {}) {
  if (grime) kit.panel('grime', [length / 2, 0.45, offset], [length, 0.9], '-z');
  for (const s of streaksAt) kit.panel('rainStreak', [s.x, s.y - s.h / 2, offset], [s.w ?? 0.8, s.h], '-z');
}
