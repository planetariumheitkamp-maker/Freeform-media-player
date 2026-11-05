import type { RenderQuality } from '../types';

export const DEFAULT_RENDER_QUALITY: RenderQuality = 'standard';
export const MAX_RENDER_PIXELS = 67_108_864;

export interface RenderQualityPreset {
  id: RenderQuality;
  name: string;
  scale: number;
  anisotropy: number;
  mipmaps: boolean;
  description: string;
}

export const RENDER_QUALITY_PRESETS: Record<RenderQuality, RenderQualityPreset> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    scale: 1,
    anisotropy: 4,
    mipmaps: false,
    description: 'Native display density with linear filtering. Best for editing and lower GPU load.',
  },
  high: {
    id: 'high',
    name: 'High',
    scale: 2,
    anisotropy: 8,
    mipmaps: true,
    description: '2× supersampling, mipmaps, and 8× anisotropic filtering for sharper projected output.',
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra',
    scale: 3,
    anisotropy: 16,
    mipmaps: true,
    description: '3× supersampling, mipmaps, and 16× anisotropic filtering for demanding large-screen projection.',
  },
};

export function isRenderQuality(value: unknown): value is RenderQuality {
  return value === 'standard' || value === 'high' || value === 'ultra';
}

export function normalizeRenderQuality(value: unknown): RenderQuality {
  return isRenderQuality(value) ? value : DEFAULT_RENDER_QUALITY;
}

export function getRenderQualityPreset(quality: RenderQuality): RenderQualityPreset {
  return RENDER_QUALITY_PRESETS[quality];
}

export function resolveRenderPixelRatio(
  width: number,
  height: number,
  basePixelRatio: number,
  quality: RenderQuality,
  maxTextureSize: number,
  maxPixels = MAX_RENDER_PIXELS,
): number {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeHeight = Math.max(1, Number.isFinite(height) ? height : 1);
  const safeBase = Number.isFinite(basePixelRatio) && basePixelRatio > 0 ? basePixelRatio : 1;
  const safeTextureSize = Number.isFinite(maxTextureSize) && maxTextureSize > 0 ? maxTextureSize : 8192;
  const desired = safeBase * getRenderQualityPreset(quality).scale;
  const dimensionLimit = Math.min(safeTextureSize / safeWidth, safeTextureSize / safeHeight);
  const budgetLimit = Math.sqrt(maxPixels / (safeWidth * safeHeight));
  return Math.max(0.01, Math.min(desired, dimensionLimit, budgetLimit));
}

export interface RenderPerformanceSample {
  fps: number;
  frameTime: number;
}

export function sampleRenderPerformance(
  startedAt: number,
  endedAt: number,
  frames: number,
): RenderPerformanceSample {
  const elapsed = endedAt - startedAt;
  if (!Number.isFinite(elapsed) || elapsed <= 0 || !Number.isFinite(frames) || frames <= 0) {
    return { fps: 0, frameTime: 0 };
  }
  return {
    fps: frames * 1000 / elapsed,
    frameTime: elapsed / frames,
  };
}
