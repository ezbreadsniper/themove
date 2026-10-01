# Character Gauntlet Checklist

Status legend: ✅ done and verified · 🟡 partial / weak · ❌ missing · 🚫 blocked (see note)

Updated every pass. Evidence lives in `docs/evidence/` (orbit strips, trial sheet, variant matrix).

## Pipeline foundation
| Item | Status | Notes |
|---|---|---|
| Canonical 22-joint Mixamo/UniMate skeleton | ✅ | `src/rig/skeleton.js`, tested against UniMate's joint list |
| Anatomical procedural body (morph by parameters) | ✅ | `body.js` torso/arm/leg cross-sections scale with build/shoulders/hips/legs |
| Garments generated from body + ease | ✅ | tee, rugby, football, vest, jeans/pants/shorts, socks |
| Sleeve ↔ shirt junction flush | ✅ | armhole ring snapped under shirt surface |
| Inner garments clamped under outer | ✅ | `underLayer` (pants under shirts) |
| Deterministic build (seed + data) | ✅ | hash test |
| GLB export + reimport | ✅ | `npm run export` |
| Muscle / softness parameters | ✅ | `body.muscle`; belly/love-handle morph from `build` |
| Age system | ✅ | 14–80: face fullness/jowls, wrinkles, eyelids, skin roughness, greying, recession, posture, movement energy |
| Default trial character + trial sheet | ✅ | `trial-default`, `docs/evidence/trial/*` |
| Character map synced to data | ✅ | `node scripts/character-map.mjs` → `docs/CHARACTER_MAP.md` |
| Body/age variant validation matrix | ✅ | `tests/variants.test.js` (7 variants × 6 characters) |
| LOD1 validated | 🟡 | `lod` flag exists for hair/head; body LOD untested |
| Draw-call merge per character | 🟡 | 6–10 draws/character; acceptable, merge later |

## Animation
| Item | Status | Notes |
|---|---|---|
| Idle, turn-in-place, crouch, jump, wave, shrug, cheer, look-around | ✅ | baked procedural clips |
| Walk + run, 8 directions (strafe, backpedal, diagonals) | ✅ | IK gait (`anim/gait.js`); no foot slide on 7 body variants (`tests/locomotion.test.js`) |
| Start / stop / accel | ❌ | pass 2 |
| Fall / land / stumble / hit react / death | ✅ | one-shot clips with events |
| Pickup / interact / point / emotes | ✅ | |
| Locomotion blend controller + transition guards | ❌ | pass 2 |
| Foot IK at runtime, pelvis correction | 🟡 | IK used when baking planted poses; not runtime |
| Look-at / head tracking | ❌ | pass 2 |
| Facial expressions / blink | ❌ | pass 3 (texture-swap + jaw morph) |
| Hair & cloth secondary motion | ❌ | pass 3 |
| Animation event hooks | ✅ | `clip.userData.events` (footstep, impact, hit, grab, use, bodyfall) |
| UniMate | 🚫 | no CUDA GPU on this machine; skeleton/bridge ready, tested round-trip |

## User task queue (latest)
| Task | Status |
|---|---|
| Creator: local edits persist, revert / revert all, every schema field in the menu | ✅ (`tests/creator.test.js`, `scripts/creator-e2e.mjs`) |
| Sheet 01 afro floating off the head | ✅ thickness ramps from the scalp, curl clumps |
| Sheet 03 socks too wide | ✅ socks follow the leg profile |
| Better silhouettes for every shoe type | ✅ sole slab + flat-bottom foot box + leg-following collar (`docs/evidence/shoe-board.png`) |
| More clothing: jackets, hoodie, more pants/shorts cuts | 🟡 hoodie, zip hoodie, track, bomber, denim jacket done; more pants/shorts cuts next |
| More hats and glasses | ✅ beanie, slouch beanie, bucket, durag, headband; round/aviator glasses; earrings, watch, bracelet |
| Smoking animation (hand to mouth) + smoke particles | 🟡 IK arm to mouth, tip wisp + exhale cloud; cigarette needs to read bigger in the fingers |
| Chains sit over the shirt all the way round, tucked under vests | ✅ neck-hugging, flush on fabric |
| Fit 0 = near skin-tight for shirts and pants, fit 1 = boxy/baggy | ✅ |
| Fabrics: cotton, jersey, denim, twill, canvas, corduroy, fleece, knit, mesh, nylon, satin, leather, suede | ✅ |
| 9 new facial hair styles, 6 new hairstyles, 7 new shoe types | ✅ |
| Low-poly face rebuild: face-dense topology, nose planes, lips, sockets, real ears, 2x painted features | ✅ (docs/evidence/face-board.png) |
| Sheet 05 trucker cap with original gothic-cross patch | ✅ |

## Characters
| Character | Status | Open issues |
|---|---|---|
| Sheet 01 – Milan Jersey | 🟡 | afro reads a bit helmet-like from the side |
| Sheet 02 – Denim Vest | 🟡 | tattoo density vs. reference; collar a little flat |
| Sheet 03 – Red Rugby | 🟡 | locs uniform length; no secondary motion |
| Sheet 04 – Camo Cargo | 🟡 | tee reads boxy at the back |
| Sheet 05 – Curly Denim | 🟡 | small hair flap near the ear at some angles |
| Trial default | ✅ | system test asset, passes the full suite |

## Body calibration (pass 2)
Measured the user-supplied low-poly base mesh (male 1.776 m, 588 tris) with `scripts/measure-reference.mjs`
(triangle-plane contour slicing) and our body with `scripts/measure-ours.mjs`. Our body was ~25% too thin front-to-back;
recalibrated so every landmark is within ~10%:

| Zone | Reference w×d (cm) | Ours before | Ours now |
|---|---|---|---|
| ankle | 9×11 | 7×7 | 9×10 |
| calf | 15×17 | 11×12 | 15×17 |
| thigh | 20×24 | 15×16 | 20×22 |
| waist | 36×22 | 31×18 | 36×22 |
| chest | 34×25 | 29×18 | 34×25 |
| upper arm | 14×17 | 13×12 | 14×16 |
| head | 18×21 | 15×20 | 16×20 |
| leg spacing | ±11.5 | ±9 | ±11 |

The reference file stays in Downloads (licence not reviewed); nothing from it is copied into the repo.

## Reference workflow notes
- MPFB2 needs Blender (not installed here) and Quaternius bases would replace a working rig/body; the procedural
  base already gives a controllable, parameterised body on our own rig. Decision: keep it and borrow their
  *workflow* (spec → flat silhouette → clothing from body topology → morph validation → animation deformation →
  rig validation → export → multi-view compare).
- Style must hold with the retro pipeline off (`pipeline: clean`); evidence includes clean renders.
