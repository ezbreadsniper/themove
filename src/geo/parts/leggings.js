import * as THREE from 'three';
import { JOINT_INDEX as J } from '../../rig/skeleton.js';
import { MeshBuilder } from '../mesh-builder.js';
import { buildBody, gluteForm, legStations, torsoRings } from './body.js';
import { GARMENT_UV, bodySurface } from './garments.js';

/** Stretch fabric sits this far off the skin (m at 1.78 m): close enough to read as second skin. */
const SKIN_GAP = 0.004;
/** Extra stand-off where a sock is underneath (m at 1.78 m). */
const SOCK_EXTRA = 0.007;

/** The leggings' outer surface for layering: skin torso rings plus the fabric gap (tops clear this). */
export function leggingsSurface(layout) {
  const gap = SKIN_GAP * (layout.measures.height / 1.78);
  return bodySurface(torsoRings(layout, { skin: true }).map((r) => ({ ...r, rx: r.rx + gap, rzF: r.rzF + gap, rzB: r.rzB + gap })));
}

const ARM_BONES = new Set(Object.entries(J).filter(([name]) => /Shoulder|Arm|Hand/.test(name)).map(([, i]) => i));

/**
 * Leggings and bike shorts as true second-skin garments: the body's own connected lower-body skin
 * (pelvis, crotch seam, glutes, thigh / knee / calf landmarks) between riseY and hemY, pushed out along
 * the skin normals and re-mapped to the trouser UV layout (legL / legR / waist). Vertex weights are
 * copied from the skin, so the fabric deforms exactly with the body underneath.
 */
export function buildLeggings(layout, { riseY: wantRise, hemY: wantHem, sockTop = null }) {
  const k = layout.measures.height / 1.78;
  // Edges sit on real skin rings so the hem and waistband are clean horizontal loops.
  const nearest = (ys, y) => ys.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  const hemY = nearest(legStations(layout, 'Left').map((s) => s.y), wantHem);
  const riseY = nearest(torsoRings(layout, { skin: true }).map((r) => r.y), wantRise);
  const EPS = 1e-4;
  const skin = buildBody(layout, {});
  const geo = skin.toGeometry();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const crotchY = gluteForm(layout).foldY;
  const legTop = crotchY + 0.02 * k;
  const gap = SKIN_GAP * k;
  const mb = new MeshBuilder('bottom');
  const weights = (i) => [0, 1, 2, 3].map((c) => [skin.skinIndex[i * 4 + c], skin.skinWeight[i * 4 + c]]).filter(([, w]) => w > 0);
  const onArm = (i) => weights(i).some(([b, w]) => ARM_BONES.has(b) && w > 0.01);
  const legCentreX = (side) => layout.world[`${side}UpLeg`].x;
  const uvFor = (p, onLeg, side) => {
    if (onLeg) {
      const [u0, v0, u1, v1] = GARMENT_UV.bottom[side === 'Left' ? 'legL' : 'legR'];
      // Mirrored so the outer side lands where the trouser painter puts it (legL 0.25, legR 0.75).
      const a = Math.atan2(legCentreX(side) - p.x, p.z) / (Math.PI * 2) + 0.5;
      const v = (p.y - hemY) / Math.max(1e-3, legTop - hemY);
      return [u0 + (u1 - u0) * a, v0 + (v1 - v0) * Math.min(1, Math.max(0, v))];
    }
    const [u0, v0, u1, v1] = GARMENT_UV.bottom.waist;
    const a = Math.atan2(p.x, p.z) / (Math.PI * 2) + 0.5;
    const v = (p.y - legTop) / Math.max(1e-3, riseY - legTop);
    return [u0 + (u1 - u0) * a, v0 + (v1 - v0) * Math.min(1, Math.max(0, v))];
  };
  const idx = geo.index.array;
  const p = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (tri.some((i) => pos.getY(i) > riseY + EPS || pos.getY(i) < hemY - EPS) || tri.some(onArm)) continue;
    // One UV region per triangle (leg strip or waist band), chosen by its centroid, so no triangle mixes
    // two mappings.
    const cy = tri.reduce((s, i) => s + pos.getY(i), 0) / 3;
    const cx = tri.reduce((s, i) => s + pos.getX(i), 0) / 3;
    const onLeg = cy < legTop;
    const side = cx >= 0 ? 'Left' : 'Right';
    const verts = tri.map((i) => {
      // Over a sock the fabric stands off by the sock's thickness as well.
      const overSock = sockTop == null ? 0 : SOCK_EXTRA * k * (1 - THREE.MathUtils.smoothstep(pos.getY(i), sockTop, sockTop + 0.02 * k));
      p.fromBufferAttribute(pos, i).addScaledVector(new THREE.Vector3().fromBufferAttribute(nrm, i), gap + overSock);
      return { p: p.clone(), uv: uvFor(p, onLeg, side), w: weights(i) };
    });
    // A triangle across the angular seam of its UV strip would smear the whole strip: pin its far
    // vertices to the seam edge instead.
    const us = verts.map((v) => v.uv[0]);
    if (Math.max(...us) - Math.min(...us) > 0.25) {
      const hi = Math.max(...us);
      verts.forEach((v) => { if (hi - v.uv[0] > 0.25) v.uv[0] = hi; });
    }
    const ids = verts.map((v) => mb.addVertex(v.p, v.uv, v.w));
    mb.tri(ids[0], ids[1], ids[2]);
  }
  return { mb, hemY, riseY, ease: gap };
}
