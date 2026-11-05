import type { WorkspaceTraceSettings, WorkspaceTraceSettingsInput } from '../types';

export const MIN_TRACE_SMOOTHING = 0;
export const MAX_TRACE_SMOOTHING = 20;
export const MIN_INTERIOR_NODE_SPACING = 8;
export const MAX_INTERIOR_NODE_SPACING = 96;

export const DEFAULT_TRACE_SETTINGS: WorkspaceTraceSettings = {
  smoothing: 2.5,
  interiorSpacing: 24,
  sourceMapping: 'crop',
};

function clamp(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeTraceSettings(settings: WorkspaceTraceSettingsInput): WorkspaceTraceSettings {
  const smoothing = clamp(
    settings.smoothing,
    DEFAULT_TRACE_SETTINGS.smoothing,
    MIN_TRACE_SMOOTHING,
    MAX_TRACE_SMOOTHING,
  );
  const interiorSpacing = clamp(
    settings.interiorSpacing,
    DEFAULT_TRACE_SETTINGS.interiorSpacing,
    MIN_INTERIOR_NODE_SPACING,
    MAX_INTERIOR_NODE_SPACING,
  );
  return {
    smoothing: Math.round(smoothing * 2) / 2,
    interiorSpacing: Math.round(interiorSpacing),
    sourceMapping: settings.sourceMapping === 'whole' ? 'whole' : DEFAULT_TRACE_SETTINGS.sourceMapping,
  };
}
