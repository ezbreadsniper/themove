import * as THREE from 'three';

/**
 * Cinematic dialogue camera (Witcher 3 / Mass Effect style, built from film grammar):
 *   - the line of action runs through both heads; a side is chosen once per conversation (the side
 *     the gameplay camera already sits on, so the blend-in never crosses the line) and every shot
 *     keeps the camera on that side: the 180° rule, so A always looks screen-right and B screen-left
 *   - 'two'    establishing two-shot from the side
 *   - 'ots'    over the listener's shoulder onto the speaker (shot / reverse shot)
 *   - 'close'  close-up on the speaker for emotional beats
 *   - 'medium' single, waist up
 *   - 'profile' three-quarter single far off the line (fallback when a wall blocks the reverse angle)
 *   - cuts are hard (film), the entry and exit blend from / to the gameplay camera, and a slow
 *     handheld drift keeps held shots alive
 * a = player, b = NPC; each { head: Vector3 } (eye height world position).
 */
export const SHOT_KINDS = ['two', 'ots', 'close', 'medium', 'profile'];
/** When a shot is blocked by a wall, try these instead (all on the same side of the line). */
export const SHOT_FALLBACKS = { ots: ['profile', 'close', 'two'], medium: ['profile', 'close', 'two'], close: ['profile', 'two'], profile: ['close', 'two'], two: ['ots', 'profile', 'medium'] };
const UP = new THREE.Vector3(0, 1, 0);

/** Line of action between two heads: { mid, dir (a→b, XZ unit), normal (dir rotated +90° about Y), dist }. */
export function lineOfAction(a, b) {
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const dist = Math.max(0.3, dir.length());
  dir.divideScalar(dist);
  const normal = new THREE.Vector3(dir.z, 0, -dir.x);
  const mid = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return { mid, dir, normal, dist };
}

/** Which side of the line a point is on: +1 / −1 (0 when on the line). */
export function sideOf(p, a, b) {
  const { normal, mid } = lineOfAction(a, b);
  const d = (p.x - mid.x) * normal.x + (p.z - mid.z) * normal.z;
  return Math.abs(d) < 1e-6 ? 0 : Math.sign(d);
}

/**
 * Camera placement for a shot. speaker: 'a' | 'b' (who the shot is about). Returns
 * { pos, target, fov, kind, speaker }. The pos always lies on `side` of the line of action.
 */
export function frameShot(kind, { a, b, speaker = 'b', side = 1, aspect = 16 / 9, orbit = 0, scale = 1 }) {
  const { mid, dir, normal, dist } = lineOfAction(a, b);
  const s = side >= 0 ? 1 : -1;
  const subj = speaker === 'a' ? a : b;
  const other = speaker === 'a' ? b : a;
  // Unit from the subject toward the other person (the camera sits behind the other person for OTS).
  const toOther = speaker === 'a' ? dir.clone() : dir.clone().negate();
  const n = normal.clone().multiplyScalar(s);
  let pos;
  let target;
  let fov;
  switch (kind) {
    case 'two': {
      // Far enough that both heads sit inside the middle ~60% of the frame width.
      fov = 40;
      const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect);
      const back = Math.max(2.2, (dist / 2 + 0.5) / Math.tan(halfH) / 0.62);
      pos = mid.clone().addScaledVector(n, back).addScaledVector(UP, 0.02);
      target = mid.clone().addScaledVector(UP, -0.22);
      break;
    }
    case 'ots': {
      // Behind the listener's shoulder that faces the camera side, slightly above eye level.
      pos = new THREE.Vector3(other.x, other.y, other.z).addScaledVector(toOther, 0.95).addScaledVector(n, 0.55).addScaledVector(UP, 0.08);
      target = new THREE.Vector3(subj.x, subj.y - 0.08, subj.z);
      fov = 38;
      break;
    }
    case 'close': {
      pos = new THREE.Vector3(subj.x, subj.y, subj.z).addScaledVector(toOther, 0.95).addScaledVector(n, 0.42).addScaledVector(UP, -0.02);
      target = new THREE.Vector3(subj.x, subj.y - 0.03, subj.z);
      fov = 28;
      break;
    }
    case 'profile': {
      // Clean three-quarter single from well off the line (used when a wall eats the reverse angle).
      pos = new THREE.Vector3(subj.x, subj.y, subj.z).addScaledVector(toOther, 1.0).addScaledVector(n, 1.35).addScaledVector(UP, -0.05);
      target = new THREE.Vector3(subj.x, subj.y - 0.1, subj.z);
      fov = 34;
      break;
    }
    case 'medium':
    default: {
      pos = new THREE.Vector3(subj.x, subj.y, subj.z).addScaledVector(toOther, 1.9).addScaledVector(n, 0.95).addScaledVector(UP, -0.12);
      target = new THREE.Vector3(subj.x, subj.y - 0.25, subj.z);
      fov = 32;
      break;
    }
  }
  if (orbit || scale !== 1) {
    // Variant: swing the camera around the framed point and / or move it in or out.
    const off = pos.clone().sub(target).applyAxisAngle(UP, orbit).multiplyScalar(scale);
    pos = target.clone().add(off);
  }
  return { pos, target, fov, kind, speaker, orbit, scale };
}

