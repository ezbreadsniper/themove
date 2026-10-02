import * as THREE from 'three';
import { buildCharacter } from '../character/build.js';
import { bakeClip } from '../anim/clips.js';
import { shoeCollider, SHOE_TYPES } from '../geo/parts/shoes.js';
import { updateCorrectives } from './correctives.js';

/**
 * Fit audit: measures how garments sit on the body and the shoes in real poses (CPU skinning).
 * Runs in Node (tests, reports) and in the browser.
 *
 *  shoe.maxDepth   deepest point of the trousers inside a shoe (metres, in the foot's bind space)
 *  shoe.ratio      fraction of sampled hem-zone triangle points more than SHOE_TOL inside a shoe
 *  poke.ratio      fraction of covered skin samples that end up outside the garment
 *  frontGap        standing only: how far the front of the hem floats above the shoe upper
 */
export const SHOE_TOL = 0.004;

export const AUDIT_POSES = [
  ['neutral', 0], ['idle', 1.3], ['walk', 0.1], ['walk', 0.35], ['walk', 0.6], ['run', 0.1], ['run', 0.3],
  ['turn', 0.6], ['crouch', 1.2], ['jump', 0.35], ['jump', 0.85], ['jump', 1.3], ['sit', 1],
];

export const BODY_VARIANTS = {
  base: {},
  slim: { build: 0, muscle: 0.1 },
  heavy: { build: 1, muscle: 0.5 },
  short: { height: 1.56 },
  tall: { height: 2.0 },
  wideHips: { hips: 1.2, butt: 0.8, thighs: 1.2 },
  narrowHips: { hips: 0.85, butt: 0.1, thighs: 0.85 },
  bigChest: { bust: 1, feminine: 1, shoulders: 1.1 },
  young: { age: 18 },
  mature: { age: 48 },
  old: { age: 76 },
  woman: { feminine: 1, bust: 0.6, hips: 1.1, butt: 0.6, waist: 0.9, height: 1.66 },
};

export function meshNamed(group, name) {
  let found = null;
  group.traverse((o) => { if (o.isMesh && o.name === name) found = o; });
  return found;
}

export function poseGroup(group, clip, time) {
  const mixer = new THREE.AnimationMixer(group);
  mixer.clipAction(bakeClip(group.userData.layout, clip)).play();
  mixer.setTime(time);
  group.updateMatrixWorld(true);
  if (!poseGroup.noCorrectives) updateCorrectives(group);
  return mixer;
}

function skinned(mesh) {
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const pos = mesh.geometry.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/** World → foot bind space for each foot in the current pose. */
function footSpaces(group) {
  const rig = group.userData.rig;
  const skel = rig.skeleton;
  const out = {};
  for (const side of ['Left', 'Right']) {
    const i = skel.bones.findIndex((b) => b.name === `${side}Foot` || b.name.endsWith(`:${side}Foot`));
    const bone = skel.bones[i];
    bone.updateMatrixWorld(true);
    const bind = skel.boneInverses[i].clone().invert();
    out[side] = bind.multiply(bone.matrixWorld.clone().invert());
  }
  return out;
}

/** Trousers vs shoes in one pose. */
export function shoeContact(group, { colliders, zoneY = 0.3 } = {}) {
  const bottom = meshNamed(group, 'bottom');
  if (!bottom || !colliders) return { maxDepth: 0, ratio: 0, samples: 0 };
  const bindPos = bottom.geometry.attributes.position;
  const world = skinned(bottom);
  const spaces = footSpaces(group);
  const idx = bottom.geometry.index.array;
  let samples = 0;
  let bad = 0;
  let maxDepth = 0;
  const worst = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    if (bindPos.getY(a) > zoneY && bindPos.getY(b) > zoneY && bindPos.getY(c) > zoneY) continue;
    for (const [wa, wb, wc] of [[1, 0, 0], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5]]) {
      p.set(
        world[a * 3] * wa + world[b * 3] * wb + world[c * 3] * wc,
        world[a * 3 + 1] * wa + world[b * 3 + 1] * wb + world[c * 3 + 1] * wc,
        world[a * 3 + 2] * wa + world[b * 3 + 2] * wb + world[c * 3 + 2] * wc,
      );
      samples += 1;
      let depth = 0;
      for (const side of ['Left', 'Right']) {
        q.copy(p).applyMatrix4(spaces[side]);
        const res = colliders[side].resolve(q, 0);
        if (res) depth = Math.max(depth, res.len);
      }
      if (depth > SHOE_TOL) {
        bad += 1;
        if (worst.length < 400) worst.push({ depth, bind: [0, 1, 2].map((ax) => +(bindPos.getComponent(a, ax) * wa + bindPos.getComponent(b, ax) * wb + bindPos.getComponent(c, ax) * wc).toFixed(3)) });
      }
      maxDepth = Math.max(maxDepth, depth);
    }
  }
  worst.sort((x, y) => y.depth - x.depth);
  return { maxDepth, ratio: samples ? bad / samples : 0, samples, worst: worst.slice(0, 8) };
}

/**
 * Skin poke-through in pose: every covered body vertex casts a ray outward along its posed normal; it
 * must hit the posed garment within `reach`. Covered = bind position inside `filter`.
 */
