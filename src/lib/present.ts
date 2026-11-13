import { normalizeOutputSize } from './output';
import type {
  DesktopWindowPlacement,
  Player,
  PresentLayoutSnapshot,
  WorkspaceOutputSize,
  WorkspacePresentSettings,
  WorkspacePresentSettingsInput,
} from '../types';

export const DEFAULT_PRESENT_SETTINGS: WorkspacePresentSettings = {
  layoutLocked: false,
  lockedLayout: null,
  windowPlacement: null,
  transparency: false,
  ambient: {
    enabled: false,
    style: 'edge',
    intensity: 0.85,
    spread: 56,
    smoothing: 0.72,
  },
};

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function normalizeWindowPlacement(value: DesktopWindowPlacement | null | undefined): DesktopWindowPlacement | null {
  if (!value || typeof value.displayId !== 'string') return null;
  const numbers = [value.x, value.y, value.width, value.height];
  if (!numbers.every(Number.isFinite)) return null;
  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: clamp(Math.round(value.width), 640, 15360, 1500),
    height: clamp(Math.round(value.height), 480, 8640, 950),
    displayId: value.displayId,
  };
}

export function normalizePresentSettings(input?: WorkspacePresentSettingsInput): WorkspacePresentSettings {
  const defaults = DEFAULT_PRESENT_SETTINGS;
  const ambient = input?.ambient;
  return {
    layoutLocked: input?.layoutLocked === true,
    lockedLayout: input?.lockedLayout ? {
      players: input.lockedLayout.players,
      output: normalizeOutputSize(input.lockedLayout.output),
    } : null,
    windowPlacement: normalizeWindowPlacement(input?.windowPlacement),
    transparency: input?.transparency === true,
    ambient: {
      enabled: ambient?.enabled === true,
      style: ambient?.style === 'average' ? 'average' : 'edge',
      intensity: clamp(ambient?.intensity ?? defaults.ambient.intensity, 0, 2, defaults.ambient.intensity),
      spread: clamp(ambient?.spread ?? defaults.ambient.spread, 0, 160, defaults.ambient.spread),
      smoothing: clamp(ambient?.smoothing ?? defaults.ambient.smoothing, 0, 0.95, defaults.ambient.smoothing),
    },
  };
}

export function capturePresentLayout(players: Player[], output: WorkspaceOutputSize): PresentLayoutSnapshot {
  return structuredClone({ players, output });
}

export function restorePresentLayout(
  players: Player[],
  output: WorkspaceOutputSize,
  snapshot: PresentLayoutSnapshot | null,
): { players: Player[]; output: WorkspaceOutputSize } {
  if (!snapshot) return { players, output };
  const lockedPlayers = new Map(snapshot.players.map((player) => [player.id, player]));
  return {
    players: players.map((player) => {
      const locked = lockedPlayers.get(player.id);
      if (!locked) return player;
      return {
        ...player,
        position: { ...locked.position },
        rotation: locked.rotation,
        scale: locked.scale,
        mode: locked.mode,
        quickCorners: structuredClone(locked.quickCorners),
        nodes: structuredClone(locked.nodes),
        border: [...locked.border],
        domeWarp: locked.domeWarp,
        domePrewarped: locked.domePrewarped,
        domeOrientation: locked.domeOrientation ?? 'manual',
        domeOrientationReference: locked.domeOrientationReference ?? 'center',
      };
    }),
    output: { ...snapshot.output },
  };
}
