# Animation sources and licences

Every clip in the game must appear here with its source and licence.

## Shipped clips

| Clips | Source | Author | Licence |
|---|---|---|---|
| All 64 base clips in `src/anim/clips.js`, `src/anim/gait.js`, `src/anim/base-extra.js` | Original procedural animation (code-generated keyframes and IK) | this project | Project-owned |
| All 111 weapon clips in `src/anim/weapon-clips.js` (pistol, rifle, SMG × 37) | Original procedural animation (timelines + two-hand IK) | this project | Project-owned |
| Weapon models in `src/weapons/specs.js` | Original unbranded low-poly designs | this project | Project-owned |

**No third-party motion has been imported.** No clips have been ripped from games or creators.

## Rules for importing
- **Mixamo:** use only clips downloaded by the team under Adobe's current Mixamo terms. Check those terms at download time and record the date. Raw Mixamo files must not be redistributed as standalone assets; ship only the retargeted, baked clips inside the game.
- **Animation packs and mocap:** only with a licence that allows use in a commercial game. Record the licence URL and the purchase or download record.
- **UniMate output:** generated motion is cleaned and validated like any import. Check the UniMate repository's licence before any commercial use of models or outputs.
- **Enforced in code:** `retargetClip()` refuses a clip without `license.licence`. The licence travels in `clip.userData.provenance`, so it can be audited from any exported file.

## Import log

| Date | Clip | Source file | Licence record | Retargeted by | Notes |
|---|---|---|---|---|---|
| — | none yet | | | | |
