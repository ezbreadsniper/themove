/**
 * Physical fabric behaviour used by drafting and the drape solver (the procedural stand-in for Marvelous
 * Designer's fabric physical properties). Separate from `tex/fabric.js`, which only paints the surface.
 *
 * thickness  collision / rendering thickness in metres (MD default 3 mm total; 1.5 mm each side)
 * stretch    max strain the weave tolerates before it reads as "pulled" (fit-map red), fraction
 * bend       bending stiffness 0..1 (drape solver: weight of the skip-one constraints)
 * weight     relative mass per area; heavier fabric falls straighter and stacks deeper
 * buckle     how readily compression turns into outward folds (0 = crumples small, 1 = big rolling folds)
 * ease       minimum body ease a woven garment needs, metres of radius (knits can go negative)
 */
export const FABRIC_PHYSICS = {
  cotton: { thickness: 0.0012, stretch: 0.03, bend: 0.45, weight: 0.6, buckle: 0.5, ease: 0.004 },
  jersey: { thickness: 0.001, stretch: 0.25, bend: 0.2, weight: 0.45, buckle: 0.3, ease: -0.002 },
  denim: { thickness: 0.0016, stretch: 0.02, bend: 0.8, weight: 0.9, buckle: 0.85, ease: 0.006 },
  twill: { thickness: 0.0013, stretch: 0.03, bend: 0.55, weight: 0.7, buckle: 0.6, ease: 0.005 },
  canvas: { thickness: 0.0018, stretch: 0.015, bend: 0.85, weight: 0.85, buckle: 0.9, ease: 0.007 },
  corduroy: { thickness: 0.0018, stretch: 0.03, bend: 0.6, weight: 0.8, buckle: 0.65, ease: 0.006 },
  fleece: { thickness: 0.0025, stretch: 0.15, bend: 0.35, weight: 0.6, buckle: 0.55, ease: 0.004 },
  knit: { thickness: 0.003, stretch: 0.3, bend: 0.3, weight: 0.65, buckle: 0.45, ease: -0.002 },
  mesh: { thickness: 0.001, stretch: 0.2, bend: 0.2, weight: 0.3, buckle: 0.3, ease: 0 },
  nylon: { thickness: 0.0008, stretch: 0.02, bend: 0.3, weight: 0.35, buckle: 0.55, ease: 0.006 },
  satin: { thickness: 0.0007, stretch: 0.02, bend: 0.12, weight: 0.4, buckle: 0.25, ease: 0.004 },
  leather: { thickness: 0.0022, stretch: 0.01, bend: 0.9, weight: 1, buckle: 0.95, ease: 0.006 },
  suede: { thickness: 0.002, stretch: 0.015, bend: 0.75, weight: 0.85, buckle: 0.8, ease: 0.006 },
  spandex: { thickness: 0.0008, stretch: 0.6, bend: 0.1, weight: 0.3, buckle: 0.1, ease: -0.006 },
};

/** Avatar skin offset (MD default 3 mm): the invisible buffer between body/shoe colliders and fabric. */
export const SKIN_OFFSET = 0.003;

export function fabricPhysics(name) {
  return FABRIC_PHYSICS[name] ?? FABRIC_PHYSICS.cotton;
}

/** Collision margin for a fabric: skin offset plus half its thickness. */
export function collisionMargin(name) {
  return SKIN_OFFSET + fabricPhysics(name).thickness / 2;
}
