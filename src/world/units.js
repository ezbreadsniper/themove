/**
 * World scale and the player-facing dimensions every architectural piece is built against.
 * 1 unit = 1 m, Y up. These match the character rig (default height 1.78 m).
 */
export const PLAYER = Object.freeze({ radius: 0.3, height: 1.8, stepUp: 0.36, snapDown: 0.45, eye: 1.62 });

/** Stairs must be climbable by PLAYER.stepUp with margin and read as real stairs at 1.78 m. */
export const STAIR = Object.freeze({ maxRise: 0.22, minRun: 0.25, headroom: 2.05, railHeight: 0.95 });

export const DOOR = Object.freeze({ width: 0.92, height: 2.13, frame: 0.06, threshold: 0.02 });

/** Common furniture heights the characters are checked against. */
export const FURNITURE = Object.freeze({ counter: 0.91, table: 0.42, seat: 0.43, sofaBack: 0.78, bed: 0.5, console: 0.48 });

/** Texel density targets (texels per metre) for world textures; see docs/world/STYLE_BIBLE.md. */
export const TEXEL_DENSITY = Object.freeze({ architecture: 80, ground: 32, props: 160 });
