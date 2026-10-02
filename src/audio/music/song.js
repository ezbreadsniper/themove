import { hashString } from '../../core/rng.js';
import { STEPS_PER_BAR, stepDuration } from './clock.js';

/**
 * "Foundry Loop" — an original minimal Detroit-techno track, written as data.
 *
 * Vocabulary of the genre (not any specific record): a four-on-the-floor kick, off-beat open hats
 * over shuffled sixteenth closed hats, clap / rim on 2 and 4, a rolling sub bassline in the gaps
 * between kicks, a minor-ninth dub chord stab through a dotted-eighth ping-pong delay, a 3-step
 * polymetric riff that phases against the bar, and changes that arrive in 8 / 16 / 32-bar steps
 * with slow filter automation. F minor, 128 BPM, eight 32-bar sections (8 minutes) that loop.
 *
 * Tweaking: patterns are 16-character strings, one char per sixteenth: '.' rest, '1'..'9' velocity
 * 0.1..0.9, 'X' full. Sections switch elements on with bar ranges ([from, to) within the 32 bars,
 * `true` = whole section). Automation values are [start, end] over the section (smoothstep), with an
 * optional `lfo: [depth, periodBars]`. See docs/audio/README.md.
 */
export const SONG = {
  title: 'Foundry Loop',
  bpm: 128,
  swing: 0.56,
  sectionBars: 32,
  seed: 'foundry-loop',
};

export const NOTES = { F1: 29, Ab1: 32, Bb1: 34, C2: 36, Eb2: 39, F2: 41, Ab4: 68, C5: 72, Eb5: 75, F5: 77, G5: 79 };
export const CHORDS = {
  Fm9: [53, 56, 60, 63, 67],
  Dbmaj9: [49, 53, 56, 60, 63],
  Bbm9: [46, 53, 56, 61, 65],
};

export const PATTERNS = {
  kick: 'X...X...X...X...',
  chatFull: '53.553.553.553.6',
  chatSparse: '...5...5...5...6',
  ohat: '..8...8...8...8.',
  clap: '....9.......9...',
  rim: '....8.......8...',
  rimSync: '...6...4...7..5.',
  shaker: '4243424342434244',
  ride: '6.3.6.3.6.3.6.3.',
};

/** Bass patterns: [step, note, flags] — 'a' accent, 's' slide into the next note. */
export const BASS = {
  roll: [[2, 'F1'], [3, 'F1', 'a'], [6, 'F1'], [7, 'F2', 'a'], [10, 'F1'], [11, 'F1', 'a'], [14, 'Ab1'], [15, 'F1', 'a']],
  rollTurn: [[2, 'F1'], [3, 'F1', 'a'], [6, 'F1'], [7, 'F2', 'a'], [10, 'F1'], [11, 'C2', 'a'], [13, 'Eb2', 's'], [14, 'F2', 'a'], [15, 'F1']],
  acid: [[2, 'F1', 'a'], [5, 'F1'], [7, 'C2', 'a'], [10, 'F1'], [11, 'F2', 's'], [12, 'Eb2'], [14, 'F1', 'a'], [15, 'Ab1']],
};

/** Conga-ish percussion: [step, velocity, 'lo' | 'hi']. */
export const PERC = [[7, 0.6, 'hi'], [10, 0.45, 'lo'], [15, 0.7, 'hi']];
/** Stab rhythms: S1 is one bar; S3 hits every third sixteenth (a 3-bar cycle against the 4/4). */
export const STABS = { S1: [[3, 0.9], [6, 0.6], [11, 0.8]] };
export const LEAD_RIFF = ['C5', 'Eb5', 'F5', 'C5', 'Ab4'];

