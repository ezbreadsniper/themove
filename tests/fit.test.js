import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { auditLegwear, BODY_VARIANTS } from '../src/garment/audit.js';
import { draftTrousers, validatePattern } from '../src/garment/pattern.js';
import { LEG_FIT_CLASSES, legFitClass } from '../src/garment/fit-classes.js';
import { computeJointLayout } from '../src/rig/skeleton.js';
import { buildCharacter } from '../src/character/build.js';
import { meshNamed } from '../src/garment/audit.js';

const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));

/** One representative bottom per legwear fit class. */
export const LEGWEAR = {
  straight: { type: 'pants', kind: 'twill', fit: 0.45, cut: 'straight', stack: 0.3 },
  jeans: { type: 'jeans', kind: 'denim', fit: 0.55, stack: 1 },
  wide: { type: 'pants', kind: 'twill', fit: 0.9, cut: 'wide', stack: 0.4 },
  jogger: { type: 'pants', kind: 'fleece', fit: 0.6, cinch: true, stack: 0 },
  slim: { type: 'pants', kind: 'twill', fit: 0.2, cut: 'skinny' },
  ankle: { type: 'pants', kind: 'cotton', fit: 0.4, length: 'ankle' },
};

const VARIANTS = ['base', 'slim', 'heavy', 'short', 'tall', 'wideHips', 'woman', 'old'];

describe('legwear fit classes', () => {
  test.each(Object.entries(LEGWEAR))('%s resolves to its fit class', (name, bottom) => {
    expect(legFitClass({ length: 'full', ...bottom })).toBe(name === 'ankle' ? 'cropped' : name);
  });

  test.each(Object.keys(LEG_FIT_CLASSES))('%s trouser draft sews cleanly on every body', (cls) => {
    for (const v of Object.values(BODY_VARIANTS)) {
      const layout = computeJointLayout({ ...trial.body, ...v });
      const draft = draftTrousers(layout, { fitClass: cls, fit: 0.5, riseY: layout.measures.hipsY + 0.03, fabric: 'denim', stack: 1, hemY: cls === 'cropped' || cls === 'shorts' ? 0.3 : null });
      expect(validatePattern(draft), cls).toEqual([]);
      expect(draft.girths.hem).toBeGreaterThan(0.25);
    }
  });
});

describe.each(Object.entries(LEGWEAR))('%s on shoes', (name, bottom) => {
  test.each(VARIANTS)('%s body: hem rests on the shoe and never sinks into it while moving', (variant) => {
    const def = { ...trial, body: { ...trial.body, ...BODY_VARIANTS[variant] }, bottom: { length: 'full', ...bottom }, socks: { color: '#dddddd', height: 0.16 } };
    const r = auditLegwear(def);
    for (const row of r.rows) {
      expect(row.shoe.maxDepth, `${row.clip}@${row.time} depth`).toBeLessThan(0.008);
      expect(row.shoe.ratio, `${row.clip}@${row.time} ratio`).toBeLessThan(0.005);
    }
    // Full-length classes must rest on the shoe upper (wide legs may hover over the toe box a little).
    if (name !== 'ankle') expect(r.frontGap, 'front of hem floats').toBeLessThan(name === 'wide' ? 0.025 : 0.016);
    expect(r.stats.perPart.bottom, 'triangle budget').toBeLessThanOrEqual(640);
  });
});

describe('shoes are colliders, not parents', () => {
  test('only hem vertices resting on the shoe carry Foot weight, and never all of it', () => {
    const g = buildCharacter({ ...trial, bottom: { length: 'full', ...LEGWEAR.straight } });
    const mesh = meshNamed(g, 'bottom');
    const bones = g.userData.rig.skeleton.bones.map((b) => b.name);
    const feet = new Set([bones.indexOf('LeftFoot'), bones.indexOf('RightFoot')]);
    const pos = mesh.geometry.attributes.position;
    const si = mesh.geometry.attributes.skinIndex;
    const sw = mesh.geometry.attributes.skinWeight;
    let maxFoot = 0;
    for (let i = 0; i < pos.count; i++) {
      let foot = 0;
      for (let c = 0; c < 4; c++) if (feet.has(si.getComponent(i, c))) foot += sw.getComponent(i, c);
      if (pos.getY(i) > 0.26) expect(foot, `vertex ${i} at y ${pos.getY(i)}`).toBe(0);
      maxFoot = Math.max(maxFoot, foot);
    }
    expect(maxFoot).toBeGreaterThan(0.3);
    expect(maxFoot).toBeLessThanOrEqual(0.95);
    expect(Object.keys(mesh.morphTargetDictionary)).toEqual(['LeftAnkleFlexPos', 'LeftAnkleFlexNeg', 'RightAnkleFlexPos', 'RightAnkleFlexNeg']);
  });
});
