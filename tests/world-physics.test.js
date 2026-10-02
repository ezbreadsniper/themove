import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Kit } from '../src/world/kit/builder.js';
import { MaterialLibrary } from '../src/world/kit/materials.js';
import { CollisionWorld, surfaceHeight, pointInPoly } from '../src/world/physics/collision.js';
import { PLAYER } from '../src/world/units.js';
import { CharacterMotor, MOTOR } from '../src/world/physics/kcc.js';
import { DoorSystem, DOOR_PHYSICS } from '../src/world/doors.js';
import { PropSystem } from '../src/world/physics/props.js';
import { swingDoor } from '../src/world/kit/openings.js';

const lib = new MaterialLibrary();
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

function faceNormalsPointOut(mesh, center) {
  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]);
    b.fromBufferAttribute(pos, idx[i + 1]);
    c.fromBufferAttribute(pos, idx[i + 2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).divideScalar(3);
    if (n.dot(centroid.sub(center)) <= 0) return false;
  }
  return true;
}

describe('Kit primitives', () => {
  it('box faces wind outward and register collision, walkable and occluder', () => {
    const kit = new Kit(lib);
    kit.box('concreteRough', [0, 0, 0], [2, 1, 3], { collide: true, walk: true, seg: 0.5 });
    const out = kit.finish();
    const mesh = out.buckets.default.children[0];
    expect(faceNormalsPointOut(mesh, new THREE.Vector3(1, 0.5, 1.5))).toBe(true);
    expect(out.solids).toHaveLength(1);
    expect(out.walkables[0].y).toBe(1);
    expect(out.occluders).toHaveLength(1);
    expect(mesh.geometry.attributes.bake.count).toBe(mesh.geometry.attributes.position.count);
  });

  it('prism side and cap normals point out for either polygon winding', () => {
    for (const poly of [rect(0, 0, 1, 1), rect(0, 0, 1, 1).reverse()]) {
      const kit = new Kit(lib);
      kit.prism('steelBlack', poly, 0, 1);
      const mesh = kit.finish().buckets.default.children[0];
      expect(faceNormalsPointOut(mesh, new THREE.Vector3(0.5, 0.5, 0.5))).toBe(true);
    }
  });

  it('transform frames move geometry and collision together', () => {
    const kit = new Kit(lib);
    kit.at(10, 0, 5, Math.PI / 2, (k) => k.box('steelBlack', [0, 0, 0], [2, 1, 1], { collide: true }));
    const out = kit.finish();
    const xs = out.solids[0].poly.map((p) => p[0]);
    const zs = out.solids[0].poly.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(10, 5);
    expect(Math.max(...xs)).toBeCloseTo(11, 5);
    expect(Math.min(...zs)).toBeCloseTo(3, 5);
    expect(Math.max(...zs)).toBeCloseTo(5, 5);
  });

  it('projects brick UVs continuously across adjacent boxes in one frame', () => {
    const kit = new Kit(lib);
    kit.box('brick', [0, 0, 0], [1, 2, 0.3], { faces: { pz: true, nz: false, px: false, nx: false, py: false, ny: false }, seg: 10 });
    kit.box('brick', [1, 0, 0], [2, 2, 0.3], { faces: { pz: true, nz: false, px: false, nx: false, py: false, ny: false }, seg: 10 });
    const uv = kit.finish().buckets.default.children[0].geometry.attributes.uv;
    const tile = lib.tile('brick')[0];
    expect(uv.getX(1)).toBeCloseTo(1 / tile, 5);
    expect(uv.getX(4)).toBeCloseTo(1 / tile, 5);
  });
});

