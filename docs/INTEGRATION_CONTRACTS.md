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

## 5. Pass 3 direction (user, latest — overrides earlier notes)

- **Playable world population:** no NPCs outside. The five main characters (`MAIN_PRESETS`, sheet-01..05)
  sit inside the loft as NPCs, chilling on the sofa/seats and listening to music (head nods, relaxed
  talk). sheet-04 (camo cargo) holds an unbranded clear lager bottle with a lime wedge and takes sips.
  The player is `trial-default` (or `?id=`). `?npcs=street` may still spawn the street test cast.
- **Weapons:** all three guns stay in the game. The player starts with the **pistol only**. The
  rifle and the SMG (Uzi-style) sit in a weapon crate behind the building (back lot, marker
  `weapon_cache`, placed by D; G falls back to ~[24, 0, 20] if absent). Opening the crate (E) shows
  both guns inside; taking one adds it to the player's loadout (1 pistol, 2 SMG, 3 rifle once owned).
- **Movement:** WASD runs by default; Alt (or CapsLock toggle) walks; Shift sprints outdoors.
- **Time of day:** night. Darker exterior (moonlight + sodium streetlights), interior lamps on.
- **Music:** an original procedural minimal Detroit-techno track (in the spirit of Robert Hood's
  minimal techno, NOT a copy of any real track), 128 BPM, heavy sub bass, playing from the loft's
  speakers with physically-motivated propagation.

## 6. Combat (G ↔ B) and audio (F)

- **Hitscan (G, `src/combat/**`):** on fire, G raycasts from the muzzle along the aim against
  `world.collision.raycastHit` and NPC hit volumes. B provides
  `npcs.hitTest(origin, dir, maxDist) → { npc, point, normal, distance, part: 'head'|'torso'|'arm'|'leg' } | null`
  (G falls back to body capsules). On a hit G calls `npcs.damage(npc, { amount, point, dir, part, source: 'player' })`.
- **Health (B):** each NPC dies after **5 pistol hits** (head counts double). B implements hit
  reactions (directional flinch/stagger by part, clutch wound), death (directional fall clips into
  a collapsed pose that rests on the floor — no T-pose, no floating), and everyone else's reaction
  to gunfire and deaths (startle, duck, cower, hands up, flee to exits, scream barks; seated NPCs
  jump up). B emits `npc:hit { npc, point, dir, part }`, `npc:death { npc, point, dir }`,
  `npc:panic { npc }` on `game.events`. Dead NPCs stay as bodies.
- **Blood & impacts (G, `src/fx/**`):** blood mist burst at the hit point, splatter decals projected
  onto walls/floor/furniture behind the hit (raycast along `dir`), drips, a pool that spreads under
  a dead body, bullet impact decals + dust on world surfaces. Retro pixel textures, deterministic
  per seed, budgeted (oldest decals recycle). Decals sit on surfaces with polygon offset, never float.
- **Audio (F, `src/audio/**`):** `installAudio(game)` (default export or named) wires itself to
  `game.events`/`game.world`/camera: music source(s) at the loft speakers, gunshot sounds
  (indoor/outdoor reverb), impacts, NPC screams optional. Propagation: inverse-distance attenuation,
  air absorption (HF loss with distance), wall/floor occlusion with frequency-dependent transmission
  (bass travels through walls, highs don't), door openness opens the path, room reverb per zone.
  Exposes `game.audio = { music: { bpm, beatPhase(), playing, toggle() }, play(name, pos) }`.
  G calls it from `world-play.js` via optional dynamic import. The audio context starts on first
  user gesture (browser autoplay rules).

## 7. Apartment life: activities & chill animations (H ↔ B)

- **H owns** `src/anim/chill-clips.js` (registered through `registerSamplers`) and
  `src/npc/activities/**` (activity / smart-object registry). B owns the rest of `src/npc/**`.
- **Activity** = `{ id, tags, slots(world) → [{ pos, yaw, seat?, prop? }], enter(npc, slot, ctx),
  update(npc, dt, ctx) → 'continue'|'done', exit(npc, ctx), interruptible: true }`, exported from
  `src/npc/activities/index.js` as `ACTIVITIES` + `pickActivity(npc, ctx)`. B's brain, while calm,
  runs activities through this registry (idle/scenario state); any threat stimulus (gunfire,
  weapon aimed, death) interrupts immediately and B's reactions take over.
- Activities in the loft: sit and listen (head-nod to `game.audio.music.beatPhase()`, foot tap,
  shoulder bounce, eyes closed vibe), sit and drink (sip, rest bottle on knee), sit and talk in
  pairs (gestures, laugh, lean in), dance/two-step by the speakers, lean on the kitchen counter,
  grab a drink from the fridge, look out the big window, scroll phone, play video games with a
  controller facing the TV, smoke by the window (reuse A's smoke clips), stretch/yawn, lean on the
  mezzanine railing, sit on the stair, flip a record / pick music at the console. NPCs rotate
  between activities over minutes so the room feels alive; at most one NPC per slot.
- Held props (`src/npc/activities/props.js`): bottle (unbranded clear lager + lime), phone,
  controller, cup; attached to hand bones with a grip offset.

## 8. Physical, shootable props (I ↔ D ↔ G)

- **I owns** `src/world/physics/**` (rigid-body world, props, breakage, debris; the KCC/collision
  files there keep their APIs and tests) and may add one physics dependency (e.g.
  `@dimforge/rapier3d-compat`) if it is clearly worth it. D owns where props are placed; G owns
  hitscan.
- **D** builds every loose item (bottles, cans, cups, books, magazines, plants/pots, speakers,
  boxes, crates, bins, chairs, stools, lamps, frames, remote, controller, console, candles,
  shoes, basketball, cushions/blanket if cheap) through
  `kit.physical(name, buildFn, { shape: 'box'|'cylinder'|'sphere'|'hull', mass, material:
  'glass'|'ceramic'|'wood'|'metal'|'plastic'|'paper'|'fabric'|'rubber'|'electronics', breakable?,
  anchored?: 'wall'|'ceiling'|null })` so each is its own dynamic node (not merged into a static
  bucket), resting on its shelf/table/floor. Heavy furniture (sofa, console, tables, fridge) can be
  `physical` with high mass or stay static with `bulletDecalsOnly`.
- **I** simulates them: full 3D rigid bodies (tumble, roll, stack, slide off shelves, sleep),
  collision with world static geometry and with each other, character capsules push them
  (player + NPC bodies), and exposes on `game.physics` (and `world.physics`):
  `raycast(origin, dir, max) → { body, point, normal, distance, material } | null`,
  `shoot(hit, dir, { impulse, weapon })` (applies impulse at the point, spin, breakage), `step(dt)`.
  Breakables shatter into retro low-poly shards/debris (glass bottles, TV screen cracks + sparks,
  ceramic pots → pieces + soil, lamp bulbs pop and the light goes out via `world.setLight`,
  hanging pendants swing on their chains when hit, posters/frames fall or tilt, speakers knocked over
  — music source follows/cuts).
  Events: `prop:hit { body, point, material }`, `prop:break { body, material, pos }` on game.events
  (audio plays material-specific sounds).
- **G** includes `game.physics.raycast` in hitscan (nearest of world / prop / NPC wins) and calls
  `shoot`; bullet decals still go on static surfaces.
