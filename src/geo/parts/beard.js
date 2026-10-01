import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder } from '../mesh-builder.js';
import { featureOffset } from './head.js';

/**
 * Beards with volume. Each column around the jaw is a profile: from the cheek line down the jaw
 * (sitting `bulk` off the skin), over the chin, hanging to a tip `length` below it, then folding back
 * under to the throat — so a beard has a real silhouette in profile instead of being painted on.
 *
 * reach: half-angle the beard covers (sideburn to sideburn); tip: how the length falls off toward the
 * sides ('round' | 'point' | 'square'); cheek: true starts on the cheekbones, false under the lip line.
 */
export const BEARD_SHAPES = {
  fullBeard: { reach: 1.5, bulk: 0.007, length: 0.022, tip: 'round', cheek: true },
  boxed: { reach: 1.45, bulk: 0.006, length: 0.016, tip: 'square', cheek: true },
  bushy: { reach: 1.55, bulk: 0.013, length: 0.04, tip: 'round', cheek: true },
  longBeard: { reach: 1.5, bulk: 0.009, length: 0.085, tip: 'round', cheek: true },
  ducktail: { reach: 1.45, bulk: 0.007, length: 0.06, tip: 'point', cheek: true },
  garibaldi: { reach: 1.55, bulk: 0.012, length: 0.07, tip: 'round', cheek: true },
  longGoatee: { reach: 0.42, bulk: 0.006, length: 0.045, tip: 'point', cheek: false },
  verdi: { reach: 1.45, bulk: 0.008, length: 0.05, tip: 'square', cheek: true },
};

const COLUMNS = 14;

function lengthFactor(tip, u) {
  const a = Math.abs(u);
  if (tip === 'point') return (1 - a) ** 1.6;
  if (tip === 'square') return a < 0.55 ? 1 : Math.max(0, 1 - (a - 0.55) / 0.45) ** 0.8;
  return Math.sqrt(Math.max(0, 1 - a * a));
}

export function buildBeard(shape, styleName) {
  const style = BEARD_SHAPES[styleName];
  if (!style) return null;
  const mb = new MeshBuilder('beard');
  const k = shape.k;
  const { lm } = shape;
  const chinY = shape.chinY;
  const mouthY = lm.mouth;
  const cheekLine = (a) => (style.cheek ? lm.noseBase - 0.014 * k - Math.max(0, a - 0.55) * 0.012 : mouthY - 0.012 * k);
  const profiles = [];
  for (let c = 0; c <= COLUMNS; c++) {
    const u = (c / COLUMNS) * 2 - 1;
    const theta = u * style.reach;
    const a = Math.abs(theta);
    const edge = 1 - Math.abs(u) ** 4 * 0.75;
    const bulk = style.bulk * k * edge;
    const top = a < 0.42 ? mouthY - 0.011 * k : cheekLine(a);
    const skin = (y, out) => shape.point(theta, y, featureOffset(shape, theta, y) + out);
    const pts = [];
    for (const t of [0, 0.35, 0.7, 1]) {
      const y = top + (chinY + 0.003 * k - top) * t;
      pts.push(skin(y, bulk * (0.08 + 0.92 * t ** 0.8)));
    }
    const chin = pts[pts.length - 1];
    const len = style.length * k * lengthFactor(style.tip, u) * edge;
    const outward = chin.clone().setY(0).normalize();
    const tip = chin.clone().addScaledVector(outward, len * 0.18).setY(chin.y - len);
    const mid = chin.clone().lerp(tip, 0.5).addScaledVector(outward, bulk * 0.6);
    const throat = shape.point(theta, chinY - 0.016 * k, 0.003 * k);
    const under = tip.clone().lerp(throat, 0.5).setY(Math.min(tip.y, throat.y) + (len > 0.01 ? 0.006 * k : 0));
    pts.push(mid, tip, under, throat);
    profiles.push(pts);
  }
  const rows = profiles[0].length;
  const starts = profiles.map((pts, c) => {
    const start = mb.vertexCount;
    pts.forEach((p, r) => {
      const jaw = p.y < mouthY - 0.004 * k ? 0.75 * (1 - Math.abs((c / COLUMNS) * 2 - 1) ** 3) : 0;
      mb.addVertex(p, [c / COLUMNS, 1 - r / (rows - 1)], [[J.Head, 1 - jaw], [J.Jaw, jaw]]);
    });
    return start;
  });
  for (let c = 0; c < COLUMNS; c++) {
    for (let r = 0; r < rows - 1; r++) {
      mb.quad(starts[c] + r, starts[c] + r + 1, starts[c + 1] + r + 1, starts[c + 1] + r);
    }
  }
  return mb;
}
