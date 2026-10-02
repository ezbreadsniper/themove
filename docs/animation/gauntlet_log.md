# Animation gauntlet log

Standards: `canonical_skeleton.md`, `animation_standard.md`, `animation_sources.md`, `unimate_plan.md`.
Evidence: `docs/evidence/animation/`.
Tools:
- `scripts/clip-sheet.mjs` — clip contact sheets;
- `scripts/play-e2e.mjs` — in-game run;
- `scripts/export-characters.mjs` — glTF round trip;
- `scripts/tmp/jumps.mjs`, `scripts/tmp/wa.mjs` — pop and attachment probes.

## W1: audit
**Present:**
- canonical 22+1 joint rig, A-pose, identity rest, +Z forward;
- 38 procedural clips baked per body at 30 fps;
- leg IK, 8-direction walk and run;
- the UniMate bridge.

**Missing:**
- upper-body IK that works after spine motion;
- weapons, sockets, layers or masks, an additive layer, a state machine;
- sprint, crouch-walk, start/stop, step-up/down, knockback, push/pull and social gestures;
- a retarget pipeline for non-UniMate sources;
- source and licence records.

## W2: weapons, sockets, two-hand IK, animator
**Added:**
- world FK and arm IK;
- pistol, rifle and SMG specs and models with sockets, hand frames and stow mounts;
- stances;
- timeline clips: 37 per weapon, plus 4 aim offsets each;
- the layered animator.

**Defects found and fixed:**
- crossed pistol forearms (extension raised to 0.84 × reach, reach-limited on leans);
- rifle support hand out of reach (bladed stance, support socket moved, support slide for short arms);
- `reachable` always false (it measured a normalised vector);
- an animator fade bug: `weight = 0` before `fadeIn` left every faded action at zero, so the legs had no clip and the hands came 1 m off the gun;
- hand pops up to 166°/frame:
  - blends to and from a free hand now blend arm rotations, not targets;
  - hand orientation is slerped;
  - transitions were re-timed;
- inspect twisted the torso (weapon-only `spin` added);
- the long gun couldn't aim 45° right (the torso now takes 70% of the aim yaw).

**Gate (`tests/weapons.test.js`):**
- every weapon clip on all 12 body variants keeps both hands < 1 mm from their targets, and every target is reachable;
- < 40°/frame;
- loop seams < 0.5°;
- skinned palm contact < 1 mm on 5 bodies;
- the animator scripts for all three weapons.

## W3: base set completion
**Added:** sprint, crouchWalk (8 directions), crouchIdle, start/stop walk and run, turnSharp, stepUp, stepDown, knockback → recover, push, pull, laugh, angry, confused.

**Fixed:**
- `land` 56°/frame knee pop (contact now starts with bent knees);
- recover didn't start where knockback ended.

**Gate:** every chained clip (`then`) hands over within 3°.

## W4: retargeting, standards, licences
**Added:**
- `src/anim/retarget.js`: Mixamo, UniMate and mannequin profiles; refuses motion without a licence record;
- the standards, source and licence, and UniMate documents.

**Defects found and fixed:**
- `:` in track names cannot bind in three.js, so a source never moved (tracks are now rebound by uuid);
- a looping sampler wrapped `t = duration` to frame 0.

**Gate:** a centimetre-unit Mixamo-style rig with random bind rotations round-trips walk, wave and jump within 2° per bone.

## W5: in-game validation
**Added:**
- `play.html` and `src/game/character-controller.js`: third-person controller, weapon state and ammo, root motion from clip speed;
- `scripts/play-e2e.mjs`: 15 scripted gameplay steps with state assertions;
- armed glTF export and re-import.

**Defects found and fixed:**
- an empty long gun played the jam clip (a dry fire was added) and swallowed the reload (reloads are now buffered);
- rifle and SMG stacked on the same hip as the holster (the rifle moved to a back sling);
- 180° forearm flips drawing from the back (over-the-shoulder waypoints, adaptive elbow pole, ~152° elbow-flex limit, re-timed draw);
- the SMG grip sat 12 cm from the shoulder when aiming right (stock extended).

**Results:**
- in-game run passes on trial-default, sheet-01, sheet-06 and sheet-07;
- the armed GLB re-imports with 177 clips, and the draw swaps play through GLTFLoader;
- 658 of 658 tests pass.

## Still open (next highest-value first)
1. **Mitten hands.** There are no finger bones, so grips are a flat palm against the weapon. Add three finger chains plus a thumb to the rig, still UniMate-core compatible since extras come after the core, with per-weapon hand poses.
2. **Hip/torso turn while aiming in place.** The feet stay planted while the torso twists up to 32°. Add turn-in-place steps when the aim yaw passes 45°.
3. **Runtime aim stabilisation.** In layered walk-aim, the pelvis yaw (±6°) slightly sways the gun. Baked `*_walkAim` clips counter it; the runtime layer does not.
4. **Foot IK at runtime.** Uneven ground and slopes aren't handled; the clips assume flat ground.
5. **Weapon drop/pickup and first-person view** aren't built.
6. **UniMate** is blocked (no CUDA GPU here); see `unimate_plan.md`.
7. **Skirt sit poke-through** (pre-existing clothing issue, see `docs/character/gauntlet_log.md`).