describe('CollisionWorld', () => {
  const floor = { poly: rect(-10, -10, 10, 10), y: 0 };

  it('pushes a capsule out of a wall and slides along it', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(1, -5, 1.2, 5), y0: 0, y1: 3 }], walkables: [floor] });
    const s = w.move({ x: 0, y: 0, z: 0, vy: 0 }, 1.0, 0.5, 1 / 30);
    expect(s.x).toBeLessThanOrEqual(1 - PLAYER.radius + 1e-3);
    expect(s.z).toBeCloseTo(0.5, 3);
  });

  it('steps up a curb but not onto a waist-high ledge', () => {
    const curb = { poly: rect(1, -5, 5, 5), y: 0.15 };
    const ledgeSolid = { poly: rect(1, -5, 5, 5), y0: 0, y1: 0.8 };
    const w1 = new CollisionWorld({ solids: [{ poly: rect(1, -5, 5, 5), y0: 0, y1: 0.15 }], walkables: [floor, curb] });
    let s = { x: 0, y: 0, z: 0, vy: 0 };
    for (let i = 0; i < 30; i++) s = w1.move(s, 0.05, 0, 1 / 30);
    expect(s.y).toBeCloseTo(0.15, 5);
    const w2 = new CollisionWorld({ solids: [ledgeSolid], walkables: [floor, { poly: rect(1, -5, 5, 5), y: 0.8 }] });
    s = { x: 0, y: 0, z: 0, vy: 0 };
    for (let i = 0; i < 30; i++) s = w2.move(s, 0.05, 0, 1 / 30);
    expect(s.y).toBe(0);
    expect(s.x).toBeLessThan(1);
  });

  it('climbs a straight flight of 0.2 m risers and falls off an open edge', () => {
    const walk = [floor];
    const solids = [];
    for (let i = 1; i <= 10; i++) {
      walk.push({ poly: rect(i * 0.28, -1, i * 0.28 + 0.28, 1), y: i * 0.2 });
      solids.push({ poly: rect(i * 0.28, -1, i * 0.28 + 0.28, 1), y0: i * 0.2 - 0.3, y1: i * 0.2 - 0.1 });
    }
    walk.push({ poly: rect(3.08, -1, 6, 1), y: 2.0 });
    const w = new CollisionWorld({ solids, walkables: walk });
    let s = { x: 0, y: 0, z: 0, vy: 0 };
    for (let i = 0; i < 120; i++) s = w.move(s, 0.04, 0, 1 / 30);
    expect(s.y).toBeCloseTo(2.0, 5);
    for (let i = 0; i < 60; i++) s = w.move(s, 0, 0.05, 1 / 30);
    expect(s.y).toBe(0);
  });

  it('helix walkable rises with angle', () => {
    const h = { poly: rect(-1, -1, 1, 1), helix: { cx: 0, cz: 0, a0: 0, dir: 1, span: Math.PI, y0: 1, dyda: 1 / Math.PI } };
    expect(surfaceHeight(h, 0.5, 0)).toBeCloseTo(1, 5);
    expect(surfaceHeight(h, 0, 0.5)).toBeCloseTo(1.5, 5);
  });

  it('raycast stops at the first wall', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(2, -5, 2.2, 5), y0: 0, y1: 3 }] });
    expect(w.raycast([0, 1, 0], [1, 0, 0], 10)).toBeCloseTo(2, 5);
    expect(w.raycast([0, 4, 0], [1, 0, 0], 10)).toBe(10);
  });
});

// --- kinematic character controller ---------------------------------------------------------------

const FLOOR = { poly: rect(-20, -20, 20, 20), y: 0 };
const DT = 1 / 30;
const run = (m, seconds, vx, vz, each) => {
  let r;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    r = m.step(DT, vx, vz);
    each?.(r, m);
  }
  return r;
};

