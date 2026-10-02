# Playable world: movement, physics and interaction

**Entry point:** `world.html` → `src/app/world-play.js`. It loads the player (trial-default, with pistol, rifle and SMG) into the Foundry St. location at the `spawn` marker.

**URL parameters:**
- `?id=<preset>` picks the character;
- `&spawn=<marker>` picks the start point;
- `&preset=ps2|ps1|clean` picks the render preset;
- `&rays=<n>` sets the light-bake quality;
- `&scripted` stops the real-time loop so tests step the clock themselves.

## Controls
| Key | Action |
|---|---|
| WASD | move (camera relative) |
| Shift | sprint (not indoors) |
| CapsLock | toggle walk/run |
| Alt (hold) | walk |
| Space | jump (coyote time 0.12 s, buffer 0.14 s) |
| C / Ctrl | crouch toggle (needs headroom to stand). Ctrl+W still closes the browser tab. |
| E | interact with the focused item, or stand up when seated |
| F / RMB | aim (tighter arm and fov, crosshair) |
| LMB | fire; it hip-aims when not aiming |
| R | reload |
| 1 / 2 / 3 / 0 | pistol / rifle / SMG / holster |
| Q / MMB | swap shoulder |
| X | inspect weapon |
| V | melee |
| G | smoke |
| Mouse | look. Click the view to lock the pointer; Esc releases it. Dragging also looks. |

Inspect, melee and smoke play `${weapon}_inspect`, `${weapon}_melee`, `melee_jab`/`melee_cross` and `smoke_light`/`smoke` when those clips exist. If they don't, the action plays no animation, but its gameplay event still fires.

## Modules
| File | What it does |
|---|---|
| `src/world/physics/kcc.js` | `CharacterMotor`: kinematic capsule with collide-and-slide, step-up (headroom checked), snap-down, a 46° slope limit with sliding, gravity, jump with coyote time and a buffer, head bumps, crouch height, `clearance()` and `separate(bodies)`. |
| `src/world/physics/collision.js` | Additions: `removeSolid`, `updateSolid(item, poly, y0, y1)`, a `filter` and `normals` out-param on `resolve` / `penetration`, `raycastHit` → `{ dist, solid }`, `ceiling()`, `slopeOf()`. The `move`, `ground` and `raycast` APIs are unchanged. |
| `src/world/doors.js` | `DoorSystem`: hinged rigid leaves. See `DOOR_PHYSICS` for the tuning. `update(dt, bodies)`, `toggle(name, from)`, `impulse`, `setLocked`, `state(name)`, `isOpen`, and `events` (`open` / `latch` / `rattle`). It also accepts the legacy single-actor call. |
| `src/world/physics/props.js` | `PropSystem`: box and cylinder props. It consumes `dynamics` with `data.physical` (contracts §3), and `add(spec)` adds props by hand. |
| `src/game/character-controller.js` | Two paths. The kinematic path (root motion, used by `play.html`) is unchanged. The physical path (`{ motor, events }`) adds: clip speed as a target velocity with inertia; playback scaled to the achieved speed; turning in place; a jump / fall / land state with `land_soft`/`land_hard` fallbacks; step smoothing on the visual root; slowing in tight spaces; no sprint indoors; perception events; and `body()`. |
| `src/game/seat.js` | `seatSpec(item, collision, fits)` and `SeatAction`, which runs approach → turn → down → seated → up. Clips: `sitDown[_variant]`, `sitIdle[_variant]` / `sit`, `standUp[_variant]`. The motor collision is off while seated. |
| `src/game/camera.js` | `ThirdPersonCamera` (spring arm) and `CameraProbe` (collision solids plus AABB occluders). |
| `src/game/input.js` | Keyboard and mouse → controller input, with edge flags. |
| `src/game/events.js` | `EventBus` (`on`, `off`, `once`, `emit`, plus EventTarget aliases, and a `log` for tests). |
| `src/world/interaction/index.js` | `InteractionSystem`: focus (distance + angle + line of sight + hysteresis), `prompt()`, `interact(ctx)`, and handlers for seat, door, switch, lamp, tv, item, container and npc. `addSource(fn)` adds dynamic interactables such as NPCs. |
| `src/world/interaction/fallback.js` | `fallbackInteractables(world)`: door items for undeclared doors, plus Foundry loft seats and a floor lamp when the world declares none. |

## window.game (contracts §4)
```
{ world, player, controller, motor, props, interaction, events, camera, stage, npcs, dialogue, input,
  step(dt), advance(seconds), autopilot(points, { speed }), teleport(x, y, z, yaw), look(yaw, pitch),
  door(name), snapshot() }
```

**Events** (on `game.events`):
- player events: `player:fire {pos, weapon, target}`, `player:aim`, `player:draw`, `player:holster`, `player:sprint`, `player:crouch {on}`, `player:interact {id, kind, result}`, `player:collide {who}`, `player:melee {pos}`, `player:land {speed}`, `player:sit` / `player:stand {id}`, `player:pickup`;
- door events: `door:open`, `door:latch`, `door:rattle`.

**Optional NPCs and dialogue.** `world-play` looks through `src/npc/*.js` for an exported `NpcManager`, and through `src/dialogue/*.js` for a `DialogueDirector`, using `import.meta.glob`. If either is missing, it runs without it. It wires in:
- `spawnFromMarkers()`;
- `update(dt, ctx)`;
- `interactables()`, which feeds the focus list;
- `bodies()` (or `npcs[].body`), which push doors and props and keep the player out;
- `dialogue.active`, which freezes movement and hands the camera over.

## Tests
- `tests/world-physics.test.js`: the KCC (slide, tunnelling, stairs up and down, risers, headroom, slope limit, jump height, coyote time, the jump buffer, head bumps, crouch), doors (contact push, push direction, closer and latch, stopping against a body, never through walls, locked, the E motor, the collider following the leaf) and props.
- `tests/controller.test.js`: the physical path (inertia, walls, jump, smooth stairs, turning in place, no sprint indoors, events).
- `tests/interaction.test.js`: focus, prompts, lamps, pickups, fallback data, and the seat state machine.
- `scripts/world-play-e2e.mjs`: a walk-through from spawn → street door → hall → corridor → loft door → spiral stair → sofa → jump. It writes screenshots to `docs/game/evidence/`. Set `THEMOVE_URL` to target a specific dev server.

## Known issue: the spiral stair top is not passable for a capsule
At the top of the loft stair:
- the mezzanine plate's south guard runs along x 11.45–12.4, z ≈ 6.95;
- the last tread's outer rail and the mezzanine guard end at (11.4, 7.32–7.38).

That leaves a gap of only about 0.33–0.39 m. Any body wider than about 0.17 m in radius stops on the top tread, and the `stair-top` marker (z 7.2) lies inside the plate guard's clearance. The fix is in the location geometry (workstream D). Either:
- start the plate guard further east, at x ≥ 12.0; or
- extend the plate to the full tread width (z 6.5–7.45) and end the last rail segment one tread earlier.

The e2e run climbs to about 2.4 m, records whether the landing is reached, and comes back down.
