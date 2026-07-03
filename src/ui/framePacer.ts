/**
 * Render-cadence pacing for the main animation loop.
 *
 * The loop used to soft-cap at ~70 FPS by skipping any rAF callback that
 * arrived <14 ms after the last *rendered* frame. That gate compares raw
 * timestamps against a fixed threshold, which fails two ways:
 *  - On a plain 60 Hz display, timer jitter occasionally delivers a callback
 *    at ~13.9 ms; the gate skips it and the next render lands ~33 ms after the
 *    previous one — a visible hitch in an otherwise steady stream.
 *  - On high-refresh displays the achieved rate is whatever multiple of the
 *    vsync period happens to clear 14 ms (144 Hz → 48 fps), leaving headroom
 *    on the table.
 *
 * `FramePacer` instead estimates the display's vsync period from an EMA of
 * callback deltas and renders every Nth callback, where N is the smallest
 * integer divisor that lands at or under ~72 fps (60 Hz → every callback,
 * 120 Hz → every 2nd, 144 Hz → every 2nd = 72 fps, 240 Hz → every 4th).
 * Counting callbacks instead of comparing timestamps makes the cadence
 * immune to timestamp jitter, and an integer divisor of the vsync rate is by
 * construction evenly paced — no alternating short/long frame gaps.
 *
 * Divisor changes are debounced: a new divisor is adopted only after the
 * vsync estimate has implied it for `STABLE_CALLBACKS` consecutive callbacks,
 * so boundary jitter (e.g. a 90 Hz panel wobbling across a threshold) can't
 * flap the cadence frame to frame.
 *
 * Pure and side-effect-free — feed it the delta between consecutive rAF
 * callbacks; it answers "render this one?". Unit-tests with synthetic deltas.
 */

/** Target frame period the divisor aims at (~60 fps, tolerating up to ~72). */
const TARGET_MS = 1000 / 60;
/** A candidate divisor must hold this many consecutive callbacks to be adopted. */
const STABLE_CALLBACKS = 60;
/** EMA smoothing for the vsync-period estimate. */
const EMA_ALPHA = 0.1;
/** Deltas outside this range are noise (tab restore, breakpoint) — not vsync. */
const MIN_SANE_MS = 1;
const MAX_SANE_MS = 100;

export class FramePacer {
  private vsyncEmaMs = TARGET_MS;
  private divisor = 1;
  private candidate = 1;
  private candidateStreak = 0;
  private sinceRender = 0;

  /** Current vsync-period estimate in ms (for telemetry/tests). */
  get vsyncEstimateMs(): number {
    return this.vsyncEmaMs;
  }

  /** Current render divisor (render every Nth callback). */
  get currentDivisor(): number {
    return this.divisor;
  }

  /**
   * Feed one rAF callback with the delta (ms) since the previous callback.
   * Returns true if this callback should render.
   */
  step(deltaMs: number): boolean {
    if (deltaMs >= MIN_SANE_MS && deltaMs <= MAX_SANE_MS) {
      this.vsyncEmaMs += (deltaMs - this.vsyncEmaMs) * EMA_ALPHA;
    }

    // Nearest integer divisor of the vsync rate to the ~60 fps target:
    // 144 Hz → 2 (72 fps) rather than the old threshold gate's 3 (48 fps).
    const ideal = Math.max(1, Math.round(TARGET_MS / this.vsyncEmaMs));
    if (ideal === this.candidate) {
      this.candidateStreak++;
    } else {
      this.candidate = ideal;
      this.candidateStreak = 1;
    }
    if (this.candidate !== this.divisor && this.candidateStreak >= STABLE_CALLBACKS) {
      this.divisor = this.candidate;
      this.sinceRender = 0;
    }

    this.sinceRender++;
    if (this.sinceRender >= this.divisor) {
      this.sinceRender = 0;
      return true;
    }
    return false;
  }
}
