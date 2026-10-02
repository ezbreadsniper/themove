import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { NpcManager } from '../src/npc/manager.js';
import { EventBus } from '../src/npc/events.js';
import { rayCapsule, hitVolumes, MAX_HEALTH } from '../src/npc/combat.js';
import { escapeRoute, FOUNDRY_ROUTES } from '../src/npc/routes.js';
import { MAIN_PRESETS } from '../src/character/presets/index.js';

const P = (x, z) => ({ x, y: 0, z });

function setup(defs = [], { player = { pos: P(0, 0), facing: 0 }, ...opts } = {}) {
  const bus = new EventBus();
  const events = [];
  bus.on('*', (p, type) => events.push([type, p]));
  const m = new NpcManager({ build: false, events: bus, player, activities: null, ...opts });
  const npcs = defs.map((d) => m.spawn(d));
  const run = (seconds, dt = 1 / 30) => {
    for (let t = 0; t < seconds; t += dt) m.update(dt);
  };
  return { m, bus, npcs, run, events };
}

/** A sofa-like seat item (contract §2) at (x, z) facing +Z with an exit spot in front. */
const seat = (id, x, z) => ({ id, kind: 'seat', pos: [x, 0.45, z], yaw: 0, data: { seatHeight: 0.45, variant: 'sofa', exit: [x, 0, z + 0.65] } });

describe('hit volumes and ray tests', () => {
  test('ray vs capsule and sphere', () => {
    const o = new THREE.Vector3(0, 1, -5);
    const d = new THREE.Vector3(0, 0, 1);
    expect(rayCapsule(o, d, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2, 0), 0.2)).toBeCloseTo(4.8, 3);
    expect(rayCapsule(o, d, new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0.5, 2, 0), 0.2)).toBeNull();
    expect(rayCapsule(o, d, new THREE.Vector3(0, 1, 0), null, 0.3)).toBeCloseTo(4.7, 3);
  });

  test('hitTest finds the part the ray crosses, nearest NPC first', () => {
    const { m, npcs } = setup([{ id: 'a', pos: [0, 0, 5], yaw: Math.PI }, { id: 'b', pos: [0, 0, 8], yaw: Math.PI }]);
    const head = m.hitTest([0, 1.67, 0], [0, 0, 1], 50);
    expect(head).toMatchObject({ part: 'head' });
    expect(head.npc).toBe(npcs[0]);
    expect(head.distance).toBeGreaterThan(4.6);
    expect(head.distance).toBeLessThan(5);
    expect(m.hitTest([0, 1.2, 0], [0, 0, 1], 50).part).toBe('torso');
    // Facing the shooter, the NPC's left arm is on world −X.
    const arm = m.hitTest([-0.24, 1.15, 0], [0, 0, 1], 50);
    expect(arm).toMatchObject({ part: 'arm', side: 'Left' });
    expect(m.hitTest([0.11, 0.5, 0], [0, 0, 1], 50)).toMatchObject({ part: 'leg', side: 'Right' });
    expect(m.hitTest([0, 2.4, 0], [0, 0, 1], 50)).toBeNull();
    expect(m.hitTest([0, 1.2, 0], [0, 0, 1], 3)).toBeNull();
    expect(hitVolumes(npcs[0]).length).toBe(10);
  });
});