const ALL = true;
export const SECTIONS = [
  {
    name: 'intro', kick: ALL, chat: [[0, 16, 'chatSparse'], [16, 32, 'chatFull']], rim: [8, 32], ohat: [16, 32],
    stab: [16, 32, 'S1'], chords: ['Fm9'],
    auto: { stabCut: [0.08, 0.3], delayWet: [0.25, 0.35], riser: [28, 32] },
  },
  {
    name: 'groove', kick: ALL, chat: ALL, ohat: ALL, clap: ALL, rim: [0, 16], shaker: [16, 32], bass: [0, 32, 'roll'],
    stab: [0, 32, 'S1'], chords: ['Fm9'], fills: true,
    auto: { bassCut: [0.22, 0.42], bassRes: [0.3, 0.35], stabCut: [0.3, 0.45], delayWet: [0.35, 0.35] },
  },
  {
    name: 'hypnosis', kick: ALL, chat: ALL, ohat: ALL, clap: ALL, shaker: ALL, perc: ALL, bass: [0, 32, 'roll'],
    stab: [[0, 8, 'S1'], [8, 32, 'S3']], chords: ['Fm9'], fills: true,
    auto: { bassCut: [0.42, 0.58], bassRes: [0.35, 0.45], stabCut: [0.45, 0.6, { lfo: [0.08, 8] }], delayWet: [0.35, 0.5], riser: [28, 32] },
  },
  {
    name: 'break', kick: [8, 32], chat: [8, 32], ohat: [16, 32], clap: [16, 32], shaker: [24, 32], rim: [0, 32, 'rimSync'],
    perc: [0, 8], bass: [0, 32, 'roll'], stab: [0, 32, 'S3'], chords: ['Fm9', 'Fm9', 'Bbm9', 'Fm9'],
    auto: { bassCut: [0.18, 0.55], bassRes: [0.45, 0.4], stabCut: [0.68, 0.5], delayWet: [0.7, 0.4], riser: [28, 32] },
  },
  {
    name: 'peak', kick: ALL, chat: ALL, ohat: ALL, clap: ALL, ride: ALL, shaker: ALL, perc: [16, 32], bass: [0, 32, 'acid'],
    stab: [0, 32, 'S1'], lead: ALL, chords: ['Fm9', 'Fm9', 'Fm9', 'Dbmaj9'], fills: true,
    auto: { bassCut: [0.55, 0.6, { lfo: [0.14, 16] }], bassRes: [0.6, 0.72], stabCut: [0.5, 0.55], leadCut: [0.35, 0.7, { lfo: [0.15, 8] }], delayWet: [0.45, 0.45] },
  },
  {
    name: 'drive', kick: ALL, chat: ALL, ohat: ALL, clap: ALL, ride: [0, 24], shaker: ALL, perc: ALL, bass: [0, 32, 'roll'],
    stab: [0, 32, 'S3'], lead: [0, 16], chords: ['Fm9'], fills: true,
    auto: { bassCut: [0.6, 0.5], bassRes: [0.6, 0.38], stabCut: [0.55, 0.42], leadCut: [0.6, 0.3], delayWet: [0.42, 0.38], riser: [28, 32] },
  },
  {
    name: 'strip', kick: ALL, rim: [0, 32, 'rimSync'], chat: [16, 32], ohat: [24, 32], clap: [8, 32], shaker: [24, 32],
    bass: [[0, 16, 'roll'], [16, 32, 'rollTurn']], stab: [0, 32, 'S1'], chords: ['Fm9', 'Fm9', 'Dbmaj9', 'Fm9'], fills: true,
    auto: { bassCut: [0.35, 0.5], bassRes: [0.45, 0.45], stabCut: [0.3, 0.48], delayWet: [0.4, 0.45], riser: [28, 32] },
  },
  {
    name: 'outro', kick: ALL, chat: ALL, ohat: [0, 24], clap: [0, 16], rim: ALL, shaker: [0, 8], bass: [0, 16, 'roll'],
    stab: [0, 24, 'S1'], chords: ['Fm9'],
    auto: { bassCut: [0.45, 0.2], bassRes: [0.35, 0.3], stabCut: [0.45, 0.1], delayWet: [0.4, 0.25] },
  },
];

