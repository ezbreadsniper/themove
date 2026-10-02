import * as THREE from 'three';
import { legCollider } from './colliders.js';

/**
 * Corrective shapes (pose-space morph targets) for garments.
 *
 * Linear-blend skinning cannot keep cloth outside the things it touches at extreme joint angles. A
 * trouser hem on the shin swings into the instep when the ankle flexes, and a skirt panel hanging from
 * the pelvis is crossed by the thigh in a stride or when sitting. For each driver pose we pose only the
 * driving joint(s), collide the posed garment with the posed collider, and store the push, converted
 * back to bind space, as a morph target.
 *
 * Runtime: a driver's influence ramps 0 → 1 as its joint angle goes from `from` to `angle`. In-between
 * targets also ramp back to 0 by `to`, where the next target has taken over. Everything exports to glTF
 * as plain morph targets plus the driver table in the mesh extras (`correctives`).
 */
export const ANKLE_DRIVER_DEG = { pos: 30, neg: 50 };
export const HIP_DRIVERS = [
  { name: 'Stride', angle: -45, to: -95, knee: 0 },
  { name: 'Sit', angle: -95, from: -45, knee: 90 },
  { name: 'Back', angle: 35, knee: 20 },
  // Knee-driven: the knee cap and shin pushing the panel when the knee folds (crouch / sit).
  { name: 'Knee', bone: 'Leg', angle: 105, from: 35, hip: -65, knee: 105 },
];

const X = new THREE.Vector3(1, 0, 0);

export function boneByName(skeleton, name) {
  return skeleton.bones.find((b) => b.name === name || b.name.endsWith(`:${name}`));
}

/** Flex angle (degrees, signed, about the bone's local X) of a bone with identity rest. */
export function flexAngle(bone) {
  const q = bone.quaternion;
  return THREE.MathUtils.radToDeg(2 * Math.atan2(q.x, q.w));
}

/** Influence of one driver at joint angle `a` (degrees). */
export function driverInfluence(d, a) {
  const from = d.from ?? 0;
  const up = (a - from) / (d.angle - from);
  if (up <= 0) return 0;
  if (up <= 1 || d.to === undefined) return Math.min(d.to === undefined ? 1.15 : 1, up);
  const down = 1 - (a - d.angle) / (d.to - d.angle);
  return Math.max(0, Math.min(1, down));
}

/**
 * Generic baker. For each spec: pose(skel) poses the joints, collide(pointWorld, margin) returns a world
 * push or null, active(i, spec) selects vertices. Returns { name, delta, driver } (bind-space deltas).
 */
