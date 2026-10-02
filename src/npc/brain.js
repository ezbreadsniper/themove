import { rankIndex } from './disposition.js';
import { STIMULI } from './stimuli.js';
import { fleeTarget } from './steering.js';

/**
 * Behaviour layer: a two-level hierarchical state machine whose transitions are chosen by utility.
 *
 *   groups (priority)   dialogue 5 > threat 4 > alert 3 > social 2 > ambient 1
 *   states              each scores 0..1 from the NPC's drives, traits, relationship and senses
 *
 * Every think tick all states score; the current state gets an inertia bonus (and a large one while
 * inside its minimum time), so behaviour commits instead of flickering. A state from a higher-priority
 * group may interrupt a committed state when it scores above INTERRUPT; lower groups must wait.
 * The reaction matrix leaves an `intent` (a state id, e.g. 'handsUp') that adds a decaying bonus to
 * that state whenever it is viable (score > 0), so the immediate reaction carries into the sustained
 * behaviour without hard-wiring transitions.
 *
 * A state: { group, minTime, score(npc, env), enter(npc, env), update(npc, dt, env), exit(npc, env) }.
 * Add states by passing an extended table to `new Brain(npc, { ...STATES, mine: {...} })`.
 */
export const GROUPS = { dialogue: 5, threat: 4, alert: 3, social: 2, ambient: 1 };
export const INERTIA = 0.12;
export const COMMIT = 0.6;
export const INTERRUPT = 0.35;

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nearPlayer = (env, m) => env.player && env.player.dist < m;
const threatPos = (npc, env) => npc.threat?.pos ?? npc.perception.strongest(0.3)?.pos ?? env.player?.pos ?? null;

