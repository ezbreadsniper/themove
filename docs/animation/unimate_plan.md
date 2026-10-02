# UniMate integration plan

Repository: https://github.com/Friedrich-M/UniMate

## Status
- **Blocked:** UniMate sampling needs a CUDA GPU, and this machine has none. Nothing has been generated yet, and no UniMate clip ships.
- **Ready and tested:**
  - the skeleton matches UniMate's `mixamo` object type joint for joint (`CORE_JOINTS`, `tests/unimate.test.js`);
  - `tools/unimate_export_motion.py` decodes UniMate `.npy` features into `unimate-global-v1` JSON;
  - `src/unimate/bridge.js` converts that JSON both ways: UniMate → our clip, and our clip → UniMate ground truth for in-betweening and editing;
  - the same interchange is the last step of `src/anim/retarget.js`, so UniMate motion gets the identical rest alignment and clean-up as Mixamo imports.

## When a GPU is available
1. Sample, in this order: locomotion variations (walk and run styles), idles, turns, start/stop transitions, gestures, combat movement, weapon-ready movement.
2. **In-betweening:** export our keyed clips with `unimateMotionFromClip` as constraints, and let UniMate fill transitions (for example aim → sprint).
3. **Decode:** `python tools/unimate_export_motion.py --motion … --out clip.unimate.json`.
4. **Convert:** `clipFromUnimateMotion` → `cleanRetargetedClip`, then add a provenance record (`source: 'unimate'`, model version, prompt or seed).
5. **Gate every generated clip with the same tests as procedural clips:**
   - no pops (< 40°/frame);
   - loop seam < 0.5°;
   - feet above the floor;
   - foot-slide check (`tests/locomotion.test.js` pattern);
   - all 12 body variants;
   - with weapons: hands < 1 mm from their sockets after re-solving the arm IK over the generated upper body.
6. **Manual review:** contact sheets (`scripts/clip-sheet.mjs`) from three cameras.

Nothing generated is treated as production-ready until it passes all of the above.
