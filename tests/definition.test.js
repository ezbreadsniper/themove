import { describe, test, expect } from 'vitest';
import { normalizeDefinition, parseDefinition, serializeDefinition } from '../src/character/definition.js';
import { PRESETS } from '../src/character/presets/index.js';

describe('character definition', () => {
  test('every shipped preset validates without warnings', () => {
    for (const preset of PRESETS) {
      const { ok, errors } = normalizeDefinition(preset);
      expect(errors, preset.id).toEqual([]);
      expect(ok).toBe(true);
    }
  });

  test('missing fields are filled with defaults', () => {
    const { value } = normalizeDefinition({ id: 'bare' });
    expect(value.body.height).toBeCloseTo(1.78);
    expect(value.rig).toBe('mixamo-core-22');
    expect(value.accessories).toEqual([]);
    expect(value.shoes.type).toBe('canvasLow');
  });

  test('out-of-range numbers are clamped and reported', () => {
    const { value, errors } = normalizeDefinition({ body: { height: 9 } });
    expect(value.body.height).toBe(2.05);
    expect(errors.join()).toMatch(/body.height/);
  });

  test('bad colours, enums and accessories fall back safely', () => {
    const { value, errors } = normalizeDefinition({
      skin: { tone: 'javascript:alert(1)' },
      hair: { style: 'mohawk-9000' },
      accessories: [{ type: 'cap' }, { type: 'jetpack' }],
    });
    expect(value.skin.tone).toBe('#9d6a45');
    expect(value.hair.style).toBe('crop');
    expect(value.accessories.map((a) => a.type)).toEqual(['cap']);
    expect(errors.length).toBe(3);
  });

  test('null garment slots stay null, unknown fields are ignored', () => {
    const { value, errors } = normalizeDefinition({ top: null, bogus: 1 });
    expect(value.top).toBeNull();
    expect(value.bogus).toBeUndefined();
    expect(errors).toEqual(['bogus: unknown field ignored']);
  });

  test('serialize → parse round-trips exactly', () => {
    for (const preset of PRESETS) {
      const text = serializeDefinition(preset);
      const parsed = parseDefinition(text);
      expect(parsed.ok).toBe(true);
      expect(serializeDefinition(parsed.value)).toBe(text);
    }
  });

  test('invalid JSON reports a parse error instead of throwing', () => {
    const parsed = parseDefinition('{nope');
    expect(parsed.value).toBeNull();
    expect(parsed.errors[0]).toMatch(/JSON parse error/);
  });
});
