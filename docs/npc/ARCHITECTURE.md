# NPC & dialogue architecture

Workstream B: `src/npc/**`, `src/dialogue/**`, `src/anim/social-clips.js`. See `research.md` for
where each technique comes from. The test harness is `npc.html` (`src/app/npc-demo.js`). Evidence
shots come from `node scripts/npc-shots.mjs`, which writes to `docs/npc/evidence/`.

```
 game bus (player:fire / aim / draw / holster / sprint / crouch / interact / collide / melee)
      │                          ctx.player { pos, facing, weapon, aiming, sprint, crouch }
      ▼                                       │
 NpcManager ── stimuli ──► Perception ──► reaction matrix ──► drives + intent + deed + bark + one-shot
   │  (LOD, panic,            (sight cone,       (stimulus × temperament        │
   │   pairing, barks,         LOS, hearing,       × rank)                      ▼
   │   relationships)          awareness)                         Brain: utility-scored HFSM
   │                                                                (dialogue > threat > alert
   ▼                                                                 > social > ambient)
 Npc ── steering (arrive / flee / feelers / separation → CollisionWorld.move)
     ── Animator (base loop by speed / rest pose, upper gestures, full one-shots) + LookAt
     ── cue() from DialogueDirector (talk / listen / emotion)

 DialogueDirector ── DialogueRunner (JSON graph, vars, conditions, effects, checks)
                  ── DialogueCamera (180° rule shots, blend in/out, drift, wall/bystander fallback)
                  ── DialogueHud (letterbox, subtitles, choices, timer, log, barks)
```

## Wiring into the game (C's `world-play.js`)

```js
import { NpcManager } from './npc/manager.js';
import { DialogueDirector } from './dialogue/director.js';

const dialogue = new DialogueDirector({ camera, scene, hud: hudContainer, player: playerRoot, events: game.events,
  globals: game.flags /* { cash, ... } */, stats: { persuade: 2, intimidate: 1 }, collision: world.collision });
const npcs = new NpcManager({ world, scene, player: playerRoot, events: game.events, dialogue });
npcs.spawnFromMarkers();               // npc_* markers from D, else FALLBACK_SPAWNS near the Foundry spawn

// per frame, after the player and the gameplay camera have been updated:
npcs.update(dt, { player: { pos, facing, weapon, aiming, sprint, crouch } });   // ctx is optional; the bus also works
world.update(dt, { actor, camera, bodies: [playerBody, ...npcs.bodies()] });     // NPCs push doors
dialogue.update(dt);                   // overrides the camera while active, blends back to yours on exit
if (dialogue.active) { /* freeze player input; face dialogue.playerFacing */ }
```

- **Interaction.** `npcs.interactables()` returns contract §2 entries (`kind: 'npc'`, id `npc:<id>`).
  Emit `player:interact { id }` when one is used. The manager starts the conversation (or barks a
  refusal) and emits `npc:talk`.
- **Events out.** `npc:react`, `npc:state`, `npc:bark`, `npc:rank`, `npc:talk`, `npc:interrupt`,
  `npc:attack` (combat stub), and `dialogue:start / line / choice / effect / end`. Effects the
  game must implement arrive as `dialogue:effect` (`give`, `take`, `emit`, ...). For example, the
  clerk's "put it away" option emits `dialogue:holster`.
- **Bus.** The manager accepts any `{ on, emit }` object or a DOM `EventTarget` (`connectBus`); with
  none it makes a private `EventBus`.
- **Clips.** NPC clips come from `defaultClipsFor(character)`: a subset of `clips.js` plus all
  social clips, baked once per body and shared. When A's `registerSamplers` lands, `manager.js`
  registers the social samplers on import. Missing names fall back via `CLIP_FALLBACKS` in `npc.js`.

## Add an NPC archetype

1. Add an entry to `ARCHETYPES` in `src/npc/archetypes.js`:
   ```js
   bouncer: { label: 'Bouncer', faction: 'club', traits: { bravery: 0.9, aggression: 0.5, sociability: 0.3, curiosity: 0.3, wander: 0 },
     disposition: -5, perception: { fov: 150, sightRange: 24, hearing: 1 },
     idles: ['npc_idle_armsCrossed'], talk: ['npc_talk_gesture_3'], dialogue: 'bouncer', voice: 'bouncer',
     presets: ['sheet-04-camo-cargo'] },
   ```
