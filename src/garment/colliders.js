import { V } from '../geo/mesh-builder.js';
import { legStations, legCenter } from '../geo/parts/body.js';

/**
 * Leg collision volume (bind pose): the same superellipse cross-sections the body leg is lofted from
 * (rx = 0.96 r, front r·front, back r·back), plus whatever is worn on the skin (socks).
 * Fabric colliding with it can lie on the shin but never inside it.
 */
export function legCollider(layout, side, { extra = 0, minY = -Infinity, maxY = Infinity } = {}) {
  const stations = [...legStations(layout, side)].sort((a, b) => a.y - b.y);
  const at = (y) => {
    if (y <= stations[0].y) return stations[0];
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const b = stations[i + 1];
      if (y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        const l = (key, d) => (a[key] ?? d) + ((b[key] ?? d) - (a[key] ?? d)) * t;
        return { r: l('r'), front: l('front', 1), back: l('back', 1) };
      }
    }
    return stations[stations.length - 1];
  };
  const n = 2;
  // Cross-sections and centres tabulated every 2 mm (the solver queries them hundreds of thousands of times).
  const STEP = 0.002;
  const y0 = -0.06;
  const table = [];
  const lookup = (y) => {
    const i = Math.max(0, Math.round((y - y0) / STEP));
    let e = table[i];
    if (!e) {
      const yy = y0 + i * STEP;
      const st = at(yy);
      const c = legCenter(layout, side, Math.max(yy, layout.measures.ankleY - 0.02));
      e = table[i] = { r: st.r, front: st.front ?? 1, back: st.back ?? 1, cx: c.x, cz: c.z };
    }
    return e;
  };
  return {
    side,
    sectionAt: at,
    resolve(p, margin = 0) {
      if (p.y < minY || p.y > maxY) return null;
      const st = lookup(p.y);
      const c = { x: st.cx, z: st.cz };
      const ox = p.x - c.x;
      const oz = p.z - c.z;
      const theta = Math.atan2(-ox, oz);
      const rz = Math.cos(theta) >= 0 ? st.r * (st.front ?? 1) : st.r * st.back;
      const rx = st.r * 0.96;
      const R = 1 / Math.pow(Math.pow(Math.abs(Math.cos(theta)) / rz, n) + Math.pow(Math.abs(Math.sin(theta)) / rx, n), 1 / n) + extra;
      const d = Math.hypot(ox, oz);
      if (d >= R + margin) return null;
      const k = (R + margin - d) / (d || 1e-6);
      const len = R + margin - d;
      return { len, push: V(ox * k, 0, oz * k), contact: 'leg' };
    },
  };
}
