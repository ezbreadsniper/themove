# Character gauntlet log

One entry per pass: what was inspected, what failed, what changed, how it was verified, what is next.
Clothing-pipeline handoff notes live in `clothing_gauntlet_status.md`; evidence images in `docs/evidence/anatomy/`.

Review tooling: `node scripts/body-strip.mjs <out.png> <presetId> '<json overrides>' --zone=hips|shoulders|torso|head|legs --yaws=0,90 --clip=walk --time=0.35 --view=clay|wire|silhouette --preset=clean --hide=hair,top`.
Pass `'{"top":null,"bottom":null,"socks":null}'` to inspect the bare base mesh.

---

## Pass A1: pelvis, thigh junction, glutes (sheet 06 base body)

**Inspected:** bare base mesh at 6 yaws, hip zone in wire, clay and textured views, walk/run/crouch/sit, and the open-edge count of the welded body mesh (`scripts/tmp/holes.mjs`).

**Failed:**
- The legs were separate tubes pushed into the torso, with no shared vertices. That left a visible seam at the hip line and a "pasted-on" read from every angle.
- The glutes were a shelf over thin legs, with a full-circumference crease under them.
- After the first rebuild, a flat crotch bridge 18 cm wide read as a shelf under the buttocks.
- A crack under the right glute in every pose. The thigh top-loop seam vertex was emitted twice at different positions (θ = −π vs +π fell into different branches).
- The gluteal cleft was 67 mm deep.
- A hard shading line ran all round the hips. The seat ring and the thigh loops were 1 cm apart, and that sliver band packed the whole normal change into one line.

**Changed (`src/geo/parts/body.js`):**
- Trouser topology for bare legs. Each thigh's top loop is the outer half of the seat ring plus a midline crotch seam: pubic front → crotch → gluteal cleft. The torso halves are zipped to the loops with bridge triangles. These copy the weights, use torso UVs, and share positions, so normals weld.
- The bare torso ends at the hip ring. The seat ring only shapes the thigh loops.
- The glute lower lobe continues onto the upper thigh and ends at a real gluteal fold. The widest hip point moved down to trochanter level. The skin cleft is shallower (cloth bridging is unchanged).

**Verified:** 0 open edges in the pelvis. Clay renders show one continuous surface. Walk and run deform cleanly. 453/453 tests pass.
Evidence: `pass1-before-full.png`, `pass1-after-full.png`, `pass1-after-hips.png`, `pass1-poses-walk-run-crouch-sit.png`.

**Still open:** crouch and sit fold the thigh top with a hard edge, and the glutes go angular. These need hip-flexion correctives (see A4).

## Pass A2: shoulders and bust

**Failed:**
- The trapezius ring sat 9 mm above the shoulder ring, giving a flat shelf ("box shoulders").
- The torso shoulder corners and the arm tube's open top poked through the deltoid as spikes.
- The bust read as a cone from the side: the upper-pole curve kinked at the apex, and there was no ring between the apex and the upper chest.

**Changed:**
- The skin shoulder ring drops toward the acromion (`shoulderSlope`) and sits inside the deltoid.
- The arm is 10-sided, and its open top is sunk into the torso.
- The bust upper pole uses a smoothstep. A new `bustHigh` ring sits between the apex and the upper chest; tops sample it too, so fabric follows.

**Verified:** shoulder close-ups at 4 yaws. Tee, tank and cami at 0/60/90° show no skin through the top. 453/453 tests pass.
Evidence: `pass1-after-shoulders.png`, `pass1-after-silhouette.png`.

## Pass C1: trouser seat blob (sheet 06 cutoffs) and the jeans hem in the shoe

**Failed:**
- The cutoffs showed a pale diamond "patch" under the back waistband. The trouser waist section bulged between the leg tubes, which form the glute lobes, then stepped straight into a narrow crotch ring.
- `tests/fit.test.js` failed on this machine: the jeans hem sank 8.2 mm into the shoe heel in the rest pose. The ring seam vertex was copied after the collision pushes, and the turned-hem diagonal `hem[q] → inner[q+1]` was never collision-checked.

**Changed (`src/geo/parts/garments.js`):**
- The waist back is tucked under the tubes, and an under-seat ring carries the fabric down to the crotch seam. The seat now reads as a back-seam valley.
- Hem rings share their seam vertex. The lip diagonal and the triangle centroids are collision-checked.

**Verified:** shoe depth is 0.0 mm and poke-through is 0% in all 13 audit poses, across the base, slim, woman, heavy and wide-hips bodies. 453/453 tests pass.
Evidence: `pass1-shorts-seat.png`.

---

## Pass A4: joint-volume correctives (hips, knees)

**Failed:**
- Crouch and sit folded the groin flat and made the glutes angular. Linear blend skinning pulls half-weighted vertices toward the joint. At 100° hip flex, the blend zone sat at 92.6% of its rest distance.

**Changed:**
- `src/rig/body-correctives.js` bakes, per driver pose, the difference between LBS and a rigid rotation by each vertex's weighted share of the bend (DQS-style) as a bind-space morph target. Drivers: hip flex 45/95/130, hip extend 35, knee 70/130, both legs. They run through the existing `updateCorrectives` (Stage.update).
- GLB extras now carry every mesh's corrective driver table. The export script no longer crashes on `presets/meta.json`.

**Verified:** the blend zone holds 100.7% of rest at 100° (test). All 8 presets export and re-import. Evidence: `passA4-crouch-sit.png`.

## Pass A3: leg landmarks

**Failed:** the legs were plain tubes in silhouette: no knee, a weak calf, and no medial/lateral asymmetry.

**Changed:** the leg stations carry anatomical bumps. These cover the vastus lateralis and adductors, the vastus medialis (inner knee), the patella and popliteal hollow, the tibial tuberosity, the gastrocnemius (medial head larger and lower), and the malleoli. Landmarks apply only to skin below any hem, because garment colliders use the plain stations.

**Regression caught and fixed:** the knee corrective pushed skin 11% through knee-length shorts (jump/sit). Body correctives now fade out 2 cm below a trouser hem and are off under skirts. A new test gates shorts poke at 0 on the base, woman and heavy bodies.

**Skirt baseline note:** on this machine the agent's last commit (779504a) already shows 4–7% skin poke for A-line, flared, pleated and long pencil skirts in `sit` (and 2–4% in some crouches). That's not the 0% in `clothing_gauntlet_status.md`. My passes leave the matrix exactly at that baseline. This goes into the queue below.

Evidence: `passA3-legs.png`.

---

## Queue (in order)
1. **Skirt sit poke** (pre-existing, 4–7% on this machine): add the skirt matrix to `tests/fit.test.js` as the status doc planned, then fix it.
2. **Elbow/shoulder correctives**, plus a real armpit stitch (the arm is still a tube sunk into the torso).
3. **Arms vs torso:** the arms merge into the torso in the front silhouette. Also missing: an armpit stitch like the pelvis zip, and an elbow loop.
4. Open items from `clothing_gauntlet_status.md`: tee hem over skirts in motion, skirt gates in tests, upper-body garment audit.
5. **Female body variety:** a bust/butt/waist matrix across build 0..1, with silhouette sheets per variant.
6. Head/face planes, the hairline audit, and the expanded hairstyle and womenswear libraries.
