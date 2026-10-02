import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { DialogueRunner, makeContext, evalCondition, applyEffects } from '../src/dialogue/graph.js';
import { getTree, validateTree, BUILTIN_TREES, registerTree } from '../src/dialogue/loader.js';
import { BarkSystem } from '../src/dialogue/barks.js';
import BARK_RULES from '../src/dialogue/data/barks.json';
import { frameShot, frameClearShot, composeShot, scoreShot, sideOf, DialogueCamera, SHOT_KINDS } from '../src/dialogue/camera.js';
import { CollisionWorld } from '../src/world/physics/collision.js';
import { DialogueDirector, pickShot } from '../src/dialogue/director.js';
import { Relationships } from '../src/npc/disposition.js';
import { createRng } from '../src/core/rng.js';

function conversation(treeId, { npcVars = {}, globals = {}, rel = new Relationships(), base = 0, stats = {}, check = null, effects = [] } = {}) {
  rel.register('n', { base, faction: 'residents' });
  const ctx = makeContext({ vars: { npc: npcVars, global: globals }, relationships: rel, npcId: 'n', stat: (s) => stats[s] ?? 0, check, effect: (e) => effects.push(e) });
  return { runner: new DialogueRunner(getTree(treeId), ctx, { resolveTree: getTree }), rel, npcVars, globals, effects };
}

describe('dialogue trees', () => {
  test.each(BUILTIN_TREES.map((t) => t.id))('%s validates with no errors or unreachable nodes', (id) => {
    const { errors, warnings } = validateTree(getTree(id));
    expect(errors).toEqual([]);
    expect(warnings.filter((w) => w.includes('unreachable'))).toEqual([]);
  });

  test('validation catches dangling links, bad types and empty choices', () => {
    const bad = { id: 'bad', start: 'a', nodes: { a: { type: 'line', text: 'x', next: 'nope' }, b: { type: 'choice', options: [] }, c: { type: 'wat' } } };
    const { errors } = validateTree(bad);
    expect(errors.some((e) => e.includes('missing node "nope"'))).toBe(true);
    expect(errors.some((e) => e.includes('choice without options'))).toBe(true);
    expect(errors.some((e) => e.includes('unknown type'))).toBe(true);
    expect(() => registerTree(bad)).toThrow();
  });
});