export const STATES = {
  idle: {
    group: 'ambient',
    minTime: 1,
    score: () => 0.15,
    enter(npc) {
      npc.boredom = 0;
      npc.idleSwap = 4 + npc.rng.next() * 6;
      if (dist2(npc.pos, npc.home) > 1.2) npc.moveTo(npc.home, 'walk');
      npc.setRest(npc.scenarioClip() ?? npc.pickIdle());
    },
    update(npc, dt, env) {
      npc.boredom += dt * (0.5 + npc.traits.wander);
      if (!npc.moving && dist2(npc.pos, npc.home) < 1.4 && npc.home.yaw !== undefined && !npc.lookTarget) npc.faceYaw(npc.home.yaw);
      npc.idleSwap -= dt;
      if (npc.idleSwap <= 0 && !npc.home.scenario) {
        npc.idleSwap = 6 + npc.rng.next() * 8;
        npc.setRest(npc.pickIdle());
      }
      if (nearPlayer(env, 6) && env.player.visible) npc.look(env.player.head, 1);
    },
  },
  wander: {
    group: 'ambient',
    minTime: 3,
    score: (npc) => (npc.home.scenario ? 0 : npc.traits.wander * Math.min(1, npc.boredom / 14) * 0.45),
    enter(npc, env) {
      npc.setRest(null);
      npc.wanderWait = 0;
      const p = npc.randomPointNear(npc.home, 6, env);
      if (p) npc.moveTo(p, 'walk');
    },
    update(npc, dt) {
      if (npc.moving) return;
      npc.wanderWait += dt;
      if (npc.wanderWait > 2.5) npc.boredom = 0;
    },
  },
  social: {
    group: 'social',
    minTime: 6,
    score: (npc) => (npc.partner ? 0.18 + npc.traits.sociability * 0.25 : 0),
    enter(npc) {
      npc.chatTimer = 0;
      npc.talking = npc.id < npc.partner.id;
      npc.setRest(npc.talking ? npc.pickIdle() : 'npc_listen');
    },
    update(npc, dt, env) {
      const p = npc.partner;
      if (!p) return;
      npc.faceToward(p.pos);
      npc.look(p.headPos(), 1);
      npc.chatTimer -= dt;
      if (npc.chatTimer <= 0) {
        npc.chatTimer = 3.5 + npc.rng.next() * 2;
        npc.talking = !npc.talking;
        if (npc.talking) {
          npc.gesture(npc.rng.pick(npc.personality.talk));
          if (nearPlayer(env, 14)) npc.bark('chat');
        } else {
          npc.releaseGesture();
          npc.setRest('npc_listen');
          if (nearPlayer(env, 14) && npc.rng.chance(0.4)) npc.bark('chatReply');
        }
      }
    },
    exit(npc) {
      npc.releaseGesture();
    },
  },
  greet: {
    group: 'social',
    minTime: 2.2,
    score: (npc, env) => (env.player?.visible && nearPlayer(env, 5) ? npc.drives.social * 0.9 : 0),
    enter(npc, env) {
      npc.stop();
      npc.faceToward(env.player.pos);
      npc.look(env.player.head, 3);
      const rank = rankIndex(npc.rank());
      if (rank >= 3) npc.gesture('npc_greet_wave', { once: true });
      else if (rank >= 2) npc.gesture('npc_greet_nod', { once: true });
      npc.bark('greet', {}, { force: true });
      npc.memory.greetedAt = env.time;
      npc.manager?.relationships.deed(npc.id, 'greeted', { witnessed: false });
    },
    update(npc, dt) {
      npc.drives.social = Math.max(0, npc.drives.social - dt * 0.6);
    },
  },
  converse: {
    group: 'dialogue',
    minTime: 0,
    score: (npc) => (npc.inDialogue ? 10 : 0),
    enter(npc, env) {
      npc.stop();
      npc.setRest('npc_listen');
      if (env.player) npc.faceToward(env.player.pos);
    },
    update(npc, dt, env) {
      if (env.player) {
        npc.faceToward(env.player.pos);
        npc.look(env.player.head, 1);
      }
    },
    exit(npc) {
      npc.releaseGesture();
    },
  },
  alert: {
    group: 'alert',
    minTime: 1.5,
    score: (npc) => (npc.perception.strongest(0) ? npc.drives.alarm * 0.75 : npc.drives.alarm * 0.3),
    enter(npc) {
      npc.stop();
      npc.setRest('npc_idle_weight');
    },
    update(npc, dt, env) {
      const m = npc.perception.strongest(0);
      if (m) npc.look({ x: m.pos.x, y: (m.pos.y ?? 0) + 1.4, z: m.pos.z }, 1);
      if (m && npc.lookAt?.wantsTurn) npc.faceToward(m.pos);
      if (!m && env.player?.visible) npc.look(env.player.head, 1);
    },
  },
  investigate: {
    group: 'alert',
    minTime: 3,
    score: (npc) => {
      const m = npc.perception.strongest(0);
      if (!m || npc.drives.fear > 0.35) return 0;
      const far = dist2(m.pos, npc.pos) > 2.5 ? 1 : 0.3;
      return npc.drives.interest * (0.3 + npc.traits.curiosity) * 0.75 * far;
    },
    enter(npc) {
      const m = npc.perception.strongest(0);
      npc.searchTime = 0;
      npc.setRest('lookAround');
      if (m) npc.moveTo(m.pos, 'walk', { stop: 1.4 });
      npc.bark('investigate');
    },
    update(npc, dt) {
      if (npc.moving) return;
      npc.searchTime += dt;
      if (npc.searchTime > 3.5) {
        npc.drives.interest = 0;
        npc.drives.alarm *= 0.5;
        npc.bark('giveUp');
      }
    },
  },
  cower: {
    group: 'threat',
    minTime: 3,
    score: (npc) => npc.drives.fear * (1.05 - npc.traits.bravery * 0.6) * 0.75,
    enter(npc) {
      npc.stop();
      npc.setRest('npc_fear_cower');
      npc.look(null);
    },
    update(npc, dt, env) {
      const t = threatPos(npc, env);
      if (t) npc.faceToward(t, 3);
    },
  },
  handsUp: {
    group: 'threat',
    minTime: 2.5,
    score: (npc, env) => npc.drives.fear * npc.drives.surrender * (env.player?.aimingAt === npc.id ? 1 : 0.55),
    enter(npc, env) {
      npc.stop();
      npc.setRest('npc_handsUp');
      if (env.player) npc.faceToward(env.player.pos);
    },
    update(npc, dt, env) {
      if (!env.player) return;
      npc.faceToward(env.player.pos, 3);
      npc.look(env.player.head, 1);
      if (env.player.aimingAt === npc.id) npc.drives.surrender = 1;
    },
  },
  flee: {
    group: 'threat',
    minTime: 3,
    score: (npc, env) => (threatPos(npc, env) ? npc.drives.fear * 0.85 : 0),
    enter(npc, env) {
      npc.setRest(null);
      npc.replan = 0;
      npc.fleeing = true;
      STATES.flee.plan(npc, env);
    },
    plan(npc, env) {
      const t = threatPos(npc, env);
      if (!t) return;
      const target = fleeTarget(npc.pos, t, npc.raycast, { distance: 16 });
      npc.moveTo(target, npc.drives.fear > 0.7 ? 'sprint' : 'run', { stop: 0.6 });
      npc.replan = 2.5;
    },
    update(npc, dt, env) {
      npc.replan -= dt;
      const t = threatPos(npc, env);
      const far = t && dist2(t, npc.pos) > 24;
      if (far) npc.drives.fear = Math.max(0, npc.drives.fear - dt * 0.25);
      if ((!npc.moving || npc.stuck || npc.replan <= 0) && !far) STATES.flee.plan(npc, env);
      if (far && !npc.moving) npc.setRest('npc_idle_weight');
    },
    exit(npc) {
      npc.fleeing = false;
      npc.stop();
    },
  },
  confront: {
    group: 'threat',
    minTime: 4,
    score: (npc, env) => (nearPlayer(env, 14) ? npc.drives.anger * (0.35 + npc.traits.bravery * 0.6) : 0),
    enter(npc) {
      npc.confrontTimer = 0;
      npc.setRest('npc_confront');
    },
    update(npc, dt, env) {
      if (!env.player) return;
      npc.look(env.player.head, 1);
      if (env.player.dist > 2.2) npc.moveTo(env.player.pos, 'walk', { stop: 1.7 });
      else {
        npc.stop();
        npc.faceToward(env.player.pos);
      }
      npc.confrontTimer -= dt;
      if (npc.confrontTimer <= 0) {
        npc.confrontTimer = 4 + npc.rng.next() * 2;
        npc.gesture('npc_anger_point', { once: false, duration: 2.4 });
        npc.bark('confront', { cause: npc.threat?.type });
      }
    },
    exit(npc) {
      npc.releaseGesture();
    },
  },
  /** Stub: closes to arm's length and swings (plays `melee_jab` when A provides it, else `angry`). */
  combat: {
    group: 'threat',
    minTime: 4,
    score: (npc, env) => (npc.drives.anger > 0.75 && npc.traits.aggression > 0.55 && (rankIndex(npc.rank()) === 0 || npc.intent?.id === 'combat') && nearPlayer(env, 20) ? npc.drives.anger : 0),
    enter(npc) {
      npc.attackTimer = 0.6;
      npc.setRest('npc_confront');
      npc.bark('fight', {}, { force: true });
    },
    update(npc, dt, env) {
      if (!env.player) return;
      npc.look(env.player.head, 1);
      if (env.player.dist > 1.3) npc.moveTo(env.player.pos, 'run', { stop: 1.0 });
      else {
        npc.stop();
        npc.faceToward(env.player.pos);
        npc.attackTimer -= dt;
        if (npc.attackTimer <= 0) {
          npc.attackTimer = 1.6;
          npc.gesture(npc.hasClip('melee_jab') ? 'melee_jab' : 'angry', { once: true });
          npc.manager?.events.emit('npc:attack', { npc: npc.id, target: 'player', pos: { ...npc.pos } });
        }
      }
    },
  },
};

