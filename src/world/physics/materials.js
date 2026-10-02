/**
 * Physical materials (contracts §8): surface response and how a material takes a bullet.
 *   friction / restitution  Rapier contact coefficients (combined: friction by average, bounce by max)
 *   density                 kg/m³ used when a prop gives no mass (solid volume of the collider)
 *   bullet                  fraction of a bullet's impulse transferred (soft things soak it up)
 *   spin                    extra random angular kick per unit shot impulse (rad/s per N·s / kg)
 *   toughness               bullet "damage" a breakable absorbs before it breaks (pistol = 1)
 *   breakSpeed              impact Δv (m/s) that breaks a breakable without a shot
 *   debris                  what a break leaves: 'glass' | 'ceramic' | 'wood' | 'paper' | 'electronics' | null
 *   damping                 linear, angular damping (air drag; keeps light things from skating forever)
 */
export const PHYS_MATERIALS = Object.freeze({
  glass: { friction: 0.45, restitution: 0.12, density: 900, bullet: 1.0, spin: 6, toughness: 1, breakSpeed: 5.6, debris: 'glass', damping: [0.05, 0.25] },
  ceramic: { friction: 0.6, restitution: 0.08, density: 1200, bullet: 0.9, spin: 3, toughness: 1, breakSpeed: 5.2, debris: 'ceramic', damping: [0.05, 0.3] },
  wood: { friction: 0.6, restitution: 0.15, density: 600, bullet: 0.8, spin: 3, toughness: 4, breakSpeed: 99, debris: 'wood', damping: [0.05, 0.3] },
  metal: { friction: 0.4, restitution: 0.2, density: 1500, bullet: 1.0, spin: 4, toughness: 99, breakSpeed: 99, debris: null, damping: [0.03, 0.2] },
  plastic: { friction: 0.5, restitution: 0.3, density: 500, bullet: 1.0, spin: 6, toughness: 6, breakSpeed: 99, debris: null, damping: [0.08, 0.3] },
  paper: { friction: 0.7, restitution: 0.05, density: 450, bullet: 0.7, spin: 4, toughness: 99, breakSpeed: 99, debris: 'paper', damping: [0.15, 0.6] },
  fabric: { friction: 0.9, restitution: 0.02, density: 200, bullet: 0.25, spin: 1, toughness: 99, breakSpeed: 99, debris: null, damping: [0.6, 1.5] },
  rubber: { friction: 0.85, restitution: 0.72, density: 250, bullet: 1.0, spin: 2, toughness: 99, breakSpeed: 99, debris: null, damping: [0.02, 0.15] },
  electronics: { friction: 0.55, restitution: 0.1, density: 700, bullet: 0.8, spin: 2, toughness: 2, breakSpeed: 7, debris: 'electronics', damping: [0.05, 0.3] },
  plant: { friction: 0.7, restitution: 0.05, density: 900, bullet: 0.7, spin: 2, toughness: 1, breakSpeed: 5.2, debris: 'ceramic', damping: [0.08, 0.4] },
});

/** Bullet impulse (N·s, a 9 mm round carries ~3) and damage per weapon. */
export const WEAPON_IMPULSE = Object.freeze({
  pistol: { impulse: 3.2, damage: 1 },
  smg: { impulse: 2.4, damage: 0.75 },
  rifle: { impulse: 6.5, damage: 2.5 },
  shotgun: { impulse: 9, damage: 4 },
  melee: { impulse: 6, damage: 0.5 },
  default: { impulse: 3, damage: 1 },
});

/** Render material name (world/kit/materials.js) → physical material, for carved and spawned props. */
const BY_RENDER = {
  bottleGreen: 'glass', bottleBrown: 'glass', glass: 'glass', glassDark: 'glass', lavaLamp: 'glass', mirror: 'glass', candleJar: 'glass',
  terracotta: 'ceramic', ceramic: 'ceramic', dirt: 'ceramic',
  maple: 'wood', woodDark: 'wood', cardboard: 'paper', books: 'paper', magazines: 'paper', paper: 'paper',
  steelGray: 'metal', steelBlack: 'metal', chrome: 'metal', stainless: 'metal', brass: 'metal', bronze: 'metal', galvanized: 'metal', redPaint: 'metal', yellowPaint: 'metal',
  plasticBlack: 'plastic', plasticWhite: 'plastic', plasticGrey: 'plastic', paintWhiteGloss: 'metal',
  knit: 'fabric', sage: 'fabric', mustard: 'fabric', leather: 'fabric', bedding: 'fabric', denim: 'fabric', rug: 'fabric',
  rubber: 'rubber', tv: 'electronics', case48: 'wood',
};

export function materialFor(renderName, fallback = 'plastic') {
  return BY_RENDER[renderName] ?? fallback;
}

export function physMaterial(name) {
  return PHYS_MATERIALS[name] ?? PHYS_MATERIALS.plastic;
}
