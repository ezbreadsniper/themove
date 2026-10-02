# Canonical skeleton and retarget profile

Source of truth: `src/rig/skeleton.js`. All clips, weapons, exports and imports use this skeleton. No animation source may introduce its own skeleton standard.

## Audit

| Item | Standard |
|---|---|
| Joints | Mixamo / UniMate 22-joint core (`CORE_JOINTS`), plus `Jaw` (talking). Extra joints always come after the core. |
| Names | Bare joint names in the runtime (`Hips`, `LeftForeArm` …). Exports and imports use the `mixamorig:` prefix (`RIG_PREFIX`). |
| Hierarchy | Hips → Spine → Spine1 → Spine2 → Neck → Head → Jaw. Spine2 → {Left,Right}Shoulder → Arm → ForeArm → Hand. Hips → {Left,Right}UpLeg → Leg → Foot → ToeBase. |
| Rest pose | A-pose, arms 32° down from horizontal (`A_POSE_DEGREES`). **Every bone rests at identity rotation**: a bone's rest offset is the difference of rest world positions. |
| Axes | Y up, +Z forward (the character faces +Z), the character's left is +X. Units are metres. |
| Root | `Hips` is the root joint at pelvis height. The character group's origin is between the feet on the ground. |
| Scale | 1 unit = 1 m. Proportions are per character (`computeJointLayout`), so clips are baked per body. |
| Hands | Single `Hand` bone (mitten hand, no finger bones). Grip contact point = wrist + 0.42 × hand length along the fingers + 1.3 cm toward the palm (`handGripOffset`). The hand rest frame is fingers along the rest arm, palm facing the body (`handRestFrame`). |
| Feet | `Foot` (ankle) and `ToeBase` (ball). Heel and ball pivots for foot roll are in `legRig` (`src/anim/ik.js`). |
| Weapon attachment | The weapon is a child of `RightHand`, at the constant offset `handToWeapon(layout, spec)`. Stowed copies hang on the mount bone (`Hips`). The spare magazine is a child of `LeftHand`. Sockets are listed in `src/weapons/specs.js`. |
| IK | Legs: `solveLeg` (sagittal), `solveLeg3D` (`src/anim/ik.js`). Arms: `solveArm` / `gripAt` / `gripWith` (`src/anim/arm-ik.js`) in world space after any spine pose (FK in `src/anim/fk.js`). The rest elbow pole is −Z (the elbow bends back). |
| Facial | `Jaw` bone (mouth open). Eyes, brows and wrinkles are painted texture, with no blend shapes yet. |
| Correctives | Body morph targets with angle drivers: hip flex 45/95/130, hip extend 35, knee 70/130 (`src/rig/body-correctives.js`). Garment correctives are in `src/garment/correctives.js`. Driver tables export in the glTF mesh extras (`correctives`). |

## Retarget profile

`src/anim/retarget.js`. Every external clip goes through the same five steps:

1. **Names → joints.** Profiles: `mixamo` (any `mixamorigN:` namespace), `unimate`, `mannequin` (Unreal-style `pelvis`, `spine_01` …). A source missing any core joint is rejected and the missing names are listed.
2. **Sample at 30 fps** on the source's own skeleton (tracks are rebound by uuid; played once, so the last frame is real).
3. **World rotations relative to the source bind pose.** Units are converted with `metresPerUnit` (Mixamo FBX is 0.01).
4. **Rest alignment** onto our A-pose. Per joint, the rotation turning our rest bone direction into the source's is applied, then local rotations are rebuilt (`clipFromUnimateMotion`, the shared "canonical global motion" interchange, also used for UniMate).
5. **Clean-up:**
   - hip height is scaled to the character;
   - horizontal root drift is removed for in-place clips, with the velocity kept in `userData.rootVelocity`;
   - the hips are lifted wherever a foot would go below the floor;
   - `provenance` is recorded.

Motion without a licence record is refused.

Verified by `tests/retarget.test.js`. A centimetre-unit Mixamo-style rig, with arbitrary bind rotations on every bone, round-trips walk, wave and jump within 2° per bone.
