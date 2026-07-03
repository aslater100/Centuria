/**
 * Tiny WebAudio synth: every effect is an oscillator envelope, no assets.
 * The context is created lazily on the first user gesture (browser policy),
 * and the mute preference persists across sessions.
 */

/** Clamp a volume input to the valid [0, 1] gain range, falling back to full
 *  volume for non-finite input (e.g. a corrupted localStorage value). */
function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(1, Math.max(0, v));
}
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;
  /** Master gain multiplier for every SFX note, 0 (silent) to 1 (full). */
  volume = 1;

  constructor() {
    try {
      this.muted = localStorage.getItem('centuria-muted') === '1';
      const stored = localStorage.getItem('centuria-sfx-volume');
      if (stored !== null) this.volume = clampVolume(Number(stored));
    } catch {
      // storage unavailable (private mode etc.) — default to sound on
    }
  }

  toggleMuted(): void {
    this.muted = !this.muted;
    try {
      localStorage.setItem('centuria-muted', this.muted ? '1' : '0');
    } catch {
      // preference just won't persist
    }
  }

  /** Set the SFX master volume (0–1); clamps and persists like `toggleMuted`. */
  setVolume(v: number): void {
    this.volume = clampVolume(v);
    try {
      localStorage.setItem('centuria-sfx-volume', String(this.volume));
    } catch {
      // preference just won't persist
    }
  }

  /** Call from a user input handler so the context is allowed to start. */
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
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** One enveloped oscillator note, optionally gliding to a second pitch. */
  private tone(
    freq: number, durS: number, type: OscillatorType, vol: number,
    glideTo?: number, delayS = 0,
  ): void {
    if (this.muted || this.volume <= 0) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delayS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + durS);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol * this.volume, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durS + 0.02);
  }

  /** UI button / palette selection. */
  click(): void {
    this.tone(880, 0.05, 'square', 0.06);
  }

  /** Something good happened (building finished, hunt landed, arrival). */
  chime(): void {
    this.tone(660, 0.1, 'triangle', 0.1);
    this.tone(990, 0.16, 'triangle', 0.08, undefined, 0.09);
  }

  /** Something bad happened (spoilage, sickness, broken wall). */
  thud(): void {
    this.tone(180, 0.16, 'sawtooth', 0.1, 120);
  }

  /** The raid horn — long, low, unmistakable. */
  horn(): void {
    this.tone(220, 0.55, 'sawtooth', 0.14, 160);
    this.tone(110, 0.55, 'square', 0.08, 80, 0.05);
  }

  /** A death knell. */
  knell(): void {
    this.tone(392, 0.5, 'triangle', 0.12, 196);
    this.tone(98, 0.7, 'sine', 0.1, undefined, 0.12);
  }
}
