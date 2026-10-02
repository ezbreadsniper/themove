import { describe, test, expect, vi } from 'vitest';
import { CollisionWorld } from '../src/world/physics/collision.js';
import { Perception, makeLineOfSight } from '../src/npc/perception.js';
import { Relationships, rankOf, RANKS } from '../src/npc/disposition.js';
import { NpcManager, FALLBACK_SPAWNS } from '../src/npc/manager.js';
import { EventBus, connectBus } from '../src/npc/events.js';
import { REACTION_MATRIX, REACTIONS, selectReaction, temperament } from '../src/npc/reactions.js';
import { makePersonality, ARCHETYPES } from '../src/npc/archetypes.js';
import { castNpc, WARDROBES } from '../src/npc/casting.js';
import { normalizeDefinition } from '../src/character/definition.js';
import { MAIN_PRESETS } from '../src/character/presets/index.js';
import { fleeTarget, avoidWalls, arrive } from '../src/npc/steering.js';

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const P = (x, z) => ({ x, y: 0, z });

describe('perception', () => {
  test('sight cone, peripheral band and range', () => {
    const p = new Perception({ fov: 120, sightRange: 20 });
    expect(p.sight(P(0, 0), 0, P(0, 5))).toBeGreaterThan(0.9);
    expect(p.sight(P(0, 0), 0, P(0, 25))).toBe(0);
    expect(p.sight(P(0, 0), 0, P(0, -5))).toBe(0);
    // 80° off-axis, close: peripheral, partially seen.
    const side = p.sight(P(0, 0), 0, P(Math.sin(1.4) * 3, Math.cos(1.4) * 3));
    expect(side).toBeGreaterThan(0);
    expect(side).toBeLessThan(0.6);
    // Right behind you (< 1.1 m) is felt.
    expect(p.sight(P(0, 0), 0, P(0, -0.8))).toBeGreaterThan(0);
  });

  test('crouching shrinks the distance you are seen from', () => {
    const p = new Perception({ fov: 120, sightRange: 20 });
    expect(p.sight(P(0, 0), 0, P(0, 14))).toBeGreaterThan(0);
    expect(p.sight(P(0, 0), 0, P(0, 14), { crouch: true })).toBe(0);
  });

  test('line of sight through collision solids', () => {
    const world = new CollisionWorld({ solids: [{ poly: rect(-2, 4, 2, 4.3), y0: 0, y1: 3 }] });
    const p = new Perception({ los: makeLineOfSight(world) });
    expect(p.sight(P(0, 0), 0, P(0, 8))).toBe(0);
    expect(p.sight(P(0, 0), 0, P(5, 8))).toBeGreaterThan(0);
    // Hearing through the wall is halved, not blocked.
    const open = new Perception().hear(P(0, 0), P(0, 8), 20);
    expect(p.hear(P(0, 0), P(0, 8), 20)).toBeCloseTo(open * 0.5, 5);
  });

  test('hearing radius and memory decay', () => {
    const p = new Perception();
    expect(p.sense(P(0, 0), 0, { type: 'gunshot', pos: P(30, 0) })).toBeGreaterThan(0);
    expect(p.sense(P(0, 0), 0, { type: 'gunshot', pos: P(60, 0) })).toBe(0);
    const before = p.recall('gunshot').intensity;
    p.update(20);
    expect(p.recall('gunshot').intensity).toBeLessThan(before * 0.75);
    p.update(400);
    expect(p.recall('gunshot')).toBeNull();
  });

  test('awareness rises while seen and decays when not', () => {
    const p = new Perception();
    for (let i = 0; i < 10; i++) p.updateAwareness(0.9, 0.1, P(0, 3));
    expect(p.level).toBe('aware');
    expect(p.lastSeen.z).toBe(3);
    for (let i = 0; i < 100; i++) p.updateAwareness(0, 0.1);
    expect(p.awareness).toBeLessThan(0.3);
  });
});

