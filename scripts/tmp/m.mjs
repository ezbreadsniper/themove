import { computeJointLayout } from '../../src/rig/skeleton.js';
import { torsoRings, legStations } from '../../src/geo/parts/body.js';
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json','utf8'));
const L = computeJointLayout(p.body);
const f = (v)=>v.toFixed(3);
console.log('upleg', f(L.world.LeftUpLeg.x), f(L.world.LeftUpLeg.y), 'hips', f(L.world.Hips.y), 'knee', f(L.measures.kneeY), 'hipHalf', f(L.measures.hipHalfWidth), 'thighR', f(L.measures.thighRadius));
for (const r of torsoRings(L)) console.log(r.key.padEnd(11), f(r.y), f(r.rx), f(r.rzF), f(r.rzB));
for (const s of legStations(L,'Left')) console.log('leg', f(s.y), f(s.r), s.back.toFixed(2), s.inset ?? '');
