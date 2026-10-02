import * as THREE from 'three';

/**
 * Combat helpers: hit volumes that follow the animated skeleton, ray tests against them, and the
 * choice of hit-reaction / death clips from where and from which side a bullet arrives.
 *
 * Hit volumes (character space → world through the posed bones):
 *   head   sphere around the head bone (raised to the skull centre)
 *   torso  capsule hips → neck
 *   arm    capsules upper arm and forearm, each side
 *   leg    capsules thigh and shin, each side
 * Headless NPCs (no character) use the same layout built from their position, facing and height.
 */
export const MAX_HEALTH = 5;
/** Damage multipliers by part (a pistol round is 1; the head counts double). */
export const PART_MULTIPLIER = { head: 2, torso: 1, arm: 1, leg: 1 };

const VOLUMES = [
  { part: 'head', a: 'Head', b: null, r: 0.12, lift: 0.09 },
  { part: 'torso', a: 'Hips', b: 'Neck', r: 0.17 },
  { part: 'arm', side: 'Left', a: 'LeftArm', b: 'LeftForeArm', r: 0.065 },
  { part: 'arm', side: 'Left', a: 'LeftForeArm', b: 'LeftHand', r: 0.055 },
  { part: 'arm', side: 'Right', a: 'RightArm', b: 'RightForeArm', r: 0.065 },
  { part: 'arm', side: 'Right', a: 'RightForeArm', b: 'RightHand', r: 0.055 },
  { part: 'leg', side: 'Left', a: 'LeftUpLeg', b: 'LeftLeg', r: 0.085 },
  { part: 'leg', side: 'Left', a: 'LeftLeg', b: 'LeftFoot', r: 0.065 },
  { part: 'leg', side: 'Right', a: 'RightUpLeg', b: 'RightLeg', r: 0.085 },
  { part: 'leg', side: 'Right', a: 'RightLeg', b: 'RightFoot', r: 0.065 },
];

/** Standing joint layout (1.78 m, facing +Z) for headless NPCs. */
const HEADLESS = {
  Head: [0, 1.6, 0], Neck: [0, 1.5, 0], Hips: [0, 0.95, 0],
  LeftArm: [0.19, 1.42, 0], LeftForeArm: [0.24, 1.15, 0], LeftHand: [0.27, 0.9, 0.03],
  RightArm: [-0.19, 1.42, 0], RightForeArm: [-0.24, 1.15, 0], RightHand: [-0.27, 0.9, 0.03],
  LeftUpLeg: [0.1, 0.9, 0], LeftLeg: [0.11, 0.5, 0.01], LeftFoot: [0.12, 0.08, 0],
  RightUpLeg: [-0.1, 0.9, 0], RightLeg: [-0.11, 0.5, 0.01], RightFoot: [-0.12, 0.08, 0],
};

function jointGetter(npc) {
  const bones = npc.character?.userData.rig?.bones;
  if (bones) {
    npc.boneMap ??= Object.fromEntries(bones.map((b) => [b.name.replace(/^.*:/, ''), b]));
    npc.character.updateMatrixWorld(true);
    return (name) => npc.boneMap[name]?.getWorldPosition(new THREE.Vector3()) ?? null;
  }
  const s = (npc.height ?? 1.78) / 1.78;
  const c = Math.cos(npc.facing);
  const sn = Math.sin(npc.facing);
  return (name) => {
    const [x, y, z] = HEADLESS[name];
    return new THREE.Vector3(npc.pos.x + (x * c + z * sn) * s, npc.pos.y + y * s, npc.pos.z + (-x * sn + z * c) * s);
  };
}

/** World-space hit volumes of an NPC: [{ part, side, a, b (null for spheres), r }]. */
export function hitVolumes(npc) {
  const at = jointGetter(npc);
  const out = [];
  for (const v of VOLUMES) {
    const a = at(v.a);
    if (!a) continue;
    if (v.lift) a.y += v.lift * ((npc.height ?? 1.78) / 1.78);
    out.push({ part: v.part, side: v.side ?? null, a, b: v.b ? at(v.b) : null, r: v.r });
  }
  return out;
}