const AUTO_DEFAULTS = { bassCut: 0.4, bassRes: 0.35, stabCut: 0.4, leadCut: 0.5, delayWet: 0.35 };

/** '53.5…' → [0.5, 0.3, 0, 0.5, …] */
export function parsePattern(str) {
  return [...str].map((c) => (c === '.' ? 0 : c === 'X' ? 1 : Number(c) / 10));
}

export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** Normalises a section element spec to a list of [from, to, variant] ranges. */
function ranges(spec, fallback) {
  if (!spec) return [];
  if (spec === true) return [[0, Infinity, fallback]];
  if (Array.isArray(spec[0])) return spec.map(([a, b, v]) => [a, b, v ?? fallback]);
  return [[spec[0], spec[1], spec[2] ?? fallback]];
}

const smooth = (t) => t * t * (3 - 2 * t);

export class Song {
  constructor({ seed = SONG.seed, bpm = SONG.bpm, swing = SONG.swing, sections = SECTIONS, sectionBars = SONG.sectionBars } = {}) {
    this.seed = seed;
    this.seedHash = hashString(String(seed));
    this.bpm = bpm;
    this.swing = swing;
    this.sections = sections;
    this.sectionBars = sectionBars;
    this.totalBars = sections.length * sectionBars;
    this.patterns = Object.fromEntries(Object.entries(PATTERNS).map(([k, v]) => [k, parsePattern(v)]));
    this.compiled = sections.map((s) => this.compile(s));
  }

  compile(s) {
    const el = {};
    for (const key of ['kick', 'chat', 'ohat', 'clap', 'rim', 'shaker', 'ride', 'perc', 'bass', 'stab', 'lead']) {
      const fallback = { chat: 'chatFull', rim: 'rim', bass: 'roll', stab: 'S1' }[key] ?? key;
      el[key] = ranges(s[key], fallback);
    }
    return { ...s, el };
  }

  get stepDur() {
    return stepDuration(this.bpm);
  }

  get loopSeconds() {
    return this.totalBars * STEPS_PER_BAR * this.stepDur;
  }

  /** Section at an absolute bar (the arrangement loops). */
  sectionAt(bar) {
    const b = ((bar % this.totalBars) + this.totalBars) % this.totalBars;
    const index = Math.floor(b / this.sectionBars);
    return { index, barIn: b - index * this.sectionBars, def: this.compiled[index], name: this.compiled[index].name };
  }

  /** Variant of element `key` active at bar-in-section `barIn`, or null. */
  active(def, key, barIn) {
    for (const [a, b, v] of def.el[key]) if (barIn >= a && barIn < b) return v;
    return null;
  }

