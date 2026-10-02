import { test } from 'vitest';
import { MaterialLibrary } from '../src/world/kit/materials.js';
import { buildFoundry } from '../src/world/locations/foundry/index.js';
import { World } from '../src/world/world.js';
test('probe', () => {
  let t = performance.now();
  const data = buildFoundry(new MaterialLibrary());
  console.log('build ms', performance.now() - t, Object.keys(data.buckets), data.solids.length, data.walkables.length);
  t = performance.now();
  try { const w = new World({ rays: 4 }); console.log('world ms', performance.now() - t, w.stats()); } catch (e) { console.log('world fail', e.stack); }
});
