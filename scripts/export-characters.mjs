/**
 * Exports every preset to exports/<id>.glb, then validates each file twice:
 *  1. structurally in Node (joint names, skin, animations, texture count), and
 *  2. by re-importing through three's GLTFLoader in the browser and rendering it beside the original.
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { ensureServer, openPage } from './lib/browser.mjs';
import { JOINTS } from '../src/rig/skeleton.js';

const UNIMATE_CORE = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'].map((n) => `mixamorig:${n}`);

function readGlbJson(buf) {
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
}

function validateStructure(json) {
  const problems = [];
  const skin = json.skins?.[0];
  if (!skin) problems.push('no skin');
  const jointNames = skin ? skin.joints.map((j) => json.nodes[j].name) : [];
  if (JSON.stringify(jointNames.slice(0, 22)) !== JSON.stringify(UNIMATE_CORE)) problems.push(`joint names/order differ: ${jointNames.join(',')}`);
  const sameJoints = (json.skins ?? []).every((s) => JSON.stringify(s.joints) === JSON.stringify(skin.joints));
  if (!sameJoints) problems.push('parts are bound to different joint sets');
  if (json.nodes.filter((n) => n.name?.startsWith('mixamorig:')).length !== JOINTS.length) problems.push('joint nodes duplicated or missing');
  const skinnedNodes = json.nodes.filter((n) => n.skin !== undefined).length;
  const clips = (json.animations ?? []).map((a) => a.name);
  if (clips.length < 8) problems.push(`only ${clips.length} animations`);
  return { problems, jointCount: jointNames.length, skinnedNodes, clips, images: (json.images ?? []).length, materials: (json.materials ?? []).length };
}

const presetDir = 'src/character/presets';
const ids = readdirSync(presetDir).filter((f) => f.endsWith('.json') && f !== 'meta.json').map((f) => JSON.parse(readFileSync(`${presetDir}/${f}`, 'utf8')).id);

mkdirSync('exports', { recursive: true });
mkdirSync('docs/evidence', { recursive: true });
const stop = await ensureServer();
const { browser, page, errors } = await openPage('/evidence.html', { width: 900, height: 700 });
const summary = [];
let failed = false;
for (const id of ids) {
  const b64 = await page.evaluate((i) => window.evidence.exportGLB(i), id);
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(`exports/${id}.glb`, buf);
  const structure = validateStructure(readGlbJson(buf));
  const reimport = await page.evaluate(([i, b]) => window.evidence.reimport(i, b), [id, b64]);
  await page.screenshot({ path: `docs/evidence/export-roundtrip-${id}.png` });
  const problems = [...structure.problems];
  if (reimport.bones.length !== JOINTS.length) problems.push(`reimported skeleton has ${reimport.bones.length} bones`);
  if (!reimport.sharedSkeleton) problems.push('reimported meshes do not all bind 22 bones');
  if (!reimport.texturesNearest) problems.push('reimported textures lost nearest filtering');
  if (problems.length) failed = true;
  summary.push({ id, bytes: buf.length, ...structure, reimportedMeshes: reimport.skinnedMeshes, problems });
}
// Armed export: one character with all three weapons, re-imported and played through GLTFLoader.
{
  const b64 = await page.evaluate(() => window.evidence.exportGLB('trial-default', ['pistol', 'rifle', 'smg']));
  writeFileSync('exports/trial-default-armed.glb', Buffer.from(b64, 'base64'));
  const checks = {};
  for (const [clip, type] of [['pistol_draw', 'pistol'], ['rifle_equip', 'rifle'], ['smg_equip', 'smg']]) checks[clip] = await page.evaluate(([b, c, t]) => window.evidence.reimportArmed(b, c, t), [b64, clip, type]);
  const problems = Object.entries(checks).filter(([, r]) => !r.ok).map(([c, r]) => `${c}: ${JSON.stringify(r)}`);
  if (problems.length) failed = true;
  summary.push({ id: 'trial-default-armed', bytes: Buffer.from(b64, 'base64').length, clips: [], jointCount: JOINTS.length, skinnedNodes: 0, images: 0, armed: checks, problems });
}
writeFileSync('docs/evidence/export-report.json', JSON.stringify(summary, null, 2));
for (const s of summary) {
  console.log(`${s.problems.length ? 'FAIL' : 'PASS'} ${s.id}: ${(s.bytes / 1024).toFixed(0)} KB, ${s.jointCount} joints, ${s.skinnedNodes} skinned parts, ${s.clips.length} clips, ${s.images} textures${s.problems.length ? `\n  - ${s.problems.join('\n  - ')}` : ''}`);
}
if (errors.length) console.log(`Browser errors:\n${errors.join('\n')}`);
await browser.close();
stop();
process.exit(failed ? 1 : 0);
