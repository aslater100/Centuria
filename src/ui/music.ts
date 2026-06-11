/**
 * Procedural era-aware soundtrack (GDD §3.3) — no audio assets, every note is
 * a WebAudio oscillator, the same philosophy as the SFX synth. A lookahead
 * scheduler lays down a chord pad, a bassline, an arpeggiated lead and light
 * percussion. The instrumentation ages with the century, and the mix follows
 * a tension scalar: paused or calm play drops to the ambient pad alone, a raid
 * brings the lead and drums up. The chip timbre never fully leaves — it is the
 * franchise voice — but the era around it modernizes.
 */

/** Equal-tempered frequency for `semitones` above a reference pitch. */
function freqAt(baseHz: number, semitones: number): number {
  return baseHz * Math.pow(2, semitones / 12);
}

// Scales as semitone offsets within the octave.
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

type ScaleName = keyof typeof SCALES;

export interface EraVoicing {
  id: string;
  /** First year (inclusive) this era's music takes over. */
  fromYear: number;
  scale: ScaleName;
  /** Chord roots as scale-degree indices; a bar sits on each in turn. */
  progression: number[];
  bpm: number;
  pad: OscillatorType;
  bass: OscillatorType;
  lead: OscillatorType;
  /** Detune spread (cents) for a fatter, analog-synth pad. */
  detune: number;
  /** Add a four-on-the-floor kick from this era on (electronica). */
  fourFloor: boolean;
}

/**
 * The eight-era audio arc, keyed by date window (GDD §3.3). Ragtime chiptune
 * gives way to chip-jazz, then synth strings creep in mid-century, analog
 * idioms in the 70s–90s, layered electronica in the 2000s, and a calm hybrid
 * pad in the speculative era.
 */
export const ERAS: EraVoicing[] = [
  { id: 'ragtime', fromYear: 1900, scale: 'major', progression: [0, 3, 4, 0], bpm: 104, pad: 'triangle', bass: 'square', lead: 'square', detune: 0, fourFloor: false },
  { id: 'chipjazz', fromYear: 1918, scale: 'mixolydian', progression: [0, 5, 1, 4], bpm: 96, pad: 'triangle', bass: 'triangle', lead: 'square', detune: 0, fourFloor: false },
  { id: 'midcentury', fromYear: 1945, scale: 'major', progression: [0, 4, 5, 3], bpm: 84, pad: 'sine', bass: 'triangle', lead: 'triangle', detune: 4, fourFloor: false },
  { id: 'analog', fromYear: 1970, scale: 'dorian', progression: [0, 6, 5, 4], bpm: 112, pad: 'sawtooth', bass: 'sawtooth', lead: 'square', detune: 10, fourFloor: false },
  { id: 'electronica', fromYear: 2000, scale: 'minor', progression: [0, 5, 3, 4], bpm: 124, pad: 'sawtooth', bass: 'square', lead: 'sawtooth', detune: 8, fourFloor: true },
  { id: 'future', fromYear: 2040, scale: 'dorian', progression: [0, 3, 5, 1], bpm: 76, pad: 'sine', bass: 'sine', lead: 'triangle', detune: 6, fourFloor: false },
];

/** The era whose date window contains `year` (clamped to the first/last era). */
export function eraForYear(year: number): EraVoicing {
  let chosen = ERAS[0];
  for (const e of ERAS) if (year >= e.fromYear) chosen = e;
  return chosen;
}

/** Live signals the soundtrack reacts to, fed from the game loop each frame. */
export interface MusicContext {
  year: number;
  paused: boolean;
  /** 0 = calm, 1 = under attack — raises lead/drum intensity. */
  tension: number;
}

