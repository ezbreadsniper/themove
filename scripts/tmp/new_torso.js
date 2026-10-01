/**
 * Torso skin. `from` is the first ring above anything worn on the upper body; `lowerFrom` and
 * `gapFrom` describe a visible band below a cropped top (midriff) down to the trousers.
 * Returns the bottom ring when the pelvis is bare, so the legs can be stitched onto it.
 */
function buildTorso(mb, layout, { from = 'crotch', lowerFrom = 'crotch', gapFrom = null, neckHidden = false }) {
  const table = torsoRings(layout, { skin: true }).filter((r) => !neckHidden || (r.key !== 'neck' && r.key !== 'neckTop'));
  const fem = layout.measures.feminine ?? 0;
  const [u0, v0, u1, v1] = SKIN_ATLAS.torso;
  const yMin = gluteForm(layout).foldY;
  const yMax = table[table.length - 1].y;
  const indexOf = (key) => (key === 'crotch' ? 0 : table.findIndex((r) => r.key === key));
  const sides = fem > 0.3 ? 24 : 16;
  let bottom = null;
  const toRing = (r) => {
    const base = torsoShape(r.key, fem);
    const extra = r.shape;
    return {
      ...r,
      shape: extra ? (t, c, s2) => base(t) * extra(t, c, s2) : base,
      c: V(0, r.y, r.cz),
      x: X,
      z: Z,
      v: (r.y - yMin) / (yMax - yMin),
      w: torsoWeights(layout, r.y),
    };
  };
  const loft = (rows, capStart) => {
    if (rows.length < 2) return;
    const res = mb.loft(rows.map(toRing), { sides, uv: [u0, v0, u1, v1], capStart });
    if (rows[0] === table[0]) bottom = { start: res.starts[0], sides, group: mb.group, ring: toRing(rows[0]), yMin, yMax };
  };
  if (gapFrom !== null && from !== 'crotch') {
    const lower = table.slice(indexOf(lowerFrom)).filter((r) => r.y < gapFrom);
    const above = table.find((r) => r.y >= gapFrom);
    if (lower.length && above) {
      lower.push(interpRing(lower[lower.length - 1], above, gapFrom));
      loft(lower);
    }
  }
  const rows = table.slice(indexOf(from)).map((r, i) => (i === 0 && from !== 'crotch' ? { ...r, rx: r.rx * 0.8, rzF: r.rzF * 0.85, rzB: r.rzB * 0.85 } : r));
  mb.newSmoothingGroup();
  loft(rows, from === 'crotch' ? undefined : 0.001);
  return bottom;
}

function vertexAt(mb, i) {
  const p = V(mb.positions[i * 3], mb.positions[i * 3 + 1], mb.positions[i * 3 + 2]);
  const w = [0, 1, 2, 3].map((j) => [mb.skinIndex[i * 4 + j], mb.skinWeight[i * 4 + j]]).filter(([, x]) => x > 0);
  return { p, w };
}

/**
 * Emits a skin triangle between existing vertices as fresh vertices in the torso UV rect (so the
 * texture never stretches across atlas regions); positions and weights are copied, so normals weld
 * and the surface deforms exactly with its neighbours. Winding faces `outward(centroid)`.
 */
function bridgeTri(mb, ids, uvAt, outward) {
  const vs = ids.map((i) => vertexAt(mb, i));
  const n = vs[1].p.clone().sub(vs[0].p).cross(vs[2].p.clone().sub(vs[0].p));
  if (n.lengthSq() < 1e-12) return;
  const centroid = vs[0].p.clone().add(vs[1].p).add(vs[2].p).divideScalar(3);
  const order = n.dot(outward(centroid)) < 0 ? [0, 2, 1] : [0, 1, 2];
  const us = vs.map((v) => uvAt(v.p));
  const [lo, hi] = [Math.min(...us.map((u) => u[0])), Math.max(...us.map((u) => u[0]))];
  const [tu0, , tu1] = SKIN_ATLAS.torso;
  if (hi - lo > (tu1 - tu0) / 2) us.forEach((u) => { if (u[0] < (tu0 + tu1) / 2) u[0] = tu0 + tu1 - u[0]; });
  const nv = order.map((o) => mb.addVertex(vs[o].p, us[o], vs[o].w));
  mb.tri(nv[0], nv[1], nv[2]);
}

