import * as THREE from 'three';
import { handFrame } from '../rig/skeleton.js';
import { DEG } from './pose.js';

/**
 * Where the cigarette sits in the right hand, shared by the mesh (buildCigarette), the smoking clips
 * (which place the filter on the lips) and the smoke emitter (which needs the lit tip).
 *
 * The hold is the classic V grip: wedged between the index and middle fingers at the proximal
 * phalanx, filter on the palm side, lit end through to the back of the hand, tilted a little toward
 * the wrist. The mitten hand has one finger block, so "between index and middle" is the thumb-side
 * quarter of the block. The cigarette is skinned to RightHandFingers1, so it follows the finger curl.
 */
export const CIGARETTE = {
  bone: 'RightHandFingers1',
  /** Along the fingers from the knuckle (fraction of hand length). */
  along: 0.11,
  /** Toward the thumb side from the block centre (m at 1.78 m): the index / middle gap. */
  gap: 0.011,
  /** Tilt of the lit end toward the wrist (degrees). */
  tilt: 14,
  /** Filter end on the palm side and lit end on the back (m at 1.78 m from the hold point). */
  filter: 0.026,
  lit: 0.052,
  radius: 0.0042,
};

/** Unit vectors of the right hand's rest frame (world = Fingers1 local, bones rest at identity). */
export function rightHandFrame(layout) {
  return handFrame(layout.measures.armDir, -1);
}

/**
 * Rest-pose cigarette points (character space): hold, filter end, lit tip, and the axis (filter → tip).
 * Also each end relative to the knuckle joint (the RightHandFingers1 bone space).
 */
export function cigarettePoints(layout) {
  const k = layout.measures.height / 1.78;
  const f = rightHandFrame(layout);
  const knuckle = layout.world.RightHandFingers1.clone();
  const hold = knuckle.clone().addScaledVector(f.fingers, layout.measures.handLength * CIGARETTE.along).addScaledVector(f.forward, CIGARETTE.gap * k);
  const t = CIGARETTE.tilt * DEG;
  const axis = f.palm.clone().negate().multiplyScalar(Math.cos(t)).addScaledVector(f.fingers, -Math.sin(t)).normalize();
  const filter = hold.clone().addScaledVector(axis, -CIGARETTE.filter * k);
  const tip = hold.clone().addScaledVector(axis, CIGARETTE.lit * k);
  return { k, knuckle, hold, filter, tip, axis, frame: f, local: { filter: filter.clone().sub(knuckle), tip: tip.clone().sub(knuckle), hold: hold.clone().sub(knuckle) } };
}

/** Rotation of the finger block for a curl (matches curlFingers: 55% of the curl at the knuckle). */
export function fingerCurlQuat(layout, fingersDeg) {
  const f = rightHandFrame(layout);
  const axis = f.fingers.clone().cross(f.palm).normalize();
  return new THREE.Quaternion().setFromAxisAngle(axis, fingersDeg * 0.55 * DEG);
}

/**
 * Offset (hand-bone rest space, i.e. before the hand's world rotation) from the wrist joint to a
 * cigarette point ('filter' | 'tip' | 'hold') with the fingers curled `fingersDeg`.
 */
export function cigaretteFromWrist(layout, which, fingersDeg) {
  const c = cigarettePoints(layout);
  const knuckle = c.knuckle.clone().sub(layout.world.RightHand);
  return knuckle.add(c.local[which].clone().applyQuaternion(fingerCurlQuat(layout, fingersDeg)));
}

/** Mouth (lips centre) in Head bone space, from the head height (matches the built face within ~5 mm). */
export function mouthLocal(layout) {
  const hh = layout.measures.headHeight;
  return new THREE.Vector3(0, 0.112 * hh, 0.378 * hh);
}
