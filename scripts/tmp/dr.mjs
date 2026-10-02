import { readFileSync } from 'node:fs';
import { createContext } from '../../src/character/build.js';
const p = JSON.parse(readFileSync('src/character/presets/sheet-06-floral-cutoffs.json','utf8'));
const ctx = createContext({ ...p, dress: { bodice: 'cami', color: '#6b1f2e' } });
console.log(ctx.authored.dress, ctx.def.top?.type, ctx.def.bottom?.type, ctx.errors);
