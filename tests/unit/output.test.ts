import { describe, expect, it } from 'vitest';
import { DEFAULT_OUTPUT_SIZE, normalizeOutputOpacity, normalizeOutputSize } from '../../src/lib/output';

describe('output dimensions', () => {
  it('uses the legacy 1600 by 900 output by default', () => {
    expect(DEFAULT_OUTPUT_SIZE).toEqual({ width: 1600, height: 900 });
  });

  it('preserves custom dimensions and rounds them to whole pixels', () => {
    expect(normalizeOutputSize({ width: 2048, height: 2048 })).toEqual({ width: 2048, height: 2048 });
    expect(normalizeOutputSize({ width: 1920.4, height: 1080.6 })).toEqual({ width: 1920, height: 1081 });
  });

  it('clamps unsafe values and recovers from invalid numbers', () => {
    expect(normalizeOutputSize({ width: 1, height: 99999 })).toEqual({ width: 160, height: 7680 });
    expect(normalizeOutputSize({ width: Number.NaN, height: Number.POSITIVE_INFINITY })).toEqual(DEFAULT_OUTPUT_SIZE);
  });
});

describe('output backdrop opacity', () => {
  it('preserves transparency, clamps its range, and recovers from invalid numbers', () => {
    expect(normalizeOutputOpacity(0.35)).toBe(0.35);
    expect(normalizeOutputOpacity(0)).toBe(0);
    expect(normalizeOutputOpacity(-1)).toBe(0);
    expect(normalizeOutputOpacity(4)).toBe(1);
    expect(normalizeOutputOpacity(Number.NaN)).toBe(1);
    expect(normalizeOutputOpacity(Number.POSITIVE_INFINITY)).toBe(1);
  });
});