/** Zips two vertex polylines (both ordered front → back, params 0..1) into a triangle band. */
function zip(mb, a, b, uvAt, outward) {
  let i = 0;
  let j = 0;
  while (i < a.length - 1 || j < b.length - 1) {
    const stepA = j === b.length - 1 || (i < a.length - 1 && a[i + 1].t <= b[j + 1].t);
    if (stepA) {
      bridgeTri(mb, [a[i].id, a[i + 1].id, b[j].id], uvAt, outward);
      i += 1;
    } else {
      bridgeTri(mb, [a[i].id, b[j + 1].id, b[j].id], uvAt, outward);
      j += 1;
    }
  }
}

const ringArc = (start, from, to) => Array.from({ length: Math.abs(to - from) + 1 }, (_, n) => ({
  id: start + from + Math.sign(to - from) * n,
  t: n / Math.max(1, Math.abs(to - from)),
}));

/**
 * Bare legs grown out of the pelvis as one surface: each thigh starts on a junction ring whose
 * outer half rises to the torso's seat ring and whose inner half meets the other thigh at the
 * crotch. Torso halves are zipped to the outer halves, the inner halves are bridged across the
 * perineum, and the two leftover gaps (pubic front, sacral back) are closed with one triangle each.
 */
function buildConnectedLegs(mb, layout, bottom) {
  const m = layout.measures;
  const k = m.height / 1.78;
  const fem = m.feminine ?? 0;
  const seat = bottom.ring;
  const crotchY = gluteForm(layout).foldY;
  const halfW = seat.rx * 0.5;
  const L = bottom.sides / 2 + 4;
  const saved = mb.group;
  mb.group = bottom.group;
  const junction = {};
  for (const [side, s] of SIDES) {
    const U = J[`${side}UpLeg`];
    const all = legStations(layout, side);
    const top = all[0].y;
    const low = all[all.length - 1].y;
    const outer = (theta) => Math.max(0, -s * Math.sin(theta));
    const lift = seat.y - 0.012 * k - crotchY;
    const keepInside = (inner) => (theta, p) => V(s * p.x < inner ? s * inner - p.x : 0, 0, 0);
    const legRing = (c, rx, rzF, rzB, y, w, extra = {}) => ({ c, x: X.clone().multiplyScalar(-1), z: Z, rx, rzF, rzB, v: 1 - (top - y) / (top - low), w, ...extra });
    const upY = crotchY - 0.05 * k;
    const lc = legCenter(layout, side, upY);
    const upR = m.thighRadius * (1.02 + fem * 0.05);
    const junctionWeights = (theta) => {
      const o = outer(theta);
      return [[J.Hips, 0.3 + 0.35 * o], [U, 0.7 - 0.35 * o]];
    };
    const rings = [
      legRing(V(s * halfW, crotchY, seat.cz), halfW - 0.003 * k, seat.rzF * 0.94, seat.rzB * 0.82, crotchY, junctionWeights, { n: 2.2, offset: (theta) => V(0, lift * outer(theta) ** 1.5, 0) }),
      legRing(V(s * (halfW + Math.abs(lc.x)) * 0.5, upY, (seat.cz + lc.z) * 0.5), upR * 0.98, upR, upR * (1.04 + (m.butt ?? 0.3) * 0.1), upY, [[J.Hips, 0.1], [U, 0.9]], { offset: keepInside(0.004 * k) }),
      ...all.filter((st) => st.y < upY - 0.06 * k).map((st) => legRing(legCenter(layout, side, st.y), st.r * 0.96, st.r * (st.front ?? 1), st.r * st.back, st.y, st.w)),
    ];
    junction[side] = mb.loft(rings, { sides: L, uv: SKIN_ATLAS[side === 'Left' ? 'legL' : 'legR'] }).starts[0];
  }
  const [u0, v0, u1, v1] = SKIN_ATLAS.torso;
  const uvAt = (p) => [
    u0 + (u1 - u0) * (Math.atan2(p.x, p.z - seat.cz) / (Math.PI * 2) + 0.5),
    v0 + (v1 - v0) * Math.max(0, (p.y - bottom.yMin) / (bottom.yMax - bottom.yMin)),
  ];
  const radial = (c) => V(c.x, 0, c.z - seat.cz);
  const N = bottom.sides;
  const T = bottom.start;
  zip(mb, ringArc(T, N / 2, N), ringArc(junction.Left, L / 2, 0), uvAt, radial);
  zip(mb, ringArc(T, N / 2, 0), ringArc(junction.Right, L / 2, L), uvAt, radial);
  zip(mb, ringArc(junction.Left, L / 2, L), ringArc(junction.Right, L / 2, 0), uvAt, () => V(0, -1, 0));
  bridgeTri(mb, [T + N / 2, junction.Left + L / 2, junction.Right + L / 2], uvAt, radial);
  bridgeTri(mb, [T, junction.Left, junction.Right], uvAt, radial);
  mb.group = saved;
}