describe('disposition', () => {
  test('rank thresholds', () => {
    expect([-80, -40, 0, 30, 80].map(rankOf)).toEqual(RANKS);
    expect(rankOf(-60)).toBe('unfriendly');
    expect(rankOf(20)).toBe('friendly');
  });

  test('aiming at someone drops them a rank or two; heat cools back', () => {
    const changes = [];
    const r = new Relationships({ onRankChange: (id, from, to) => changes.push([id, from, to]) });
    r.register('a', { faction: 'residents' });
    r.deed('a', 'aimedAt');
    expect(r.rank('a')).toBe('unfriendly');
    expect(changes).toEqual([['a', 'neutral', 'unfriendly']]);
    for (let i = 0; i < 300; i++) r.update(1);
    expect(r.rank('a')).toBe('neutral');
    expect(r.remembers('a', 'aimedAt')).toBe(true);
  });

  test('repeat deeds are dampened; help and gifts climb to ally', () => {
    const r = new Relationships();
    r.register('b', {});
    const first = r.deed('b', 'insulted').standing;
    const second = r.deed('b', 'insulted').standing;
    expect(Math.abs(second)).toBeLessThan(Math.abs(first));
    const c = new Relationships();
    c.register('c', { base: 10 });
    c.deed('c', 'helped');
    expect(c.rank('c')).toBe('friendly');
    c.deed('c', 'helped');
    c.deed('c', 'gift');
    c.deed('c', 'helped');
    expect(c.rank('c')).toBe('ally');
  });

  test('witnessed deeds spill over to the faction', () => {
    const r = new Relationships();
    r.register('x', { faction: 'crew' });
    r.register('y', { faction: 'crew' });
    r.register('z', { faction: 'residents' });
    r.deed('x', 'shotAt');
    expect(r.score('y')).toBeLessThan(0);
    expect(r.score('z')).toBe(0);
    r.deed('z', 'shotAt', { witnessed: false });
    expect(r.factionStanding('residents')).toBe(0);
  });

  test('serialises', () => {
    const r = new Relationships();
    r.register('a', { faction: 'residents', base: 5 });
    r.deed('a', 'helped');
    const copy = new Relationships().load(JSON.parse(JSON.stringify(r.toJSON())));
    expect(copy.score('a')).toBeCloseTo(r.score('a'), 6);
    expect(copy.remembers('a', 'helped')).toBe(true);
  });
});

describe('reaction matrix', () => {
  test('every cell resolves to a known reaction for every temperament and rank', () => {
    const temps = { coward: { bravery: 0.1, aggression: 0.1 }, normal: { bravery: 0.5, aggression: 0.3 }, hothead: { bravery: 0.5, aggression: 0.8 }, tough: { bravery: 0.9, aggression: 0.9 } };
    for (const [name, t] of Object.entries(temps)) expect(temperament({ curiosity: 0.5, sociability: 0.5, ...t })).toBe(name);
    for (const type of Object.keys(REACTION_MATRIX)) {
      for (const t of Object.values(temps)) {
        for (const rank of RANKS) {
          for (const distance of [1, 6, 20]) {
            const r = selectReaction({ type, intensity: 0.8, traits: { curiosity: 0.5, sociability: 0.5, ...t }, rank, distance, repeats: 0 });
            expect(REACTIONS[r.id], `${type}/${rank}`).toBeDefined();
          }
        }
      }
    }
  });

  test('cowards cower near gunfire, tough guys confront a gun when hostile', () => {
    const coward = { bravery: 0.1, aggression: 0.1, curiosity: 0.5, sociability: 0.5 };
    const tough = { bravery: 0.9, aggression: 0.9, curiosity: 0.5, sociability: 0.5 };
    expect(selectReaction({ type: 'gunshot', intensity: 1, traits: coward, rank: 'neutral', distance: 5 }).id).toBe('cower');
    expect(selectReaction({ type: 'aimedAt', intensity: 1, traits: tough, rank: 'hostile', distance: 8 }).id).toBe('confront');
    expect(selectReaction({ type: 'aimedAt', intensity: 1, traits: { ...coward, bravery: 0.5 }, rank: 'neutral', distance: 8 }).id).toBe('handsUp');
  });
});

