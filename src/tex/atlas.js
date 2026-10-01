/** Skin atlas layout (UV rects [u0, v0, u1, v1]) shared by body, head, hands and feet. */
export const SKIN_ATLAS = {
  head: [0, 0.5, 1, 1],
  torso: [0, 0.25, 0.5, 0.5],
  armL: [0.5, 0.25, 0.75, 0.5],
  armR: [0.75, 0.25, 1, 0.5],
  legL: [0, 0, 0.25, 0.25],
  legR: [0.25, 0, 0.5, 0.25],
  hand: [0.5, 0.125, 0.75, 0.25],
  foot: [0.75, 0.125, 1, 0.25],
  ear: [0.5, 0, 0.625, 0.125],
  misc: [0.625, 0, 1, 0.125],
};

export const SKIN_SIZE = 256;

/** Converts an atlas rect to pixel bounds on a raster of `size`. */
export function rectPx(rect, size = SKIN_SIZE) {
  const [u0, v0, u1, v1] = rect;
  return { x: u0 * size, y: v0 * size, w: (u1 - u0) * size, h: (v1 - v0) * size };
}
