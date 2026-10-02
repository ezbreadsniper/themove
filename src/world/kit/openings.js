/**
 * Openings: industrial steel windows, swing doors (dynamic, collidable, lockable) and roll-up doors.
 * Authored in a wall frame (local +X along the wall, z across it).
 */

function divisions(a0, a1, count, skip = []) {
  const out = [];
  for (let i = 1; i < count; i++) {
    const v = a0 + ((a1 - a0) * i) / count;
    if (!skip.some((s) => Math.abs(s - v) < 1e-6)) out.push(v);
  }
  return out;
}

/**
 * Factory steel window filling the opening [x0,x1]×[y0,y1] with its frame centred at depth z.
 * Layout follows the reference: a heavy centre mullion and a heavy transom split the window into
 * four lights, each divided by thin muntins into `colsPerSide` × rowsBelow / rowsAbove panes.
 */
export function steelWindow(kit, { x0, x1, y0, y1, z, colsPerSide = 3, rowsBelow = 3, rowsAbove = 2, transomY = null, heavyCol = true, glass = 'glass', frame = 'steelBlack', backing = null, collide = false }) {
  const d = 0.07;
  const f = 0.075;
  const box = (a, b) => kit.box(frame, a, b, { seg: 9, occlude: false });
  box([x0, y0, z - d / 2], [x1, y0 + f, z + d / 2]);
  box([x0, y1 - f, z - d / 2], [x1, y1, z + d / 2]);
  box([x0, y0 + f, z - d / 2], [x0 + f, y1 - f, z + d / 2]);
  box([x1 - f, y0 + f, z - d / 2], [x1, y1 - f, z + d / 2]);
  const xm = (x0 + x1) / 2;
  const ty = transomY ?? y0 + (y1 - y0) * 0.58;
  if (heavyCol) box([xm - 0.05, y0 + f, z - d / 2 - 0.01], [xm + 0.05, y1 - f, z + d / 2 + 0.01]);
  if (rowsAbove > 0) box([x0 + f, ty - 0.06, z - d / 2 - 0.01], [x1 - f, ty + 0.06, z + d / 2 + 0.01]);
  const cols = heavyCol ? colsPerSide * 2 : colsPerSide;
  for (const x of divisions(x0, x1, cols, heavyCol ? [xm] : [])) box([x - 0.016, y0 + f, z - 0.022], [x + 0.016, y1 - f, z + 0.022]);
  const below = rowsAbove > 0 ? ty : y1;
  for (const y of divisions(y0, below, rowsBelow)) box([x0 + f, y - 0.016, z - 0.022], [x1 - f, y + 0.016, z + 0.022]);
  if (rowsAbove > 0) for (const y of divisions(ty, y1, rowsAbove)) box([x0 + f, y - 0.016, z - 0.022], [x1 - f, y + 0.016, z + 0.022]);
  kit.panel(glass, [xm, (y0 + y1) / 2, z], [x1 - x0 - 0.02, y1 - y0 - 0.02], '-z');
  if (backing) {
    kit.panel(backing, [xm, (y0 + y1) / 2, z + 0.9], [x1 - x0, y1 - y0], '-z');
    kit.box('plasticBlack', [x0, y0, z + 0.04], [x0 + 0.02, y1, z + 0.9], { seg: 9, occlude: false });
    kit.box('plasticBlack', [x1 - 0.02, y0, z + 0.04], [x1, y1, z + 0.9], { seg: 9, occlude: false });
  }
  if (collide) kit.solid([[x0, z - 0.05], [x1, z - 0.05], [x1, z + 0.05], [x0, z + 0.05]], y0, y1, 'glass');
}

/**
 * Hinged door, dynamic. The hinge sits at (hx, hz); the closed leaf runs along +X (dir = 1) or -X
 * (dir = -1) from it. data: { locked, auto } — auto doors open toward the side away from the player.
 */
export function swingDoor(kit, name, { hx, hz, y = 0, width = 0.92, height = 2.13, thickness = 0.045, dir = 1, mat = 'paintBlack', locked = false, glassPanel = false, label = name }) {
  const yaw = dir === 1 ? 0 : Math.PI;
  kit.beginDynamic(name, [hx, y, hz], yaw, { door: true, locked, width, height, label });
  kit.box(mat, [0.005, 0, -thickness / 2], [width - 0.005, height, thickness / 2], { seg: 9, occlude: false });
  if (glassPanel) kit.panel('glassDark', [width / 2, height * 0.62, thickness / 2 + 0.002], [width * 0.6, height * 0.5], '+z');
  kit.box('chrome', [width - 0.14, 0.98, thickness / 2], [width - 0.04, 1.02, thickness / 2 + 0.05], { seg: 9, occlude: false });
  kit.box('chrome', [width - 0.14, 0.98, -thickness / 2 - 0.05], [width - 0.04, 1.02, -thickness / 2], { seg: 9, occlude: false });
  kit.solid([[0, -thickness / 2 - 0.02], [width, -thickness / 2 - 0.02], [width, thickness / 2 + 0.02], [0, thickness / 2 + 0.02]], 0, height, 'door');
  kit.endDynamic();
}

/** Door frame (casing) around an opening [x0,x1]×[y0,y1] on both wall faces (z0 outer, z1 inner). */
export function doorFrame(kit, { x0, x1, y0, y1, z0, z1, mat = 'paintBlack', w = 0.06 }) {
  for (const [za, zb] of [[z0 - 0.02, z0 + 0.01], [z1 - 0.01, z1 + 0.02]]) {
    kit.box(mat, [x0 - w, y0, za], [x0, y1 + w, zb], { seg: 9, occlude: false });
    kit.box(mat, [x1, y0, za], [x1 + w, y1 + w, zb], { seg: 9, occlude: false });
    kit.box(mat, [x0, y1, za], [x1, y1 + w, zb], { seg: 9, occlude: false });
  }
  kit.box('concreteGray', [x0, y0, z0], [x1, y0 + 0.02, z1], { seg: 9, occlude: false });
}

/** Closed corrugated roll-up door with hood and guides, filling [x0,x1]×[y0,y1] at depth z. */
export function rollupDoor(kit, { x0, x1, y0, y1, z, mat = 'galvanized' }) {
  const slat = 0.09;
  for (let y = y0; y < y1 - 1e-6; y += slat) {
    kit.box(mat, [x0, y, z - 0.02], [x1, Math.min(y1, y + slat - 0.012), z + 0.02], { seg: 9, occlude: false });
    kit.box('steelGray', [x0, y + slat - 0.012, z - 0.012], [x1, Math.min(y1, y + slat), z + 0.012], { seg: 9, occlude: false });
  }
  kit.box('steelGray', [x0 - 0.08, y0, z - 0.06], [x0, y1 + 0.3, z + 0.04], { seg: 9 });
  kit.box('steelGray', [x1, y0, z - 0.06], [x1 + 0.08, y1 + 0.3, z + 0.04], { seg: 9 });
  kit.box('steelGray', [x0 - 0.1, y1, z - 0.35], [x1 + 0.1, y1 + 0.45, z + 0.02], { seg: 9 });
  kit.box('yellowPaint', [x0 + 0.1, y0, z - 0.06], [x0 + 0.35, y0 + 0.05, z - 0.02], { seg: 9, occlude: false });
  kit.solid([[x0, z - 0.05], [x1, z - 0.05], [x1, z + 0.05], [x0, z + 0.05]], y0, y1, 'rollup');
}