describe('CharacterMotor (collide-and-slide KCC)', () => {
  it('slides along a wall at full tangential speed and clips the velocity into it', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(1, -10, 1.2, 10), y0: 0, y1: 3 }], walkables: [FLOOR] });
    const m = new CharacterMotor(w);
    const r = run(m, 1, 2, 1);
    expect(m.pos.x).toBeLessThanOrEqual(1 - PLAYER.radius + 1e-3);
    expect(m.pos.z).toBeCloseTo(1, 1);
    expect(r.vx).toBeCloseTo(0, 3);
    expect(r.vz).toBeCloseTo(1, 3);
    expect(w.penetration(m.pos.x, m.pos.z, m.pos.y)).toBeLessThan(1e-3);
  });

  it('never tunnels through a thin wall at sprint speed', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(1, -10, 1.05, 10), y0: 0, y1: 3 }], walkables: [FLOOR] });
    const m = new CharacterMotor(w);
    run(m, 1, 9, 0);
    expect(m.pos.x).toBeLessThan(1);
  });

  it('steps up a flight of 0.2 m risers and snaps down it without leaving the ground', () => {
    const walk = [FLOOR];
    const solids = [];
    for (let i = 1; i <= 10; i++) {
      walk.push({ poly: rect(i * 0.28, -1, i * 0.28 + 0.28, 1), y: i * 0.2 });
      solids.push({ poly: rect(i * 0.28, -1, i * 0.28 + 0.28, 1), y0: i * 0.2 - 0.3, y1: i * 0.2 - 0.1 });
    }
    walk.push({ poly: rect(3.08, -1, 6, 1), y: 2.0 });
    const w = new CollisionWorld({ solids, walkables: walk });
    const m = new CharacterMotor(w);
    let maxRise = 0;
    let last = 0;
    run(m, 3, 1.4, 0, () => {
      maxRise = Math.max(maxRise, m.pos.y - last);
      last = m.pos.y;
    });
    expect(m.pos.y).toBeCloseTo(2.0, 5);
    expect(maxRise).toBeLessThanOrEqual(PLAYER.stepUp + 1e-6);
    let airborne = 0;
    run(m, 3, -1.4, 0, (r) => { if (!r.grounded) airborne++; });
    expect(m.pos.y).toBe(0);
    expect(airborne).toBe(0);
  });

  it('refuses risers taller than stepUp and needs headroom to step', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(1, -5, 5, 5), y0: 0, y1: 0.5 }], walkables: [FLOOR, { poly: rect(1, -5, 5, 5), y: 0.5 }] });
    const m = new CharacterMotor(w);
    run(m, 1.5, 1.4, 0);
    expect(m.pos.y).toBe(0);
    expect(m.pos.x).toBeLessThan(1);
    // A curb under a low beam: the step is within reach but the head would not fit.
    const low = new CollisionWorld({ solids: [{ poly: rect(1, -5, 5, 5), y0: 0, y1: 0.15 }, { poly: rect(1, -5, 5, 5), y0: 1.8, y1: 2.2 }], walkables: [FLOOR, { poly: rect(1, -5, 5, 5), y: 0.15 }] });
    const m2 = new CharacterMotor(low);
    run(m2, 1.5, 1.4, 0);
    expect(m2.pos.y).toBe(0);
  });

  it('walks up a 30 deg ramp but not a 60 deg one, and slides down the steep one', () => {
    const ramp = (deg) => new CollisionWorld({ walkables: [FLOOR, { poly: rect(1, -2, 4, 2), y: 0, plane: { x0: 1, z0: 0, y0: 0, gx: Math.tan((deg * Math.PI) / 180), gz: 0 } }] });
    const easy = new CharacterMotor(ramp(30));
    run(easy, 2, 1.4, 0);
    expect(easy.pos.y).toBeGreaterThan(0.8);
    const steep = new CharacterMotor(ramp(60));
    run(steep, 2, 1.4, 0);
    expect(steep.pos.y).toBeLessThan(0.1);
    const slide = new CharacterMotor(ramp(60), { x: 1.5, y: Math.tan(Math.PI / 3) * 0.5, z: 0 });
    run(slide, 1.5, 0, 0);
    expect(slide.pos.x).toBeLessThan(1.2);
  });

  it('jumps to the configured height, reports the landing impact and is grounded again', () => {
    const w = new CollisionWorld({ walkables: [FLOOR] });
    const m = new CharacterMotor(w);
    m.requestJump();
    let peak = 0;
    let landed = null;
    run(m, 1.5, 0, 0, (r) => {
      peak = Math.max(peak, m.pos.y);
      if (r.landed !== null) landed = r.landed;
    });
    expect(peak).toBeGreaterThan(MOTOR.jumpHeight - 0.06);
    expect(peak).toBeLessThan(MOTOR.jumpHeight + 0.06);
    expect(landed).toBeGreaterThan(2.5);
    expect(m.grounded).toBe(true);
  });

  it('coyote time: a jump just after walking off a ledge still fires; a late one does not', () => {
    const ledge = () => new CollisionWorld({ walkables: [{ poly: rect(-5, -5, 1, 5), y: 4 }, { poly: rect(-20, -20, 20, 20), y: 0 }] });
    const offEdge = (delay) => {
      const m = new CharacterMotor(ledge(), { x: 0.6, y: 4, z: 0 });
      let since = -1;
      let jumped = false;
      run(m, 1, 2, 0, (r) => {
        if (r.left) since = 0;
        else if (since >= 0) since += DT;
        if (since >= delay && since < delay + DT / 2) m.requestJump();
        if (r.jumped) jumped = true;
      });
      return jumped;
    };
    expect(offEdge(DT * 2)).toBe(true);
    expect(offEdge(0.25)).toBe(false);
  });

  it('jump buffer: a jump pressed just before landing fires on touchdown', () => {
    const w = new CollisionWorld({ walkables: [FLOOR] });
    const m = new CharacterMotor(w, { x: 0, y: 1.5, z: 0 });
    let jumps = 0;
    let pressed = false;
    run(m, 1.2, 0, 0, (r) => {
      if (!pressed && !m.grounded && m.pos.y < 0.25 && m.vy < 0) {
        m.requestJump();
        pressed = true;
      }
      if (r.jumped) jumps++;
    });
    expect(pressed).toBe(true);
    expect(jumps).toBe(1);
  });

  it('bumps its head on a low ceiling instead of passing through it', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(-2, -2, 2, 2), y0: 2.1, y1: 2.4 }], walkables: [FLOOR] });
    const m = new CharacterMotor(w);
    m.requestJump();
    let peak = 0;
    run(m, 1, 0, 0, () => { peak = Math.max(peak, m.pos.y); });
    expect(peak).toBeLessThan(2.1 - PLAYER.height + 0.2);
    expect(m.grounded).toBe(true);
  });

  it('crouches under a low ceiling and cannot stand up until clear', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(1, -2, 3, 2), y0: 1.4, y1: 1.6 }], walkables: [FLOOR] });
    const m = new CharacterMotor(w);
    expect(m.setCrouch(true)).toBe(true);
    run(m, 1, 1.4, 0);
    expect(m.pos.x).toBeGreaterThan(1.2);
    expect(m.setCrouch(false)).toBe(true);
    run(m, 2, 1.4, 0);
    expect(m.setCrouch(false)).toBe(false);
  });
});

