import { STAIR } from '../units.js';

/**
 * Steel spiral stair around a centre pole. Must be authored in an unrotated frame (helical
 * walkables are stored with absolute angles).
 *
 * Collision model: the feet ride a helical ramp whose height equals each tread top at the tread's
 * middle (so riser count and step height stay honest), each tread carries a thin "underside" solid
 * that blocks people walking under low treads but never the climber, and the outer railing is a
 * solid ribbon that follows the helix. The entry is the radial edge at `start`.
 *
 * opts: { cx, cz, y0, y1, r, pole, treads, sweep, start (rad, atan2(z, x) convention), dir (+1 ccw, -1 cw) }
 */
export function spiralStair(kit, { cx, cz, y0, y1, r = 0.95, pole = 0.065, treads = 13, sweep, start = 0, dir = -1, mat = 'steelBlack', railMat = 'galvanized' }) {
  const rise = (y1 - y0) / (treads + 1);
  if (rise > STAIR.maxRise + 1e-6) throw new Error(`spiral stair rise ${rise.toFixed(3)} exceeds ${STAIR.maxRise}`);
  const step = sweep / treads;
  const at = (a, rad) => [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad];
  const wedge = (a0, a1, rIn, rOut, n = 4) => {
    const outer = Array.from({ length: n + 1 }, (_, i) => at(a0 + ((a1 - a0) * i) / n, rOut));
    const inner = Array.from({ length: 2 }, (_, i) => at(a1 + ((a0 - a1) * i), rIn));
    return [...outer, ...inner];
  };
  kit.cylinder(mat, [cx, y0, cz], pole, y1 - y0 + 1.0, { sides: 8, collide: true, tag: 'stair-pole' });
  kit.cylinder(mat, [cx, y0, cz], pole * 2.2, 0.03, { sides: 8 });
  const rail = [];
  for (let s = 0; s < treads; s++) {
    const a0 = start + dir * s * step;
    const a1 = start + dir * (s + 1) * step;
    const top = y0 + (s + 1) * rise;
    const plate = wedge(a0 - dir * 0.04, a1 + dir * 0.02, pole, r);
    kit.prism(mat, plate, top - 0.035, top);
    kit.prism(mat, wedge(a0, a0 + dir * 0.05, pole, r * 0.98, 1), top - 0.09, top - 0.035);
    kit.walkableSurface(wedge(a0, a1, 0, r), { helix: { cx, cz, a0, dir, span: step, y0: y0 + rise * (s + 0.5), dyda: rise / step } }, 'stair');
    kit.solid(wedge(a0, a1, pole, r), top - 0.3, top - 0.1, 'stair-underside');
    kit.solid(wedge(a0, a1, r - 0.07, r + 0.03, 2), top - 0.1, top + STAIR.railHeight, 'stair-rail');
    for (const t of [0.25, 0.75]) {
      const a = a0 + (a1 - a0) * t;
      const [x, z] = at(a, r - 0.04);
      kit.box(mat, [x - 0.011, top, z - 0.011], [x + 0.011, top + STAIR.railHeight, z + 0.011], { seg: 9, occlude: false });
    }
    for (let k = 0; k < 3; k++) {
      const a = a0 + ((a1 - a0) * k) / 3;
      const [x, z] = at(a, r - 0.04);
      rail.push([x, y0 + rise * (s + 0.5 + k / 3) + rise * 0.5 + STAIR.railHeight, z]);
    }
  }
  const [ex, ez] = at(start + dir * sweep, r - 0.04);
  rail.push([ex, y1 + STAIR.railHeight - rise * 0.5, ez]);
  kit.tube(railMat, rail, 0.025, { sides: 5 });
  kit.occluder([cx - pole, y0, cz - pole], [cx + pole, y1, cz + pole]);
  return { rise, step, end: start + dir * sweep };
}