describe('dialogue runner', () => {
  test('first meeting: lines, choice, effects, relationship gating, once options', () => {
    const { runner, rel, npcVars } = conversation('neighbour');
    const s0 = runner.start();
    expect(s0.kind).toBe('line');
    expect(s0.node).toBe('first');
    const c = runner.advance();
    expect(c.kind).toBe('choice');
    expect(npcVars.met).toBe(true);
    expect(c.options.map((o) => o.tone)).toEqual(['friendly', 'neutral', 'rude', 'curious']);
    expect(c.options[3].check).toMatchObject({ skill: 'persuade', dc: 10 });
    const before = rel.score('n');
    const warm = runner.choose(0);
    expect(warm.node).toBe('warm');
    expect(rel.score('n')).toBeGreaterThan(before);
    const hub = runner.advance();
    expect(hub.kind).toBe('choice');
    const favour = hub.options.find((o) => o.text.startsWith('Could you water'));
    expect(favour.locked).toBe(true);
    expect(favour.reason).toBe('Needs: Friendly');
    expect(hub.options.some((o) => o.text.startsWith('About that crew'))).toBe(false);
    expect(runner.choose(favour.index)).toBe(hub);
    // Once-only option disappears after use.
    const building = hub.options.find((o) => o.text.startsWith("What's this"));
    runner.choose(building.index);
    runner.advance();
    const hub2 = runner.advance();
    expect(hub2.options.some((o) => o.text.startsWith("What's this"))).toBe(false);
    const bye = hub2.options.find((o) => o.text === 'See you around.');
    runner.choose(bye.index);
    expect(runner.advance()).toMatchObject({ kind: 'end', outcome: 'friendly' });
    expect(runner.history.filter((h) => h.kind === 'choice')).toHaveLength(3);
  });

  test('second meeting branches on memory and rank; friendship unlocks the favour', () => {
    const rel = new Relationships();
    const { runner } = conversation('neighbour', { npcVars: { met: true }, rel, base: 30 });
    const s = runner.start();
    expect(s.node).toBe('again_warm');
    const hub = runner.advance();
    expect(hub.options.find((o) => o.text.startsWith('Could you water')).locked).toBe(false);
    const cold = conversation('neighbour', { npcVars: { met: true }, base: -40 }).runner.start();
    expect(cold.node).toBe('again_cold');
    const hostile = conversation('neighbour', { base: -80 }).runner.start();
    expect(hostile.node).toBe('hostile_brush');
  });

  test('skill checks route to success or failure', () => {
    const ok = conversation('neighbour', { check: () => true });
    ok.runner.start();
    ok.runner.advance();
    expect(ok.runner.choose(3).node).toBe('gossip_tip');
    expect(ok.globals.tip_crew).toBe(true);
    const bad = conversation('neighbour', { check: () => false });
    bad.runner.start();
    bad.runner.advance();
    expect(bad.runner.choose(3).node).toBe('gossip_fail');
    expect(bad.runner.history.find((h) => h.kind === 'check')).toMatchObject({ skill: 'persuade', success: false });
    // Deterministic default roll: same seed, same outcome.
    const roll = (seed) => makeContext({ seed, stat: () => 2 }).check('persuade', 12);
    expect(roll('a')).toBe(roll('a'));
  });

  test('clerk: cash gates purchases, purchases spend it and hand items to the game', () => {
    const { runner, globals, effects } = conversation('clerk', { globals: { cash: 5 } });
    runner.start();
    const menu = runner.advance();
    const smokes = menu.options.find((o) => o.text.startsWith('Pack of smokes'));
    const coffee = menu.options.find((o) => o.text.startsWith('Coffee'));
    expect(smokes.locked).toBe(true);
    expect(smokes.reason).toBe('Needs $8');
    expect(coffee.locked).toBe(false);
    runner.choose(coffee.index);
    expect(globals.cash).toBe(3);
    expect(effects).toContainEqual({ give: 'coffee' });
  });

  test('thug: rank-locked question, insult ends hostile with a combat intent', () => {
    const { runner, rel, effects } = conversation('thug', { base: -25 });
    runner.start();
    const s = runner.advance();
    expect(s.options.find((o) => o.text === 'Who runs this corner?').locked).toBe(true);
    const insult = s.options.find((o) => o.tone === 'rude');
    runner.choose(insult.index);
    expect(rel.rank('n')).toMatch(/unfriendly|hostile/);
    expect(effects).toContainEqual({ intent: 'combat' });
    expect(runner.advance()).toMatchObject({ kind: 'end', outcome: 'hostile' });
  });

  test('conditions compose', () => {
    const rel = new Relationships();
    rel.register('n', { base: 25 });
    rel.deed('n', 'insulted');
    const ctx = makeContext({ vars: { npc: { met: true, n: 3 }, global: { cash: 10 } }, relationships: rel, npcId: 'n', stat: (s) => ({ charm: 4 })[s] ?? 0 });
    expect(evalCondition({ var: 'npc.met' }, ctx)).toBe(true);
    expect(evalCondition({ var: 'global.cash', gte: 10 }, ctx)).toBe(true);
    expect(evalCondition({ all: [{ var: 'npc.n', gt: 2 }, { not: { var: 'npc.missing' } }] }, ctx)).toBe(true);
    expect(evalCondition({ any: [{ var: 'npc.n', lt: 0 }, { stat: 'charm', gte: 4 }] }, ctx)).toBe(true);
    expect(evalCondition({ rank: 'neutral' }, ctx)).toBe(true);
    expect(evalCondition({ rankBelow: 'neutral' }, ctx)).toBe(false);
    expect(evalCondition({ deed: 'insulted' }, ctx)).toBe(true);
    expect(evalCondition({ disposition: { gt: 100 } }, ctx)).toBe(false);
    expect(() => evalCondition({ bogus: 1 }, ctx)).toThrow();
    applyEffects([{ add: { 'npc.n': 2 } }, { set: { flag: 'x' } }], ctx);
    expect(ctx.vars.npc.n).toBe(5);
    expect(ctx.vars.local.flag).toBe('x');
  });

  test('jump across trees and the logic-loop guard', () => {
    const a = registerTree({ id: 't_a', start: 's', nodes: { s: { type: 'jump', tree: 't_b', node: 'x' } } });
    registerTree({ id: 't_b', start: 'x', nodes: { x: { type: 'line', speaker: 'npc', text: 'from b, {npc.name}', next: 'e' }, e: { type: 'end' } } });
    const r = new DialogueRunner(a, makeContext({ names: { 'npc.name': 'Dana' } }), { resolveTree: getTree });
    expect(r.start().text).toBe('from b, Dana');
    const loop = { id: 'loop', start: 'a', nodes: { a: { type: 'action', effects: [], next: 'b' }, b: { type: 'jump', next: 'a' } } };
    expect(() => new DialogueRunner(loop).start()).toThrow(/loop/);
  });
});