function bakeTargets(mesh, rig, specs, { margin, active, triangleMargin = 0.6, maxDelta = 0.08 }) {
  const skel = rig.skeleton;
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const rest = skel.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
  const reset = () => skel.bones.forEach((b, i) => { b.position.copy(rest[i][0]); b.quaternion.copy(rest[i][1]); });
  const root = skel.bones[0];
  const out = [];
  const v = new THREE.Vector3();
  const blend = new THREE.Matrix3();
  const m3 = new THREE.Matrix3();
  const m4 = new THREE.Matrix4();
  const idx = geo.index.array;
  for (const spec of specs) {
    reset();
    spec.pose(skel);
    root.updateMatrixWorld(true);
    skel.update();
    mesh.updateMatrixWorld(true);
    spec.prepare?.();
    const on = new Uint8Array(pos.count);
    const start = new Float32Array(pos.count * 3);
    const moved = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      if (!active(i, spec)) continue;
      on[i] = 1;
      v.fromBufferAttribute(pos, i);
      mesh.applyBoneTransform(i, v);
      start.set([v.x, v.y, v.z], i * 3);
      for (let pass = 0; pass < 3; pass++) {
        const push = spec.collide(v, margin);
        if (!push) break;
        v.add(push);
      }
      moved.set([v.x, v.y, v.z], i * 3);
    }
    // Triangle interiors: a sample still inside pushes its triangle's vertices.
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    const pc = new THREE.Vector3();
    const sample = new THREE.Vector3();
    for (let pass = 0; pass < 3; pass++) {
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t];
        const b = idx[t + 1];
        const c = idx[t + 2];
        if (!on[a] || !on[b] || !on[c]) continue;
        for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
          pa.fromArray(moved, a * 3);
          pb.fromArray(moved, b * 3);
          pc.fromArray(moved, c * 3);
          sample.set(0, 0, 0).addScaledVector(pa, wa).addScaledVector(pb, wb).addScaledVector(pc, wc);
          const push = spec.collide(sample, margin * triangleMargin);
          if (!push) continue;
          for (const [i, w] of [[a, wa], [b, wb], [c, wc]]) {
            if (!w) continue;
            for (let e = 0; e < 3; e++) moved[i * 3 + e] += push.getComponent(e) * 1.2;
          }
        }
      }
    }
    // Posed-space push → bind-space delta through the inverse of the blended bone matrix.
    const delta = new Float32Array(pos.count * 3);
    let any = false;
    for (let i = 0; i < pos.count; i++) {
      if (!on[i]) continue;
      const push = new THREE.Vector3(moved[i * 3] - start[i * 3], moved[i * 3 + 1] - start[i * 3 + 1], moved[i * 3 + 2] - start[i * 3 + 2]);
      if (push.lengthSq() < 1e-10) continue;
      blend.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
      for (let c = 0; c < 4; c++) {
        const w = sw.getComponent(i, c);
        if (!w) continue;
        const b = si.getComponent(i, c);
        m4.multiplyMatrices(skel.bones[b].matrixWorld, skel.boneInverses[b]);
        m3.setFromMatrix4(m4);
        for (let e = 0; e < 9; e++) blend.elements[e] += m3.elements[e] * w;
      }
      push.applyMatrix3(blend.invert());
      if (push.length() > maxDelta) push.setLength(maxDelta);
      if (spec.fade) push.multiplyScalar(spec.fade(i));
      delta.set([push.x, push.y, push.z], i * 3);
      any = true;
    }
    if (any) out.push({ name: spec.name, delta, driver: spec.driver });
  }
  reset();
  root.updateMatrixWorld(true);
  skel.update();
  mesh.updateMatrixWorld(true);
  return out;
}

/** Vertices weighted to any of the given bone indices (above a threshold). */
function weightedTo(mesh, boneIdx, min = 0.001) {
  const si = mesh.geometry.attributes.skinIndex;
  const sw = mesh.geometry.attributes.skinWeight;
  return (i) => {
    for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > min && boneIdx.includes(si.getComponent(i, c))) return true;
    return false;
  };
}

/** Matrix taking world points into a bone's bind space (colliders are defined in bind pose). */
function bindSpace(skel, bone) {
  const i = skel.bones.indexOf(bone);
  return skel.boneInverses[i].clone().invert().multiply(bone.matrixWorld.clone().invert());
}

function pushInBind(space, collide, p, margin) {
  const local = p.clone().applyMatrix4(space.to);
  const res = collide(local, margin);
  if (!res) return null;
  return local.add(res.push).applyMatrix4(space.from).sub(p);
}

function spaceOf(skel, bone) {
  const to = bindSpace(skel, bone);
  return { to, from: to.clone().invert() };
}

/** Ankle correctives for trousers resting on shoes. colliders = shoeCollider() result. */
export function bakeAnkleCorrectives(mesh, rig, colliders, { margin = 0.004, zoneY = 0.35 } = {}) {
  const skel = rig.skeleton;
  const pos = mesh.geometry.attributes.position;
  const specs = [];
  for (const side of ['Left', 'Right']) {
    const foot = boneByName(skel, `${side}Foot`);
    const onSide = weightedTo(mesh, [skel.bones.indexOf(foot), skel.bones.indexOf(boneByName(skel, `${side}Leg`))], 0);
    for (const sign of [1, -1]) {
      const angle = sign * (sign > 0 ? ANKLE_DRIVER_DEG.pos : ANKLE_DRIVER_DEG.neg);
      let space = null;
      specs.push({
        name: `${side}AnkleFlex${sign > 0 ? 'Pos' : 'Neg'}`,
        driver: { bone: `${side}Foot`, axis: 'x', angle },
        active: (i) => pos.getY(i) <= zoneY && onSide(i),
        pose: () => foot.quaternion.setFromAxisAngle(X, THREE.MathUtils.degToRad(angle)),
        prepare: () => { space = spaceOf(skel, foot); },
        collide: (p, m) => pushInBind(space, (q, mm) => colliders[side].resolve(q, mm), p, m),
      });
    }
  }
  return attach(mesh, bakeTargets(mesh, rig, specs, { margin, active: (i, spec) => spec.active(i) }));
}

