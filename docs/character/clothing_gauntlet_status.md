# Clothing gauntlet: status and handoff

Branch `claude/vibrant-curie-ant9iv` · PR https://github.com/ezbreadsniper/themove/pull/1

## Done
- **Research**: `docs/character/clothing_construction_notes.md`.
- **Pipeline** (`src/garment/`):
  - `pattern.js`: trouser draft (front/back/waistband/cuff/yoke pieces, seams, `validatePattern`, `patternSVG`).
  - `fabric-physics.js`: thickness, stretch, bend, weight and `SKIN_OFFSET` per fabric.
  - `fit-classes.js`: slim, straight, jeans, wide, jogger, cropped, shorts. Schema `bottom.fitClass` and `bottom.length: 'ankle'`.
  - `drape.js`: PBD sim (~16 mm particles, tethers, hem-band shape matching) and `resampleDrape` retopo.
  - `colliders.js` (leg) and `shoeCollider()` in `geo/parts/shoes.js`, both built from the same specs as the meshes.
  - `correctives.js`: baked pose-space morph targets with drivers. These are ankle drivers for trousers on shoes, and hip, sit, back and knee drivers for skirts. They are applied by `updateCorrectives()` in `Stage.update` and the audit.
  - `audit.js`: CPU-skinned audit with hem-vs-shoe depth, skin penetration vs exposure, front-hem float, `BODY_VARIANTS` and `AUDIT_POSES`.
  - `layers.js`: `LAYER_ORDER`, `LAYER_GAP`, `clearUnder`. The top and jacket now clear a skirt's real surface.
- **Trousers**: hems rest on and collide with the shoe. Foot weight goes only to the hem that rests on the shoe, and correctives handle ankle flex. The jogger rib cuff tapers. `tests/fit.test.js` gates 6 classes × 8 bodies × 13 poses, and the worst depth is ≤ 4 mm.
- **Skirts**: front panels follow the thighs and the back hangs. Fabric below the knee follows the shin only on long skirts. Build-time collision keeps panels clear of the legs. Long pencil skirts get a back vent, and pencil length is capped at 0.85. Thigh skin is kept under skirts.
- New `sit` clip. Evidence zones follow the pelvis. `scripts/cuff-board.mjs` and `scripts/closeup.mjs` render boards. Set `CHROMIUM_PATH=/opt/pw-browsers/chromium` in this container.
- Audit numbers (woman body): A-line, flared and pleated skirts show 0% skin penetration at lengths 0.3–0.95 in all 13 poses. Pencil skirts are 0% up to 0.8, and the ankle-length pencil is now capped.

## Open (next steps, in order)
1. **Tee hem over skirt in motion** (run/sit): the tee hem still shows shards over the skirt waistband (see the closeups in the last session). Skirt correctives now fade out under the top hem and the tee no longer leg-pulls over skirts, but the shards remain. Suspects: tee `clearUnder` vs the skirt's flare under the hem, or the skirt's upper rows' thigh share starting too high. Add a top-vs-bottom posed layer test (the `pokeThrough` pattern with the top as the garment and the skirt as the "body").
2. Add skirt gates to `tests/fit.test.js` (the `scripts/dev/skirt.mjs` matrix), plus a negative test proving `pokeThrough` catches a shrunken garment.
3. Upper body audit: shoulders, armpits, bust, elbows (sleeves) in poses. Jacket over top layering test.
4. Womenswear library (dresses, leggings, sweaters, blazers, coats, athletic, bags), each with a draft, fit class and material. Then register every garment in a `GARMENT_REGISTRY` (source pattern, material, fit class, export path) as promised in the notes.
5. GLB export: confirm the morph targets and the `correctives` driver table reach the extras (`exportableUserData` currently keeps only `slot`). Creator save/reload test for the new fields.
6. Budget: some presets already exceed the 6k style-bible cap (pre-existing, 7.4k–8.6k).

Dev probes are in `scripts/dev/` (run from the repo root, e.g. `node scripts/dev/skirt.mjs aLine 0.3,0.8 woman`).
