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

## W6: hands
**Failed:** mitten hands. Every grip was a flat palm against the weapon.

**Added:**
- `HandThumb1/2` and `HandFingers1/2` per side, after the core (31 joints; UniMate/Mixamo core unchanged);
- hand mesh skinned to them;
- `curlFingers` and `relaxHands`, with a relaxed default for every clip;
- weapon holds curl per target: grip 100°, pistol support 85°, long-gun support 55°, magazine 75°, slide pinch 60°, bolt 70°, blended along with the hand target;
- fists for angry, a gripping hand for push and pull, an open hand for laugh;
- relaxed-hand tracks on retargeted clips;
- hand camera zones that follow the posed hand.

**Verified:** 658 tests pass; no new pops (peak 39°/frame); all 9 exports pass with 31 joints; the in-game run passes.

---

## W7: standing aim turns and runtime support-hand IK
**Failed:**
- standing aim spun the root with planted feet;
- additive aim offsets left the support hand up to 62 mm off the weapon at combined yaw and pitch;
- aim-offset weights stuck after releasing aim or switching weapons;
- a rifle-first player held the pistol and the rifle at once (`attachWeapon` drew the first type by default).

**Added and fixed:**
- standing-aim dead zone of ±45° covered by the upper body and aim offsets, then a stepping-in-place turn (`stepInPlace`) until within 8°;
- `src/anim/runtime-ik.js`: after the mixer, the left arm is re-solved onto the support rail of the drawn weapon on the live skeleton, weighted by a baked `supportIK` channel. The mixer crossfades it, it is 0 through reloads and one-hand stances, and it is stripped from glTF;
- `solveArmFrom` split out of `solveArm`;
- aim weights reset each frame;
- `attachWeapon(…, { drawn })`, with the game starting unarmed;
- the contact audit measures the drawn weapon.

**Verified:**
- both hands are within 1–2 mm across yaw ±44° and pitch −35…30° for pistol, rifle and SMG;
- the IK releases during reloads;
- 672 tests pass, the in-game run passes, and all 9 exports pass.

---

## W8: aim stabilisation and a moving-root bug
**Failed:**
- in layered walk-aim, the pelvis yaw and lean swung the gun 7.5° off the aim line;
- the support hand sat 32 mm off the pistol whenever the root moved. The IK and the audit refreshed the character's own matrices but not its moving parent, so they ran one root-step behind. In the game the renderer refreshes the root only at render time.

**Fixed:**
- `Animator.stabilize()`: while aiming, the pelvis rotation is cancelled at the spine root, eased in and out;
- runtime IK and audit call `updateWorldMatrix(true, true)`.

**Verified:**
- muzzle wobble during walk-aim is ≤ 0.6° and both hands stay at 0 mm, now tested with a moving root;
- 674 tests pass and the in-game run passes.

---

## W9: runtime foot IK and a mixer write-skip bug
**Added:**
- `src/anim/foot-ik.js`: each foot is re-based on `groundAt(x, z)`; the pelvis drops (smoothed) for the lower foot; legs are re-solved with two-bone IK (`solveTwoBone`, now shared by arms and legs); planted feet pitch to the heel-to-toe slope. It is an exact no-op on flat ground.
- `Animator.setGround`; the controller follows the ground height (smoothed).
- the playground has a test course (15 cm step, 0.6 m ramp, raised pad), and the in-game run walks up the step.

**Failed and fixed:** three.js's mixer only writes a property when its sampled value changes. Post-mixer edits (stabilise, foot IK, support IK) therefore compounded on frames where a clip held still: the foot IK test showed 1.5 m of hip drift, and stabilisation could keep twisting the spine during a static aim. The animator now snapshots the mixer's pose after each step and restores it before the next.

**Verified:**
- tests: flat no-op, 15 cm step, −12 cm drop (pelvis follows), 15° ramp pitch, no compounding on a still pose;
- 679 tests pass; the in-game run passes 16 steps;
- evidence `foot-ik.png` (step edge and ramp, with and without IK).

---

## Still open (next highest-value first)
1. **Weapon drop/pickup and first-person view** aren't built.
2. **UniMate** is blocked (no CUDA GPU here); see `unimate_plan.md`.
3. **Skirt sit poke-through** (pre-existing clothing issue, see `docs/character/gauntlet_log.md`).