2. Optionally add the faction to `FACTIONS`.
3. Place it: a marker `kit.marker('npc_club_door', pos, { yaw, role: 'bouncer', scenario: 'armsCrossed' })`
   (D), or `manager.spawn({ id, archetype: 'bouncer', pos, yaw, scenario })`.
   Temperament (coward / normal / hothead / tough) is derived from the traits and selects the matrix
   column.

## Add a reaction

- **New stimulus.** Add it to `STIMULI` (`src/npc/stimuli.js`: sense, radius, threat, memory). Emit it
  with `manager.broadcast({ type, pos, source })`, or map a bus event in `NpcManager.listen()`.
- **Its row.** Add a row to `REACTION_MATRIX` (`src/npc/reactions.js`) with one cell per temperament.
  A cell is a reaction id or `(ctx) => id`, and ctx has `intensity`, `rank`, `distance` and `repeats`.
  Optionally map it to a player deed in `STIMULUS_DEEDS`.
- **New reaction kind.** Add it to `REACTIONS`: `drives` deltas, an optional one-shot `anim`, a
  `bark` concept, a `look` time, `panic: true` to spread fear, and `state` (the brain state it favours).
- **New sustained behaviour.** Add a state to `STATES` in `src/npc/brain.js`:
  `{ group, minTime, score(npc, env), enter, update, exit }`. Score from `npc.drives`, `npc.traits`,
  `npc.rank()`, `npc.perception` and `env.player`. Use the NPC commands (`moveTo`, `stop`,
  `faceToward`, `look`, `setRest`, `gesture`, `oneShot`, `bark`). Pick the group for its priority.

## Add a dialogue tree

Write `src/dialogue/data/trees/<id>.json`, import it in `loader.js`, and add it to `BUILTIN_TREES`. You
can also call `registerTree(json)` or `await loadTree(url)` at runtime. Registration validates the tree
and throws on dangling links or empty choices. Set the archetype's `dialogue: '<id>'`, or `dialogue`
on the marker.

```json
{ "id": "bouncer", "start": "entry", "speakers": { "npc": { "color": "#ffb070" } },
  "nodes": {
    "entry": { "type": "condition", "if": { "rank": "friendly" }, "then": "in", "else": "door" },
    "door":  { "type": "line", "speaker": "npc", "text": "List?", "emotion": "cold", "shot": "two", "anim": "npc_idle_armsCrossed", "next": "pick" },
    "pick":  { "type": "choice", "timeout": 8, "default": 0, "options": [
      { "text": "I'm with Dana.", "tone": "calm", "if": { "var": "global.dana_invite" }, "next": "in" },
      { "text": "Here's fifty. ($50)", "tone": "bribe", "requires": { "if": { "var": "global.cash", "gte": 50 }, "label": "Needs $50" },
        "effects": [{ "add": { "global.cash": -50 } }, { "disposition": 20 }], "next": "in" },
      { "text": "Move.", "tone": "intimidate", "check": { "skill": "intimidate", "dc": 16, "fail": "no" }, "next": "in" } ] },
    "in": { "type": "line", "speaker": "npc", "text": "Go on.", "next": "end" },
    "no": { "type": "line", "speaker": "npc", "text": "Walk away.", "shot": "close", "emotion": "angry",
            "effects": [{ "drive": { "anger": 0.6 } }, { "intent": "confront" }], "next": "end" },
    "end": { "type": "end" } } }
```

- **Nodes.** `line`, `choice`, `condition` (`if/then/else` or `branches`), `action`, `jump`
  (`next`, or `tree` + `node`) and `end`.
- **Conditions.** `var` (+ `gte/gt/lte/lt/eq/ne/in/exists`), `rank` (at least), `rankBelow`,
  `rankIs`, `disposition`, `faction`, `stat`, `visited`, `deed` and `chance`, combined with
  `all/any/not`.
