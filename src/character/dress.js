/**
 * One-piece dresses are composed from the existing garment builders: a fitted bodice (strap top or tee)
 * ending at the natural waist and a skirt starting just above it, in one fabric and colour. The waist
 * seam is where real dresses join bodice and skirt, so the two pieces read as one garment, and every
 * system that works for tops and skirts (layering, skirt correctives, animation, export) applies.
 */
export function expandDress(def, layout) {
  const d = def.dress;
  if (!d) return def;
  const m = layout.measures;
  const k = m.height / 1.78;
  const waistY = layout.world.Spine.y + 0.035 * k;
  const shared = { color: d.color, accent: d.accent, pattern: d.pattern === 'plain' ? undefined : d.pattern };
  const top = {
    type: d.bodice,
    fit: d.fit,
    length: (m.hipsY - (waistY - 0.035 * k)) / k,
    sleeve: d.bodice === 'tee' ? d.sleeve : 'none',
    collar: 'crew',
    fabric: d.fabric,
    ...shared,
    pattern: shared.pattern ?? 'plain',
  };
  const bottom = {
    type: 'skirt',
    skirtStyle: d.skirtStyle,
    skirtLength: d.skirtLength,
    rise: (waistY - m.hipsY) / k,
    fit: d.fit,
    kind: d.fabric,
    wash: 0,
    whiskers: false,
    dressSkirt: true,
    ...shared,
    pattern: shared.pattern ?? 'none',
  };
  return { ...def, top, bottom };
}
