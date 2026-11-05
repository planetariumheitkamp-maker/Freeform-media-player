import { describe, expect, it } from 'vitest';
import { DEFAULT_TRACE_SETTINGS, normalizeTraceSettings } from '../../src/lib/traceSettings';

describe('trace settings normalization', () => {
  it('rounds smoothing and spacing and preserves the selected source mapping', () => {
    expect(normalizeTraceSettings({ smoothing: 2.26, interiorSpacing: 24.6, sourceMapping: 'whole' })).toEqual({
      smoothing: 2.5,
      interiorSpacing: 25,
      sourceMapping: 'whole',
    });
  });

  it('clamps out-of-range values and restores missing settings to defaults', () => {
    expect(normalizeTraceSettings({ smoothing: -4, interiorSpacing: 500 })).toEqual({
      smoothing: 0,
      interiorSpacing: 96,
      sourceMapping: 'crop',
    });
    expect(normalizeTraceSettings({ smoothing: 99, interiorSpacing: -2 })).toEqual({
      smoothing: 20,
      interiorSpacing: 8,
      sourceMapping: 'crop',
    });
    expect(normalizeTraceSettings({
      smoothing: Number.NaN,
      interiorSpacing: Number.POSITIVE_INFINITY,
    })).toEqual(DEFAULT_TRACE_SETTINGS);
  });
});