  /** Deterministic 0..1 per (step, voice): humanised velocities without stateful RNG. */
  hash(step, salt) {
    let h = (this.seedHash ^ Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  human(step, salt, amount = 0.08) {
    return 1 + (this.hash(step, salt) - 0.5) * 2 * amount;
  }

  /** Is the kick sounding on this step (arrangement, fills)? Used by the sub-bass "feel" hook too. */
  kickAt(step) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step - bar * STEPS_PER_BAR;
    const { def, barIn } = this.sectionAt(bar);
    if (!this.active(def, 'kick', barIn) || !this.patterns.kick[s]) return false;
    if (def.fills && barIn % 16 === 15 && s === 12) return false;
    return true;
  }

  /** Every event that starts on global sixteenth `step`. */
  eventsAtStep(step) {
    const out = [];
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step - bar * STEPS_PER_BAR;
    const { def, barIn } = this.sectionAt(bar);
    const swing = s % 2 === 1 ? (this.swing - 0.5) * 2 : 0;
    const fillBar = def.fills && barIn % 16 === 15;
    const P = this.patterns;
    const hit = (voice, vel, salt, extra) => {
      if (vel > 0) out.push({ voice, vel: Math.min(1, vel * this.human(step, salt)), offset: swing, ...extra });
    };

    if (this.kickAt(step)) out.push({ voice: 'kick', vel: 1, offset: 0 });
    const chat = this.active(def, 'chat', barIn);
    if (chat) hit('chat', P[chat][s] * (fillBar && s >= 12 ? 1.15 : 1), 1);
    if (this.active(def, 'ohat', barIn)) hit('ohat', P.ohat[s], 2);
    if (this.active(def, 'clap', barIn)) hit('clap', P.clap[s], 3);
    const rim = this.active(def, 'rim', barIn);
    if (rim) hit('rim', P[rim][s], 4);
    if (fillBar && (s === 13 || s === 14 || s === 15)) hit('rim', 0.35 + 0.15 * (s - 13), 14);
    if (this.active(def, 'shaker', barIn)) hit('shaker', P.shaker[s], 5);
    if (this.active(def, 'ride', barIn)) hit('ride', P.ride[s], 6);
    if (this.active(def, 'perc', barIn)) {
      for (const [ps, v, n] of PERC) if (ps === s && (barIn % 2 === 1 || n === 'hi')) hit('perc', v, 7, { note: n });
    }

    const bass = this.active(def, 'bass', barIn);
    if (bass) {
      const pat = BASS[bar % 4 === 3 && bass === 'roll' ? 'rollTurn' : bass];
      for (let i = 0; i < pat.length; i++) {
        const [ps, note, flags = ''] = pat[i];
        if (ps !== s) continue;
        const next = pat[i + 1];
        const slide = flags.includes('s');
        const len = slide && next ? next[0] - ps : 0.55;
        hit('bass', flags.includes('a') ? 1 : 0.78, 8, { note: NOTES[note], len, slide, accent: flags.includes('a') });
      }
    }

    const stab = this.active(def, 'stab', barIn);
    if (stab) {
      const chord = CHORDS[def.chords[Math.floor(barIn / 4) % def.chords.length]];
      if (stab === 'S1') {
        for (const [ps, v] of STABS.S1) if (ps === s) hit('stab', v, 9, { notes: chord });
      } else if (step % 3 === 0) {
        hit('stab', [0.9, 0.5, 0.68, 0.55][Math.floor(step / 3) % 4], 9, { notes: chord });
      }
    }
    if (this.active(def, 'lead', barIn) && step % 3 === 1) {
      const k = Math.floor(step / 3);
      hit('lead', k % 5 === 0 ? 0.9 : 0.65, 10, { note: NOTES[LEAD_RIFF[k % LEAD_RIFF.length]] });
    }
    return out;
  }

  /** Continuous automation at song time `pos` (s): filter cutoffs, resonance, delay, riser. */
  automation(pos) {
    const bars = pos / (STEPS_PER_BAR * this.stepDur);
    const loopBars = ((bars % this.totalBars) + this.totalBars) % this.totalBars;
    const index = Math.min(this.sections.length - 1, Math.floor(loopBars / this.sectionBars));
    const def = this.compiled[index];
    const t = (loopBars - index * this.sectionBars) / this.sectionBars;
    const out = { ...AUTO_DEFAULTS, riser: 0, section: index };
    for (const [key, spec] of Object.entries(def.auto ?? {})) {
      if (key === 'riser') {
        const barIn = t * this.sectionBars;
        out.riser = barIn >= spec[0] && barIn < spec[1] ? (barIn - spec[0]) / (spec[1] - spec[0]) : 0;
        continue;
      }
      const [a, b, opts] = spec;
      let v = a + (b - a) * smooth(t);
      if (opts?.lfo) v += opts.lfo[0] * Math.sin((2 * Math.PI * loopBars) / opts.lfo[1]);
      out[key] = Math.min(1, Math.max(0, v));
    }
    return out;
  }
}
