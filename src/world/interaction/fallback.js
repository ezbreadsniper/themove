/**
 * Fallback interactables for worlds built before `kit.interactable(...)` existed (contracts §2):
 * one door item per physical door, plus seats and a lamp synthesised from the Foundry St. loft's
 * known furniture so the interaction system is testable without the dressing data. Anything the
 * world already declares wins: a door item is added only for doors nobody declared, and seats /
 * lamps only when the world declares none of that kind.
 */
const F = 0.1;
const SEAT_Y = F + 0.45;

/** Loft 1B (see locations/foundry/loft-dressing.js): L-sofa, shell chair; hall bench. */
function foundrySeats() {
  const seats = [];
  // Sofa section along the window wall: origin (10.95, 0.43), seats face +Z, left arm 0.16, 5 seats.
  const w1 = (3.92 - 0.16) / 5;
  for (let i = 0; i < 5; i++) {
    seats.push({ id: `loft.sofa.a${i + 1}`, kind: 'seat', pos: [10.95 + 0.16 + (i + 0.5) * w1, SEAT_Y, 0.43 + 0.5], yaw: 0, radius: 1.3, prompt: 'Sit', data: { seatHeight: 0.45, variant: 'sofa' } });
  }
  // Return section along the east wall: origin (14.87, 1.35) facing -X, 4 seats (right arm at the far end).
  const w2 = (3.05 - 0.16) / 4;
  for (let i = 0; i < 4; i++) {
    seats.push({ id: `loft.sofa.b${i + 1}`, kind: 'seat', pos: [14.87 - 0.5, SEAT_Y, 1.35 + (i + 0.5) * w2], yaw: -Math.PI / 2, radius: 1.3, prompt: 'Sit', data: { seatHeight: 0.45, variant: 'sofa' } });
  }
  seats.push({ id: 'loft.shellChair', kind: 'seat', pos: [11.75, F + 0.47, 4.37], yaw: Math.PI, radius: 1.2, prompt: 'Sit', data: { seatHeight: 0.47, variant: 'chair' } });
  for (const [i, z] of [6.0, 6.6].entries()) {
    seats.push({ id: `hall.bench${i + 1}`, kind: 'seat', pos: [4.06, SEAT_Y, z], yaw: Math.PI / 2, radius: 1.2, prompt: 'Sit', data: { seatHeight: 0.45, variant: 'bench' } });
  }
  return seats;
}

function foundryLamps() {
  return [{ id: 'loft.floorLamp', kind: 'lamp', pos: [10.5, F + 1.2, 0.8], yaw: 0, radius: 1.4, prompt: null, data: { lights: ['floor-lamp'], on: true } }];
}

export function fallbackInteractables(world) {
  const declared = world.data?.interactables ?? [];
  const out = [...declared];
  const doorsDeclared = new Set(declared.filter((i) => i.kind === 'door').map((i) => i.data?.door));
  for (const d of world.doors?.doors ?? []) {
    if (doorsDeclared.has(d.name)) continue;
    out.push({ id: `door.${d.name}`, kind: 'door', pos: [d.centre.x, d.centre.y + 1.05, d.centre.z], yaw: d.yaw0, radius: 1.5, prompt: null, data: { door: d.name }, derived: true });
  }
  const foundry = world.location?.id === 'foundry-st';
  if (foundry && !declared.some((i) => i.kind === 'seat')) out.push(...foundrySeats().map((s) => ({ ...s, derived: true })));
  if (foundry && !declared.some((i) => i.kind === 'lamp' || i.kind === 'switch')) out.push(...foundryLamps().map((s) => ({ ...s, derived: true })));
  return out;
}
