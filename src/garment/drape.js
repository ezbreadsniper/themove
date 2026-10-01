import * as THREE from 'three';

/**
 * Drape solver: a small position-based-dynamics cloth sim on a dense tube (the "simulation mesh",
 * ~16 mm particle distance, like Marvelous Designer's working resolution). It is used offline at
 * build time and never shipped. Its result is resampled onto the low-poly runtime rings.
 *
 * The tube is described in material coordinates: row i at arc length s_i from the pinned top,
 * column j at angle θ_j = (j / S - 0.5) · 2π (the same convention as MeshBuilder.loft).
 *
 * opts:
 *   rest(s, θ)        → Vector3: unstressed garment shape (the pattern sewn up, hanging straight)
 *   start(s, θ)       → Vector3: arrangement position (rest shape lifted above obstacles)
 *   length            material length of the tube (m)
 *   sides             particle columns (default 20)
 *   spacing           target particle distance (default 0.016)
 *   pinBottom(θ)      optional Vector3: bottom row is sewn to something (e.g. a jogger rib)
 *   colliders         [{ resolve(p, margin) → { push, contact } | null }]
 *   margin            collision margin (skin offset + half fabric thickness)
 *   floorY            ground plane
 *   physics           FABRIC_PHYSICS entry (bend, weight, buckle)
 *   rng               seeded rng for the buckling seed
 *   steps, iterations solver budget
 */