/** Ray (origin o, unit dir d) vs capsule a–b radius r (sphere when b is null): distance or null. */
export function rayCapsule(o, d, a, b, r) {
  if (!b) return raySphere(o, d, a, r);
  // Closest approach between the ray and the segment, then step back to the surface.
  const u = b.clone().sub(a);
  const w = o.clone().sub(a);
  const uu = u.dot(u);
  const ud = u.dot(d);
  const uw = u.dot(w);
  const dw = d.dot(w);
  const den = uu - ud * ud;
  let s = den > 1e-9 ? (uu * -dw + ud * uw) / den : 0;
  let t = uu > 1e-9 ? (uw + s * ud) / uu : 0;
  t = Math.max(0, Math.min(1, t));
  // Re-solve the ray parameter for the clamped segment point.
  const q = a.clone().addScaledVector(u, t);
  s = Math.max(0, q.clone().sub(o).dot(d));
  const p = o.clone().addScaledVector(d, s);
  const dist = p.distanceTo(q);
  if (dist > r) return null;
  // Exact sphere test around the closest segment point gives the entry distance.
  return raySphere(o, d, q, r) ?? s;
}

function raySphere(o, d, c, r) {
  const oc = o.clone().sub(c);
  const b = oc.dot(d);
  const cc = oc.dot(oc) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : cc <= 0 ? 0 : null;
}

/**
 * Nearest hit of a ray against NPC hit volumes (contract §6):
 * → { npc, point, normal, distance, part, side } | null. Dead NPCs are hit too (bodies stay).
 */
export function hitTestNpcs(npcs, origin, dir, maxDist = 100) {
  const o = new THREE.Vector3(origin.x ?? origin[0], origin.y ?? origin[1], origin.z ?? origin[2]);
  const d = new THREE.Vector3(dir.x ?? dir[0], dir.y ?? dir[1], dir.z ?? dir[2]).normalize();
  let best = null;
  for (const npc of npcs) {
    // Broad phase: the ray's closest approach to the NPC's vertical axis.
    const to = new THREE.Vector3(npc.pos.x - o.x, 0, npc.pos.z - o.z);
    const along = to.x * d.x + to.z * d.z;
    const flat = Math.hypot(d.x, d.z) || 1e-6;
    const tAxis = along / (flat * flat);
    if (tAxis < -1.5 || tAxis * flat > maxDist + 1.5) continue;
    const px = o.x + d.x * tAxis;
    const pz = o.z + d.z * tAxis;
    if (Math.hypot(px - npc.pos.x, pz - npc.pos.z) > 1.2 && !npc.dead) continue;
    for (const v of hitVolumes(npc)) {
      const t = rayCapsule(o, d, v.a, v.b, v.r);
      if (t === null || t > maxDist || (best && t >= best.distance)) continue;
      const point = o.clone().addScaledVector(d, t);
      let axis = v.a;
      if (v.b) {
        const u = v.b.clone().sub(v.a);
        const k = Math.max(0, Math.min(1, point.clone().sub(v.a).dot(u) / u.dot(u)));
        axis = v.a.clone().addScaledVector(u, k);
      }
      const normal = point.clone().sub(axis).normalize();
      best = { npc, point, normal, distance: t, part: v.part, side: v.side };
    }
  }
  return best;
}

/**
 * Hit reaction clip for a part, from the bullet direction (travel) relative to the NPC's facing
 * and the side of the body the point is on.
 */
export function hitClip(npc, { part, dir, side }) {
  const fwd = { x: Math.sin(npc.facing), z: Math.cos(npc.facing) };
  const fromFront = dir ? dir.x * fwd.x + dir.z * fwd.z < 0 : true;
  if (part === 'head') return 'npc_hit_head';
  if (part === 'arm') return side === 'Right' ? 'npc_hit_arm_right' : 'npc_hit_arm_left';
  if (part === 'leg') return side === 'Right' ? 'npc_hit_leg_right' : 'npc_hit_leg_left';
  return fromFront ? 'npc_hit_torso_front' : 'npc_hit_torso_back';
}

/** Wound hold (upper-body loop) for a part. */
export function clutchClip({ part, side }) {
  if (part === 'arm') return side === 'Right' ? 'npc_clutch_arm_right' : 'npc_clutch_arm_left';
  if (part === 'leg') return 'npc_clutch_leg';
  return 'npc_clutch_torso';
}

/**
 * Death clip from how the shot arrived: from behind → forward onto the face; from the front →
 * backwards; head shots, legs and seated victims crumple more often (deterministic per NPC).
 */
export function deathClip(npc, { part, dir }, rng) {
  const fwd = { x: Math.sin(npc.facing), z: Math.cos(npc.facing) };
  const fromBehind = dir ? dir.x * fwd.x + dir.z * fwd.z > 0.3 : false;
  if (npc.seat) return 'npc_death_forward';
  if (part === 'leg' || (part === 'head' && rng.chance(0.5))) return 'npc_death_crumple';
  if (fromBehind) return 'npc_death_forward';
  return rng.chance(0.75) ? 'npc_death_back' : 'npc_death_crumple';
}