describe('steering', () => {
  test('arrive slows and stops; feelers bend around a wall; flee picks an open direction', () => {
    expect(arrive(P(0, 0), P(0, 10), 2).z).toBeCloseTo(2, 5);
    expect(Math.hypot(...Object.values(arrive(P(0, 0), P(0, 0.1), 2)))).toBe(0);
    const world = new CollisionWorld({ solids: [{ poly: rect(-3, 1, 3, 1.3), y0: 0, y1: 3 }] });
    const ray = world.raycast.bind(world);
    const v = avoidWalls(P(0, 0), { x: 0, z: 1.3 }, ray);
    expect(Math.abs(v.x)).toBeGreaterThan(0.3);
    const t = fleeTarget(P(0, 0), P(0, -3), ray, { distance: 10 });
    // Straight away (+Z) is walled, so the run goes sideways.
    expect(Math.abs(t.x)).toBeGreaterThan(Math.abs(t.z));
  });
});

/** Headless manager with a stand-in player at the origin facing +Z. */
function setup(defs, { player = { pos: P(0, 0), facing: 0 } } = {}) {
  const bus = new EventBus();
  const m = new NpcManager({ build: false, events: bus, player });
  const npcs = defs.map((d) => m.spawn(d));
  const run = (seconds, dt = 1 / 30) => {
    for (let t = 0; t < seconds; t += dt) m.update(dt);
  };
  return { m, bus, npcs, run, player };
}

