# Integration contracts (workstream pass 2)

Four workstreams run in parallel. Each owns a set of files and talks to the others only through the
interfaces below. If you need something from another workstream that is not here, code against the
contract with a graceful fallback (missing clip → skip / substitute, missing data → no-op) and note
it in your hand-off. Never edit a file owned by another workstream except where it says so below.

## Ownership

| Workstream | Owns (may create/edit) |
|---|---|
| **A. Weapons & animation** | `src/anim/**`, `src/weapons/**`, `src/render/smoke.js`, `buildCigarette` in `src/geo/parts/accessories.js`, `play.html`, `src/app/play.js`, `docs/animation/**`, tests `animation/weapons/locomotion/retarget/foot-ik` |
| **B. NPC behaviour & dialogue** | `src/npc/**`, `src/dialogue/**`, `src/anim/social-clips.js` (new, only this file in anim), `docs/npc/**`, new tests `tests/npc*.test.js`, `tests/dialogue*.test.js` |
| **C. Player movement & interaction** | `src/game/**`, `src/world/physics/**`, `src/world/doors.js`, `src/world/interaction/**` (new), `world.html` + `src/app/world-play.js` (new playable entry), `docs/game/**`, tests `controller/world-physics` + new `tests/interaction*.test.js` |
| **D. Apartment, interiors & lighting** | `src/world/locations/**`, `src/world/props/**`, `src/world/kit/**`, `src/world/lighting/**`, `src/world/world.js`, `src/world/viewer.js`, `src/render/retro-pipeline.js`, `docs/world/**`, `scripts/world-shots.mjs` |

Shared and append-only: `src/anim/clips.js` registry (A owns; B registers social clips through
`registerSamplers`, see below), `package.json` (add scripts only).

## 1. Clip registry (A ↔ B ↔ C)

- `src/anim/clips.js` exposes `SAMPLERS` keyed by clip name. A adds an exported
  `registerSamplers(map)` that merges extra samplers (same `{ duration, loop, events?, sample(L, t) }`
  shape) before baking, so B's `social-clips.js` can register its clips without editing clips.js.
- Clip names C depends on (A provides; C must fall back gracefully if absent):
  - Seating: `sitDown` (one-shot, ends seated), `sitIdle` (loop), `standUp` (one-shot). Seat height
    parameter: clips are authored for `FURNITURE.seat` (0.43 m); a `sofa` variant `sitDown_sofa`,
    `sitIdle_sofa`, `standUp_sofa` for 0.45 m deep sofa seats with back rest.
  - Interaction: `interact` (exists), `pressSwitch`, `pushDoor` (upper-body additive/one-shot),
    `pickUp`, `lookAround`.
  - Locomotion: existing `idle`, `walk_*`, `run_*`, `crouchWalk_*`, `jump*`, `stepInPlace`, plus
    A may add `land_soft`, `land_hard`, `stairs_up`, `stairs_down`.
  - Weapons: existing `${type}_*` + new `${type}_inspect`, `${type}_melee`, `${type}_equip`
    polish; unarmed `melee_jab`, `melee_cross`, `melee_kick` (optional).
  - Smoking: `smoke` (rebuilt), `smoke_light`, `smoke_flick`, `smoke_drop` (optional).
- Social clips B provides (names prefixed `npc_`): `npc_idle_*`, `npc_alert`, `npc_fear_cower`,
  `npc_flee_*` (or reuse `run_*`), `npc_anger_point`, `npc_greet_wave`, `npc_greet_nod`,
  `npc_talk_gesture_*`, `npc_listen`, `npc_handsUp`, `npc_shrug`, `npc_phone`, `npc_lean_wall`.

## 2. World data (D → C, D → B)

`kit.finish()` returns `{ root, buckets, dynamics, solids, walkables, occluders, lights, markers, stats }`.
D adds:

- `interactables: Array<Interactable>` (new field, built through `kit.interactable(...)`):
  ```js
  { id: 'loft.sofa.seat2', kind: 'seat' | 'switch' | 'door' | 'lamp' | 'tv' | 'item' | 'container' | 'npc',
    pos: [x, y, z],          // world space, the point the player walks to / looks at
    yaw: rad,                // the facing the player takes when using it (seat: facing out of the seat)
    radius: 1.2,             // prompt radius (m)
    prompt: 'Sit',           // HUD verb
    data: { ... } }          // kind-specific:
       // seat:   { seatHeight, variant: 'chair'|'sofa'|'stool'|'bed', exit: [x,y,z] }
       // switch: { lights: ['light name', ...], on: true }
       // lamp:   { lights: [...], on: true }
       // door:   { door: '<dynamic name>' }
  ```
- `lights` entries keep `{ name, pos, color, intensity, range, dynamic, zone }`; D adds
  `flicker: { rate, depth, seed }` (optional) and `switchable: true` (optional). World exposes
  `world.setLight(name, on)` and `world.lightsByName`.
- `markers` keep `spawn`; D may add `spawn_loft`, `spawn_corridor` and `npc_*` markers
  (`kit.marker('npc_corridor_1', pos, { yaw, role: 'resident' })`) which B consumes.

## 3. Physics & doors (C, consumed by D's world.js)

- `World.update(dt, { actor, camera, bodies })`: D keeps this signature; C may change the door
  system so `DoorSystem.update(dt, bodies)` takes an array of capsule bodies
  `{ x, y, z, vx, vz, radius, height, mass }` and doors are physical hinged leaves (angular velocity,
  damping, push from body contact, latch when shut, locked flag). D's world.js passes
  `bodies ?? (actor ? [actor] : [])`. C edits only those lines in world.js if needed.
- `CollisionWorld` keeps `move`/`ground` APIs used by existing tests; C may add `raycast(origin, dir, max)`
  and `addSolid`/`removeSolid` for dynamic props.
- Physics props: C owns `src/world/physics/props.js` (simple rigid boxes/cylinders, gravity,
  friction, sleep). D marks props as physical via `kit.physical(meshGroup, { shape, mass })` which
  pushes into `dynamics` with `data.physical`. C simulates them.

## 4. Characters in the world (C ↔ B)

- C's `world-play.js` builds the player, the `World`, a `CharacterController`, input, camera and HUD,
  and exposes `window.game = { world, player, controller, npcs, dialogue, step(dt), input }`.
- B exposes `class NpcManager { constructor({ world, scene, player, clipsFor }) ; spawnFromMarkers(); update(dt, ctx) }`
  and `class DialogueDirector { constructor({ camera, scene, hud }) ; start(npc, treeId); update(dt); get active }`.
  C wires them in `world-play.js` behind `if (NpcManager)` imports so the game runs without them.
- Perception events B listens for (C emits on `window.game.events`, a tiny EventTarget-like bus in
  `src/game/events.js`): `player:fire {pos, weapon}`, `player:aim {target, weapon}`,
  `player:draw {weapon}`, `player:holster`, `player:sprint`, `player:crouch`, `player:interact {id}`,
  `player:collide {who}`, `player:melee {pos}`.

## Style

Older graphical style (PS2-era: low poly, nearest-filtered pixel textures, vertex lighting, fog),
modern systems (responsiveness, physics, blending, IK). Code is generated, deterministic, no binary
source assets. Match surrounding code style and comment density. Licences for any external asset
go in `docs/animation/animation_sources.md`.
