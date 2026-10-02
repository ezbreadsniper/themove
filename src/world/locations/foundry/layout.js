/**
 * Foundry St. location: one street segment and the loft warehouse on it.
 * Every dimension other modules and tests rely on lives here (metres, Y up).
 *
 * Plan (top view, +X east, +Z north into the building):
 *   -16.2..-13  south sidewalk, railing and hedge
 *   -13..-3.2   Foundry St. roadway (road surface y = -0.15)
 *   -3.2..0     north sidewalk (y = 0)
 *   0..13.8     warehouse, x 3.4..25.3 (half the original 30 x 20 block): entry hall | empty 1A |
 *               the loft (1B) | empty 1C | empty 1D,
 *               with a cement corridor along the back joining the hall to every apartment door
 *   x 30..33.2  Mill Ave. sidewalk, 33.2..43 Mill Ave. roadway
 */
export const GROUND = Object.freeze({ sidewalk: 0, road: -0.15, floor: 0.1 });

export const STREET = Object.freeze({
  x0: -26, x1: 52,
  sidewalkN: [-3.2, 0], road: [-13, -3.2], sidewalkS: [-16.2, -13],
  centerZ: -8.1, parkingN: -5.4, parkingS: -10.8,
  mill: { x: [33.2, 43], sidewalkW: [30, 33.2], sidewalkE: [43, 46.2], z1: 44 },
  lotZ1: 44,
});

export const BUILDING = Object.freeze({
  x0: 3.4, x1: 25.3, z0: 0, z1: 13.8,
  wall: 0.4, roofTop: 7.3, deckUnderside: 6.9, parapetTop: 8.35,
});

/** Entry hall from the street door straight back to the corridor. */
export const HALL = Object.freeze({ x0: 3.8, x1: 5.4, z0: 0.4, z1: 11.6, ceiling: 3.1, door: { x0: 4.14, x1: 5.06 } });

export const CORRIDOR = Object.freeze({ x0: 3.8, x1: 24.9, z0: 11.6, z1: 13.4, ceiling: 3.1, exit: { z0: 12.04, z1: 12.96 } });

/** The featured loft (1B): double-height living room, mezzanine, kitchen, bath. */
export const UNIT = Object.freeze({
  x0: 10.1, x1: 14.9, z0: 0.4, z1: 11.4, floor: GROUND.floor, ceiling: 6.9,
  window: { x0: 10.45, x1: 14.55, y0: 2.1, y1: 6.3, transomY: 4.75 },
  mezz: { z0: 7.45, top: 3.1, thick: 0.25 },
  stair: { cx: 11.4, cz: 6.5, r: 0.95, pole: 0.065, treads: 13, sweep: (270 * Math.PI) / 180 },
  door: { x0: 11.29, x1: 12.21, z: 11.4 },
  bath: { x0: 12.9, z0: 8.9 },
});

/** Empty neighbour apartments (enterable shells for now). */
export const EMPTY_UNITS = Object.freeze([
  { id: '1A', x0: 5.6, x1: 9.9, door: 7.2, window: { x0: 5.95, x1: 9.55 } },
  { id: '1C', x0: 15.1, x1: 19.9, door: 16.3, window: { x0: 15.45, x1: 19.55 } },
  { id: '1D', x0: 20.1, x1: 24.9, door: 21.3, window: { x0: 20.45, x1: 24.55 } },
]);
