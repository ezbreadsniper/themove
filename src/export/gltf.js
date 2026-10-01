import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { JOINTS, RIG_PREFIX } from '../rig/skeleton.js';
import { bakeAllClips } from '../anim/clips.js';

const JOINT_NAMES = new Set(JOINTS.map(([name]) => name));

/** Splits a GLB into its JSON object and binary chunk. */
export function readGLB(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  const binOffset = 20 + jsonLength;
  const bin = binOffset < buffer.byteLength ? new Uint8Array(buffer, binOffset + 8, view.getUint32(binOffset, true)) : new Uint8Array(0);
  return { json, bin };
}

export function writeGLB(json, bin) {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = Math.ceil(enc.length / 4) * 4;
  const binPadded = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonPadded + (bin.length ? 8 + binPadded : 0);
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(enc, 20);
  bytes.fill(0x20, 20 + enc.length, 20 + jsonPadded);
  if (bin.length) {
    const o = 20 + jsonPadded;
    view.setUint32(o, binPadded, true);
    view.setUint32(o + 4, 0x004e4942, true);
    bytes.set(bin, o + 8);
  }
  return out;
}

/** Renames joint nodes to `mixamorig:<Joint>` (Three's track parser forbids ':' so it happens post-export). */
export function applyRigPrefix(buffer, prefix = RIG_PREFIX) {
  const { json, bin } = readGLB(buffer);
  for (const node of json.nodes ?? []) {
    if (JOINT_NAMES.has(node.name)) node.name = `${prefix}${node.name}`;
  }
  json.asset = { ...json.asset, generator: 'themove character pipeline (three.js GLTFExporter)', extras: { rig: 'mixamo-core-22' } };
  return writeGLB(json, bin);
}

/**
 * Runtime userData holds rasters, the rig and layout vectors; glTF `extras` only gets the parts a
 * game needs back (definition, collider, stats, part slot).
 */
function exportableUserData(object, root) {
  if (object === root) {
    const { definition, collider, stats } = object.userData;
    return { definition, collider, stats: { triangles: stats.triangles, drawCalls: stats.drawCalls } };
  }
  return object.userData.slot ? { slot: object.userData.slot } : {};
}

/** Exports a built character plus its procedural clips as binary glTF with Mixamo joint names. */
export async function exportCharacterGLB(character, { clips = true, prefix = RIG_PREFIX } = {}) {
  const animations = clips ? Object.values(bakeAllClips(character.userData.layout)) : [];
  const saved = [];
  character.traverse((o) => {
    saved.push([o, o.userData]);
    o.userData = exportableUserData(o, character);
  });
  try {
    const raw = await new GLTFExporter().parseAsync(character, { binary: true, animations, onlyVisible: true });
    return applyRigPrefix(raw, prefix);
  } finally {
    saved.forEach(([o, data]) => { o.userData = data; });
  }
}