describe('npc behaviour', () => {
  const resident = (id, z, extra = {}) => ({ id, archetype: 'resident', pos: [0, 0, z], yaw: Math.PI, traits: { bravery: 0.5, aggression: 0.2, wander: 0, sociability: 0.4 }, ...extra });

  test('idles at home, notices and greets the player up close', () => {
    const { npcs, run, m } = setup([resident('r1', 3)]);
    run(0.5);
    expect(['idle', 'greet']).toContain(npcs[0].brain.state);
    run(2);
    expect(npcs[0].brain.history.some((h) => h.to === 'greet')).toBe(true);
    expect(m.relationships.remembers('r1', 'greeted')).toBe(true);
  });

  test('drawn weapon → alert; aimed weapon → hands up; holster → calms', () => {
    const { npcs, run, bus } = setup([resident('r2', 7)]);
    run(0.3);
    bus.emit('player:draw', { weapon: 'pistol' });
    run(0.5);
    expect(npcs[0].brain.state).toBe('alert');
    bus.emit('player:aim', { target: 'r2', weapon: 'pistol', on: true });
    run(1);
    expect(npcs[0].brain.state).toBe('handsUp');
    expect(npcs[0].rank()).not.toBe('neutral');
    bus.emit('player:aim', { on: false });
    bus.emit('player:holster', {});
    run(20);
    expect(['handsUp', 'flee', 'cower']).not.toContain(npcs[0].brain.state);
  });

  test('gunfire: a coward close by cowers, a normal person further away flees', () => {
    const { npcs, run, bus } = setup([
      resident('coward', 4, { traits: { bravery: 0.05, aggression: 0.1, wander: 0 } }),
      resident('normal', 12, { pos: [12, 0, 0] }),
    ]);
    run(0.3);
    bus.emit('player:fire', { pos: P(0, 0), dir: { x: 0, y: 0, z: -1 }, weapon: 'pistol' });
    run(1);
    expect(npcs[0].brain.state).toBe('cower');
    expect(npcs[1].brain.state).toBe('flee');
    const d0 = Math.hypot(npcs[1].pos.x, npcs[1].pos.z);
    run(2);
    expect(Math.hypot(npcs[1].pos.x, npcs[1].pos.z)).toBeGreaterThan(d0 + 2);
  });

  test('tough hostile thug confronts a gun instead of surrendering', () => {
    const { npcs, run, bus, m } = setup([{ id: 'v', archetype: 'thug', pos: [0, 0, 6], yaw: Math.PI, traits: { bravery: 0.95, aggression: 0.9, wander: 0 } }]);
    m.relationships.adjust('v', { standing: -50 });
    run(0.3);
    bus.emit('player:draw', { weapon: 'pistol' });
    bus.emit('player:aim', { target: 'v', on: true });
    run(1);
    expect(['confront', 'combat']).toContain(npcs[0].brain.state);
  });

  test('panic propagates from a witness to someone who never heard the shot', () => {
    const { npcs, run, m } = setup([resident('w', 50, { pos: [50, 0, 0] }), resident('b', 58, { pos: [58, 0, 0] })], { player: { pos: P(0, 0), facing: Math.PI / 2 } });
    run(0.2);
    m.stimulate(npcs[0], { type: 'gunshotNear', pos: P(47, 0), source: 'player' }, { force: true });
    run(1.5);
    expect(npcs[1].perception.recall('panic')).not.toBeNull();
    expect(['flee', 'alert', 'cower']).toContain(npcs[1].brain.state);
  });

  test('bumping: residents complain, repeated bumps make a thug square up', () => {
    const { npcs, run, bus, m } = setup([resident('r', 2), { id: 't', archetype: 'thug', pos: [3, 0, 0], yaw: -Math.PI / 2, traits: { bravery: 0.9, aggression: 0.8, wander: 0 } }]);
    const barks = [];
    bus.on('npc:bark', (p) => barks.push(p));
    run(0.2);
    bus.emit('player:collide', { who: 'r' });
    run(0.2);
    expect(barks.some((b) => b.npc === 'r' && b.concept === 'bumped')).toBe(true);
    for (let i = 0; i < 3; i++) {
      bus.emit('player:collide', { who: 't' });
      run(1.5);
    }
    expect(m.relationships.deedCount('t', 'bumped')).toBe(3);
    expect(['confront', 'combat']).toContain(npcs[1].brain.state);
  });

  test('a threat interrupts a conversation', () => {
    const { npcs, run, bus } = setup([resident('d', 2)]);
    const events = [];
    bus.on('npc:interrupt', (p) => events.push(p));
    npcs[0].inDialogue = true;
    run(0.3);
    expect(npcs[0].brain.state).toBe('converse');
    bus.emit('player:fire', { pos: P(0, 0), dir: { x: 1, y: 0, z: 0 } });
    run(0.5);
    expect(events).toHaveLength(1);
    expect(npcs[0].inDialogue).toBe(false);
    expect(npcs[0].brain.state).not.toBe('converse');
  });

  test('two sociable idle NPCs pair up and chat', () => {
    const { npcs, run } = setup([
      resident('a', 20, { pos: [20, 0, 0], traits: { sociability: 0.9, wander: 0 } }),
      resident('b', 20, { pos: [21.5, 0, 0], traits: { sociability: 0.9, wander: 0 } }),
    ]);
    run(8);
    expect(npcs[0].partner).toBe(npcs[1]);
    expect(npcs[0].brain.state).toBe('social');
  });

  test('LOD: far NPCs think far less often', () => {
    const { npcs, run } = setup([resident('near', 5), resident('far', 60, { pos: [60, 0, 0] })]);
    const near = vi.spyOn(npcs[0].brain, 'update');
    const far = vi.spyOn(npcs[1].brain, 'update');
    run(3);
    expect(near.mock.calls.length).toBeGreaterThan(far.mock.calls.length * 5);
    expect(npcs[1].lod.tier).toBe('far');
  });

  test('talk requests start dialogue or bark a refusal', () => {
    const { npcs, bus, m } = setup([resident('d', 2), { id: 'p', archetype: 'pedestrian', pos: [2, 0, 0] }]);
    const talk = [];
    const barks = [];
    bus.on('npc:talk', (p) => talk.push(p));
    bus.on('npc:bark', (p) => barks.push(p));
    bus.emit('player:interact', { id: 'npc:d' });
    bus.emit('player:interact', { id: 'npc:p' });
    expect(talk).toEqual([{ npc: 'd', tree: 'neighbour' }]);
    expect(barks.some((b) => b.npc === 'p' && b.concept === 'noTalk')).toBe(true);
    expect(m.interactables().map((i) => i.id)).toEqual(['npc:d', 'npc:p']);
    expect(npcs[0].body().radius).toBeGreaterThan(0);
  });
});