describe('barks', () => {
  test('most specific rule wins, generic is the fallback', () => {
    const b = new BarkSystem(BARK_RULES, { seed: 't' });
    expect(b.query('greet', { archetype: 'resident', rank: 'friendly', npc: { met: true } }).rule).toBe('greet_resident_friendly');
    expect(b.query('greet', { archetype: 'pedestrian', rank: 'neutral' }).rule).toBe('greet_generic');
    expect(b.query('confront', { cause: 'aimedAt', temperament: 'tough' }).rule).toBe('confront_gun');
    expect(b.query('nothing-at-all', {})).toBeNull();
  });

  test('cooldowns, once, speaker gap, remember and line cycling', () => {
    const rules = [
      { id: 'a', concept: 'c', lines: ['1', '2', '3'], cooldown: 5 },
      { id: 'b', concept: 'c', lines: ['fallback'], criteria: {} },
      { id: 'o', concept: 'once', lines: ['only once'], once: true, remember: { 'npc.said': true } },
    ];
    const b = new BarkSystem(rules, { seed: 'x', speakerGap: 2 });
    const first = b.query('c', {});
    expect(['a', 'b']).toContain(first.rule);
    const mem = { npc: {} };
    expect(b.query('once', {}, { speaker: 's', memory: mem }).text).toBe('only once');
    expect(mem.npc.said).toBe(true);
    expect(b.query('once', {}, { speaker: 's2' })).not.toBeNull();
    b.update(10);
    expect(b.query('once', {}, { speaker: 's' })).toBeNull();
    expect(b.query('c', {}, { speaker: 's' })).not.toBeNull();
    expect(b.query('c', {}, { speaker: 's' })).toBeNull();
    // Lines of one rule cycle without immediate repeats.
    const solo = new BarkSystem([{ id: 'r', concept: 'k', lines: ['x', 'y', 'z'] }]);
    const seq = [solo.query('k').text, solo.query('k').text, solo.query('k').text];
    expect(new Set(seq).size).toBe(3);
  });
});

