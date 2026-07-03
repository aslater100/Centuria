import { describe, it, expect } from 'vitest';
import { FramePacer } from '../src/ui/framePacer';

/** Run `n` callbacks at a fixed vsync period (± deterministic jitter) and
 *  collect the gaps (in callbacks) between rendered frames after warm-up. */
function renderGaps(pacer: FramePacer, periodMs: number, n: number, jitterMs = 0): number[] {
  const gaps: number[] = [];
  let sinceRender = 0;
  for (let i = 0; i < n; i++) {
    const jitter = jitterMs === 0 ? 0 : (i % 2 === 0 ? jitterMs : -jitterMs);
    sinceRender++;
    if (pacer.step(periodMs + jitter)) {
      gaps.push(sinceRender);
      sinceRender = 0;
    }
  }
  return gaps;
}

describe('FramePacer', () => {
  it('renders every callback on a 60 Hz display', () => {
    const pacer = new FramePacer();
    const gaps = renderGaps(pacer, 1000 / 60, 300);
    expect(pacer.currentDivisor).toBe(1);
    expect(gaps.every((g) => g === 1)).toBe(true);
  });

  it('is immune to timestamp jitter at 60 Hz (no skipped-frame hitches)', () => {
    // The old `delta < 14ms → skip` gate turned a 13.9 ms jittered callback
    // into a ~33 ms render gap. Counting callbacks must not.
    const pacer = new FramePacer();
    const gaps = renderGaps(pacer, 1000 / 60, 600, 3);
    expect(gaps.every((g) => g === 1)).toBe(true);
  });

  it('locks to every 2nd callback on a 120 Hz display (steady 60 fps)', () => {
    const pacer = new FramePacer();
    const gaps = renderGaps(pacer, 1000 / 120, 600);
    expect(pacer.currentDivisor).toBe(2);
    // After the debounce window, cadence is perfectly even.
    const settled = gaps.slice(-100);
    expect(settled.every((g) => g === 2)).toBe(true);
  });

  it('locks to every 2nd callback on a 144 Hz display (steady 72 fps)', () => {
    const pacer = new FramePacer();
    renderGaps(pacer, 1000 / 144, 600);
    expect(pacer.currentDivisor).toBe(2);
  });

  it('locks to every 4th callback on a 240 Hz display (steady 60 fps)', () => {
    const pacer = new FramePacer();
    const gaps = renderGaps(pacer, 1000 / 240, 1200);
    expect(pacer.currentDivisor).toBe(4);
    const settled = gaps.slice(-100);
    expect(settled.every((g) => g === 4)).toBe(true);
  });

  it('debounces divisor changes: brief delta spikes do not flap the cadence', () => {
    const pacer = new FramePacer();
    renderGaps(pacer, 1000 / 120, 600);
    expect(pacer.currentDivisor).toBe(2);
    // 20 slow callbacks (a stall burst) — shorter than the stability window.
    renderGaps(pacer, 1000 / 30, 20);
    expect(pacer.currentDivisor).toBe(2);
    // Sustained 60 Hz eventually re-locks to rendering every callback.
    renderGaps(pacer, 1000 / 60, 600);
    expect(pacer.currentDivisor).toBe(1);
  });

  it('ignores insane deltas (tab restore, breakpoint) in the vsync estimate', () => {
    const pacer = new FramePacer();
    renderGaps(pacer, 1000 / 60, 300);
    const before = pacer.vsyncEstimateMs;
    pacer.step(5000);
    pacer.step(0);
    expect(pacer.vsyncEstimateMs).toBe(before);
  });
});
