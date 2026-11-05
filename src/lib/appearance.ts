import type { PlayerVisualSettings } from '../types';

export const DEFAULT_BACKGROUND_COLOR = '#1a1d1b';

export const DEFAULT_PLAYER_VISUAL: PlayerVisualSettings = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  gamma: 1,
  hue: 0,
  temperature: 0,
};

export type PlayerVisualInput = Partial<PlayerVisualSettings>;

export function isBackgroundColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeBackgroundColor(value: unknown): string {
  return isBackgroundColor(value) ? value.toLowerCase() : DEFAULT_BACKGROUND_COLOR;
}

export function isPlayerVisual(value: unknown): value is PlayerVisualInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (Object.keys(DEFAULT_PLAYER_VISUAL) as (keyof PlayerVisualSettings)[]).every((field) => (
    input[field] === undefined || (typeof input[field] === 'number' && Number.isFinite(input[field]))
  ));
}

export function normalizePlayerVisual(value?: PlayerVisualInput | null): PlayerVisualSettings {
  const input = value ?? {};
  const clamp = (number: number | undefined, min: number, max: number, fallback: number) => (
    Math.max(min, Math.min(max, typeof number === 'number' && Number.isFinite(number) ? number : fallback))
  );
  return {
    brightness: clamp(input.brightness, 0, 2, 1),
    contrast: clamp(input.contrast, 0, 2, 1),
    saturation: clamp(input.saturation, 0, 2, 1),
    gamma: clamp(input.gamma, 0.2, 3, 1),
    hue: clamp(input.hue, -180, 180, 0),
    temperature: clamp(input.temperature, -100, 100, 0),
  };
}

export function isDefaultPlayerVisual(value?: PlayerVisualInput | null): boolean {
  return (Object.keys(DEFAULT_PLAYER_VISUAL) as (keyof PlayerVisualSettings)[]).every((field) => (
    (value?.[field] ?? DEFAULT_PLAYER_VISUAL[field]) === DEFAULT_PLAYER_VISUAL[field]
  ));
}
