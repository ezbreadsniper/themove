/**
 * Rapier loader. The compat build inlines its WebAssembly as base64, so it works unchanged in Vite,
 * in the browser and under Vitest (node) — no wasm plugin, no asset copying. init() is async and
 * takes ~100 ms once; every later call returns the cached module.
 */
let pending = null;
let ready = null;

export function loadRapier() {
  if (ready) return Promise.resolve(ready);
  pending ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    const R = m.default ?? m;
    // Newer builds take an options object; older ones none. Silence the one-off deprecation note.
    const warn = console.warn;
    console.warn = (...a) => (String(a[0]).includes('deprecated parameters') ? undefined : warn(...a));
    try {
      await R.init();
    } finally {
      console.warn = warn;
    }
    ready = R;
    return R;
  });
  return pending;
}

/** The module once loadRapier() has resolved (null before). */
export function rapier() {
  return ready;
}
