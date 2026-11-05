import { WORKSPACE_HEIGHT, WORKSPACE_WIDTH } from '../data/defaults';
import type { WorkspaceOutputSize } from '../types';

export const MIN_OUTPUT_DIMENSION = 160;
export const MAX_OUTPUT_DIMENSION = 7680;

export const DEFAULT_OUTPUT_SIZE: WorkspaceOutputSize = {
  width: WORKSPACE_WIDTH,
  height: WORKSPACE_HEIGHT,
};

function normalizeDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.max(MIN_OUTPUT_DIMENSION, Math.min(MAX_OUTPUT_DIMENSION, value)));
}

export function normalizeOutputSize(size: WorkspaceOutputSize): WorkspaceOutputSize {
  return {
    width: normalizeDimension(size.width, DEFAULT_OUTPUT_SIZE.width),
    height: normalizeDimension(size.height, DEFAULT_OUTPUT_SIZE.height),
  };
}

export function normalizeOutputOpacity(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