/**
 * Hip correctives for skirts and dresses: the posed thigh/shin (leg collider in the UpLeg / Leg bind
 * spaces) pushes the skirt panel out. Drivers: stride (hip flex 45°), sit (hip 95° + knee 90°, an
 * in-between after stride), and leg back (extension 35°).
 */
export function bakeHipCorrectives(mesh, rig, layout, { margin = 0.006, extra = 0, shoes = null, topY = null } = {}) {
  const skel = rig.skeleton;
  const pos = mesh.geometry.attributes.position;
  // Corrections fade out toward the pelvis: above the groin the thigh/belly crease is self-contact,
  // and under an untucked top's hem the skirt must not be pushed through the layer above it.
  const fadeTop = Math.min(topY ?? Infinity, layout.world.LeftUpLeg.y - 0.02);
  const fade = (i) => {
    const t = Math.max(0, Math.min(1, (fadeTop - pos.getY(i)) / 0.1));
    return t * t * (3 - 2 * t);
  };
  const kneeY = layout.measures.kneeY;
  const specs = [];
  for (const side of ['Left', 'Right']) {
    const up = boneByName(skel, `${side}UpLeg`);
    const leg = boneByName(skel, `${side}Leg`);
    const foot = boneByName(skel, `${side}Foot`);
    // The thigh volume stops a little under the hip joint: above it the pelvis/seat take over, and an
    // unbounded thigh cylinder would sweep through the waistband when the hip flexes.
    const thigh = legCollider(layout, side, { extra, minY: kneeY - 0.02, maxY: layout.world[`${side}UpLeg`].y - 0.04 });
    const shin = legCollider(layout, side, { extra, minY: -1, maxY: kneeY + 0.02 });
    for (const d of HIP_DRIVERS) {
      let spaces = null;
      specs.push({
        name: `${side}Hip${d.name}`,
        fade,
        driver: { bone: `${side}${d.bone ?? 'UpLeg'}`, axis: 'x', angle: d.angle, ...(d.from !== undefined ? { from: d.from } : {}), ...(d.to !== undefined ? { to: d.to } : {}) },
        pose: () => {
          up.quaternion.setFromAxisAngle(X, THREE.MathUtils.degToRad(d.hip ?? d.angle));
          leg.quaternion.setFromAxisAngle(X, THREE.MathUtils.degToRad(d.knee));
        },
        prepare: () => {
          spaces = [[spaceOf(skel, up), thigh], [spaceOf(skel, leg), shin]];
          if (shoes) spaces.push([spaceOf(skel, foot), shoes[side]]);
        },
        collide(p, m) {
          let total = null;
          const q = p.clone();
          for (const [space, col] of spaces) {
            const push = pushInBind(space, (x, mm) => col.resolve(x, mm), q, m);
            if (push) {
              q.add(push);
              total = (total ?? new THREE.Vector3()).add(push);
            }
          }
          return total;
        },
      });
    }
  }
  return attach(mesh, bakeTargets(mesh, rig, specs, { margin, active: () => true }));
}

/** Appends baked targets to the mesh's morph attributes and driver table. */
export function attach(mesh, targets) {
  if (!targets.length) return null;
  const geo = mesh.geometry;
  const prev = geo.morphAttributes.position ?? [];
  geo.morphAttributes.position = [...prev, ...targets.map((t) => {
    const attr = new THREE.Float32BufferAttribute(t.delta, 3);
    attr.name = t.name;
    return attr;
  })];
  geo.morphTargetsRelative = true;
  mesh.updateMorphTargets();
  mesh.userData.correctives = [...(mesh.userData.correctives ?? []), ...targets.map((t) => t.driver)];
  return targets.map((t) => t.driver);
}

/** Sets corrective influences from the current pose (call after the mixer update). */
export function updateCorrectives(group) {
  const skel = group.userData.rig?.skeleton;
  if (!skel) return;
  group.traverse((o) => {
    const drivers = o.isSkinnedMesh && o.userData.correctives;
    if (!drivers) return;
    drivers.forEach((d, i) => {
      o.morphTargetInfluences[i] = driverInfluence(d, flexAngle(boneByName(skel, d.bone)));
    });
  });
}