describe('dialogue camera', () => {
  const rng = createRng('cam');
  const head = () => new THREE.Vector3(rng.range(-10, 10), rng.range(1.4, 1.8), rng.range(-10, 10));

  test('every shot stays on the chosen side of the line of action (180° rule)', () => {
    for (let i = 0; i < 200; i++) {
      const a = head();
      const b = head().add(new THREE.Vector3(0.5, 0, 0.5));
      for (const side of [1, -1]) {
        for (const kind of SHOT_KINDS) {
          for (const speaker of ['a', 'b']) {
            const shot = frameShot(kind, { a, b, speaker, side });
            expect(sideOf(shot.pos, a, b), `${kind}/${speaker}`).toBe(side);
            expect(sideOf(shot.target, a, b)).toBeGreaterThanOrEqual(side === 1 ? 0 : -1);
          }
        }
      }
    }
  });

  test('shot / reverse shot keeps screen direction: A always looks one way on screen, B the other', () => {
    const a = new THREE.Vector3(0, 1.6, 0);
    const b = new THREE.Vector3(0.4, 1.6, 1.4);
    const cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 50);
    const inFront = (p) => p.clone().applyMatrix4(cam.matrixWorldInverse).z < -0.1;
    const gaze = (x, y) => Math.sign(x.clone().lerp(y, 0.2).project(cam).x - x.clone().project(cam).x);
    for (const side of [1, -1]) {
      const seen = { a: new Set(), b: new Set() };
      for (const kind of SHOT_KINDS) {
        for (const speaker of ['a', 'b']) {
          const s = frameShot(kind, { a, b, speaker, side });
          cam.position.copy(s.pos);
          cam.lookAt(s.target);
          cam.updateMatrixWorld(true);
          if (inFront(a)) seen.a.add(gaze(a, b));
          if (inFront(b)) seen.b.add(gaze(b, a));
        }
      }
      expect(seen.a.size).toBe(1);
      expect(seen.b.size).toBe(1);
      expect([...seen.a][0]).toBe(-[...seen.b][0]);
    }
  });

  test('the conversation picks the gameplay camera side, and cuts never switch it', () => {
    const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
    const a = new THREE.Vector3(0, 1.6, 0);
    const b = new THREE.Vector3(0, 1.6, 1.5);
    cam.position.set(-3, 2, -1);
    const dc = new DialogueCamera(cam);
    dc.begin(a, b);
    expect(dc.side).toBe(sideOf(cam.position, a, b));
    const side = dc.side;
    for (const [k, s] of [['two', 'b'], ['ots', 'b'], ['ots', 'a'], ['close', 'b'], ['medium', 'a']]) {
      dc.cut(k, s);
      for (let i = 0; i < 40; i++) dc.update(1 / 30);
      expect(sideOf(cam.position, a, b)).toBe(side);
    }
    // Looking at the speaker.
    dc.cut('close', 'b');
    for (let i = 0; i < 10; i++) dc.update(1 / 30);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(fwd.dot(b.clone().sub(cam.position).normalize())).toBeGreaterThan(0.98);
    expect(dc.cuts.every((c) => c.side === side)).toBe(true);
  });

  test('a wall behind the NPC swaps the blocked reverse angle for a clear shot on the same side', () => {
    // NPC with its back to a wall (z = 2.0); the player stands in front of it.
    const wall = new CollisionWorld({ solids: [{ poly: [[-6, 2.0], [6, 2.0], [6, 2.4], [-6, 2.4]], y0: 0, y1: 4 }] });
    const ray = wall.raycast.bind(wall);
    const a = new THREE.Vector3(0, 1.6, 0);
    const b = new THREE.Vector3(0, 1.6, 1.5);
    for (const side of [1, -1]) {
      const blocked = frameShot('ots', { a, b, speaker: 'a', side });
      expect(blocked.pos.z).toBeGreaterThan(2.0);
      const s = frameClearShot('ots', { a, b, speaker: 'a', side }, ray);
      expect(s.clear).toBeGreaterThanOrEqual(0.7);
      expect(s.pos.z).toBeLessThan(2.0);
      expect(sideOf(s.pos, a, b)).toBe(side);
    }
  });

  test('a bystander standing in the two-shot pushes the camera to another framing', () => {
    const a = new THREE.Vector3(0, 1.6, 0);
    const b = new THREE.Vector3(0, 1.6, 1.5);
    const two = frameShot('two', { a, b, side: 1 });
    const mid = two.pos.clone().lerp(two.target, 0.4);
    const by = [{ x: mid.x, y: 0, z: mid.z }];
    expect(scoreShot(two, { a, b, bystanders: by }).issues).toContain('bystander blocks a speaker');
    const s = composeShot('two', { a, b, side: 1 }, { bystanders: by });
    expect(s.issues.filter((i) => i.includes('blocks'))).toEqual([]);
    expect(s.orbit !== 0 || s.scale !== 1 || s.kind !== 'two').toBe(true);
    expect(sideOf(s.pos, a, b)).toBe(1);
  });

  test('a clean two-shot keeps both speakers in frame at any separation and aspect', () => {
    for (const sep of [0.9, 1.5, 2.6]) {
      for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
        const a = new THREE.Vector3(0, 1.6, 0);
        const b = new THREE.Vector3(0.3, 1.7, sep);
        const s = composeShot('two', { a, b, side: -1, aspect });
        expect(s.kind).toBe('two');
        expect(s.issues).toEqual([]);
      }
    }
  });

  test('shot choice follows hints, opening and emotion', () => {
    expect(pickShot({ kind: 'line', speaker: 'npc', emotion: 'neutral', shot: 'auto' }, 0)).toEqual({ kind: 'two', speaker: 'b' });
    expect(pickShot({ kind: 'line', speaker: 'npc', emotion: 'angry', shot: 'auto' }, 3)).toEqual({ kind: 'close', speaker: 'b' });
    expect(pickShot({ kind: 'line', speaker: 'player', emotion: 'neutral', shot: 'auto' }, 3)).toEqual({ kind: 'ots', speaker: 'a' });
    expect(pickShot({ kind: 'line', speaker: 'npc', shot: 'medium' }, 3)).toEqual({ kind: 'medium', speaker: 'b' });
  });
});