describe('damage, death and witnesses', () => {
  test('five body hits kill, the head counts double; events and bookkeeping follow', () => {
    const { m, npcs, events, run } = setup([{ id: 'v', archetype: 'resident', pos: [0, 0, 6], yaw: Math.PI }]);
    run(0.2);
    for (let i = 0; i < MAX_HEALTH - 1; i++) expect(m.damage(npcs[0], { part: 'torso' }).killed).toBe(false);
    expect(npcs[0].wound.part).toBe('torso');
    expect(m.damage(npcs[0], { part: 'torso' }).killed).toBe(true);
    expect(npcs[0].dead).toBe(true);
    expect(m.damage(npcs[0], { part: 'torso' }).killed).toBe(false);
    expect(events.filter(([t]) => t === 'npc:hit')).toHaveLength(MAX_HEALTH);
    expect(events.filter(([t]) => t === 'npc:death')).toHaveLength(1);
    expect(m.bodies()).toHaveLength(0);
    expect(m.interactables()).toHaveLength(0);
    run(2);
    expect(npcs[0].pos.z).toBe(6);
    const h = setup([{ id: 'h', pos: [0, 0, 6] }]);
    h.m.damage('h', { part: 'head' });
    h.m.damage('h', { part: 'head' });
    expect(h.npcs[0].dead).toBe(false);
    h.m.damage('h', { part: 'head' });
    expect(h.npcs[0].dead).toBe(true);
  });

  test('a wounded NPC flees or fights; a witness panics and the panic event fires', () => {
    const { m, npcs, run, events } = setup([
      { id: 'victim', archetype: 'resident', pos: [0, 0, 6], yaw: Math.PI, traits: { bravery: 0.4, aggression: 0.2, wander: 0 } },
      { id: 'witness', archetype: 'pedestrian', pos: [3, 0, 7], yaw: -Math.PI / 2, traits: { bravery: 0.4, aggression: 0.2, wander: 0 } },
    ]);
    run(0.3);
    m.damage(npcs[0], { part: 'arm', point: { x: -0.2, y: 1.2, z: 6 }, dir: { x: 0, y: 0, z: 1 } });
    run(1.5);
    expect(npcs[0].brain.state).toBe('flee');
    expect(['flee', 'cower']).toContain(npcs[1].brain.state);
    expect(events.some(([t, p]) => t === 'npc:panic' && p.npc === 'witness')).toBe(true);
    expect(events.some(([t, p]) => t === 'npc:bark' && p.concept === 'hurt')).toBe(true);
  });

  test('friends of the dead grieve or avenge; strangers flee', () => {
    const { m, npcs, run } = setup([
      { id: 'dead', archetype: 'resident', pos: [0, 0, 6], yaw: Math.PI },
      { id: 'pal', archetype: 'resident', pos: [2, 0, 6], yaw: -Math.PI / 2, traits: { bravery: 0.2, aggression: 0.1, wander: 0 } },
      { id: 'brother', archetype: 'thug', pos: [-2, 0, 6], yaw: Math.PI / 2, traits: { bravery: 0.95, aggression: 0.9, wander: 0 } },
      { id: 'stranger', archetype: 'pedestrian', pos: [3, 0, 9], yaw: -Math.PI / 2, traits: { bravery: 0.4, aggression: 0.2, wander: 0 } },
    ]);
    npcs[2].friends.add('dead');
    const reacts = [];
    m.events.on('npc:react', (p) => reacts.push(p));
    run(0.3);
    m.damage(npcs[0], { part: 'head', amount: 5 });
    run(1.2);
    const by = (id) => reacts.filter((r) => r.npc === id && r.stimulus === 'death').map((r) => r.reaction);
    expect(by('pal')).toContain('grief');
    expect(by('brother')).toContain('avenge');
    expect(by('stranger')).toContain('flee');
    expect(['combat', 'confront']).toContain(npcs[2].brain.state);
  });
});

