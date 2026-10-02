import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../src/character/build.js';
import { updateCorrectives } from '../src/garment/correctives.js';

const sheet06 = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json', 'utf8'));
const bare = { ...sheet06, top: null, bottom: null, socks: null };

/** Mean distance from the left hip joint of the vertices blended across it, posed at `deg` hip flex. */
function blendZoneRadius(group, deg, { correctives }) {
  const body = group.getObjectByName('body');
  const skel = group.userData.rig.skeleton;
  const up = skel.bones.find((b) => b.name.endsWith('LeftUpLeg'));
  const hipsIdx = skel.bones.findIndex((b) => b.name.endsWith('Hips'));
  const upIdx = skel.bones.indexOf(up);
  up.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(deg));
  skel.bones[0].updateMatrixWorld(true);
  skel.update();
  body.morphTargetInfluences?.fill(0);
  if (correctives) updateCorrectives(group);
  const pivot = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
  const pos = body.geometry.attributes.position;
  const si = body.geometry.attributes.skinIndex;
  const sw = body.geometry.attributes.skinWeight;
  const v = new THREE.Vector3();
  const bind = new THREE.Vector3();
  let posed = 0;
  let rest = 0;
  for (let i = 0; i < pos.count; i++) {
    let wUp = 0;
    let wHips = 0;
    for (let c = 0; c < 4; c++) {
      if (si.getComponent(i, c) === upIdx) wUp += sw.getComponent(i, c);
      if (si.getComponent(i, c) === hipsIdx) wHips += sw.getComponent(i, c);
    }
    if (wUp < 0.3 || wHips < 0.3) continue;
    bind.fromBufferAttribute(pos, i);
    v.copy(bind);
    body.getVertexPosition(i, v);
    v.applyMatrix4(body.matrixWorld);
    posed += v.distanceTo(pivot);
    rest += bind.distanceTo(new THREE.Vector3().setFromMatrixPosition(up.matrixWorld));
  }
  up.quaternion.identity();
  return posed / rest;
}

describe('body joint-volume correctives', () => {
  test('a bare body gets hip and knee targets for both legs, with drivers', () => {
    const body = buildCharacter(bare).getObjectByName('body');
    const names = body.geometry.morphAttributes.position.map((a) => a.name);
    for (const side of ['Left', 'Right']) {
      for (const n of ['HipFlex45', 'HipFlex95', 'HipFlex130', 'HipExtend', 'KneeBend70', 'KneeBend130']) expect(names).toContain(`${side}${n}`);
    }
    expect(body.userData.correctives.length).toBe(names.length);
  });

  test('deep hip flexion keeps the groin/glute blend zone at its rest distance from the joint', () => {
    const g = buildCharacter(bare);
    const lbs = blendZoneRadius(g, -100, { correctives: false });
    const fixed = blendZoneRadius(g, -100, { correctives: true });
    expect(lbs).toBeLessThan(0.97);
    expect(Math.abs(1 - fixed)).toBeLessThan(Math.abs(1 - lbs) * 0.5);
  });
});

describe('skin correctives never push through legwear', () => {
  const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));
  test.each(['base', 'woman', 'heavy'])('knee-length shorts on the %s body: no skin through the fabric in any audit pose', async (variant) => {
    const { auditLegwear, BODY_VARIANTS } = await import('../src/garment/audit.js');
    const r = auditLegwear({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[variant] }, bottom: { type: 'shorts', kind: 'cotton', fit: 0.5, length: 'shorts' }, socks: { color: '#dddddd', height: 0.16 } });
    for (const row of r.rows) expect(row.poke.ratio, `${row.clip}@${row.time}`).toBe(0);
  });
});
