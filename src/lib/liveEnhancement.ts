import type {
  LiveEnhancementInputSize,
  PlayerLiveEnhancementInput,
  PlayerLiveEnhancementSettings,
} from '../types';

export const LIVE_ENHANCEMENT_MODEL_URL = 'https://huggingface.co/OwlMaster/AllFilesRope/resolve/main/realesr-general-x4v3.onnx';
export const LIVE_ENHANCEMENT_MODEL_BYTES = 4_871_181;
export const LIVE_ENHANCEMENT_MODEL_SHA256 = '09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4';
export const LIVE_ENHANCEMENT_MODEL_CACHE = 'freeform-live-ai-models-v1';
export const LIVE_ENHANCEMENT_MAX_LATENCY_MS = 350;
export const LIVE_ENHANCEMENT_INPUT_SIZES: LiveEnhancementInputSize[] = [320, 480, 640];

export const DEFAULT_PLAYER_LIVE_ENHANCEMENT: PlayerLiveEnhancementSettings = {
  enabled: false,
  strength: 0.8,
  inputSize: 320,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPlayerLiveEnhancement(value: unknown): value is PlayerLiveEnhancementInput {
  if (!isRecord(value)) return false;
  return (value.enabled === undefined || typeof value.enabled === 'boolean')
    && (value.strength === undefined || (typeof value.strength === 'number' && Number.isFinite(value.strength)))
    && (value.inputSize === undefined || (typeof value.inputSize === 'number' && Number.isFinite(value.inputSize)));
}

export function normalizePlayerLiveEnhancement(
  value?: PlayerLiveEnhancementInput | null,
): PlayerLiveEnhancementSettings {
  const strength = typeof value?.strength === 'number' && Number.isFinite(value.strength)
    ? Math.max(0, Math.min(1, value.strength))
    : DEFAULT_PLAYER_LIVE_ENHANCEMENT.strength;
  const requestedSize = value?.inputSize;
  const inputSize = LIVE_ENHANCEMENT_INPUT_SIZES.includes(requestedSize as LiveEnhancementInputSize)
    ? requestedSize as LiveEnhancementInputSize
    : DEFAULT_PLAYER_LIVE_ENHANCEMENT.inputSize;
  return {
    enabled: value?.enabled === true,
    strength,
    inputSize,
  };
}

export function fitLiveEnhancementInput(width: number, height: number, longEdge: LiveEnhancementInputSize) {
  const safeWidth = Math.max(2, Math.round(width));
  const safeHeight = Math.max(2, Math.round(height));
  const scale = Math.min(1, longEdge / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(2, Math.round(safeWidth * scale / 2) * 2),
    height: Math.max(2, Math.round(safeHeight * scale / 2) * 2),
  };
}

export function liveEnhancementFrameIsFresh(
  capturedAt: number,
  receivedAt: number,
  mediaTimeAtCapture: number,
  currentMediaTime: number,
  paused: boolean,
): boolean {
  if (paused) return true;
  return receivedAt - capturedAt <= LIVE_ENHANCEMENT_MAX_LATENCY_MS
    && Math.abs(currentMediaTime - mediaTimeAtCapture) * 1000 <= LIVE_ENHANCEMENT_MAX_LATENCY_MS;
}

export function liveEnhancementRetryDelay(consecutiveLateFrames: number): number {
  return consecutiveLateFrames >= 3 ? 2000 : 0;
}