describe('spawning and plumbing', () => {
  test('spawnFromMarkers uses npc_* markers, else the fallback cast', () => {
    const m = new NpcManager({ build: false });
    const got = m.spawnFromMarkers({ spawn: { name: 'spawn', pos: [0, 0, 0] }, npc_hall_1: { name: 'npc_hall_1', pos: [1, 0, 2], yaw: 1, role: 'thug', scenario: 'lean' } });
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe('hall_1');
    expect(got[0].personality.archetype).toBe('thug');
    expect(got[0].home.scenario).toBe('lean');
    const m2 = new NpcManager({ build: false });
    expect(m2.spawnFromMarkers({})).toHaveLength(FALLBACK_SPAWNS.length);
  });

  test('personalities are deterministic per id', () => {
    expect(makePersonality('resident', { id: 'q' })).toEqual(makePersonality('resident', { id: 'q' }));
    expect(makePersonality('resident', { id: 'q' }).traits).not.toEqual(makePersonality('resident', { id: 'r' }).traits);
    for (const a of Object.keys(ARCHETYPES)) expect(WARDROBES[a]).toBeDefined();
  });

  test('casting never uses a main character and yields valid, varied definitions', () => {
    const mains = new Set(MAIN_PRESETS.map((p) => p.id));
    const seen = new Set();
    for (const archetype of Object.keys(ARCHETYPES)) {
      for (let i = 0; i < 12; i++) {
        const def = castNpc({ id: `${archetype}${i}`, archetype });
        expect(mains.has(def.id)).toBe(false);
        expect(normalizeDefinition(def).errors).toEqual([]);
        seen.add(`${def.skin.tone}/${def.hair.style}/${def.top?.color}`);
      }
    }
    expect(seen.size).toBeGreaterThan(30);
    expect(castNpc({ id: 'x', look: 'sheet-07-puffer-balaclava' }).id).toBe('sheet-07-puffer-balaclava');
    // A main character requested as a look is refused (procedural variant instead).
    expect(castNpc({ id: 'x', look: MAIN_PRESETS[0].id }).id).toBe('npc-x');
    for (const s of FALLBACK_SPAWNS) expect(mains.has(s.look)).toBe(false);
    expect(castNpc({ id: 'same', archetype: 'thug' })).toEqual(castNpc({ id: 'same', archetype: 'thug' }));
  });

  test('a cast NPC builds, bakes its clips and animates off the A-pose', () => {
    const m = new NpcManager({});
    const npc = m.spawn({ id: 'built', archetype: 'resident', pos: [0, 0, 0] });
    expect(npc.clips.npc_idle_weight).toBeDefined();
    const arm = npc.character.userData.rig.bones.find((b) => b.name.endsWith('LeftArm'));
    for (let i = 0; i < 20; i++) m.update(1 / 30);
    expect(npc.brain.state).not.toBeNull();
    // Idles hold the arms down by the sides: far from the rest A-pose.
    expect(2 * Math.acos(Math.min(1, Math.abs(arm.quaternion.w)))).toBeGreaterThan(0.2);
  });

  test('connectBus adapts on/emit buses and EventTargets', () => {
    const got = [];
    const target = new EventTarget();
    const bus = connectBus(target);
    const off = bus.on('player:fire', (p) => got.push(p));
    bus.emit('player:fire', { weapon: 'smg' });
    off();
    bus.emit('player:fire', { weapon: 'rifle' });
    expect(got).toEqual([{ weapon: 'smg' }]);
    const host = { fns: {}, on(t, f) { (this.fns[t] ??= []).push(f); }, emit(t, p) { (this.fns[t] ?? []).forEach((f) => f(p)); }, off(t, f) { this.fns[t] = this.fns[t].filter((x) => x !== f); } };
    const wrapped = connectBus(host);
    const off2 = wrapped.on('x', (p) => got.push(p));
    host.emit('x', 1);
    off2();
    host.emit('x', 2);
    expect(got.at(-1)).toBe(1);
  });
});