- **Effects.** `set`, `add`, `disposition`, `heat`, `faction`, `deed`, `drive`, `intent`, `anim`,
  `bark` and `emit`. Anything else is forwarded as `dialogue:effect`.
- **Options.** `if` hides the option, `requires` greys it out with a label, `check` rolls d20 + stat
  against `dc` (the success chance is shown), and `once` removes it after use.
- **Line fields.** `speaker` (`npc` | `player`), `emotion`, `anim` (any `npc_*` clip), `shot`
  (`auto` | `two` | `ots` | `close` | `medium` | `profile`) and `duration`.

## Add a bark

Append a rule to `src/dialogue/data/barks.json`:

```json
{ "id": "greet_bouncer_regular", "concept": "greet", "criteria": { "archetype": "bouncer", "npc.visits": { "gte": 3 } },
  "lines": ["Back again? Go on in."], "cooldown": 60, "remember": { "npc.waved_in": true } }
```

The most specific matching rule wins (most criteria), and generic rules act as fall-backs. These are
the facts available to criteria:

| Fact | Meaning |
|---|---|
| `archetype`, `faction`, `voice`, `temperament` | who the speaker is |
| `rank` | the speaker's relationship rank with the player |
| `state` | the speaker's current brain state |
| `traits.*` | personality values |
| `npc.*` | the speaker's memory, shared with dialogue `npc.*` variables |
| `cause` | the stimulus type that caused the bark |

Code calls `npc.bark(concept, facts)`. The concepts in use are: greet, chat, chatReply, startled,
investigate, giveUp, weaponSeen, plead, scream, flee, confront, fight, bumped, stare, relief, busy and
noTalk.

## Add a social clip

Add a sampler to `SOCIAL_SAMPLERS` in `src/anim/social-clips.js`, named `npc_*`. It takes the form
`{ duration, loop, sample(L, t, dur) }` and uses `Pose`/`clip-kit` helpers and arm IK (`hand()`) onto
points in character space. Loops must use whole periods. `tests/npc-social-clips.test.js` checks for
finite values, loop closure, sane joint angles, hand bounds and planted feet.

## Tuning reference

- **LOD.** The `LOD` table in `manager.js` sets near < 20 m (think 10 Hz, every frame), mid < 45 m
  (4 Hz / 20 Hz) and far (1 Hz / 6 Hz). NPCs are hidden beyond 90 m. Threat reactions force an
  immediate think.
- **Commitment.** `INERTIA`, `COMMIT` and `INTERRUPT` live in `brain.js`. Per-state `minTime` sets how
  long a state is held.
- **Drives.** `DRIVE_DECAY` in `npc.js` sets how fast drives fall off, and `driveGain` in
  `reactions.js` scales them by trait.
- **Relationships.** `DEEDS`, `RANK_THRESHOLDS`, `FACTION_WEIGHT` and `HEAT_DECAY` live in
  `disposition.js`.

## Known gaps / next steps

- **Pathfinding.** There is no navmesh: steering plus feelers handles open sidewalks and halls, but
  NPCs can get stuck on complex geometry. They detect it (`npc.stuck`) and replan only when fleeing.
  A grid or navmesh A* over `walkables` is the next step.
- **Combat.** The combat state is a stub: it closes in, swings `melee_jab` (or `angry`) and emits
  `npc:attack`. It has no damage, weapons or cover.
- **Player performance in dialogue.** Player lines are subtitled, but the player character only
  turns to face the NPC. C can animate it from `dialogue:line`.
- **Voice and lip sync.** There is no voice playback; the jaw flaps procedurally inside the talk
  gestures.
- **Persistence.** Schedules and day/night routines (Radiant-style packages) are not implemented.
  `Relationships.toJSON()` / `load()` exist, but nothing saves them yet.
- **Placeholder content.** The dialogue trees and barks are placeholders. The clerk has no shop
  location, so a fallback spawn puts the clerk by the street door. D should place `npc_*` markers
  (roles: resident, clerk, thug, pedestrian; scenarios: lean, phone, counter, armsCrossed, pockets).
