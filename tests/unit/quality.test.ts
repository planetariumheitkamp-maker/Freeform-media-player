import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RENDER_QUALITY,
  getRenderQualityPreset,
  isRenderQuality,
  MAX_RENDER_PIXELS,
  normalizeRenderQuality,
  RENDER_QUALITY_PRESETS,
  resolveRenderPixelRatio,
  sampleRenderPerformance,
} from '../../src/lib/quality';

describe('projection quality', () => {
  it('defines standard, high, and ultra rendering presets', () => {
    expect(DEFAULT_RENDER_QUALITY).toBe('standard');
    expect(Object.keys(RENDER_QUALITY_PRESETS)).toEqual(['standard', 'high', 'ultra']);
    expect(getRenderQualityPreset('standard')).toMatchObject({ scale: 1, anisotropy: 4, mipmaps: false });
    expect(getRenderQualityPreset('high')).toMatchObject({ scale: 2, anisotropy: 8, mipmaps: true });
    expect(getRenderQualityPreset('ultra')).toMatchObject({ scale: 3, anisotropy: 16, mipmaps: true });
  });

  it('normalizes legacy and unknown quality settings to standard', () => {
    expect(isRenderQuality('high')).toBe(true);
    expect(isRenderQuality('lossless')).toBe(false);
    expect(normalizeRenderQuality(undefined)).toBe('standard');
    expect(normalizeRenderQuality('ultra')).toBe('ultra');
    expect(normalizeRenderQuality(4)).toBe('standard');
  });

  it('multiplies native display density for high and ultra rendering', () => {
    expect(resolveRenderPixelRatio(800, 450, 1.5, 'standard', 8192)).toBe(1.5);
    expect(resolveRenderPixelRatio(800, 450, 1.5, 'high', 8192)).toBe(3);
    expect(resolveRenderPixelRatio(800, 450, 1.5, 'ultra', 8192)).toBe(4.5);
  });

  it('caps supersampling to the GPU texture dimensions', () => {
    expect(resolveRenderPixelRatio(2000, 1000, 2, 'high', 4096)).toBeCloseTo(2.048, 8);
    expect(resolveRenderPixelRatio(1000, 4000, 2, 'ultra', 4096)).toBeCloseTo(1.024, 8);
  });

  it('caps supersampling to the render-pixel safety budget', () => {
    expect(MAX_RENDER_PIXELS).toBe(67_108_864);
    expect(resolveRenderPixelRatio(1000, 1000, 1, 'high', 8192, 1_000_000)).toBe(1);
    expect(resolveRenderPixelRatio(2000, 1000, 1, 'ultra', 8192, 8_000_000)).toBe(2);
  });

  it('falls back safely for invalid display inputs', () => {
    expect(resolveRenderPixelRatio(0, Number.NaN, 0, 'standard', 0)).toBe(1);
    expect(resolveRenderPixelRatio(800, 450, 1, 'high', 8192)).toBe(2);
  });

  it('calculates live frame rate and frame time from elapsed render samples', () => {
    expect(sampleRenderPerformance(1000, 2000, 60)).toEqual({ fps: 60, frameTime: 1000 / 60 });
    expect(sampleRenderPerformance(1000, 2500, 30)).toEqual({ fps: 20, frameTime: 50 });
    expect(sampleRenderPerformance(1000, 1000, 0)).toEqual({ fps: 0, frameTime: 0 });
    expect(sampleRenderPerformance(2000, 1000, 60)).toEqual({ fps: 0, frameTime: 0 });
    expect(sampleRenderPerformance(0, Number.NaN, 60)).toEqual({ fps: 0, frameTime: 0 });
  });
});
