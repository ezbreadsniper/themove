import { MeshBuilder, V } from '../mesh-builder.js';
import { torsoRings, torsoWeights } from './body.js';
import { sampleTorsoShaped } from './garments.js';

const X = V(1, 0, 0);
const Z = V(0, 0, 1);

/** UV layout inside the 128×64 belt texture. */
export const BELT_UV = { strap: [0, 0, 1, 0.5], buckle: [0, 0.5, 0.5, 1], edge: [0.5, 0.5, 1, 1] };

/**
 * Leather belt riding on the trouser waistband plus an oval buckle (8.3 × 5.4 cm) whose face is a
 * planar-mapped disc so the engraved texture reads straight on.
 */
export function buildBelt(layout, { riseY, ease, width = 0.038 }) {
  const mb = new MeshBuilder('belt');
  const by = Object.fromEntries(torsoRings(layout).map((r) => [r.key, r]));
  const k = layout.measures.height / 1.78;
  const yMid = riseY - width / 2 - 0.004;
  const torsoAt = sampleTorsoShaped(torsoRings(layout));
  const ring = (y, grow) => {
    const t = torsoAt(y);
    const out = ease * 0.3 + grow + 0.002;
    return {
      c: V(0, y, t.cz),
      x: X,
      z: Z,
      rx: t.rx + out,
      rzF: t.rzF + out,
      rzB: t.rzB + out,
      n: Math.min(2.3, t.n),
      shape: t.shape,
      w: torsoWeights(layout, Math.max(y, by.hips.y - 0.02)),
    };
  };
  const rings = [
    { ...ring(yMid - width / 2, 0.003), v: 0 },
    { ...ring(yMid - width / 2, 0.007), v: 0.08 },
    { ...ring(yMid + width / 2, 0.007), v: 0.92 },
    { ...ring(yMid + width / 2, 0.003), v: 1 },
  ];
  mb.loft(rings, { sides: 16, uv: BELT_UV.strap });

  const mid = torsoAt(yMid);
  const front = mid.cz + mid.rzF * mid.shape(0, 1, 0) + ease * 0.3 + 0.01;
  const center = V(0, yMid, front);
  const rx = 0.0415 * k;
  const ry = 0.027 * k;
  const depth = 0.008 * k;
  const w = torsoWeights(layout, yMid)(0, center);
  const n = 14;
  const [u0, v0, u1, v1] = BELT_UV.buckle;
  mb.newSmoothingGroup();
  const hub = mb.addVertex(center.clone().setZ(front + depth), [(u0 + u1) / 2, (v0 + v1) / 2], w);
  const rim = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = V(center.x + Math.cos(a) * rx, center.y + Math.sin(a) * ry, front + depth);
    rim.push(mb.addVertex(p, [u0 + (0.5 + Math.cos(a) * 0.48) * (u1 - u0), v0 + (0.5 + Math.sin(a) * 0.48) * (v1 - v0)], w));
  }
  for (let i = 0; i < n; i++) mb.tri(hub, rim[i], rim[i + 1]);
  mb.newSmoothingGroup();
  const [e0, f0, e1, f1] = BELT_UV.edge;
  const band = [];
  for (const [z, v] of [[front + depth, f1], [front - 0.002, f0]]) {
    const row = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      row.push(mb.addVertex(V(center.x + Math.cos(a) * rx, center.y + Math.sin(a) * ry, z), [e0 + (i / n) * (e1 - e0), v], w));
    }
    band.push(row);
  }
  for (let i = 0; i < n; i++) mb.quad(band[1][i], band[1][i + 1], band[0][i + 1], band[0][i]);
  return mb;
}