export function drapeTube(opts) {
  const S = opts.sides ?? 20;
  const spacing = opts.spacing ?? 0.016;
  const R = Math.max(4, Math.ceil(opts.length / spacing));
  const ds = opts.length / R;
  const phys = opts.physics;
  const margin = opts.margin ?? 0.004;
  const floorY = opts.floorY ?? 0;
  const N = (R + 1) * S;
  const idx = (i, j) => i * S + ((j % S) + S) % S;
  const theta = (j) => (j / S - 0.5) * Math.PI * 2;
  const pos = new Float64Array(N * 3);
  const prev = new Float64Array(N * 3);
  const restP = new Float64Array(N * 3);
  const inv = new Float64Array(N).fill(1);
  const contact = new Array(N).fill(null);
  for (let i = 0; i <= R; i++) {
    for (let j = 0; j < S; j++) {
      const n = idx(i, j);
      const r = opts.rest(i * ds, theta(j));
      const a = opts.start(i * ds, theta(j));
      // Seed the buckling with a tiny deterministic radial perturbation (no perfectly symmetric folds).
      const jitter = i > 0 ? opts.rng.range(-0.0008, 0.0008) : 0;
      restP.set([r.x, r.y, r.z], n * 3);
      pos.set([a.x * (1 + jitter), a.y, a.z + jitter * 0.5], n * 3);
    }
  }
  for (let j = 0; j < S; j++) inv[idx(0, j)] = 0;
  if (opts.pinBottom) {
    for (let j = 0; j < S; j++) {
      const p = opts.pinBottom(theta(j));
      pos.set([p.x, p.y, p.z], idx(R, j) * 3);
      inv[idx(R, j)] = 0;
    }
  }
  prev.set(pos);

  // Constraints: [a, b, rest, stiffness]. Structural + shear take the rest length from the sewn
  // (unstressed) shape, so compression has nowhere to go but out of plane: the fabric buckles.
  const cA = [];
  const cB = [];
  const cR = [];
  const cK = [];
  const restDist = (a, b) => Math.hypot(restP[a * 3] - restP[b * 3], restP[a * 3 + 1] - restP[b * 3 + 1], restP[a * 3 + 2] - restP[b * 3 + 2]);
  const add = (a, b, k) => {
    if (inv[a] + inv[b] === 0) return;
    cA.push(a);
    cB.push(b);
    cR.push(restDist(a, b));
    cK.push(k);
  };
  const bendK = 0.04 + phys.bend * 0.5;
  for (let i = 0; i <= R; i++) {
    for (let j = 0; j < S; j++) {
      add(idx(i, j), idx(i, j + 1), 1);
      if (i < R) {
        add(idx(i, j), idx(i + 1, j), 1);
        add(idx(i, j), idx(i + 1, j + 1), 0.6);
        add(idx(i, j + 1), idx(i + 1, j), 0.6);
      }
      if (i < R - 1) add(idx(i, j), idx(i + 2, j), bendK);
      add(idx(i, j), idx(i, j + 2), bendK * 0.7);
    }
  }
  // Hem band: the turned, doubled allowance is stiffer than the single layer above it.
  for (let i = Math.max(0, R - 1); i < R; i++) for (let j = 0; j < S; j++) add(idx(i, j), idx(i, j + 3), Math.min(1, bendK * 2.5));
  const CA = Int32Array.from(cA);
  const CB = Int32Array.from(cB);
  const CR = Float64Array.from(cR);
  const CK = Float64Array.from(cK);
  const NC = CA.length;
  const tether = new Float64Array(N);
  for (let j = 0; j < S; j++) {
    let acc = 0;
    for (let i = 1; i <= R; i++) {
      acc += restDist(idx(i - 1, j), idx(i, j));
      tether[i * S + j] = acc;
    }
  }

  // Hem band shape matching: the turned, stitched hem is a stiff hoop, so its height around the leg can
  // only tilt (rest on the instep, drop at the heel) and dip gently, not sag into points beside the shoe.
  // Each iteration the bottom rows' heights are pulled toward their low-order (≤ 2nd harmonic) fit.
  const hemBand = opts.hemBand ?? 0.6;
  const bandRows = [R, R - 1];
  const bandHem = () => {
    for (const i of bandRows) {
      let a0 = 0;
      let a1 = 0;
      let b1 = 0;
      let a2 = 0;
      let b2 = 0;
      for (let j = 0; j < S; j++) {
        const y = pos[idx(i, j) * 3 + 1];
        const th = theta(j);
        a0 += y;
        a1 += y * Math.cos(th);
        b1 += y * Math.sin(th);
        a2 += y * Math.cos(2 * th);
        b2 += y * Math.sin(2 * th);
      }
      a0 /= S;
      a1 *= 2 / S;
      b1 *= 2 / S;
      a2 *= 2 / S;
      b2 *= 2 / S;
      for (let j = 0; j < S; j++) {
        const n = idx(i, j);
        if (!inv[n]) continue;
        const th = theta(j);
        const fitY = a0 + a1 * Math.cos(th) + b1 * Math.sin(th) + 0.3 * (a2 * Math.cos(2 * th) + b2 * Math.sin(2 * th));
        pos[n * 3 + 1] += (fitY - pos[n * 3 + 1]) * hemBand;
      }
    }
  };
  const steps = opts.steps ?? 60;
  const iterations = opts.iterations ?? 8;
  const g = 9.81 * (1 / 60) ** 2 * (0.6 + phys.weight * 0.6);
  const damping = 0.86;
  const p = new THREE.Vector3();
  const resolveCollisions = (final) => {
    for (let n = 0; n < N; n++) {
      if (!inv[n]) continue;
      p.set(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]);
      let hit = null;
      for (let pass = 0; pass < 2; pass++) {
        let moved = false;
        for (const c of opts.colliders) {
          if (final) {
            const near = c.resolve(p, margin + 0.003);
            if (near) hit = near.contact;
          }
          const res = c.resolve(p, margin);
          if (res) {
            p.add(res.push);
            hit = res.contact;
            moved = true;
          }
        }
        if (!moved) break;
      }
      if (p.y < floorY + margin + (final ? 0.003 : 0)) {
        p.y = Math.max(p.y, floorY + margin);
        hit = hit ?? 'floor';
      }
      pos[n * 3] = p.x;
      pos[n * 3 + 1] = p.y;
      pos[n * 3 + 2] = p.z;
      if (final) contact[n] = hit;
    }
  };
  for (let step = 0; step < steps; step++) {
    for (let n = 0; n < N; n++) {
      if (!inv[n]) continue;
      for (let a = 0; a < 3; a++) {
        const v = (pos[n * 3 + a] - prev[n * 3 + a]) * damping;
        prev[n * 3 + a] = pos[n * 3 + a];
        pos[n * 3 + a] += v;
      }
      pos[n * 3 + 1] -= g;
    }
    for (let it = 0; it < iterations; it++) {
      for (let c = 0; c < NC; c++) {
        const a = CA[c];
        const b = CB[c];
        const wa = inv[a];
        const wb = inv[b];
        const a3 = a * 3;
        const b3 = b * 3;
        const dx = pos[b3] - pos[a3];
        const dy = pos[b3 + 1] - pos[a3 + 1];
        const dz = pos[b3 + 2] - pos[a3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const corr = ((d - CR[c]) / d) * CK[c] / (wa + wb);
        pos[a3] += dx * corr * wa;
        pos[a3 + 1] += dy * corr * wa;
        pos[a3 + 2] += dz * corr * wa;
        pos[b3] -= dx * corr * wb;
        pos[b3 + 1] -= dy * corr * wb;
        pos[b3 + 2] -= dz * corr * wb;
      }
      // Long-range attachments: a particle can never be further from the pinned top of its column than
      // the fabric between them (stops PBD chains sagging/stretching under gravity).
      for (let j = 0; j < S; j++) {
        const t = idx(0, j) * 3;
        for (let i = 1; i <= R; i++) {
          const n = idx(i, j);
          if (!inv[n]) continue;
          const n3 = n * 3;
          const dx = pos[n3] - pos[t];
          const dy = pos[n3 + 1] - pos[t + 1];
          const dz = pos[n3 + 2] - pos[t + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const max = tether[i * S + j];
          if (d > max) {
            const k = max / d;
            pos[n3] = pos[t] + dx * k;
            pos[n3 + 1] = pos[t + 1] + dy * k;
            pos[n3 + 2] = pos[t + 2] + dz * k;
          }
        }
      }
      if (hemBand > 0 && !opts.pinBottom) bandHem();
      if (it % 2 === 1)      resolveCollisions(false);
    }
  }
  resolveCollisions(true);

  // Fit map: per-row strain of the circumference and of the vertical edges vs the sewn shape.
  const strain = [];
  for (let i = 0; i <= R; i++) {
    let around = 0;
    let aroundRest = 0;
    let down = 0;
    let downRest = 0;
    for (let j = 0; j < S; j++) {
      const a = idx(i, j);
      const b = idx(i, j + 1);
      around += Math.hypot(pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]);
      aroundRest += restDist(a, b);
      if (i < R) {
        const c = idx(i + 1, j);
        down += Math.hypot(pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]);
        downRest += restDist(a, c);
      }
    }
    strain.push({ around: around / aroundRest - 1, down: i < R ? down / downRest - 1 : 0 });
  }
  return {
    rows: R + 1,
    sides: S,
    ds,
    at(i, j) {
      const n = idx(i, j);
      return new THREE.Vector3(pos[n * 3], pos[n * 3 + 1], pos[n * 3 + 2]);
    },
    contactAt: (i, j) => contact[idx(i, j)],
    strain,
  };
}

