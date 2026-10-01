import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { buildCharacter, createContext } from '../src/character/build.js';
import { PRESETS } from '../src/character/presets/index.js';
import { buildTop } from '../src/geo/parts/garments.js';
import { bakeClip } from '../src/anim/clips.js';
import { skinnedPositions, meshByName } from './helpers.js';

/** Body/age extremes every character must survive. */
const VARIANTS = {
  thin: { build: 0, muscle: 0.1 },
  heavy: { build: 1, muscle: 0.5 },
  short: { height: 1.56 },
  tall: { height: 2.0 },
  young: { age: 15 },
  old: { age: 76 },
  muscular: { muscle: 1, build: 0.6 },
};

const variant = (preset, body) => ({ ...preset, body: { ...preset.body, ...body } });

function poseAt(group, clip, time) {
  const mixer = new THREE.AnimationMixer(group);
  mixer.clipAction(bakeClip(group.userData.layout, clip)).play();
  mixer.setTime(time);
  group.updateMatrixWorld(true);
}

function minY(mesh) {
  const p = skinnedPositions(mesh);
  let m = Infinity;
  for (let i = 1; i < p.length; i += 3) m = Math.min(m, p[i]);
  return m;
}

/** Fraction of trouser vertices (above the shirt hem) that stick out through the shirt. */
function trouserPokeThrough(preset, group) {
  const ctx = createContext(preset);
  if (!ctx.def.top || !ctx.def.bottom) return 0;
  const top = buildTop(ctx.layout, ctx.def.top, { overPants: ctx.def.bottom.fit ?? 0.7 });
  const bottom = meshByName(group, 'bottom');
  const pos = bottom.geometry.attributes.position;
  let checked = 0;
  let out = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < top.hemY + 0.01) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const cz0 = top.surface(y, 0).cz;
    const { r, cz } = top.surface(y, Math.atan2(x, z - cz0));
    checked += 1;
    if (Math.hypot(x, z - cz) > r + 0.002) out += 1;
  }
  return checked ? out / checked : 0;
}

describe.each(PRESETS.map((p) => [p.id, p]))('%s variants', (id, preset) => {
  test.each(Object.entries(VARIANTS))('%s builds within budget and stays grounded', (name, body) => {
    const def = variant(preset, body);
    const group = buildCharacter(def);
    const s = group.userData.stats;
    expect(s.triangles).toBeLessThanOrEqual(9000);
    expect(group.userData.errors).toEqual([]);
    const feet = meshByName(group, 'shoes') ?? meshByName(group, 'body');
    for (const [clip, t] of [['idle', 1], ['crouch', 1.2]]) {
      poseAt(group, clip, t);
      const floor = minY(feet);
      expect(floor, `${name} ${clip}`).toBeGreaterThan(-0.03);
      expect(floor, `${name} ${clip}`).toBeLessThan(0.035);
    }
    expect(trouserPokeThrough(def, group), `${name} trousers through shirt`).toBeLessThan(0.01);
  });
});

describe('age keeps identity', () => {
  test('aging changes skin texture and hair colour but never the garments or skeleton topology', () => {
    const young = buildCharacter(variant(PRESETS[3], { age: 25 }));
    const old = buildCharacter(variant(PRESETS[3], { age: 72 }));
    expect(young.userData.rig.bones.map((b) => b.name)).toEqual(old.userData.rig.bones.map((b) => b.name));
    const names = (g) => { const n = []; g.traverse((o) => { if (o.isMesh) n.push(o.name); }); return n.sort(); };
    expect(names(young)).toEqual(names(old));
    expect(old.userData.definition.body.age).toBe(72);
    expect(old.userData.definition.hair.color).toBe(PRESETS[3].hair.color);
  });
});