const BASE_HZ = 55; // A1, the floor the bass sits near.

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled: boolean;

  // Scheduler state.
  private nextNoteTime = 0;
  private step = 0; // 16th-note counter, wraps every 16 (one bar)
  private bar = 0;
  private era = ERAS[0];
  // Smoothed mix targets so layers fade in and out instead of clicking.
  private intensity = 0; // lead/perc presence, eased toward a target
  private seed = 0x2545f491; // tiny LCG state for melodic choice

  constructor() {
    let on = true;
    try {
      on = localStorage.getItem('centuria-music') !== '0';
    } catch {
      // storage unavailable — default to music on
    }
    this.enabled = on;
  }

  toggle(): void {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('centuria-music', this.enabled ? '1' : '0');
    } catch {
      // preference just won't persist
    }
    if (!this.enabled && this.master) this.master.gain.value = 0;
  }

  /** Call from a user gesture so the browser lets the context start. */
  unlock(): void {
    this.ensure();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      this.nextNoteTime = this.ctx.currentTime + 0.1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** A fast deterministic-ish pick in [0,1); keeps the melody from looping flat. */
  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  /** Frequency for `degree` steps up the current scale (degrees may exceed 7). */
  private scaleFreq(rootDegree: number, octave: number): number {
    const scale = SCALES[this.era.scale];
    const deg = rootDegree % scale.length;
    const oct = octave + Math.floor(rootDegree / scale.length);
    return freqAt(BASE_HZ, scale[deg] + 12 * oct);
  }

  private chordRoot(): number {
    return this.era.progression[this.bar % this.era.progression.length];
  }

  /** One enveloped oscillator note on the master bus. */
  private note(
    freq: number, time: number, durS: number, type: OscillatorType, vol: number,
    detune = 0,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (detune) osc.detune.setValueAtTime(detune, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + durS);
    osc.connect(gain).connect(this.master!);
    osc.start(time);
    osc.stop(time + durS + 0.02);
  }

  /** A short noise burst for hats; built from a buffer source. */
  private noise(time: number, durS: number, vol: number): void {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * durS));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + durS);
    src.connect(gain).connect(this.master!);
    src.start(time);
    src.stop(time + durS);
  }

  /** Lay down all the voices that land on `step` (a 16th) at `time`. */
  private scheduleStep(time: number, intensity: number): void {
    const root = this.chordRoot();
    const e = this.era;

    // Pad: a sustained triad at the top of each bar — the ambient bed that
    // plays even when the game is paused.
    if (this.step === 0) {
      const barS = (60 / e.bpm) * 4;
      for (const d of [0, 2, 4]) {
        this.note(this.scaleFreq(root + d, 2), time, barS, e.pad, 0.018, this.rand() * e.detune - e.detune / 2);
      }
    }

    // Bass: root on the strong beats (every quarter note = every 4 steps).
    if (this.step % 4 === 0) {
      const walk = this.step === 8 ? 4 : 0; // a little walk to the fifth mid-bar
      this.note(this.scaleFreq(root + walk, 1), time, 60 / e.bpm * 0.9, e.bass, 0.05);
    }

    // Lead arpeggio: chord tones on the off-beats, presence scaled by intensity.
    if (intensity > 0.05 && this.step % 2 === 1) {
      const tones = [0, 2, 4, 6];
      const pick = tones[Math.floor(this.rand() * tones.length)];
      const oct = this.rand() < 0.3 ? 4 : 3;
      this.note(this.scaleFreq(root + pick, oct), time, 60 / e.bpm * 0.4, e.lead, 0.03 * intensity);
    }

    // Percussion: hat on off-beats once there's energy, plus an era kick.
    if (intensity > 0.35) {
      if (this.step % 2 === 0) this.noise(time, 0.04, 0.02 * intensity);
      const kickStep = e.fourFloor ? this.step % 4 === 0 : this.step === 0 || this.step === 8;
      if (kickStep) this.note(freqAt(BASE_HZ, -12), time, 0.12, 'sine', 0.06 * intensity);
    }
  }

  /**
   * Advance the scheduler up to a short lookahead horizon. Called once per
   * animation frame from the game loop, fed the live game signals.
   */
  update(c: MusicContext): void {
    if (!this.enabled) {
      if (this.master) this.master.gain.value = 0;
      return;
    }
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    // Pick the era for the current year; switches take effect at the next bar.
    const era = eraForYear(c.year);
    // Ease master volume up from silence, and the lead/drum intensity toward a
    // target set by pause and tension. Paused → pad only; tension → full kit.
    const targetMaster = 0.5;
    this.master.gain.value += (targetMaster - this.master.gain.value) * 0.02;
    const targetIntensity = c.paused ? 0 : 0.45 + 0.55 * Math.min(1, Math.max(0, c.tension));
    this.intensity += (targetIntensity - this.intensity) * 0.03;

    const stepDur = 60 / era.bpm / 4; // a 16th note
    const horizon = ctx.currentTime + 0.2;
    while (this.nextNoteTime < horizon) {
      this.era = era;
      this.scheduleStep(this.nextNoteTime, this.intensity);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }
}
