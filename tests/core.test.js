import { describe, test, expect } from 'vitest';
import { createRng, hashString } from '../src/core/rng.js';
import { Raster } from '../src/tex/raster.js';

describe('rng', () => {
  test('same seed produces the same sequence', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-a');
    expect(Array.from({ length: 50 }, a.next)).toEqual(Array.from({ length: 50 }, b.next));
  });

  test('different seeds diverge and values stay in [0, 1)', () => {
    const a = Array.from({ length: 200 }, createRng('x').next);
    const b = Array.from({ length: 200 }, createRng('y').next);
    expect(a).not.toEqual(b);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  test('fork is deterministic and independent of later parent draws', () => {
    const p1 = createRng(7);
    const f1 = p1.fork('hair');
    const p2 = createRng(7);
    const f2 = p2.fork('hair');
    p2.next();
    expect(f1.next()).toBe(f2.next());
    expect(hashString('abc')).toBe(hashString('abc'));
  });
});

describe('raster', () => {
  test('drawing is byte-identical across runs and wraps horizontally', () => {
    const draw = () => {
      const r = new Raster(16, 16).fill('#102030');
      r.ellipse(15, 8, 3, 3, '#ff0000');
      r.line(0, 0, 15, 15, [0, 255, 0], 1.5);
      r.grain(createRng(1), 0.1);
      return r.data;
    };
    expect(draw()).toEqual(draw());
    const r = new Raster(16, 16).fill('#000000');
    r.plot(17, 3, '#ffffff');
    expect(r.get(1, 3)[0]).toBe(255);
  });
});
