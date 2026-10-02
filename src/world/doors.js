import * as THREE from 'three';

const OPEN_ANGLE = (95 * Math.PI) / 180;
const TRIGGER = 1.5;
const SPEED = 4.5;

/**
 * Swing doors built by kit.beginDynamic(..., { door: true }). Unlocked doors open automatically
 * when an actor comes within TRIGGER metres, swinging away from the actor, and close behind them.
 * A door's leaf solid is only active while it is shut, so a half-open leaf never shoves the player.
 */
export class DoorSystem {
  constructor(dynamics, collision) {
    this.doors = Object.values(dynamics).filter((d) => d.data?.door).map((d) => {
      const solids = d.solids.map((s) => collision.addSolid({ ...s, poly: this.transform(d, s.poly, 0), y0: s.y0 + d.pivotMatrix.elements[13], y1: s.y1 + d.pivotMatrix.elements[13] }));
      const centre = new THREE.Vector3(d.data.width / 2, 0, 0).applyMatrix4(d.pivotMatrix);
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(d.pivotMatrix);
      return { ...d, solids, centre, normal, angle: 0, target: 0, side: 1 };
    });
  }

  transform(d, poly, angle) {
    const m = d.pivotMatrix.clone().multiply(new THREE.Matrix4().makeRotationY(angle));
    return poly.map(([x, z]) => {
      const v = new THREE.Vector3(x, 0, z).applyMatrix4(m);
      return [v.x, v.z];
    });
  }

  get(name) {
    return this.doors.find((d) => d.name === name);
  }

  update(dt, actor) {
    for (const d of this.doors) {
      let want = 0;
      if (actor && !d.data.locked) {
        const dist = Math.hypot(actor.x - d.centre.x, actor.z - d.centre.z);
        const level = Math.abs(actor.y - d.centre.y) < 1.5;
        if (dist < TRIGGER && level) {
          if (d.target === 0) d.side = Math.sign(new THREE.Vector3(actor.x - d.centre.x, 0, actor.z - d.centre.z).dot(d.normal)) || 1;
          want = d.side * OPEN_ANGLE;
        }
      }
      d.target = want;
      const delta = d.target - d.angle;
      d.angle += Math.sign(delta) * Math.min(Math.abs(delta), SPEED * dt);
      d.group.quaternion.copy(d.baseQuaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.angle));
      const shut = Math.abs(d.angle) < 0.03;
      for (const s of d.solids) s.enabled = shut;
    }
  }
}