/**
 * Pulls a shot in front of walls: `raycast(o, d, max)` (CollisionWorld) from the target toward the
 * camera; a blocked camera moves in to the hit point. Sets `shot.clear` (unblocked fraction).
 */
export function clearShot(shot, raycast) {
  const d = shot.pos.clone().sub(shot.target);
  const len = d.length();
  d.divideScalar(len);
  const hit = raycast ? raycast(shot.target.toArray(), d.toArray(), len) : len;
  shot.clear = Math.min(1, hit / len);
  if (hit < len) shot.pos = shot.target.clone().addScaledVector(d, Math.max(0.6, hit - 0.2));
  return shot;
}

const _cam = new THREE.PerspectiveCamera();

/** Points a shot must show: the subject's head, plus the other head and both chests for a two-shot. */
function subjects(kind, a, b, speaker) {
  const subj = speaker === 'a' ? a : b;
  const pts = [{ p: subj, who: speaker, weight: 2 }];
  if (kind === 'two') {
    pts.push({ p: speaker === 'a' ? b : a, who: speaker === 'a' ? 'b' : 'a', weight: 2 });
    for (const h of [a, b]) pts.push({ p: h.clone().addScaledVector(UP, -0.45), who: 'chest', weight: 0.5 });
  }
  return pts;
}

/**
 * Framing quality of a shot (higher is better, 0 = clean): required subjects inside the frame with a
 * margin, an unobstructed line of sight to each head (walls via raycast), and bystanders kept out of
 * the frame, especially in front of a speaker. Returns { score, issues }.
 */
export function scoreShot(shot, { a, b, aspect = 16 / 9, raycast = null, bystanders = [] }) {
  _cam.fov = shot.fov;
  _cam.aspect = aspect;
  _cam.near = 0.05;
  _cam.far = 100;
  _cam.position.copy(shot.pos);
  _cam.lookAt(shot.target);
  _cam.updateMatrixWorld(true);
  _cam.updateProjectionMatrix();
  let score = 0;
  const issues = [];
  const subj = subjects(shot.kind, a, b, shot.speaker);
  let far = 0;
  for (const { p, who, weight } of subj) {
    const ndc = p.clone().project(_cam);
    far = Math.max(far, shot.pos.distanceTo(p));
    const out = Math.max(0, Math.abs(ndc.x) - 0.82, Math.abs(ndc.y) - 0.82);
    if (ndc.z > 1 || out > 0) {
      score -= weight * (1 + out * 2);
      issues.push(`${who} out of frame`);
    }
    if (raycast && who !== 'chest') {
      const d = p.clone().sub(shot.pos);
      const len = d.length();
      if (raycast(shot.pos.toArray(), d.divideScalar(len).toArray(), len) < len - 0.15) {
        score -= weight * 1.5;
        issues.push(`${who} behind a wall`);
      }
    }
  }
  for (const by of bystanders) {
    let worst = 0;
    for (const y of [1.0, 1.5]) {
      const q = new THREE.Vector3(by.x, (by.y ?? 0) + y, by.z);
      if (q.clone().applyMatrix4(_cam.matrixWorldInverse).z > -0.1) continue;
      const depth = shot.pos.distanceTo(q);
      const ndc = q.project(_cam);
      if (Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) continue;
      // In front of a speaker on screen: blocks them. Elsewhere nearer than the speakers: clutter.
      let blocks = false;
      for (const { p, who } of subj) {
        if (who === 'chest' || depth > shot.pos.distanceTo(p) + 0.2) continue;
        const sp = p.clone().project(_cam);
        if (Math.abs(sp.x - ndc.x) < 0.22 * (1 + 2 / Math.max(0.5, depth))) blocks = true;
      }
      worst = Math.max(worst, blocks ? 2.5 : depth < far ? 0.6 : 0.15);
    }
    if (worst) {
      score -= worst;
      issues.push(worst >= 2.5 ? 'bystander blocks a speaker' : 'bystander in frame');
    }
  }
  return { score, issues };
}

const ORBITS = [0, 0.2, -0.2, 0.42, -0.42];
const SCALES = [1, 0.85, 1.2];

/**
 * Picks the best-framed variant of a shot: the requested kind first, swung around the framed point
 * (orbit) and moved in / out (scale), then the fallback kinds; every candidate stays on the chosen
 * side of the line. The plain shot wins when it is clean. Returns the shot plus score / issues.
 */
export function composeShot(kind, opts, { raycast = null, bystanders = [] } = {}) {
  const ctx = { a: opts.a, b: opts.b, aspect: opts.aspect ?? 16 / 9, raycast, bystanders };
  const side = opts.side >= 0 ? 1 : -1;
  let best = null;
  [kind, ...(SHOT_FALLBACKS[kind] ?? [])].forEach((k, ki) => {
    for (const orbit of ORBITS) {
      for (const scale of SCALES) {
        const shot = clearShot(frameShot(k, { ...opts, orbit, scale }), raycast);
        if (sideOf(shot.pos, opts.a, opts.b) !== side) continue;
        const { score, issues } = scoreShot(shot, ctx);
        // Preferences: the asked-for kind, the canonical angle and distance, no wall pull-in.
        const total = score - ki * 0.45 - Math.abs(orbit) * 0.5 - Math.abs(scale - 1) * 0.6 - (1 - shot.clear) * 1.5;
        if (!best || total > best.total) best = { ...shot, score, issues, total };
      }
    }
  });
  return best;
}