export function pokeThrough(group, garmentName, filter, { reach = 0.35, stride = 2 } = {}) {
  const body = meshNamed(group, 'body');
  const garment = meshNamed(group, garmentName);
  if (!body || !garment) return { ratio: 0, checked: 0 };
  const bodyWorld = skinned(body);
  const gWorld = skinned(garment);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(gWorld, 3));
  geo.setIndex(new THREE.BufferAttribute(garment.geometry.index.array, 1));
  geo.computeBoundingSphere();
  const gMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  // Posed normals: recompute on the posed body.
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bodyWorld, 3));
  bgeo.setIndex(new THREE.BufferAttribute(body.geometry.index.array, 1));
  bgeo.computeVertexNormals();
  const nrm = bgeo.attributes.normal;
  bgeo.computeBoundingSphere();
  const bMesh = new THREE.Mesh(bgeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const bind = body.geometry.attributes.position;
  const ray = new THREE.Raycaster();
  const back = new THREE.Raycaster();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  let exposed = 0;
  let checked = 0;
  let out = 0;
  const offenders = [];
  for (let i = 0; i < bind.count; i += stride) {
    b.fromBufferAttribute(bind, i);
    if (!filter(b)) continue;
    p.set(bodyWorld[i * 3], bodyWorld[i * 3 + 1], bodyWorld[i * 3 + 2]);
    n.fromBufferAttribute(nrm, i);
    if (n.lengthSq() < 0.5) continue;
    ray.set(p.clone().addScaledVector(n, -0.02), n);
    ray.far = reach + 0.02;
    checked += 1;
    const hits = ray.intersectObject(gMesh);
    // Skin facing other skin (inner thighs, calves) is occluded before it could reach the fabric.
    if (!hits.length) {
      const self = ray.intersectObject(bMesh).filter((h) => h.distance > 0.035);
      if (self.length) continue;
    }
    // Penetration = the skin is past the fabric: the garment is found just *behind* the skin (within
    // 6 cm inward) and not in front of it. Skin with no garment on either side is merely exposed (a
    // short skirt riding up), which `exposed` counts separately.
    const front = hits.filter((h) => h.distance > 0.02 - 0.003);
    let behind = hits.some((h) => h.distance <= 0.02 - 0.003);
    if (!behind) {
      back.set(p, n.clone().negate());
      back.far = 0.06;
      behind = back.intersectObject(gMesh).length > 0;
    }
    if (!front.length && !behind) {
      exposed += 1;
      continue;
    }
    if (!front.length || (behind && front[0].distance > 0.2)) {
      out += 1;
      if (offenders.length < 12) offenders.push(b.toArray().map((x) => +x.toFixed(3)));
    }
  }
  return { ratio: checked ? out / checked : 0, checked, offenders, exposed: checked ? exposed / checked : 0 };
}

/** Standing: the front of each hem should rest on (not float above) the shoe upper. */
export function frontHemGap(group, colliders) {
  const bottom = meshNamed(group, 'bottom');
  if (!bottom || !colliders) return 0;
  const pos = bottom.geometry.attributes.position;
  let worst = 0;
  for (const side of ['Left', 'Right']) {
    const foot = group.userData.layout.world[`${side}Foot`];
    let best = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      if (Math.abs(x - foot.x) > 0.06 || z < foot.z + 0.02 || y > 0.2) continue;
      const top = colliders[side].topAt(x, z);
      if (top === -Infinity) continue;
      best = Math.min(best, y - top);
    }
    if (best < Infinity) worst = Math.max(worst, best);
  }
  return worst;
}

const LOWER_BONES = ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];

/**
 * Skin the bottom garment should cover: vertices driven by the pelvis/legs, between the garment's hem
 * (plus a 3 cm overlap allowance) and the waistband.
 */
export function coveredByBottom(group) {
  const body = meshNamed(group, 'body');
  const bottom = meshNamed(group, 'bottom');
  const m = group.userData.layout.measures;
  if (!body || !bottom) return () => false;
  const bones = group.userData.rig.skeleton.bones.map((b) => b.name.replace(/^.*:/, ''));
  const lower = new Set(LOWER_BONES.map((n) => bones.indexOf(n)));
  const si = body.geometry.attributes.skinIndex;
  const sw = body.geometry.attributes.skinWeight;
  const bb = new THREE.Box3().setFromBufferAttribute(bottom.geometry.attributes.position);
  const pos = body.geometry.attributes.position;
  const ok = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let best = -1;
    let bw = -1;
    for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); best = si.getComponent(i, c); }
    const y = pos.getY(i);
    ok[i] = lower.has(best) && y > bb.min.y + 0.03 && y < Math.min(bb.max.y, m.hipsY) - 0.04 ? 1 : 0;
  }
  // The filter receives bind positions; map them back to indices by a position key.
  const keys = new Set();
  for (let i = 0; i < pos.count; i++) if (ok[i]) keys.add(`${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`);
  return (v) => keys.has(`${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`);
}

/** Full legwear audit of one definition across poses. */
export function auditLegwear(def, { poses = AUDIT_POSES } = {}) {
  const group = buildCharacter(def);
  const d = group.userData.definition;
  const colliders = d.shoes && SHOE_TYPES.includes(d.shoes.type) ? shoeCollider(group.userData.layout, d.shoes.type, { size: d.shoes.size }) : null;
  const m = group.userData.layout.measures;
  const covered = coveredByBottom(group);
  const rows = [];
  for (const [clip, time] of poses) {
    poseGroup(group, clip, time);
    rows.push({ clip, time, shoe: shoeContact(group, { colliders }), poke: pokeThrough(group, 'bottom', covered) });
  }
  poseGroup(group, 'neutral', 0);
  return { rows, frontGap: d.bottom?.length === 'full' ? frontHemGap(group, colliders) : 0, stats: group.userData.stats };
}
