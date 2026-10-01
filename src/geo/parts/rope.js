import { V, ringRadius } from '../mesh-builder.js';
import { torsoRings } from './body.js';

const G = -9.8;
const DT = 1 / 60;
const STEPS = 200;
const ITERATIONS = 6;
const DAMPING = 0.94;

/** Radius of the clothed torso at (y, θ): body rings plus garment ease. */
function torsoSurface(layout, ease) {
  const table = torsoRings(layout);
  return (y, theta) => {
    for (let i = 0; i < table.length - 1; i++) {
      const a = table[i];
      const b = table[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        const l = (key) => a[key] + (b[key] - a[key]) * t;
        const ring = { rx: l('rx'), rzF: l('rzF'), rzB: l('rzB'), n: 2.3 };
        return { r: ringRadius(ring, theta) + ease, cz: l('cz') };
      }
    }
    return null;
  };
}

function pushOutRadial(p, cz, rMin) {
  const dx = p.x;
  const dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= rMin) return;
  const k = rMin / Math.max(1e-5, d);
  p.x = dx * k;
  p.z = cz + dz * k;
}

/**
 * Verlet rope for one loc: root pinned to the scalp, gravity, length + bend constraints, and
 * collisions with skull, face, neck and the clothed torso, so the loc lies on the head and
 * drapes over shoulders and back instead of sticking out.
 */
export function simulateLoc(shape, layout, root, rootTheta, { length, segments = 8, radius, ease = 0.035, faceGuard = true }) {
  const k = shape.k;
  const seg = length / segments;
  const torso = torsoSurface(layout, ease + radius);
  const table = torsoRings(layout);
  const trapY = table.find((r) => r.key === 'trapezius').y;
  const neckR = layout.measures.neckRadius * 1.1 + radius + 0.006;
  const headCz = shape.rings[6].cz;
  const out = V(root.x, 0, root.z - headCz).normalize();
  const side = Math.sign(rootTheta || 1);
  const initDir = V(0, -1, 0).addScaledVector(out, 0.25);
  if (faceGuard && Math.cos(rootTheta) > 0.25) initDir.add(V(side * 0.8, 0, -0.15));
  initDir.normalize();
  const pts = [root.clone()];
  for (let i = 1; i <= segments; i++) pts.push(pts[i - 1].clone().addScaledVector(initDir, seg));
  const prev = pts.map((p) => p.clone());

  const collide = (p) => {
    const theta = Math.atan2(p.x, p.z - headCz);
    if (p.y > shape.chinY - 0.03 * k && p.y < shape.topY + radius) {
      const y = Math.min(p.y, shape.topY - 0.002);
      const cz = shape.sampleRing(y).cz;
      const skull = shape.point(theta, y, 0.008 * k + radius);
      pushOutRadial(p, cz, Math.hypot(skull.x, skull.z - cz));
    }
    if (faceGuard && p.z > headCz && p.y < shape.lm.hairlineFront + 0.02 * k && p.y > shape.chinY - 0.05 * k) {
      const minX = 0.088 * k;
      if (Math.abs(p.x) < minX) p.x = Math.sign(p.x || side) * minX;
    }
    if (p.y <= shape.chinY && p.y >= trapY) pushOutRadial(p, table.find((r) => r.key === 'neck').cz, neckR);
    const t = torso(p.y, Math.atan2(p.x, p.z));
    if (t) pushOutRadial(p, t.cz, t.r);
  };

  for (let step = 0; step < STEPS; step++) {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - prev[i].x) * DAMPING;
      const vy = (p.y - prev[i].y) * DAMPING;
      const vz = (p.z - prev[i].z) * DAMPING;
      prev[i].copy(p);
      p.set(p.x + vx, p.y + vy + G * DT * DT, p.z + vz);
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const d = b.clone().sub(a);
        const len = d.length() || 1e-6;
        const diff = (len - seg) / len;
        if (i === 0) b.addScaledVector(d, -diff);
        else {
          a.addScaledVector(d, diff * 0.5);
          b.addScaledVector(d, -diff * 0.5);
        }
      }
      for (let i = 0; i < pts.length - 2; i++) {
        const a = pts[i];
        const c = pts[i + 2];
        const d = c.clone().sub(a);
        const len = d.length() || 1e-6;
        const min = seg * 1.75;
        if (len < min) {
          const push = (min - len) / len;
          if (i === 0) c.addScaledVector(d, push);
          else {
            a.addScaledVector(d, -push * 0.5);
            c.addScaledVector(d, push * 0.5);
          }
        }
      }
      for (let i = 1; i < pts.length; i++) collide(pts[i]);
    }
  }
  return pts;
}
