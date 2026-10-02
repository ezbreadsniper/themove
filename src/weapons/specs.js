/**
 * Weapon specs: original, unbranded low-poly designs described as boxes plus sockets.
 *
 * Weapon space: +Z toward the muzzle, +Y up, and the shooter's right is −X (the same handedness as the
 * character, who faces +Z with the right side at −X). Units are metres.
 *
 * Each box is [name, center, size, part?, pitchDeg?]: part selects the material ('metal', 'polymer',
 * 'accent') and moving parts are their own nodes ('slide', 'bolt', 'mag').
 * Sockets:
 *   grip     right palm contact; rightHand = { fingers, palm } directions for the right hand there
 *   supportSlide  how far (m, toward the receiver) the support hand may slide on short arms
 *   support  left palm contact; leftHand = { fingers, palm }
 *   muzzle, ejection, magazine, sight (rear sight / optic centre), butt (stock heel, long guns)
 * travel: how far the slide / bolt moves back when cycled (m), magDrop: magazine eject distance (m).
 * mount: where the weapon rides when stowed (pistol holster on the right hip, long guns slung at the
 *   right hip), as the grip socket's offset from a bone at 1.78 m plus the weapon's forward / up there.
 */
export const WEAPONS = {
  pistol: {
    kind: 'pistol',
    boxes: [
      ['slide', [0, 0.024, 0.07], [0.027, 0.03, 0.19], 'metal'],
      ['frame', [0, -0.002, 0.075], [0.025, 0.022, 0.15], 'polymer'],
      ['grip', [0, -0.055, -0.004], [0.029, 0.1, 0.044], 'polymer', -14],
      ['guard', [0, -0.03, 0.05], [0.008, 0.032, 0.048], 'polymer'],
      ['mag', [0, -0.07, -0.006], [0.024, 0.09, 0.034], 'metal', -14],
      ['magBase', [0, -0.118, -0.018], [0.03, 0.012, 0.048], 'polymer', -14],
      ['frontSight', [0, 0.043, 0.158], [0.005, 0.008, 0.008], 'accent'],
      ['rearSight', [0, 0.043, -0.012], [0.02, 0.008, 0.01], 'metal'],
    ],
    moving: { slide: ['slide', 'frontSight', 'rearSight'], mag: ['mag', 'magBase'] },
    sockets: {
      grip: [-0.017, -0.048, -0.012],
      support: [0.019, -0.056, -0.004],
      muzzle: [0, 0.022, 0.168],
      ejection: [-0.015, 0.03, 0.07],
      magazine: [0, -0.07, -0.006],
      sight: [0, 0.047, 0.0],
    },
    rightHand: { fingers: [0.32, -0.42, 0.85], palm: [1, 0, 0] },
    leftHand: { fingers: [-0.35, -0.45, 0.82], palm: [-1, 0, 0] },
    travel: 0.032,
    magDrop: 0.14,
    rounds: 15,
    mount: { bone: 'Hips', grip: [-0.215, 0.035, -0.035], forward: [0, -1, 0.1], up: [0.1, 0, 1] },
  },
  smg: {
    kind: 'longgun',
    boxes: [
      ['receiver', [0, 0, 0.04], [0.034, 0.06, 0.26], 'metal'],
      ['barrel', [0, 0.008, 0.22], [0.016, 0.016, 0.1], 'metal'],
      ['handguard', [0, -0.004, 0.155], [0.04, 0.046, 0.1], 'polymer'],
      ['stock', [0, -0.012, -0.2], [0.03, 0.05, 0.22], 'polymer'],
      ['grip', [0, -0.068, -0.04], [0.028, 0.08, 0.036], 'polymer', -16],
      ['mag', [0, -0.1, 0.06], [0.022, 0.15, 0.034], 'metal', 8],
      ['optic', [0, 0.045, 0.02], [0.022, 0.03, 0.07], 'accent'],
      ['bolt', [-0.019, 0.016, -0.03], [0.008, 0.01, 0.022], 'metal'],
    ],
    moving: { bolt: ['bolt'], mag: ['mag'] },
    sockets: {
      grip: [-0.016, -0.06, -0.048],
      support: [0.017, -0.03, 0.16],
      supportSlide: 0.05,
      muzzle: [0, 0.008, 0.272],
      ejection: [-0.018, 0.012, 0.05],
      magazine: [0, -0.1, 0.06],
      sight: [0, 0.062, 0.0],
      butt: [0, -0.016, -0.31],
    },
    rightHand: { fingers: [0.3, -0.45, 0.84], palm: [1, 0, 0] },
    leftHand: { fingers: [-0.75, -0.25, 0.6], palm: [-0.55, 0.83, 0] },
    travel: 0.045,
    magDrop: 0.2,
    rounds: 30,
    mount: { bone: 'Hips', grip: [-0.235, 0.06, -0.06], forward: [0.18, -0.85, -0.5], up: [-0.95, -0.1, 0.1] },
  },
  rifle: {
    kind: 'longgun',
    boxes: [
      ['receiver', [0, 0, 0.0], [0.032, 0.062, 0.26], 'metal'],
      ['stock', [0, -0.014, -0.25], [0.036, 0.072, 0.25], 'polymer'],
      ['handguard', [0, 0.002, 0.26], [0.046, 0.052, 0.28], 'polymer'],
      ['barrel', [0, 0.006, 0.5], [0.016, 0.016, 0.2], 'metal'],
      ['grip', [0, -0.07, -0.05], [0.028, 0.082, 0.036], 'polymer', -18],
      ['mag', [0, -0.1, 0.07], [0.024, 0.14, 0.062], 'metal', 10],
      ['optic', [0, 0.056, 0.02], [0.03, 0.038, 0.09], 'accent'],
      ['bolt', [-0.02, 0.022, -0.1], [0.012, 0.012, 0.026], 'metal'],
    ],
    moving: { bolt: ['bolt'], mag: ['mag'] },
    sockets: {
      grip: [-0.016, -0.062, -0.058],
      support: [0.021, -0.03, 0.19],
      supportSlide: 0.08,
      muzzle: [0, 0.006, 0.6],
      ejection: [-0.017, 0.016, 0.02],
      magazine: [0, -0.1, 0.07],
      sight: [0, 0.078, 0.0],
      butt: [0, -0.014, -0.375],
    },
    rightHand: { fingers: [0.28, -0.45, 0.85], palm: [1, 0, 0] },
    leftHand: { fingers: [-0.75, -0.25, 0.6], palm: [-0.55, 0.83, 0] },
    travel: 0.07,
    magDrop: 0.25,
    rounds: 30,
    mount: { bone: 'Spine2', grip: [-0.13, 0.04, -0.19], forward: [0.55, -0.83, 0], up: [0, 0, -1] },
  },
};

export const WEAPON_TYPES = Object.keys(WEAPONS);
