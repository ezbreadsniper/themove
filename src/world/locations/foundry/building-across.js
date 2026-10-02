
/**
 * The buff-brick building across Foundry St. (what the loft window looks at in the reference
 * photos): three storeys of tan brick with pointed-arch windows in stone surrounds, a base course,
 * a cornice and a few warm lit rooms at dusk. A backdrop: one collidable mass, detail on the
 * street face only.
 */
const FACE = -21;
const X0 = -6;
const X1 = 31;
const TOP = 10.2;

function archWindow(kit, x, y, w, h, lit) {
  const z = FACE + 0.004;
  if (lit) kit.panel('fakeInterior', [x, y + h / 2, z], [w, h], '+z');
  else kit.panel('glassDark', [x, y + h / 2, z], [w, h], '+z');
  kit.panel('archWindow', [x, y + h / 2, z + 0.03], [w, h], '+z');
  kit.box('stoneTrim', [x - w / 2 - 0.08, y - 0.12, FACE], [x + w / 2 + 0.08, y, FACE + 0.12], { seg: 9, occlude: false });
  kit.box('stoneTrim', [x - 0.09, y + h - 0.04, FACE], [x + 0.09, y + h + 0.16, FACE + 0.06], { seg: 9, occlude: false });
  for (const s of [-1, 1]) kit.box('stoneTrim', [x + s * (w / 2 + 0.02) - 0.05, y + h * 0.55, FACE], [x + s * (w / 2 + 0.02) + 0.05, y + h * 0.6, FACE + 0.05], { seg: 9, occlude: false });
}

export function buildingAcross(kit, rng) {
  kit.box('brickTan', [X0, -0.3, -31], [X1, TOP, FACE], { uv: 'world', seg: 2.5, collide: true, faces: { nz: false, ny: false } });
  kit.box('concreteRough', [X0 - 0.05, -0.3, FACE], [X1 + 0.05, 0.7, FACE + 0.08], { uv: 'world', seg: 3, occlude: false });
  kit.box('stoneTrim', [X0 - 0.15, TOP - 0.1, FACE - 0.05], [X1 + 0.15, TOP + 0.18, FACE + 0.25], { seg: 9, occlude: false });
  kit.box('stoneTrim', [X0 - 0.05, 3.55, FACE], [X1 + 0.05, 3.7, FACE + 0.08], { seg: 9, occlude: false });
  for (let x = X0 + 1.6, i = 0; x < X1 - 1; x += 2.7, i++) {
    archWindow(kit, x, 1.15, 1.05, 2.1, rng.chance(0.25));
    archWindow(kit, x, 4.45, 1.05, 2.2, rng.chance(0.35));
    archWindow(kit, x, 7.6, 0.9, 1.75, rng.chance(0.2));
    if (i % 3 === 1) kit.panel('rainStreak', [x + 1.35, 6.5, FACE + 0.004], [0.8, 3.0], '+z');
  }
  kit.panel('grime', [(X0 + X1) / 2, 0.9, FACE + 0.085], [X1 - X0, 0.8], '+z');
  kit.decal('posterTorn', [3.2, 1.75, FACE + 0.004], [0.5, 1.0], '+z');
  kit.decal('posterBand', [3.85, 1.75, FACE + 0.004], [0.5, 1.0], '+z', { rot: 0.03 });
  kit.decal('tagRed', [17.5, 1.75, FACE + 0.004], [1.6, 1.6], '+z');
}