/**
 * Retopology: picks the runtime rows that carry the folds that will still read in game (the hem, fold
 * crests and troughs deeper than `minFold`) and resamples each onto `sides` columns.
 * axisAt(y) → Vector3 centre of the limb at height y (for measuring how far a row bulges out).
 * Returns rows top → hem: { s, points: Vector3[sides + 1], contact: [] }.
 */
export function resampleDrape(sim, { sides, axisAt, maxRows = 8, minFold = 0.003, fromS = 0 }) {
  const bulge = [];
  for (let i = 0; i < sim.rows; i++) {
    let sum = 0;
    for (let j = 0; j < sim.sides; j++) {
      const p = sim.at(i, j);
      const c = axisAt(p.y);
      sum += Math.hypot(p.x - c.x, p.z - c.z);
    }
    bulge.push(sum / sim.sides);
  }
  const first = Math.max(1, Math.ceil(fromS / sim.ds));
  const picked = new Set([0, sim.rows - 1]);
  const extrema = [];
  for (let i = first; i < sim.rows - 1; i++) {
    const up = bulge[i] - bulge[i - 1];
    const dn = bulge[i] - bulge[i + 1];
    if ((up > 0 && dn > 0) || (up < 0 && dn < 0)) extrema.push({ i, depth: Math.min(Math.abs(up), Math.abs(dn)) + Math.abs(bulge[i] - (bulge[i - 1] + bulge[i + 1]) / 2) });
  }
  extrema.filter((e) => e.depth > minFold * 0.25).sort((a, b) => b.depth - a.depth).slice(0, Math.max(0, maxRows - 4)).forEach((e) => picked.add(e.i));
  // Fill the longest remaining gaps so long smooth stretches can still bend with the shin.
  while (picked.size < maxRows) {
    const sorted = [...picked].sort((a, b) => a - b);
    let gap = 0;
    let at = -1;
    for (let q = 0; q < sorted.length - 1; q++) if (sorted[q + 1] - sorted[q] > gap) { gap = sorted[q + 1] - sorted[q]; at = sorted[q]; }
    if (gap * sim.ds < 0.05) break;
    picked.add(at + Math.round(gap / 2));
  }
  const order = [...picked].sort((a, b) => a - b);
  const step = sim.sides / sides;
  return order.map((i) => {
    const points = [];
    const contact = [];
    for (let k = 0; k <= sides; k++) {
      const jf = k * step;
      const j0 = Math.floor(jf);
      const t = jf - j0;
      points.push(sim.at(i, j0).lerp(sim.at(i, j0 + 1), t));
      contact.push(sim.contactAt(i, j0 + (t > 0.5 ? 1 : 0)));
    }
    return { row: i, s: i * sim.ds, points, contact, strain: sim.strain[i] };
  });
}
