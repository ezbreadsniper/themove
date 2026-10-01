import * as THREE from 'three';

/**
 * Corrective shapes (morph targets) for garments that rest on the shoes.
 *
 * Linear-blend skinning cannot keep a trouser hem on the shoe when the ankle flexes far: the front of
 * the hem (mostly on the shin) swings into the instep, and the back drops into the heel counter. For
 * each ankle and flex direction we pose the ankle alone to the driver angle, collide the posed garment
 * with the posed shoe collider, and store the push, converted back to bind space, as a morph target.
 * At runtime the influence is the ankle's flex angle divided by the driver angle (0..1). This is the
 * usual pose-space corrective set-up, and it exports to glTF as plain morph targets plus a driver
 * table in the mesh extras.
 */
export const ANKLE_DRIVER_DEG = { pos: 30, neg: 50 };

const X = new THREE.Vector3(1, 0, 0);

function boneByName(skeleton, name) {
  return skeleton.bones.find((b) => b.name === name || b.name.endsWith(`:${name}`));
}

/** Ankle flex angle (degrees, signed, about the bone's local X) of a bone with identity rest. */
export function flexAngle(bone) {
  const q = bone.quaternion;
  return THREE.MathUtils.radToDeg(2 * Math.atan2(q.x, q.w));
}

/**
 * Bakes ankle correctives onto `mesh` (a SkinnedMesh bound to `rig`). colliders = shoeCollider() result.
 * margin = collision margin; zoneY limits the work to the lower leg.
 */
export function bakeAnkleCorrectives(mesh, rig, colliders, { margin = 0.004, zoneY = 0.35 } = {}) {
  const skel = rig.skeleton;
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const rest = skel.bones.map((b) => [b.position.clone(), b.quaternion.clone()]);
  const reset = () => skel.bones.forEach((b, i) => { b.position.copy(rest[i][0]); b.quaternion.copy(rest[i][1]); });
  const root = skel.bones[0];
  const targets = [];
  const drivers = [];
  const v = new THREE.Vector3();
  const local = new THREE.Vector3();
  const blend = new THREE.Matrix3();
  const m3 = new THREE.Matrix3();
  const m4 = new THREE.Matrix4();
  for (const side of ['Left', 'Right']) {
    const foot = boneByName(skel, `${side}Foot`);
    const footIndex = skel.bones.indexOf(foot);
    const legIndex = skel.bones.indexOf(boneByName(skel, `${side}Leg`));
    for (const sign of [1, -1]) {
      reset();
      const angle = sign * (sign > 0 ? ANKLE_DRIVER_DEG.pos : ANKLE_DRIVER_DEG.neg);
      foot.quaternion.setFromAxisAngle(X, THREE.MathUtils.degToRad(angle));
      root.updateMatrixWorld(true);
      skel.update();
      mesh.updateMatrixWorld(true);
      const toFootBind = skel.boneInverses[footIndex].clone().invert().multiply(foot.matrixWorld.clone().invert());
      const fromFootBind = toFootBind.clone().invert();
      const delta = new Float32Array(pos.count * 3);
      // 1. Posed vertices in the foot's bind space (only this leg's lower vertices take part).
      const active = new Uint8Array(pos.count);
      const start = new Float32Array(pos.count * 3);
      const moved = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > zoneY) continue;
        let onSide = false;
        for (let c = 0; c < 4; c++) {
          const b = si.getComponent(i, c);
          if (sw.getComponent(i, c) > 0 && (b === footIndex || b === legIndex)) onSide = true;
        }
        if (!onSide) continue;
        active[i] = 1;
        v.fromBufferAttribute(pos, i);
        mesh.applyBoneTransform(i, v);
        local.copy(v).applyMatrix4(toFootBind);
        start.set([local.x, local.y, local.z], i * 3);
        for (let pass = 0; pass < 3; pass++) {
          const res = colliders[side].resolve(local, margin);
          if (!res) break;
          local.add(res.push);
        }
        moved.set([local.x, local.y, local.z], i * 3);
      }
      // 2. Triangle interiors: a sample still inside the shoe pushes its triangle's vertices.
      const idx = geo.index.array;
      const pa = new THREE.Vector3();
      const pb = new THREE.Vector3();
      const pc = new THREE.Vector3();
      const sample = new THREE.Vector3();
      for (let pass = 0; pass < 3; pass++) {
        for (let t = 0; t < idx.length; t += 3) {
          const a = idx[t];
          const b = idx[t + 1];
          const c = idx[t + 2];
          if (!active[a] || !active[b] || !active[c]) continue;
          pa.fromArray(moved, a * 3);
          pb.fromArray(moved, b * 3);
          pc.fromArray(moved, c * 3);
          for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
            sample.set(0, 0, 0).addScaledVector(pa, wa).addScaledVector(pb, wb).addScaledVector(pc, wc);
            const res = colliders[side].resolve(sample, margin * 0.6);
            if (!res) continue;
            for (const [i, w] of [[a, wa], [b, wb], [c, wc]]) {
              if (!w) continue;
              for (let e = 0; e < 3; e++) moved[i * 3 + e] += res.push.getComponent(e) * 1.2;
            }
            pa.fromArray(moved, a * 3);
            pb.fromArray(moved, b * 3);
            pc.fromArray(moved, c * 3);
          }
        }
      }
      // 3. Posed-space push → bind-space delta through the inverse of the blended bone matrix.
      let any = false;
      for (let i = 0; i < pos.count; i++) {
        if (!active[i]) continue;
        const s0 = new THREE.Vector3().fromArray(start, i * 3);
        const s1 = new THREE.Vector3().fromArray(moved, i * 3);
        if (s0.distanceToSquared(s1) < 1e-10) continue;
        const push = s1.applyMatrix4(fromFootBind).sub(s0.applyMatrix4(fromFootBind));
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
        delta.set([push.x, push.y, push.z], i * 3);
        any = true;
      }
      if (!any) continue;
      targets.push({ name: `${side}AnkleFlex${sign > 0 ? 'Pos' : 'Neg'}`, delta });
      drivers.push({ bone: `${side}Foot`, axis: 'x', angle });
    }
  }
  reset();
  root.updateMatrixWorld(true);
  skel.update();
  if (!targets.length) return null;
  geo.morphAttributes.position = targets.map((t) => {
    const attr = new THREE.Float32BufferAttribute(t.delta, 3);
    attr.name = t.name;
    return attr;
  });
  geo.morphTargetsRelative = true;
  mesh.updateMorphTargets();
  mesh.userData.correctives = drivers;
  return drivers;
}

/** Sets corrective influences from the current pose (call after the mixer update). */
export function updateCorrectives(group) {
  const skel = group.userData.rig?.skeleton;
  if (!skel) return;
  group.traverse((o) => {
    const drivers = o.isSkinnedMesh && o.userData.correctives;
    if (!drivers) return;
    drivers.forEach((d, i) => {
      const bone = boneByName(skel, d.bone);
      const a = flexAngle(bone);
      o.morphTargetInfluences[i] = Math.max(0, Math.min(1.15, a / d.angle));
    });
  });
}