// --- physical doors -------------------------------------------------------------------------------

/** A doorway in a wall along z = 0 (x -3..3, opening 0..0.92) with one swing door hinged at x = 0. */
function doorRoom(data = {}) {
  const kit = new Kit(lib);
  swingDoor(kit, 'd', { hx: 0, hz: 0, y: 0, width: 0.92, height: 2.1, ...data });
  const out = kit.finish();
  const collision = new CollisionWorld({
    solids: [{ poly: rect(-3, -0.1, -0.02, 0.1), y0: 0, y1: 2.5, tag: 'wall' }, { poly: rect(0.94, -0.1, 3, 0.1), y0: 0, y1: 2.5, tag: 'wall' }],
    walkables: [FLOOR],
  });
  const doors = new DoorSystem(out.dynamics, collision);
  return { collision, doors, door: doors.get('d') };
}

/** Steps a motor + doors like the game: KCC first, then doors with the intended velocity. */
function walkDoor({ doors }, m, seconds, vx, vz, each) {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    m.step(DT, vx, vz);
    doors.update(DT, [{ id: 'p', x: m.pos.x, y: m.pos.y, z: m.pos.z, vx, vz, radius: m.radius, height: m.height, mass: 75 }]);
    each?.();
  }
}

describe('DoorSystem (hinged rigid leaves)', () => {
  it('walking into a door pushes it open by contact and the player passes through', () => {
    const room = doorRoom();
    const m = new CharacterMotor(room.collision, { x: 0.5, y: 0, z: -1.5 });
    let maxAngle = 0;
    let worstPen = 0;
    walkDoor(room, m, 3, 0, 1.4, () => {
      maxAngle = Math.max(maxAngle, Math.abs(room.door.angle));
      worstPen = Math.max(worstPen, room.collision.penetration(m.pos.x, m.pos.z, m.pos.y));
    });
    expect(maxAngle).toBeGreaterThan(1.0);
    expect(m.pos.z).toBeGreaterThan(1.2);
    expect(worstPen).toBeLessThan(0.01);
  });

  it('a faster push swings the leaf faster', () => {
    const swing = (speed) => {
      const room = doorRoom();
      const m = new CharacterMotor(room.collision, { x: 0.6, y: 0, z: -0.5 });
      walkDoor(room, m, 0.3, 0, speed);
      return Math.abs(room.door.angle);
    };
    expect(swing(3.5)).toBeGreaterThan(swing(1.0) * 1.5);
  });

  it('the push follows direction: into the leaf swings it, along the leaf does not', () => {
    const push = (vx, vz) => {
      const room = doorRoom();
      room.doors.update(DT, [{ x: 0.6, y: 0, z: -0.33, vx, vz, radius: 0.3, height: 1.8, mass: 75 }]);
      return room.door.omega;
    };
    expect(Math.abs(push(0, 1.4))).toBeGreaterThan(1);
    expect(push(1.4, 0)).toBe(0);
    expect(push(0, -1.4)).toBe(0);
    // From the other side the leaf swings the other way.
    const room = doorRoom();
    room.doors.update(DT, [{ x: 0.6, y: 0, z: 0.33, vx: 0, vz: -1.4, radius: 0.3, height: 1.8, mass: 75 }]);
    expect(Math.sign(room.door.omega)).toBe(-Math.sign(push(0, 1.4)));
  });

  it('swings back under the closer and latches once the doorway is clear', () => {
    const room = doorRoom();
    const m = new CharacterMotor(room.collision, { x: 0.5, y: 0, z: -1.5 });
    walkDoor(room, m, 2.5, 0, 1.4);
    walkDoor(room, m, 1, 0.6, 1.4);
    walkDoor(room, m, 6, 0, 0);
    expect(room.door.latched).toBe(true);
    expect(room.door.angle).toBe(0);
    expect(room.doors.isOpen(room.door)).toBe(false);
  });

  it('a closing leaf stops against a body standing in its arc and never moves it', () => {
    const room = doorRoom();
    const m = new CharacterMotor(room.collision, { x: 0.5, y: 0, z: -1.5 });
    walkDoor(room, m, 1.6, 0, 1.4);
    expect(Math.abs(room.door.angle)).toBeGreaterThan(0.8);
    // Stand still just past the doorway, inside the leaf's swing.
    m.teleport(0.75, 0, 0.5);
    const before = { ...m.pos };
    walkDoor(room, m, 5, 0, 0);
    expect(m.pos.x).toBeCloseTo(before.x, 5);
    expect(m.pos.z).toBeCloseTo(before.z, 5);
    expect(room.door.latched).toBe(false);
    const k = room.doors.contact(room.door, { x: m.pos.x, y: 0, z: m.pos.z, radius: m.radius }, room.door.angle);
    expect(k.pen).toBeLessThan(0.01);
    // Step away: the leaf finishes closing and latches.
    walkDoor(room, m, 1.5, 0, 1.4);
    walkDoor(room, m, 6, 0, 0);
    expect(room.door.latched).toBe(true);
  });

  it('pressing against a fully open leaf never shoves the player through the wall', () => {
    const room = doorRoom();
    const m = new CharacterMotor(room.collision, { x: 0.5, y: 0, z: -1.5 });
    let worst = 0;
    let worstAngle = 0;
    // Walk through, then turn and push the open leaf toward the hinge-side wall for a while.
    walkDoor(room, m, 1.6, 0, 1.4);
    walkDoor(room, m, 3, -1.4, 0.2, () => {
      worst = Math.max(worst, room.collision.penetration(m.pos.x, m.pos.z, m.pos.y));
      worstAngle = Math.max(worstAngle, Math.abs(room.door.angle));
    });
    expect(worstAngle).toBeLessThanOrEqual(DOOR_PHYSICS.limit + 1e-6);
    expect(worst).toBeLessThan(0.01);
    expect(m.pos.z).toBeGreaterThan(0);
  });

  it('a locked door does not open; it rattles and blocks', () => {
    const room = doorRoom({ locked: true });
    const m = new CharacterMotor(room.collision, { x: 0.5, y: 0, z: -1.5 });
    const types = [];
    walkDoor(room, m, 2, 0, 1.4, () => types.push(...room.doors.events.map((e) => e.type)));
    expect(room.door.angle).toBe(0);
    expect(m.pos.z).toBeLessThan(-PLAYER.radius + 0.01);
    expect(types).toContain('rattle');
    expect(room.doors.toggle('d', { x: 0.5, z: -1 })).toBe('locked');
  });

  it('E opens the door away from the user with the motor, holds it, then it closes', () => {
    const room = doorRoom();
    expect(room.doors.toggle('d', { x: 0.46, z: -1 })).toBe('open');
    for (let t = 0; t < 1.5; t += DT) room.doors.update(DT, []);
    const f = room.doors.frame(room.door, room.door.angle);
    // The free end of the leaf ends up on the far (+z) side.
    expect(room.door.hinge[1] + f.uz * 0.92).toBeGreaterThan(0.6);
    for (let t = 0; t < 12; t += DT) room.doors.update(DT, []);
    expect(room.door.latched).toBe(true);
  });

  it('the leaf collider follows the leaf at every angle', () => {
    const room = doorRoom();
    room.doors.impulse('d', -2);
    for (let i = 0; i < 6; i++) room.doors.update(DT, []);
    const a = room.door.angle;
    expect(Math.abs(a)).toBeGreaterThan(0.2);
    const s = room.door.solids[0];
    const f = room.doors.frame(room.door, a);
    expect(pointInPoly(room.door.hinge[0] + f.ux * 0.8, room.door.hinge[1] + f.uz * 0.8, s.poly)).toBe(true);
  });

  it('accepts the legacy single-actor call', () => {
    const room = doorRoom();
    room.doors.update(DT, new THREE.Vector3(0.5, 0, -1));
    expect(room.door.angle).toBe(0);
  });
});

