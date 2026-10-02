import * as THREE from 'three';

const DEG = Math.PI / 180;
const CELL = 2;

/** Spring-arm tuning: pivot heights over the feet, arm lengths, shoulder offsets, fov, smoothing rates. */
export const CAMERA = Object.freeze({
  pivot: { stand: 1.52, crouch: 1.1, seated: 1.0 },
  arm: { normal: 2.9, aim: 1.25, seated: 2.4, crouch: 2.5 },
  shoulder: { normal: 0.42, aim: 0.55 },
  height: { normal: 0.12, aim: 0.08 },
  fov: { normal: 62, aim: 46 },
  pitch: { min: -55 * DEG, max: 70 * DEG },
  /** Probe sphere radius and how fast the arm extends back after a pull-in (1/s). Pull-in is immediate. */
  probe: 0.2,
  extendRate: 3.5,
  pivotRate: 9,
  pivotYRate: 7,
  shoulderRate: 7,
  aimRate: 10,
  minArm: 0.35,
});

/**
 * Ray probe against the static world for the camera: collision solids (walls, doors, props; skips
 * noCamera ones) plus the kit's AABB occluders, which also cover ceilings, slabs and furniture that
 * have no character collider. Occluders are hashed on a 2 m XZ grid.
 */
export class CameraProbe {
  constructor({ collision = null, occluders = [] } = {}) {
    this.collision = collision;
    this.boxes = occluders.filter((o) => Math.max(o.max[0] - o.min[0], o.max[2] - o.min[2]) > 0.08 && o.max[1] - o.min[1] > 0.04);
    this.cells = new Map();
    this.boxes.forEach((b, i) => {
      for (let x = Math.floor(b.min[0] / CELL); x <= Math.floor(b.max[0] / CELL); x++) {
        for (let z = Math.floor(b.min[2] / CELL); z <= Math.floor(b.max[2] / CELL); z++) {
          const k = `${x},${z}`;
          if (!this.cells.has(k)) this.cells.set(k, []);
          this.cells.get(k).push(i);
        }
      }
    });
  }

  /** Distance along the unit ray to the first hit (≤ max). Boxes containing the origin are ignored. */
  raycast(o, d, max) {
    let best = this.collision ? this.collision.raycast(o, d, max) : max;
    const seen = new Set();
    const ex = o[0] + d[0] * max;
    const ez = o[2] + d[2] * max;
    for (let x = Math.floor(Math.min(o[0], ex) / CELL); x <= Math.floor(Math.max(o[0], ex) / CELL); x++) {
      for (let z = Math.floor(Math.min(o[2], ez) / CELL); z <= Math.floor(Math.max(o[2], ez) / CELL); z++) {
        for (const i of this.cells.get(`${x},${z}`) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const t = rayBox(o, d, this.boxes[i]);
          if (t !== null && t < best) best = t;
        }
      }
    }
    return best;
  }
}

/** Slab test: entry distance into the AABB, or null (also null when the origin is inside). */
export function rayBox(o, d, b) {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b.min[a] || o[a] > b.max[a]) return null;
      continue;
    }
    let ta = (b.min[a] - o[a]) / d[a];
    let tb = (b.max[a] - o[a]) / d[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0 > 0 ? t0 : null;
}

/**
 * Third-person spring-arm camera (GTA / RDR style): a pivot over the character's shoulders follows
 * the (already step-smoothed) root with separate horizontal and vertical lag; the arm hangs back
 * along yaw/pitch with an over-the-shoulder offset that can be swapped; aiming shortens the arm,
 * narrows the fov and tightens the shoulder. The arm is probed with five rays (centre + a ring the
 * size of the probe sphere) from the pivot through the shoulder point: it pulls in instantly when
 * something gets between the camera and the character and eases back out afterwards.
 */
export class ThirdPersonCamera {
  constructor(camera, probe) {
    this.camera = camera;
    this.probe = probe;
    this.yaw = 0;
    this.pitch = 10 * DEG;
    this.side = 1;
    this.sideBlend = 1;
    this.aimBlend = 0;
    this.arm = CAMERA.arm.normal;
    this.pivot = null;
    this.state = { arm: this.arm, want: this.arm, pulled: false };
  }

