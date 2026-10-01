# Clothing construction notes

This is the research behind the clothing pipeline in `src/garment/` and the ways each idea is applied to the
procedural low-poly garments. This environment's egress proxy blocks the official Marvelous Designer (MD) support
pages, so the MD figures below come from search-index extracts of those pages and the MD user guide (sources at
the end). Every number used in code is repeated next to the constant that uses it.

## 1. Pattern drafting (what a garment *is*)

A garment is a set of flat pattern pieces joined by seams. In 3D, the cross-section at each height is the sum of
the pattern widths at that height, so the pattern decides the fit. Gravity and collisions only decide how that
fabric lies.

**Trouser block** (the base for every legwear item):

| Measure | Rule used | In code |
|---|---|---|
| Seat line | widest hip/seat girth; ¼ seat + ease per front piece | `draftTrousers` → `seatQ` |
| Front crotch extension | ≈ ¼ seat × 0.4 (10–12% of seat girth) | `frontExt` |
| Back crotch extension | ≈ hip × 0.3 / 2: longer than the front, because the back needs room for the buttocks | `backExt` |
| Back piece | wider than the front by ~2 cm each side; back rise raised, front crotch lowered | `backQ` |
| Knee | ½ knee girth + 1 cm ease per piece, plus the fit class's ease | `kneeW` |
| Hem (leg opening) | set by the fit class (see §5), not by the leg | `hemW` |
| Inseam length | crotch → floor minus the class's clearance (break, crop, gather) | `inseam` |
| Seam allowance | 1 cm on seams, 3–4 cm on hems (the folded hem gives the edge its thickness) | `SEAM`, `HEM_TURN` |

Jeans add a back **yoke** (it replaces the back darts), **flat-felled** inseams (a double-stitched ridge), a
**fly front** (left fly facing and right fly shield, J-stitch), five-pocket construction (front scoops, coin
pocket, back patch pockets), belt loops, and a doubled (turned twice) hem.

**Darts** take out a wedge of fabric to fit a curve, such as a bust, the small of the back or a seat. In low
poly we do not model the dart. The *shape* it produces is baked into the cross-section (the ring follows the
bust or seat), and the stitch line goes in the texture.

**Pleats** are fabric folded on itself and stitched at the top. They add girth below the stitch line, such
as a skirt's sweep or a trouser's pleated front. A pleat adds silhouette (the ring radius grows below it) and a
faceted fold line (geometry ridges for knife pleats, texture lines for pressed trouser pleats).

**Waistbands** are a doubled strip, interfaced and cut straight, that stands slightly proud of the body. On
joggers they are a channel with elastic and drawcord. **Cuffs/ribbing** are a tube of rib knit cut 10–20%
smaller than the opening it is sewn to. The opening is gathered into it, so the fabric above blouses over.

## 2. Sewing relationships

Each seam joins two piece edges of equal length, and when the lengths differ the surplus becomes ease or a
gather. The draft records seams as `{ a: [piece, edge], b: [piece, edge], kind }` (kinds: plain, flatFelled,
overlock, topstitched, elastic gather). In the runtime meshes:

* side seam and inseam → the loft angles where the texture draws stitch lines;
* crotch seam → the pants waist loft's front/back centre;
* hem → the folded lip rings at the bottom of the leg (2 rings, with the turn depth from the pattern);
* elastic seam → the ratio of cuff length to opening length, which sets how much the jogger leg gathers.

MD's **Auto Sewing** pairs edges of matching lengths on pieces that sit next to each other around the avatar's
arrangement points. Our equivalent is static: a draft emits its seam list, and `validatePattern()` checks that
paired edges match within the seam's tolerance. A mismatch is reported as an unintentional gather, the
procedural version of a sewing error.

## 3. Arrangement, simulation and fit inspection (MD workflow → our pipeline)