// --- physics props --------------------------------------------------------------------------------

describe('PropSystem', () => {
  it('a crate is pushed by a walking body, slides to a stop under friction and sleeps', () => {
    const w = new CollisionWorld({ walkables: [FLOOR] });
    const props = new PropSystem(w);
    const crate = props.add({ name: 'c', shape: 'box', size: [0.5, 0.5, 0.5], mass: 12, pos: [0, 0, 1] });
    const m = new CharacterMotor(w, { x: 0, y: 0, z: -0.5 });
    for (let t = 0; t < 2; t += DT) {
      m.step(DT, 0, 1.4);
      props.update(DT, [{ id: 'p', x: m.pos.x, y: m.pos.y, z: m.pos.z, vx: 0, vz: 1.4, radius: m.radius, height: m.height, mass: 75 }]);
    }
    expect(crate.z).toBeGreaterThan(2);
    expect(m.pos.z).toBeLessThan(crate.z - 0.25 - 0.1);
    const z = crate.z;
    for (let t = 0; t < 2; t += DT) props.update(DT, []);
    expect(crate.sleeping).toBe(true);
    expect(crate.z - z).toBeLessThan(0.5);
    expect(w.penetration(m.pos.x, m.pos.z, m.pos.y)).toBeLessThan(1e-3);
  });

  it('an off-centre push spins a crate; a heavy crate moves less', () => {
    const push = (mass, x) => {
      const w = new CollisionWorld({ walkables: [FLOOR] });
      const props = new PropSystem(w);
      const p = props.add({ name: 'c', size: [0.6, 0.5, 0.6], mass, pos: [0, 0, 0.62] });
      props.update(DT, [{ x, y: 0, z: 0, vx: 0, vz: 1.4, radius: 0.3, height: 1.8, mass: 75 }]);
      return p;
    };
    expect(Math.abs(push(12, 0.25).w)).toBeGreaterThan(0.3);
    expect(push(60, 0).vz).toBeLessThan(push(12, 0).vz);
  });

  it('props stop at walls and fall onto the floor', () => {
    const w = new CollisionWorld({ solids: [{ poly: rect(-5, 2, 5, 2.2), y0: 0, y1: 3 }], walkables: [FLOOR] });
    const props = new PropSystem(w);
    const p = props.add({ name: 'c', size: [0.5, 0.5, 0.5], mass: 10, pos: [0, 1.2, 1] });
    p.vz = 4;
    for (let t = 0; t < 2; t += DT) props.update(DT, []);
    expect(p.y).toBe(0);
    expect(p.z + 0.25).toBeLessThan(2.05);
  });
});
