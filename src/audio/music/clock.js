/**
 * Musical time: a transport (song position ↔ clock time) and the lookahead step scheduler.
 *
 * Song time is seconds from the top of the track. One step is a sixteenth note. Every event's time
 * is computed from its step index (never from when the scheduler happened to run), so the event
 * list is identical however coarse or jittery the scheduler's ticks are: this is what makes the
 * music deterministic in the AudioWorklet, the ScriptProcessor fallback and the offline renders.
 */

export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;

export const stepDuration = (bpm) => 60 / bpm / STEPS_PER_BEAT;
export const beatDuration = (bpm) => 60 / bpm;
export const barDuration = (bpm) => (60 / bpm) * BEATS_PER_BAR;

/** Fractional position (0..1) within the current beat at song time `pos` (s). */
export function beatPhaseAt(pos, bpm) {
  const beats = (pos * bpm) / 60;
  const f = beats - Math.floor(beats);
  return f < 0 ? f + 1 : f;
}

/** Whole bars elapsed at song time `pos` (bar 0 is the first bar). */
export function barAt(pos, bpm) {
  return Math.floor((pos * bpm) / 60 / BEATS_PER_BAR + 1e-9);
}

/** Whole beats elapsed at song time `pos`. */
export function beatAt(pos, bpm) {
  return Math.floor((pos * bpm) / 60 + 1e-9);
}

/**
 * Transport: maps a monotonic clock (AudioContext.currentTime, or performance time before audio
 * starts) to song position, with play/stop that keep the position (a paused record, not a reset).
 */
export class Transport {
  constructor({ bpm = 128, position = 0 } = {}) {
    this.bpm = bpm;
    this.anchorClock = 0;
    this.anchorPos = position;
    this.playing = false;
  }

  /** Song position (s) at clock time `now`. */
  position(now) {
    return this.playing ? this.anchorPos + Math.max(0, now - this.anchorClock) : this.anchorPos;
  }

  play(now) {
    if (this.playing) return;
    this.anchorClock = now;
    this.playing = true;
  }

  stop(now) {
    if (!this.playing) return;
    this.anchorPos = this.position(now);
    this.playing = false;
  }

  /** Re-anchors to a new clock without moving the song (switching performance → audio clock). */
  rebase(oldNow, newNow) {
    this.anchorPos = this.position(oldNow);
    this.anchorClock = newNow;
  }

  beatPhase(now) {
    return beatPhaseAt(this.position(now), this.bpm);
  }

  bar(now) {
    return barAt(this.position(now), this.bpm);
  }

  beat(now) {
    return beatAt(this.position(now), this.bpm);
  }
}

/**
 * Lookahead scheduler: each tick(now) emits every step event whose step starts before
 * now + lookahead and has not been emitted yet, with its exact song time. `source.eventsAtStep(i)`
 * returns that step's events ({ voice, offset (steps, ≥ 0, swing / flams), ... }).
 */
export class LookaheadScheduler {
  constructor(source, { bpm = 128, lookahead = 0.1 } = {}) {
    this.source = source;
    this.bpm = bpm;
    this.lookahead = lookahead;
    this.nextStep = 0;
  }

  get stepDur() {
    return stepDuration(this.bpm);
  }

  /** Next tick starts from the first step at or after song time `pos`. */
  seek(pos) {
    this.nextStep = Math.max(0, Math.ceil(pos / this.stepDur - 1e-9));
  }

  stepTime(step) {
    return step * this.stepDur;
  }

  /** Emits events with time < now + lookahead (by step start). Returns the number emitted. */
  tick(now, emit) {
    const until = now + this.lookahead;
    const dur = this.stepDur;
    let n = 0;
    while (this.nextStep * dur < until) {
      const step = this.nextStep;
      for (const ev of this.source.eventsAtStep(step)) {
        emit({ ...ev, step, time: (step + (ev.offset ?? 0)) * dur });
        n++;
      }
      this.nextStep++;
    }
    return n;
  }
}
