import * as THREE from 'three';

/**
 * Procedural head tracking layered after the Animator: the spine top, neck and head share a yaw /
 * pitch toward a world point, clamped to a natural range and eased so heads turn, not snap. Works
 * on the posed skeleton each frame (the Animator restores its own pose before the next mixer step,
 * so this never accumulates). Beyond the yaw limit the NPC should turn its body instead (`wantsTurn`).
 */
const CHAIN = [['Spine2', 0.2], ['Neck', 0.3], ['Head', 0.5]];
const Y = new THREE.Vector3(0, 1, 0);
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();

export class LookAt {
  constructor(character, { maxYaw = 75, maxPitch = 35, rate = 6 } = {}) {
    this.character = character;
    this.bones = Object.fromEntries((character.userData.rig?.bones ?? []).map((b) => [b.name.replace(/^.*:/, ''), b]));
    this.maxYaw = THREE.MathUtils.degToRad(maxYaw);
    this.maxPitch = THREE.MathUtils.degToRad(maxPitch);
    this.rate = rate;
    this.yaw = 0;
    this.pitch = 0;
    this.weight = 0;
    this.target = null;
    this.wantsTurn = 0;
  }

  /** World point to look at (THREE.Vector3 or {x,y,z}), or null to release. */
  setTarget(p) {
    this.target = p ? new THREE.Vector3(p.x, p.y, p.z) : null;
  }

  /**
   * Eases toward the target and rotates the chain. `facing` is the body yaw (radians, 0 = +Z) and
   * `origin` the head's world position (approximate is fine).
   */
  update(dt, facing, origin) {
    let yaw = 0;
    let pitch = 0;
    let w = 0;
    this.wantsTurn = 0;
    if (this.target && origin) {
      const dx = this.target.x - origin.x;
      const dz = this.target.z - origin.z;
      const dy = this.target.y - origin.y;
      const rel = Math.atan2(Math.sin(Math.atan2(dx, dz) - facing), Math.cos(Math.atan2(dx, dz) - facing));
      yaw = THREE.MathUtils.clamp(rel, -this.maxYaw, this.maxYaw);
      pitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -this.maxPitch, this.maxPitch);
      w = 1;
      if (Math.abs(rel) > this.maxYaw * 0.9) this.wantsTurn = Math.sign(rel);
    }
    const k = Math.min(1, this.rate * dt);
    this.yaw += (yaw - this.yaw) * k;
    this.pitch += (pitch - this.pitch) * k;
    this.weight += (w - this.weight) * k;
    this.apply(facing);
  }

  apply(facing) {
    if (this.weight < 1e-3 && Math.abs(this.yaw) < 1e-3 && Math.abs(this.pitch) < 1e-3) return;
    this.character.updateMatrixWorld(true);
    // Pitch axis: the body's right-hand horizontal axis (positive pitch = look up).
    _axis.set(-Math.cos(facing), 0, Math.sin(facing));
    for (const [name, share] of CHAIN) {
      const bone = this.bones[name];
      if (!bone?.parent) continue;
      bone.parent.getWorldQuaternion(_pq);
      _pqi.copy(_pq).invert();
      const world = new THREE.Quaternion().setFromAxisAngle(Y, this.yaw * share * this.weight)
        .multiply(new THREE.Quaternion().setFromAxisAngle(_axis, this.pitch * share * this.weight));
      // World-space delta → bone-local: q_local' = P⁻¹ · Δ · P · q_local.
      _dq.copy(_pqi).multiply(world).multiply(_pq);
      bone.quaternion.premultiply(_dq);
      bone.updateMatrixWorld(true);
    }
  }

  /** World position of the head bone (for the next frame's origin). */
  headPosition(out = _v) {
    const head = this.bones.Head;
    return head ? head.getWorldPosition(out) : null;
  }
}
