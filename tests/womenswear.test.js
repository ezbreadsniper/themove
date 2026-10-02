import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCharacter } from '../src/character/build.js';
import { auditLegwear, BODY_VARIANTS } from '../src/garment/audit.js';

const sheet06 = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json', 'utf8'));
const trial = JSON.parse(readFileSync('src/character/presets/trial-default.json', 'utf8'));

const DRESSES = {
  slip: { bodice: 'cami', skirtStyle: 'aLine', skirtLength: 0.5 },
  sundress: { bodice: 'tank', skirtStyle: 'flared', skirtLength: 0.55, pattern: 'floral', accent: '#d0423e' },
  bodycon: { bodice: 'tube', skirtStyle: 'pencil', skirtLength: 0.35, fabric: 'jersey' },
  tee: { bodice: 'tee', sleeve: 'short', skirtStyle: 'pencil', skirtLength: 0.4 },
  gingham: { bodice: 'tank', skirtStyle: 'pleated', skirtLength: 0.5, pattern: 'gingham' },
};

describe('dresses', () => {
  test.each(Object.entries(DRESSES))('%s dress builds as bodice + skirt with no midriff skin band', (name, dress) => {
    const g = buildCharacter({ ...sheet06, dress });
    expect(g.userData.errors).toEqual([]);
    const top = g.getObjectByName('top');
    const bottom = g.getObjectByName('bottom');
    expect(top && bottom).toBeTruthy();
    expect(bottom.geometry.morphAttributes.position?.length ?? 0).toBeGreaterThan(0);
    const topMinY = top.geometry.boundingBox.min.y;
    const skirtMaxY = bottom.geometry.boundingBox.max.y;
    expect(skirtMaxY).toBeGreaterThan(topMinY);
  });
});

describe('new tops and leggings', () => {
  test.each(['sweater', 'buttonUp'])('%s builds with sleeves', (type) => {
    const g = buildCharacter({ ...sheet06, top: { type, sleeve: 'long', color: '#c8b49a' } });
    expect(g.userData.errors).toEqual([]);
    expect(g.getObjectByName('top')).toBeTruthy();
  });

  test.each(['base', 'woman', 'heavy'])('leggings on the %s body: no skin through in any audit pose', (variant) => {
    const r = auditLegwear({ ...trial, body: { ...trial.body, ...BODY_VARIANTS[variant] }, bottom: { type: 'leggings', length: 'full', color: '#18181b', kind: 'jersey' }, socks: { color: '#dddddd', height: 0.16 } });
    for (const row of r.rows) expect(row.poke.ratio, `${row.clip}@${row.time}`).toBe(0);
  });
});
