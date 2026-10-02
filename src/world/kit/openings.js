import * as THREE from 'three';
import { slab } from './shapes.js';

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
export function swingDoor(kit, name, { hx, hz, y = 0, width = 0.92, height = 2.13, thickness = 0.045, dir = 1, mat = 'paintBlack', locked = false, glassPanel = false, label = name, style = 'flat', kick = false, peephole = false, hardware = 'chrome', interact = true }) {
  const yaw = dir === 1 ? 0 : Math.PI;
  kit.beginDynamic(name, [hx, y, hz], yaw, { door: true, locked, width, height, label });
  const t2 = thickness / 2;
  slab(kit, mat, [0.005, 0.008, -t2], [width - 0.005, height - 0.003, t2], { r: 0.004, occlude: false });
  if (style === 'panel') {
    // two recessed panels per face, framed by applied mouldings
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? t2 : -t2 - 0.007;
      const z1 = z0 + 0.007;
      const m = (a, b) => kit.box(mat, [a[0], a[1], z0], [b[0], b[1], z1], { seg: 9, occlude: false });
      for (const [py0, py1] of [[0.18, height * 0.45], [height * 0.5, height - 0.16]]) {
        const px0 = 0.14;
        const px1 = width - 0.14;
        m([px0, py0], [px1, py0 + 0.022]);
        m([px0, py1 - 0.022], [px1, py1]);
        m([px0, py0 + 0.022], [px0 + 0.022, py1 - 0.022]);
        m([px1 - 0.022, py0 + 0.022], [px1, py1 - 0.022]);
      }
    }
  }
  if (glassPanel) kit.panel('glassDark', [width / 2, height * 0.62, t2 + 0.002], [width * 0.6, height * 0.5], '+z');
  if (kick) for (const s of [-1, 1]) kit.box('stainless', [0.04, 0.012, s > 0 ? t2 : -t2 - 0.002], [width - 0.04, 0.24, s > 0 ? t2 + 0.002 : -t2], { seg: 9, occlude: false });
  for (const s of [-1, 1]) {
    const zf = s * t2;
    kit.geometry(hardware, new THREE.CylinderGeometry(0.027, 0.027, 0.012, 8).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(width - 0.07, 0.98, zf + s * 0.006));
    kit.tube(hardware, [[width - 0.07, 0.98, zf + s * 0.012], [width - 0.07, 0.98, zf + s * 0.055], [width - 0.19, 0.975, zf + s * 0.06]], 0.009, { sides: 4 });
    kit.geometry(hardware, new THREE.CylinderGeometry(0.022, 0.022, 0.014, 8).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(width - 0.07, 1.2, zf + s * 0.007));
  }
  if (peephole) kit.geometry('brass', new THREE.CylinderGeometry(0.009, 0.009, thickness + 0.012, 6).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(width / 2, 1.52, 0));
  for (const yy of [0.22, height / 2, height - 0.24]) kit.cylinder(hardware === 'chrome' ? 'steelGray' : hardware, [0.0, yy - 0.05, 0], 0.008, 0.1, { sides: 5 });
  kit.solid([[0, -t2 - 0.02], [width, -t2 - 0.02], [width, t2 + 0.02], [0, t2 + 0.02]], 0, height, 'door');
  kit.endDynamic();
  if (interact) {
    kit.at(hx, y, hz, yaw, () => kit.interactable({ id: `door.${name}`, kind: 'door', pos: [width / 2, 1.0, 0], yaw: 0, radius: 1.4, prompt: locked ? 'Locked' : 'Door', data: { door: name, locked } }));
  }
}

/**
 * Door frame around an opening [x0,x1]×[y0,y1] on both wall faces (z0 outer, z1 inner): casing
 * with a back band (two steps, so it reads as profiled trim), plinth blocks, jamb liners through
 * the wall, a door stop and a worn threshold.
 */
export function doorFrame(kit, { x0, x1, y0, y1, z0, z1, mat = 'paintBlack', w = 0.07 }) {
  for (const [za, zb, s] of [[z0 - 0.018, z0 + 0.002, -1], [z1 - 0.002, z1 + 0.018, 1]]) {
    const zo = s > 0 ? zb : za;
    const band = s > 0 ? [zb, zb + 0.008] : [za - 0.008, za];
    slab(kit, mat, [x0 - w, y0, za], [x0, y1 + w, zb], { r: 0.003, occlude: false });
    slab(kit, mat, [x1, y0, za], [x1 + w, y1 + w, zb], { r: 0.003, occlude: false });
    slab(kit, mat, [x0, y1, za], [x1, y1 + w, zb], { r: 0.003, occlude: false });
    kit.box(mat, [x0 - w - 0.012, y0, band[0]], [x0 - w + 0.01, y1 + w + 0.012, band[1]], { seg: 9, occlude: false });
    kit.box(mat, [x1 + w - 0.01, y0, band[0]], [x1 + w + 0.012, y1 + w + 0.012, band[1]], { seg: 9, occlude: false });
    kit.box(mat, [x0 - w - 0.012, y1 + w, band[0]], [x1 + w + 0.012, y1 + w + 0.012, band[1]], { seg: 9, occlude: false });
    const plinth = s > 0 ? [zo - 0.004, zo + 0.01] : [zo - 0.01, zo + 0.004];
    for (const x of [x0 - w - 0.012, x1 - 0.004]) kit.box(mat, [x, y0, plinth[0]], [x + w + 0.016, y0 + 0.16, plinth[1]], { seg: 9, occlude: false });
  }
  kit.box(mat, [x0 - 0.004, y0, z0], [x0, y1, z1], { seg: 9, occlude: false });
  kit.box(mat, [x1, y0, z0], [x1 + 0.004, y1, z1], { seg: 9, occlude: false });
  kit.box(mat, [x0, y1, z0], [x1, y1 + 0.004, z1], { seg: 9, occlude: false });
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
