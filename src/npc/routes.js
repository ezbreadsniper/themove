import { UNIT, CORRIDOR, HALL } from '../world/locations/foundry/layout.js';

/**
 * Escape routes: waypoint chains from an enclosed zone to the street, used by fleeing NPCs instead of
 * open-ground flee steering (which cannot find a door). A route applies while the NPC stands inside
 * `zone` (x/z rectangle, optional y range); the NPC joins at the first waypoint ahead of it.
 * Locations without routes fall back to steering. Add routes per location here.
 */
const mid = (a, b) => (a + b) / 2;
const loftDoorX = mid(UNIT.door.x0, UNIT.door.x1);
const corridorZ = mid(CORRIDOR.z0, CORRIDOR.z1);
const hallX = mid(HALL.x0, HALL.x1);
const street = [[hallX, 0.9], [hallX, -1.6], [hallX + 1.5, -2.6]];

export const FOUNDRY_ROUTES = [
  // Loft 1B ground floor → loft door → corridor → entry hall → street.
  { id: 'loft', zone: { x0: UNIT.x0, x1: UNIT.x1, z0: UNIT.z0, z1: UNIT.z1, y1: 2 }, path: [[loftDoorX, UNIT.door.z - 0.7], [loftDoorX, UNIT.door.z + 0.2], [loftDoorX, corridorZ], [hallX, corridorZ], [hallX, CORRIDOR.z0 - 0.6], ...street] },
  // Corridor → hall → street.
  { id: 'corridor', zone: { x0: CORRIDOR.x0, x1: CORRIDOR.x1, z0: CORRIDOR.z0, z1: CORRIDOR.z1 }, path: [[hallX, corridorZ], [hallX, CORRIDOR.z0 - 0.6], ...street] },
  // Entry hall → street.
  { id: 'hall', zone: { x0: HALL.x0, x1: HALL.x1, z0: HALL.z0, z1: HALL.z1 }, path: street },
];

export const ROUTES_BY_LOCATION = { 'foundry-st': FOUNDRY_ROUTES };

const inside = (z, p) => p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1 && (z.y1 === undefined || (p.y ?? 0) <= z.y1);

/**
 * Waypoints ({ x, z }) to follow from `pos` (null when no route covers it). Skips the first waypoint
 * when the NPC is already past it, and refuses a route whose next leg runs within
 * `avoidRadius` of the threat (then plain flee steering is safer).
 */
export function escapeRoute(routes, pos, threat = null, { avoidRadius = 1.6 } = {}) {
  const r = routes?.find((x) => inside(x.zone, pos));
  if (!r) return null;
  const pts = r.path.map(([x, z]) => ({ x, z }));
  // Routes are authored from inside the zone outwards; skip the first waypoint when already past it.
  let start = 0;
  if (pts.length > 1) {
    const [a, b] = pts;
    if ((pos.x - a.x) * (b.x - a.x) + (pos.z - a.z) * (b.z - a.z) > 0) start = 1;
  }
  const path = pts.slice(start);
  if (threat && path.length) {
    const p = path[0];
    const ex = p.x - pos.x;
    const ez = p.z - pos.z;
    const len2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((threat.x - pos.x) * ex + (threat.z - pos.z) * ez) / len2));
    if (Math.hypot(threat.x - (pos.x + ex * t), threat.z - (pos.z + ez * t)) < avoidRadius) return null;
  }
  return { id: r.id, path };
}
