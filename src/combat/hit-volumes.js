import * as THREE from 'three';

/**
 * Fallback NPC hit volumes (used when the NPC manager has no hitTest, contracts §6): a head sphere,
 * a torso capsule, upper/lower arm and leg capsules, built from the posed skeleton every shot, so a
 * seated, crouching or collapsed body is hit where it is drawn. Headless NPCs (tests, no character)
 * get three stacked volumes from their capsule body.
 */
export const PARTS = Object.freeze({ head: 'head', torso: 'torso', arm: 'arm', leg: 'leg' });

/** Radii at a 1.78 m body (scaled by height). */
const R = { head: 0.115, torso: 0.17, upperArm: 0.055, foreArm: 0.045, thigh: 0.085, shin: 0.06 };

const tmp = new THREE.Vector3();

function bone(rig, joint) {
  return rig.byName?.[joint] ?? rig.bones.find((b) => b.userData?.joint === joint || b.name === joint || b.name.endsWith(`:${joint}`));
}

function worldPos(b) {
  return b.getWorldPosition(new THREE.Vector3());
}

/** World-space volumes [{ part, a, b, r, joint }] for a built character in its current pose. */
export function characterVolumes(character) {
  const rig = character?.userData?.rig;
  if (!rig) return [];
  character.updateMatrixWorld(true);
  const k = (character.userData.layout?.measures?.height ?? 1.78) / 1.78;
  const P = (j) => {
    const b = bone(rig, j);
    return b ? worldPos(b) : null;
  };
  const out = [];
  const cap = (part, ja, jb, r, joint = ja, extend = 0) => {
    const a = P(ja);
    const b = P(jb);
    if (!a || !b) return;
    if (extend) b.addScaledVector(b.clone().sub(a).normalize(), extend);
    out.push({ part, a, b, r: r * k, joint });
  };
  // Head: a sphere a little above the Head joint along the head's own up axis.
  const head = bone(rig, 'Head');
  if (head) {
    const c = head.localToWorld(new THREE.Vector3(0, 0.085 * k, 0.015 * k));
    out.push({ part: 'head', a: c, b: c.clone(), r: R.head * k, joint: 'Head' });
  }
  cap('torso', 'Hips', 'Neck', R.torso, 'Spine1');
  cap('torso', 'Neck', 'Head', 0.06, 'Neck');
  for (const s of ['Left', 'Right']) {
    cap('arm', `${s}Arm`, `${s}ForeArm`, R.upperArm, `${s}Arm`);
    cap('arm', `${s}ForeArm`, `${s}Hand`, R.foreArm, `${s}ForeArm`, 0.06 * k);
    cap('leg', `${s}UpLeg`, `${s}Leg`, R.thigh, `${s}UpLeg`);
    cap('leg', `${s}Leg`, `${s}Foot`, R.shin, `${s}Leg`);
  }
  return out;
}

/** Volumes from a capsule body { x, y, z, height } (headless NPCs). */
export function bodyVolumes(body) {
  const h = body.height ?? 1.75;
  const k = h / 1.78;
  const at = (y) => new THREE.Vector3(body.x, body.y + y, body.z);
  return [
    { part: 'head', a: at(1.64 * k), b: at(1.64 * k), r: R.head * k, joint: 'Head' },
    { part: 'torso', a: at(0.98 * k), b: at(1.45 * k), r: R.torso * k, joint: 'Spine1' },
    { part: 'leg', a: at(0.08 * k), b: at(0.88 * k), r: 0.15 * k, joint: 'LeftUpLeg' },
  ];
}

/** Ray (origin o, unit dir d) vs capsule segment a-b of radius r: entry distance or null. */
export function rayCapsule(o, d, a, b, r) {
  const ba = tmp.subVectors(b, a);
  const baba = ba.dot(ba);
  if (baba < 1e-10) return raySphere(o, d, a, r);
  const oa = new THREE.Vector3().subVectors(o, a);
  const bard = ba.dot(d);
  const baoa = ba.dot(oa);
  const rdoa = d.dot(oa);
  const oaoa = oa.dot(oa);
  const A = baba - bard * bard;
  const B = baba * rdoa - baoa * bard;
  const C = baba * oaoa - baoa * baoa - r * r * baba;
  const h = B * B - A * C;
  if (h >= 0 && A > 1e-12) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
  }
  // Caps.
  let best = null;
  for (const c of [a, b]) {
    const t = raySphere(o, d, c, r);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

export function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}

/** Outward normal on a volume at a surface point. */
function volumeNormal(v, p) {
  const ab = v.b.clone().sub(v.a);
  const len2 = ab.lengthSq();
  const t = len2 > 1e-10 ? THREE.MathUtils.clamp(p.clone().sub(v.a).dot(ab) / len2, 0, 1) : 0;
  return p.clone().sub(v.a.clone().addScaledVector(ab, t)).normalize();
}

/** First volume along the ray: { part, point, normal, distance, joint } or null. */
export function rayVolumes(o, d, max, volumes) {
  let best = null;
  for (const v of volumes) {
    const t = rayCapsule(o, d, v.a, v.b, v.r);
    if (t === null || t > max || (best && t >= best.distance)) continue;
    best = { part: v.part, joint: v.joint, distance: t, volume: v };
  }
  if (!best) return null;
  best.point = o.clone().addScaledVector(d, best.distance);
  best.normal = volumeNormal(best.volume, best.point);
  delete best.volume;
  return best;
}

/**
 * hitTest over a list of NPC-like objects (contract shape): each has `character` (posed) or a
 * `body()` / `pos` + `height`. Quick reject on a bounding sphere around the body first.
 * → { npc, point, normal, distance, part, joint } | null
 */
export function hitTestNpcs(list, origin, dir, maxDist) {
  const o = origin.isVector3 ? origin : new THREE.Vector3(...origin);
  const d = (dir.isVector3 ? dir.clone() : new THREE.Vector3(...dir)).normalize();
  let best = null;
  for (const npc of list) {
    if (!npc) continue;
    const pos = npc.pos ?? npc.holder?.position;
    if (pos) {
      const h = npc.height ?? 1.8;
      const c = new THREE.Vector3(pos.x, (pos.y ?? 0) + h * 0.5, pos.z);
      const t = c.clone().sub(o).dot(d);
      const closest = o.clone().addScaledVector(d, Math.max(0, t));
      if (closest.distanceTo(c) > h * 0.75 + 0.3) continue;
    }
    const vols = npc.character ? characterVolumes(npc.character) : bodyVolumes(typeof npc.body === 'function' ? npc.body() : { x: pos.x, y: pos.y, z: pos.z, height: npc.height });
    const h = rayVolumes(o, d, best?.distance ?? maxDist, vols);
    if (h) best = { ...h, npc };
  }
  return best;
}