export class Brain {
  constructor(npc, states = STATES) {
    this.npc = npc;
    this.states = states;
    this.current = null;
    this.time = 0;
    this.scores = {};
    this.history = [];
  }

  get state() {
    return this.current;
  }

  /** Scores every state; returns the id to run. */
  choose(env) {
    const npc = this.npc;
    const cur = this.current ? this.states[this.current] : null;
    const committed = cur && this.time < (cur.minTime ?? 0);
    let best = null;
    let bestScore = -Infinity;
    for (const [id, s] of Object.entries(this.states)) {
      let raw = s.score(npc, env) ?? 0;
      if (raw > 0) raw += npc.intentBonus?.(id) ?? 0;
      this.scores[id] = raw;
      if (raw <= 0 && id !== 'idle') continue;
      let v = raw;
      if (id === this.current) v += INERTIA + (committed ? COMMIT : 0);
      else if (committed) {
        // Inside the current state's minimum time only a higher-priority group may interrupt, and it
        // then competes as if the commitment bonus were its own.
        const up = GROUPS[s.group] > GROUPS[cur.group];
        if (!(up && raw > INTERRUPT)) continue;
        v += COMMIT;
      }
      if (v > bestScore) {
        bestScore = v;
        best = id;
      }
    }
    return best ?? 'idle';
  }

  set(id, env) {
    if (id === this.current) return;
    const prev = this.current;
    if (prev) this.states[prev].exit?.(this.npc, env);
    this.current = id;
    this.time = 0;
    this.history.push({ from: prev, to: id, time: this.npc.clock ?? 0 });
    if (this.history.length > 32) this.history.shift();
    this.states[id].enter?.(this.npc, env);
    this.npc.onStateChange?.(prev, id);
  }

  /** Think: re-evaluate (when `decide`), then run the current state. */
  update(dt, env, { decide = true } = {}) {
    this.time += dt;
    if (decide || !this.current) this.set(this.choose(env), env);
    this.states[this.current].update?.(this.npc, dt, env);
  }
}

/** Threat level an NPC currently feels from memory (0..1), for UI / debugging. */
export function threatLevel(npc) {
  const m = npc.perception.strongest(0.3);
  return m ? Math.min(1, m.intensity * STIMULI[m.type].threat) : 0;
}
