/**
 * Legwear fit classes: how a trouser leg ends and how it meets the shoe. A class is chosen from the
 * bottom's construction (cut, cinch, length, fabric), or explicitly with `bottom.fitClass`.
 * All lengths are metres at a 1.78 m body and scale with height.
 *
 * opening      leg-opening girth target (hem circumference), metres; null = follow the leg profile
 * clearance    where the hem would hang if the shoe were not there (height above floor, back of heel)
 * excess       extra inseam length that has to stack above the shoe (jeans stack), scaled by bottom.stack
 * break        'none' | 'half' | 'full' (front fold over the instep)
 * hemTurn      depth of the turned-up hem allowance (visible thickness band inside the opening)
 * cuff         rib cuff for joggers: { height, gather } where gather = leg opening / rib length
 * simulate     true when the hem reaches the shoe, so the drape solver has to resolve contact
 */
export const LEG_FIT_CLASSES = {
  slim: { opening: 0.36, clearance: 0.055, excess: 0, break: 'none', hemTurn: 0.008, simulate: true },
  straight: { opening: 0.42, clearance: 0.03, excess: 0.012, break: 'half', hemTurn: 0.012, simulate: true },
  jeans: { opening: 0.44, clearance: 0.012, excess: 0.03, break: 'half', hemTurn: 0.01, simulate: true },
  wide: { opening: 0.58, clearance: 0.012, excess: 0.025, break: 'full', hemTurn: 0.014, hemBand: 0.25, simulate: true },
  jogger: { opening: null, clearance: 0, excess: 0.03, break: 'none', hemTurn: 0, cuff: { height: 0.07, gather: 1.35 }, simulate: true },
  cropped: { opening: 0.4, clearance: null, excess: 0, break: 'none', hemTurn: 0.014, simulate: false },
  shorts: { opening: null, clearance: null, excess: 0, break: 'none', hemTurn: 0.012, simulate: false },
};

export const LEG_FIT_CLASS_NAMES = Object.keys(LEG_FIT_CLASSES);

/** Picks the fit class for a bottom definition. */
export function legFitClass(bottom) {
  if (!bottom) return null;
  if (bottom.fitClass && LEG_FIT_CLASSES[bottom.fitClass]) return bottom.fitClass;
  const length = bottom.length ?? 'full';
  if (length === 'shorts' || length === 'cutoff') return 'shorts';
  if (length === 'cropped' || length === 'ankle') return 'cropped';
  if (bottom.cinch) return 'jogger';
  const cut = bottom.cut ?? 'straight';
  if (cut === 'wide' || cut === 'flare' || cut === 'bootcut') return 'wide';
  if (cut === 'skinny' || cut === 'tapered') return 'slim';
  if (bottom.type === 'jeans' || (bottom.kind ?? 'denim') === 'denim') return 'jeans';
  return 'straight';
}
