import { Kit } from '../../kit/builder.js';
import { createRng } from '../../../core/rng.js';
import { buildStreet } from './street.js';
import { buildExterior } from './building-exterior.js';
import { buildInterior, ZONES } from './building-interior.js';
import { dressLoft } from './loft-dressing.js';
import { HALL } from './layout.js';

/**
 * Builds the Foundry St. location cell: geometry buckets, collision source data, lights, markers.
 * Bucket names double as streaming / culling groups (see docs/world/README.md).
 */
export const FOUNDRY = { id: 'foundry-st', bounds: { minX: -26, maxX: 52, minZ: -32, maxZ: 46 }, zones: ZONES };

export function buildFoundry(lib) {
  const kit = new Kit(lib);
  const rng = createRng('foundry-st');
  buildStreet(kit, rng.fork('street'));
  buildExterior(kit, rng.fork('exterior'));
  buildInterior(kit, rng.fork('interior'));
  dressLoft(kit, rng.fork('loft'));
  kit.marker('spawn', [(HALL.door.x0 + HALL.door.x1) / 2 + 1.2, 0, -1.8], { yaw: 0 });
  kit.bucketFlags('clutter', { cullDistance: 28 });
  kit.bucketFlags('across', { cast: false });
  return kit.finish();
}