  /** Mouse look (radians). */
  look(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, CAMERA.pitch.min, CAMERA.pitch.max);
  }

  swapShoulder() {
    this.side *= -1;
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  right() {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  /** Snap the pivot (after teleports). */
  reset(target) {
    this.pivot = null;
    this.update(0, { target });
  }

  /**
   * target: feet position (Vector3); mode flags: aim, crouch, seated. Positions the camera.
   */
  update(dt, { target, aim = false, crouch = false, seated = false }) {
    const C = CAMERA;
    const k = (rate) => (dt <= 0 ? 1 : 1 - Math.exp(-rate * dt));
    const h = seated ? C.pivot.seated : crouch ? C.pivot.crouch : C.pivot.stand;
    const want = new THREE.Vector3(target.x, target.y + h, target.z);
    if (!this.pivot) this.pivot = want.clone();
    this.pivot.x += (want.x - this.pivot.x) * k(C.pivotRate);
    this.pivot.z += (want.z - this.pivot.z) * k(C.pivotRate);
    this.pivot.y += (want.y - this.pivot.y) * k(C.pivotYRate);
    // Never let the horizontal lag leave the character more than 0.6 m off-centre (sprint, falls).
    const lag = new THREE.Vector2(want.x - this.pivot.x, want.z - this.pivot.z);
    if (lag.length() > 0.6) {
      lag.setLength(lag.length() - 0.6);
      this.pivot.x += lag.x;
      this.pivot.z += lag.y;
    }
    if (Math.abs(want.y - this.pivot.y) > 1.2) this.pivot.y = want.y - Math.sign(want.y - this.pivot.y) * 1.2;

    this.aimBlend += ((aim ? 1 : 0) - this.aimBlend) * k(C.aimRate);
    this.sideBlend += (this.side - this.sideBlend) * k(C.shoulderRate);
    const a = this.aimBlend;
    const armWant = seated ? C.arm.seated : THREE.MathUtils.lerp(crouch ? C.arm.crouch : C.arm.normal, C.arm.aim, a);
    const shoulder = THREE.MathUtils.lerp(C.shoulder.normal, C.shoulder.aim, a) * this.sideBlend;
    const lift = THREE.MathUtils.lerp(C.height.normal, C.height.aim, a);

    const fwd = this.forward();
    const right = this.right();
    // Pivot → shoulder point (sideways), probed so the shoulder offset never pokes into a wall.
    const side = right.clone().multiplyScalar(Math.sign(shoulder) || 1);
    const sideLen = Math.abs(shoulder);
    const sideHit = this.cast(this.pivot, side, sideLen + C.probe);
    const shoulderPt = this.pivot.clone().addScaledVector(side, Math.max(0, Math.min(sideLen, sideHit - C.probe))).add(new THREE.Vector3(0, lift, 0));
    // Shoulder → camera along -forward, probed with a ring of rays the size of the probe sphere.
    const back = fwd.clone().negate();
    const up = new THREE.Vector3(0, 1, 0);
    const ringA = right.clone().multiplyScalar(C.probe);
    const ringB = up.clone().cross(back).normalize().cross(back).normalize().multiplyScalar(C.probe);
    let hit = this.cast(shoulderPt, back, armWant + C.probe);
    for (const off of [ringA, ringA.clone().negate(), ringB, ringB.clone().negate()]) {
      hit = Math.min(hit, this.cast(shoulderPt.clone().add(off.clone().multiplyScalar(0.7)), back, armWant + C.probe));
    }
    const limit = Math.max(C.minArm, Math.min(armWant, hit - C.probe));
    if (limit < this.arm || dt <= 0) this.arm = limit;
    else this.arm += (limit - this.arm) * k(C.extendRate);
    this.state = { arm: this.arm, want: armWant, pulled: limit < armWant - 0.05 };

    const cam = this.camera;
    cam.position.copy(shoulderPt).addScaledVector(back, this.arm);
    cam.lookAt(shoulderPt.clone().addScaledVector(fwd, 10));
    const fov = THREE.MathUtils.lerp(C.fov.normal, C.fov.aim, a);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    return this.state;
  }

  cast(from, dir, max) {
    if (!this.probe) return max;
    return this.probe.raycast(from.toArray(), dir.toArray(), max);
  }

  /** The point under the crosshair (for aim / fire events): first hit along the view ray. */
  aimPoint(max = 60) {
    const o = this.camera.position.clone();
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    const t = this.probe ? this.probe.raycast(o.toArray(), d.toArray(), max) : max;
    return o.addScaledVector(d, t);
  }
}