/** Older name for composeShot (raycast, bystanders as positional arguments). */
export const frameClearShot = (kind, opts, raycast, bystanders = []) => composeShot(kind, opts, { raycast, bystanders });

const smooth = (t) => t * t * (3 - 2 * t);

export class DialogueCamera {
  constructor(camera, { raycast = null, blendIn = 0.8, blendOut = 0.6, handheld = 1 } = {}) {
    this.camera = camera;
    this.raycast = raycast;
    this.blendIn = blendIn;
    this.blendOut = blendOut;
    this.handheld = handheld;
    this.active = false;
    this.time = 0;
    this.shot = null;
    this.side = 1;
    this.cuts = [];
  }

  /** Starts a conversation between heads a (player) and b (NPC), picking the side of the line. */
  begin(a, b) {
    this.a = a.clone();
    this.b = b.clone();
    const s = sideOf(this.camera.position, this.a, this.b);
    this.side = s === 0 ? 1 : s;
    this.from = this.pose();
    this.mode = 'in';
    this.blend = 0;
    this.active = true;
    this.cuts = [];
    this.shot = null;
    this.shotTime = 0;
  }

  /** Updates the actors' head positions (they may shuffle during the conversation). */
  track(a, b) {
    if (a) this.a.copy(a);
    if (b) this.b.copy(b);
  }

  pose() {
    return { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov };
  }

  /**
   * Hard cut (or no-op when already on that shot). The framing (kind, orbit, distance) is composed
   * once here, against walls and bystanders, and then held while the heads are tracked.
   */
  cut(kind, speaker = 'b') {
    if (this.shot && this.shot.request === `${kind}/${speaker}`) return false;
    const c = composeShot(kind, { a: this.a, b: this.b, speaker, side: this.side, aspect: this.camera.aspect }, { raycast: this.raycast, bystanders: this.bystanders?.() ?? [] });
    this.shot = { kind: c.kind, speaker, orbit: c.orbit, scale: c.scale, request: `${kind}/${speaker}`, issues: c.issues };
    this.shotTime = 0;
    this.cuts.push({ kind: c.kind, requested: kind, speaker, side: this.side, issues: c.issues });
    return true;
  }

  end() {
    if (!this.active) return;
    this.mode = 'out';
    this.blend = 0;
    this.from = this.pose();
  }

  /** Current shot's camera pose (with drift), on the chosen side. */
  shotPose() {
    const sh = this.shot ?? { kind: 'two', speaker: 'b', orbit: 0, scale: 1 };
    const f = clearShot(frameShot(sh.kind, { a: this.a, b: this.b, speaker: sh.speaker, side: this.side, aspect: this.camera.aspect, orbit: sh.orbit, scale: sh.scale }), this.raycast);
    const t = this.time;
    const h = this.handheld;
    const drift = new THREE.Vector3(Math.sin(t * 0.7) * 0.012 + Math.sin(t * 1.9) * 0.004, Math.sin(t * 0.53 + 1) * 0.009, Math.sin(t * 0.61 + 2) * 0.01).multiplyScalar(h);
    // Slow push-in on held shots.
    const push = Math.min(1, this.shotTime / 8) * 0.05;
    const pos = f.pos.clone().add(drift).lerp(f.target, push);
    const target = f.target.clone().add(new THREE.Vector3(Math.sin(t * 0.43) * 0.006, Math.sin(t * 0.37 + 0.5) * 0.005, 0).multiplyScalar(h));
    const m = new THREE.Matrix4().lookAt(pos, target, UP);
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: f.fov };
  }

  /**
   * Writes the camera. `gameplay` is the camera pose the game set this frame (needed for the
   * blend back out; defaults to the camera's current state).
   */
  update(dt, gameplay = null) {
    if (!this.active) return;
    this.time += dt;
    this.shotTime += dt;
    const cam = this.camera;
    if (this.mode === 'out') {
      this.blend = Math.min(1, this.blend + dt / this.blendOut);
      const to = gameplay ?? this.from;
      this.apply(this.from, to, smooth(this.blend));
      if (this.blend >= 1) this.active = false;
      return;
    }
    const target = this.shotPose();
    if (this.mode === 'in') {
      this.blend = Math.min(1, this.blend + dt / this.blendIn);
      this.apply(this.from, target, smooth(this.blend));
      if (this.blend >= 1) this.mode = 'hold';
    } else this.apply(target, target, 1);
    cam.updateMatrixWorld(true);
  }

  apply(from, to, k) {
    const cam = this.camera;
    cam.position.copy(from.pos).lerp(to.pos, k);
    cam.quaternion.copy(from.quat).slerp(to.quat, k);
    const fov = from.fov + (to.fov - from.fov) * k;
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
