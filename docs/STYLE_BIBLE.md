# Character Style Bible — "The Move"

Target: an early-2000s console character (PS2 era, with a little PS1 grit) rendered in Three.js.
Characters look **modelled and textured by hand for a 2001 console**. They are not modern stylized
toon models and they are not photoreal.

References (style only, nothing copied): `IMG_0082` (two boys on grass), `IMG_0083` (blue
character-select menu), `IMG_0084` (store aisle, back view), `IMG_0085` (fisheye dithered kitchen),
`IMG_0086` (street, baggy denim). Likeness sheets: `IMG_0095`, `IMG_0098`, `IMG_0099`.
Text, logos, watermarks and UI in those images are ignored.

## 1. Proportions

| Measure | Value | Note |
|---|---|---|
| Height | 1.72–1.86 m (default 1.78) | 1 unit = 1 m, Y up, faces +Z |
| Heads tall | ~7.0 | a slightly big head reads better at low res |
| Shoulder width | 0.42–0.48 m | squared-off shoulders, no slope |
| Hands | 10–15% oversized | chunky mitten-like fingers so they read |
| Feet/shoes | 15–25% oversized | shoes are a silhouette element |
| Neck | short and thick | |
| Bind pose | A-pose, arms ~50° down | matches the sheets and deforms better at the shoulders than a T-pose |

Clothing is **oversized**: tees hang past the belt line with wide sleeves, jeans are at least 1.6× leg
width with a stacked hem, shorts end below the knee.

## 2. Polygon density (triangles)

| Part | Budget |
|---|---|
| Head + ears + nose | 350–500 |
| Body (visible skin only is kept) | 900–1300 |
| Hands (each) | 60–120 |
| Hair | 150–1800 (locs are the expensive case) |
| Shirt / vest | 300–600 |
| Pants / shorts | 300–500 |
| Shoes (pair) | 150–300 |
| Accessories | ≤ 300 |
| **Whole character** | **2.5k–5k** (hard cap 6k) |

Limbs use 8 sides, the torso 12, the head 14. Silhouettes are allowed to look faceted. Normals are
smooth inside a part and hard at hems and sole edges.

## 3. Face and hair language

- Faces are **painted into the texture**. Eyes, brows, lips and nostrils are texture work. Geometry only
  gives brow ridge, nose wedge, cheekbones, jaw and chin.
- Eyes: dark iris, off-white sclera that is never pure white, a heavy upper-lid line, and no catchlight.
  The slightly dead stare is intended ("uncanny but readable").
- Brows are thick and dark. At 64 px tall on screen the face has to show 2 eyes, 2 brows, a nose shadow and a mouth line.
- Hair is a **chunky shell**: a close cap for afros and fades, and separate prism strands for locs. It uses
  a noisy strand texture with dark roots. Hairlines are jagged, not smooth.

## 4. Clothing shape language

- Tubes over tubes: every garment is a loft offset from the body, never shrink-wrapped.
- Hems are thick (a doubled ring) and sleeves flare out at the opening.
- Denim: stonewash fade on the thighs and seat, whiskers at the crotch, stacked hem folds.
- Details that matter at distance live in the **texture** (seams, pockets, piping, studs, prints). Geometry
  is reserved for silhouette: collars, cuffs, hoods, cap brims and chains.

## 5. Textures

| Texture | Size | Filter |
|---|---|---|
| Skin (body + head, one atlas per character) | 256×256 | Nearest |
| Garments | 128×128 each | Nearest |
| Hair | 64×64 | Nearest |
| Accessories | 32–64 | Nearest |

- Textures are generated procedurally from the character seed with our own rasterizer (not Canvas2D),
  so they are deterministic and byte-identical in the browser and in Node.
- Every texture gets **grain** (±4–10% value noise) and **block noise** (4×4 JPEG-like cells) so it
  looks compressed.
- No mipmaps, so texels crawl a little in motion. That is intended.

## 6. Palette

Saturated primaries on garments, gritty and faded everywhere else. Blacks are never pure: the darkest
value is `#141414` and the brightest is `#ecebe6`.

| Role | Colors |
|---|---|
| Skin ramp | `#f1c9a5` `#e0ac86` `#c68a62` `#9d6a45` `#7a4a2c` `#5b3520` `#3f2416` |
| Hair | black `#161210`, dark brown `#3a2518`, ash blonde `#c7ad6a`, honey `#b8924a` |
| Denim | light wash `#8fa6c1`, mid `#4c6788`, grey stonewash `#8a8e8c`, raw `#26324a` |
| Garment accents | rugby red `#c8231f`, tee black `#1b1b1d`, white `#e4e2dc`, gold `#d4a93c` |
| UI / menu | select blue `#1414d8`, text grey `#d9d9e4`, highlight yellow `#e6d34a` |

## 7. Lighting and post-processing

- One warm key light, a cool sky/ground hemisphere and a flat ambient floor. No shadows on the character,
  only a blob shadow under the feet (a PS2-era trick).
- Lambert (diffuse only) materials with no specular, except a tiny sheen on sunglasses and gold chains.
- Post pipeline (`src/render/retro-pipeline.js`):
  1. Render at a **low internal resolution** (default 480 px tall, `ps1` preset 240).
  2. Quantize to **15-bit color** (5 bits per channel) with a **4×4 Bayer dither**.
  3. Apply a slight gamma lift, saturation +10%, and a faded black point.
  4. Upscale with **nearest filtering** so the pixels stay visible.
  5. Optional: linear fog, and vertex snapping for PS1 wobble (off by default).

## 8. Camera and presentation

- Gameplay: a third-person camera about 3.2 m behind, eye height 1.7 m, FOV 55°.
- Character select (IMG_0083): full body, orthographic-like FOV 25°, saturated blue backdrop, the
  character slightly left of center, and a nameplate under the feet.
- Turnaround sheet: a flat `#c4c4c4` background with front, side, three-quarter and back views, like the likeness sheets.
