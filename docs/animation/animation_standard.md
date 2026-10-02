# Animation naming and metadata standard

## Format
- **Frame rate:** 30 fps (`FPS`). Every clip is baked at 30 fps; imports are resampled to it.
- **Time:** seconds. A looping clip's last key equals its first, so the loop seam is 0°.
- **Root motion:** in place. Travel is reported, never baked into the hips:
  - `rootVelocity` (m/s) for loops;
  - `rootDelta` (m, applied when the clip finishes) for one-shots that end somewhere else (step up/down, knockback → recover);
  - `rootYawDelta` (degrees) for turns.

  The game moves the character root.
- **Tracks:**
  - one quaternion track per joint, plus `Hips.position`;
  - weapon clips add `wpn_<type>_<part>.position`, and `.scale` for show/hide. glTF cannot animate visibility, so hidden is scale 1e-4.

## Names
- **Base clips** are camelCase verbs or states: `idle`, `walk`, `startWalk`, `turnSharp`, `knockback`.
- **Directional locomotion** uses `<gait>_<compass>` (N/NE/E/SE/S/SW/W/NW): `walk_E` is a strafe to the character's right, and `walk_S` walks backward.
- **Weapon clips** are `<weaponType>_<action>`: `pistol_reloadEmpty`, `rifle_crouchWalk`.
  - `<type>_aimLeft/Right/Up/Down` are additive aim offsets.
  - `<type>_recoil` is additive.
- **Retargeted clips** are `<source>_<clipName>`, for example `mixamo_SillyDance`. The licence is in `userData.provenance`.

## `clip.userData` fields
| Field | Meaning |
|---|---|
| `loop` | true for cycles and holds |
| `weapon` | weapon type the clip needs in hand |
| `layer` | `full`, or `additive` for recoil and aim offsets |
| `additive`, `additiveReference` | the clip is applied additively against this clip's first frame |
| `events` | `[{ name, time, side? }]`. Names: `footstep`, `impact`, `hit`, `bodyfall`, `grab`, `use`, `exhale`, `draw`, `holster`, `fire`, `click`, `magOut`, `magIn`, `slideRelease`, `boltRelease`, `tap` |
| `then` | the clip that must follow (start/stop → loop, knockback → recover). The chain is tested to hand over within 3° |
| `rootVelocity`, `rootDelta`, `rootYawDelta`, `rootVelocityRamp` | root motion (see above) |
| `syncGroup`, `speed` | gait family for phase-synced blends |
| `provenance` | `{ source, author, licence, url, profile }` for imported motion |

## Layers (`src/anim/animator.js`)
| Layer | Bones | Use |
|---|---|---|
| base | full body, or legs + Hips while an upper clip plays | locomotion loops |
| upper | Spine…Head, Jaw, shoulders, arms, hands, weapon nodes | weapon handling, gestures |
| additive | upper | recoil, aim offsets |
| full one-shot | everything | jump, land, hit, death; afterwards the layers resume |

Blend times live in `BLEND`:
- locomotion 0.25 s;
- upper loop 0.18 s;
- upper one-shot 0.12 s;
- full one-shot 0.10 s.

A one-shot locks the upper layer. Requests made during it are queued, recoil is refused, and `then` picks what follows.
