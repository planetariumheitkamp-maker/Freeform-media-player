import { describe, expect, it } from 'vitest';
import { presentationTimeNeedsSync } from '../../src/lib/presentationMedia';

describe('Present media time synchronization', () => {
  it('follows small explicit seeks while paused', () => {
    expect(presentationTimeNeedsSync(0.32, 0.55, true)).toBe(true);
    expect(presentationTimeNeedsSync(12, 2, true)).toBe(true);
  });

  it('avoids rewriting an already aligned paused frame', () => {
    expect(presentationTimeNeedsSync(0.55, 0.56, true)).toBe(false);
  });

  it('retains drift tolerance during playback', () => {
    expect(presentationTimeNeedsSync(10.2, 10, false)).toBe(false);
    expect(presentationTimeNeedsSync(10.5, 10, false)).toBe(true);
  });

  it('rejects non-finite media timestamps', () => {
    expect(presentationTimeNeedsSync(Number.NaN, 1, true)).toBe(false);
    expect(presentationTimeNeedsSync(1, Number.POSITIVE_INFINITY, false)).toBe(false);
  });
});
