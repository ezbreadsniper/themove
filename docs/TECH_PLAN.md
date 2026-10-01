# Character System — Technical Plan

## Findings (pass 0)

- The repository was empty. There was no engine or existing systems to integrate with. Target runtime: **Three.js r186** in the browser, built with Vite.
- There is no Blender or NVIDIA GPU on the dev machine. Everything is therefore **generated in code**, which keeps it reproducible
  and diffable. There are no binary source assets to lose.
- The interchange format is **GLB** (glTF 2.0 with skins, joints, and embedded PNG textures). Three.js loads it natively, and so do Blender,
  Unity, Godot and UniMate's Blender-based pipeline.

## Architecture

```
CharacterDefinition (JSON, versioned, seed)
        │ validate + normalize (src/character/definition.js)
        ▼
buildCharacter(def) (src/character/build.js)
   ├─ rig/skeleton.js    → canonical 22-joint Mixamo-named skeleton, sized by body proportions
   ├─ geo/parts/*        → loft-based low-poly parts, skinned per ring
   ├─ tex/*              → deterministic pixel-buffer textures (own rasterizer)
   └─ materials          → Lambert + nearest-filtered DataTextures
        ▼
THREE.Group { SkinnedMesh per part, one shared Skeleton }
        │
        ├─ anim/clips.js     → procedural AnimationClips (idle/walk/turn/crouch/jump/wave/...)
        ├─ export/gltf.js    → GLB export
        └─ unimate/bridge.js → UniMate / Mixamo motion → AnimationClip
```

### Why these choices

- **Loft geometry** (rings of vertices swept along bones) is how low-poly characters were actually built. Each
  ring carries its own skin weights, so skinning is exact and deterministic with no heat-map solve. Joint rings are
  split 50/50 and neighbours 75/25, which gives predictable elbows and knees.
- **Identity-rest bones** (every bone's rest rotation is identity, with offsets in parent space). Procedural animation
  then works in simple world-aligned axes, and retargeting from any other rig is a global-rotation
  delta. Joint *names* follow the Mixamo core, which is what UniMate's humanoid object type uses.
- **Modular parts share one skeleton.** Swapping hair or a shirt rebuilds only that part's mesh and never touches the rig.
  Changing proportions rebuilds the skeleton offsets and all parts, still from the same topology.
- **Our own rasterizer instead of Canvas2D.** Canvas anti-aliasing differs between GPUs and drivers. Our pixel buffers are
  byte-identical everywhere, so the determinism test can hash them in Node.
- **Body masking.** Body regions fully covered by clothing are dropped from the body mesh through a `covers` list on each
  garment. This saves triangles and removes skin poke-through.

## Joint list (bind order)

```
0 Hips
1 Spine  2 Spine1  3 Spine2  4 Neck  5 Head
6 LeftShoulder  7 LeftArm  8 LeftForeArm  9 LeftHand
10 RightShoulder 11 RightArm 12 RightForeArm 13 RightHand
14 LeftUpLeg 15 LeftLeg 16 LeftFoot 17 LeftToeBase
18 RightUpLeg 19 RightLeg 20 RightFoot 21 RightToeBase
```
Names are exported as `mixamorig:<Name>` in the GLB (see `RIG_PREFIX`) so that UniMate's
`MIXAMO_CORE_JOINTS` list matches 1:1.

## Collision and LOD

- **Collision:** one capsule per character (radius from shoulder width, height from the rig), exposed as
  `character.userData.collider`. Per-bone hit capsules are listed for later combat use but not built.
- **LOD:** `lod: 0|1`. LOD1 lowers ring sides (8→6 on limbs, 14→10 on the head) and drops strand
  hair to a shell. Characters beyond 18 m use LOD1.

## Validation

- `npm test`: unit tests (RNG, definition schema, skeleton, skin-weight sums, triangle budgets, determinism hash).
- `npm run export`: exports every preset to `exports/*.glb`, re-imports them with GLTFLoader, and checks joint names,
  bone count, skin weights and bounds.
- `npm run evidence`: renders turnarounds, close-ups, animation filmstrips and a deformation stress test into
  `docs/evidence/`.