describe('loft cast', () => {
  test('spawnCast seats the main characters on free seats; a gunshot gets them up and running for the door', () => {
    const seats = [seat('loft.sofa.a2', 11.5, 0.9), seat('loft.sofa.a4', 12.9, 0.9)];
    const { m, run, bus } = setup([], { player: { pos: P(12.2, 6), facing: Math.PI }, routes: FOUNDRY_ROUTES });
    m.seatItems = () => seats;
    const cast = m.spawnCast(MAIN_PRESETS.slice(0, 2).map((p) => ({ presetId: p.id })));
    expect(cast.map((n) => n.id)).toEqual(MAIN_PRESETS.slice(0, 2).map((p) => p.id));
    expect(cast.every((n) => n.seat)).toBe(true);
    expect(cast[0].friends.has(cast[1].id)).toBe(true);
    expect(cast[0].personality.archetype).toBe('friend');
    expect(m.claims.get('loft.sofa.a2')).toBe(cast[0].id);
    run(2);
    expect(cast.every((n) => n.seat && n.speed === 0)).toBe(true);
    bus.emit('player:fire', { pos: { x: 12.2, y: 1.4, z: 6 }, dir: { x: 1, y: 0, z: 0 }, weapon: 'pistol' });
    run(0.5);
    expect(cast.every((n) => !n.seat)).toBe(true);
    run(4);
    // Heading for the loft door (x ≈ 11.75, z ≈ 11.4) rather than into the window wall.
    for (const n of cast) {
      if (n.brain.state !== 'flee') continue;
      expect(n.pos.z).toBeGreaterThan(1.6);
    }
    expect(cast.some((n) => n.brain.state === 'flee' || n.brain.state === 'cower')).toBe(true);
  });

  test('a seated NPC who is shot is knocked off the seat; killed seated, the body ends off the seat', () => {
    const { m } = setup([], { player: { pos: P(12, 5), facing: Math.PI } });
    m.seatItems = () => [seat('s1', 12, 1), seat('s2', 13, 1)];
    const [a, b] = m.spawnCast([{ presetId: MAIN_PRESETS[0].id }, { presetId: MAIN_PRESETS[1].id }]);
    m.damage(a, { part: 'torso' });
    expect(a.seat).toBeNull();
    expect(a.transition).toBeTruthy();
    m.damage(b, { part: 'head', amount: 5 });
    expect(b.dead).toBe(true);
    expect(b.seat).toBeNull();
    expect(b.pos.z).toBeGreaterThan(1.06 + 0.2);
    expect(m.claims.has('s2')).toBe(false);
  });

  test('escape routes start at the loft door and avoid a threat standing on the way', () => {
    const r = escapeRoute(FOUNDRY_ROUTES, { x: 12, y: 0.1, z: 3 });
    expect(r.id).toBe('loft');
    expect(r.path[0].z).toBeGreaterThan(10);
    expect(Math.abs(r.path[0].x - 11.75)).toBeLessThan(0.1);
    expect(escapeRoute(FOUNDRY_ROUTES, { x: 12, y: 0.1, z: 3 }, { x: 11.9, z: 7 })).toBeNull();
    expect(escapeRoute(FOUNDRY_ROUTES, { x: 30, y: 0, z: -5 })).toBeNull();
  });
});

describe('activities (contract §7)', () => {
  test('calm NPCs run registry activities; a threat interrupts and exits them', () => {
    const enter = vi.fn();
    const exit = vi.fn();
    const update = vi.fn(() => 'continue');
    const activities = { ACTIVITIES: { listen: {} }, pickActivity: () => ({ activity: { id: 'listen', enter, update, exit, interruptible: true }, slot: { pos: [0, 0, 0] } }) };
    const { npcs, run, bus } = setup([{ id: 'c', archetype: 'friend', pos: [0, 0, 6], yaw: Math.PI, traits: { bravery: 0.4, wander: 0 } }], { activities });
    run(1.5);
    expect(npcs[0].brain.state).toBe('activity');
    expect(enter).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalled();
    bus.emit('player:fire', { pos: { x: 0, y: 1.4, z: 0 }, dir: { x: 1, y: 0, z: 0 } });
    run(0.5);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(['flee', 'cower', 'alert']).toContain(npcs[0].brain.state);
  });
});

describe('a built NPC dies onto the floor', () => {
  test('after the death clip the hips rest near the ground and stay', () => {
    const m = new NpcManager({ activities: null });
    const npc = m.spawn({ id: 'body', archetype: 'resident', pos: [0, 0, 0] });
    for (let i = 0; i < 10; i++) m.update(1 / 30);
    m.damage(npc, { part: 'torso', amount: 5, dir: { x: 0, y: 0, z: -1 } });
    for (let i = 0; i < 90; i++) m.update(1 / 30);
    const hips = npc.character.userData.rig.bones.find((b) => b.name.endsWith('Hips'));
    const head = npc.character.userData.rig.bones.find((b) => b.name.endsWith('Head'));
    npc.character.updateMatrixWorld(true);
    const hy = hips.getWorldPosition(new THREE.Vector3()).y;
    const y1 = head.getWorldPosition(new THREE.Vector3()).y;
    expect(hy).toBeLessThan(0.32);
    expect(y1).toBeLessThan(0.4);
    expect(y1).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) m.update(1 / 30);
    npc.character.updateMatrixWorld(true);
    expect(Math.abs(head.getWorldPosition(new THREE.Vector3()).y - y1)).toBeLessThan(0.02);
  });
});