| MD concept | MD figure | Our equivalent |
|---|---|---|
| **Particle Distance** (mesh resolution of the sim) | ~20 mm while draping and fitting, ≤5 mm for final quality | The sim mesh uses ~16–20 mm spacing (24 sides around a leg). It is never shipped. The runtime mesh is resampled to 10–12 sides. |
| **Avatar Skin Offset** (invisible collision buffer on the body) | 3 mm default | `SKIN_OFFSET = 0.003` on leg and shoe colliders |
| **Collision thickness** of the fabric | 1.5 mm per side (3 mm total) by default | per-fabric `thickness` in `FABRIC_PHYSICS` (jersey 1 mm … denim 1.6 mm … puffer 12 mm); half of it is added to collisions |
| **Fold Arrangement** (pre-fold cuffs, collars and seam allowances before simulating, for stability) | rotate an internal line before sim | hem turn-ups and collars are generated already folded (lip rings), never simulated into a fold |
| **Roll Up** (roll a sleeve or pant opening n times) | 1+ rolls, 10–200 mm each | `bottom.cuff` (turn-up height) builds rolled rings with the right number of fabric layers |
| **Fold Pattern** (fold angle 0–360°, 180 = flat; strength 0–20) | | pleat ridges and stack folds have an explicit fold angle and strength per class |
| **Elastic** on a seam | shrink ratio | `cuff.gather` (opening ÷ rib length) drives the jogger blouse |
| **Fit Map / Strain map** (stretch % vs the rest pattern) | red = high stress | `drapeLeg()` reports per-ring strain. Tests fail when it exceeds the fabric's stretch limit. |
| **Layer Clone** (copy a garment as an outer layer with matching seams, offset outward) | | outer garments rebuild from the same ring table with a layer offset (`LAYER_GAP`) |
| **Fabric physical properties** (stretch weft/warp, bending, buckling, density) | presets per fabric | `FABRIC_PHYSICS`: stretch, bend stiffness, weight; these drive the drape solver |

Workflow order (the same as MD): **pattern → sewing → arrangement → fabric → simulate → fit map → fix pattern →
retopologize → transfer weights → export → test in game.** MD keeps the high-resolution simulation and the
game mesh separate, and so do we. `drapeLeg()` runs a particle sim on a dense tube, and `resampleDrape()` bakes
it onto the low-poly ring layout. Only the low-poly result is skinned and exported.

## 4. How garments hang

* **Support points**: tops hang from the shoulder line (shoulderTop ring) and rest on the chest and bust. Below
  the chest a loose top falls straight down (no waist taper) and is not shrink-wrapped. Trousers are held by
  the waistband at the iliac crest and the seat. Below the seat they hang from the thigh's widest point and
  only touch the knee and shin at the front when the wearer is standing. Skirts hang from the waistband and
  clear the pelvis/seat, then fall on their sweep.
* **Gravity** pulls loose fabric straight down from the last support. That is why a wide trouser leg is
  straight from the seat, and why an oversized tee is boxy rather than following the waist.
* **Sleeves** follow the arm with air at the elbow. When the arm bends, the inside of the elbow compresses
  (folds) and the outside stretches, so long sleeves need ease at the elbow.

## 5. Pants on shoes (the hem rules)

From tailoring practice:

* **Break** is the fold where the trouser front rests on the shoe. *No break*: the hem just touches the shoe
  top and suits slim or tapered legs. *Half break* (the default for medium 18–20 cm openings): the hem is
  ~1–2 cm longer than the shoe top, with a single soft fold in front and the back reaching mid heel counter.
  *Full break*: deeper fold, back reaching well down the heel, for wide openings.
* A **wide opening** (≥ 23 cm flat) that hovers above the shoe looks wrong. Wide legs must cover more of the
  shoe and keep a readable opening around it.
* **Jeans** are heavy (12–16 oz denim): stiff, so excess length *stacks* into 2–3 horizontal folds above the
  ankle instead of collapsing. The double-turned hem is ~1 cm and visibly thick.