describe('dialogue director (headless)', () => {
  function fakeNpc() {
    const cues = [];
    return {
      id: 'n1', name: 'Dana', pos: { x: 0, y: 0, z: 1.5 }, memory: { vars: {} }, drives: { fear: 0, anger: 0 }, personality: { dialogue: 'neighbour' },
      headPos: () => ({ x: 0, y: 1.6, z: 1.5 }), cue: (c) => cues.push(c), cues, stop() {}, releaseGesture() {}, inDialogue: false,
    };
  }

  test('plays a conversation to the end, cueing the NPC and returning the camera', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
    camera.position.set(-2, 2, -2);
    const rel = new Relationships();
    const events = [];
    const director = new DialogueDirector({ camera, hud: false, input: null, relationships: rel, player: { pos: { x: 0, y: 0, z: 0 } }, events: { emit: (t, p) => events.push([t, p]) } });
    const npc = fakeNpc();
    rel.register('n1', { faction: 'residents' });
    expect(director.start(npc, 'neighbour')).toBe(true);
    expect(npc.inDialogue).toBe(true);
    expect(director.start(npc, 'neighbour')).toBe(false);
    for (let i = 0; i < 300 && director.step.kind !== 'choice'; i++) director.update(1 / 30);
    expect(director.step.kind).toBe('choice');
    expect(npc.cues[0]).toMatchObject({ speaking: true });
    director.handleKey('Digit1');
    expect(director.step).toMatchObject({ kind: 'line', speaker: 'player' });
    for (let i = 0; i < 600 && director.step?.kind !== 'choice'; i++) director.update(1 / 30);
    const bye = director.step.options.findIndex((o) => o.text === 'See you around.');
    director.choose(bye);
    for (let i = 0; i < 600 && director.runner; i++) director.update(1 / 30);
    expect(director.runner).toBeNull();
    expect(npc.inDialogue).toBe(false);
    expect(events.map((e) => e[0])).toContain('dialogue:end');
    expect(director.lastOutcome.outcome).toBe('friendly');
    expect(rel.score('n1')).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) director.update(1 / 30);
    expect(director.active).toBe(false);
  });

  test('locked options cannot be chosen; Escape leaves', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
    const director = new DialogueDirector({ camera, hud: false, input: null, globals: { cash: 0 }, player: { pos: { x: 0, y: 0, z: 0 } } });
    const npc = { ...fakeNpc(), personality: { dialogue: 'clerk' } };
    director.start(npc, 'clerk');
    for (let i = 0; i < 300 && director.step.kind !== 'choice'; i++) director.update(1 / 30);
    const locked = director.step.options.findIndex((o) => o.locked);
    expect(locked).toBeGreaterThanOrEqual(0);
    expect(director.choose(locked)).toBe(false);
    director.handleKey('Escape');
    expect(director.runner).toBeNull();
    expect(director.lastOutcome.reason).toBe('leave');
  });
});