* **Joggers** have an 8–10 cm rib cuff about 20% smaller than the leg. The leg blouses over it, and the cuff
  sits on or just above the shoe collar.
* **Cropped** trousers end at a deliberate height: ankle bone (9/10 length) or mid shin (culotte), never at a
  random height. The sock or ankle should show.
* **Skirts and dresses**: the hem must clear the shoe and the thigh in motion. A long hem is cut so it can
  swing forward of the leading shin.

Shoes are colliders, not parents. The hem rests on the shoe's upper because the drape solver collides it with
the shoe collision volume (`shoeCollider()`, built from the same spec as the shoe mesh). In animation the hem
is skinned mostly to the shin. Only the vertices actually lying on the instep get a partial Foot weight, the
low-poly stand-in for "fabric resting on the foot moves with it". The penetration and floating tests check
the result in every gameplay clip.

## 6. Low-poly translation rules

* Silhouette details are modelled (cuffs, collars, hoods, stacked folds, the hem lip, cargo pockets).
  Details smaller than one runtime ring spacing (~3 cm) go in the texture (stitch lines, pocket openings, fly
  J-stitch, belt loops, rib lines, piping).
* Keep only the folds that read at gameplay distance: the break, the stack, knee and elbow, the waistband
  roll, and the cuff blouse. Sim noise below ~5 mm is discarded by resampling to the runtime rings.
* Every garment has a hard triangle budget (see `GARMENT_REGISTRY`), and the whole character stays within the
  style bible's 6k cap.

## Sources

* Marvelous Designer support: [Particle Distance Setting](https://support.marvelousdesigner.com/hc/en-us/articles/47358268602777-Particle-Distance-Setting),
  [Avatar Skin Offset Setting](https://support.marvelousdesigner.com/hc/en-us/articles/47358339835929-Avatar-Skin-Offset-Setting),
  [Auto Sewing](https://support.marvelousdesigner.com/hc/en-us/articles/47358149073305-Auto-Sewing-Ver-2025-0),
  [Fold Arrangement](https://support.marvelousdesigner.com/hc/en-us/articles/47358260153881-Fold-Arrangement),
  [Roll Up](https://support.marvelousdesigner.com/hc/en-us/articles/47358444385689-Roll-Up-ver-12-2),
  [Fold Pattern](https://support.marvelousdesigner.com/hc/en-us/articles/47358354961049-Fold-Pattern),
  [Strain Map](https://support.marvelousdesigner.com/hc/en-us/articles/56518392287513--Fit-Maps-Strain-Map),
  [Garment Fit Maps](https://support.marvelousdesigner.com/hc/en-us/articles/47358286228505-Garment-Fit-Maps),
  [Collision Thickness](https://support.marvelousdesigner.com/hc/en-us/articles/47358430412441-FABRIC-PHYSICAL-PROPERTIES-Adjust-Collision-Thickness),
  [MD User Guide 2024](https://s3.marvelousdesigner.com/newmdweb/case/20240626/MD+User+Guide+2024.pdf)
* Pattern drafting: [The Shapes of Fabric: basic pants](https://www.theshapesoffabric.com/2020/08/16/learn-how-to-draft-the-basic-pants-pattern/),
  [Sewing for a Living: men's pants](https://sewingforaliving.com/how-to-draft-a-mens-pants-pattern-from-scratch/),
  [M. Müller & Sohn: pleat-front trousers](https://www.muellerundsohn.com/en/allgemein/pattern-pleat-front-trousers/)
* Breaks: [Proper Cloth: pant break](https://propercloth.com/reference/what-is-pant-break/),
  [Caprice Bespoke: trouser break](https://capricebespoke.com/blogs/mens-style-guides-italian-elegance/trouser-break-practical-guide)
* Rib cuffs: [MZ Global: jogger waistband and rib guide](https://www.mzglobaltrading.com/knowledge/jogger-waistband-guide/)
