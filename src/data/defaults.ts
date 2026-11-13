import { DEFAULT_PLAYER_VISUAL } from '../lib/appearance';
import type { MediaSource, Player, Vec2 } from '../types';

export const WORKSPACE_WIDTH = 1600;
export const WORKSPACE_HEIGHT = 900;
export const PLAYER_WIDTH = 480;
export const PLAYER_HEIGHT = 270;

export const TEST_SOURCE: MediaSource = {
  id: 'source:test-card',
  kind: 'test',
  mediaType: 'test',
  name: 'Calibration test card',
  live: false,
  connected: true,
  detail: 'Static geometry reference',
};

export function rectangleCorners(
  width = PLAYER_WIDTH,
  height = PLAYER_HEIGHT,
): [Vec2, Vec2, Vec2, Vec2] {
  return [
    { x: -width / 2, y: height / 2 },
    { x: width / 2, y: height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: -width / 2, y: -height / 2 },
  ];
}

export function createPlayer(index: number, sourceId = TEST_SOURCE.id): Player {
  const offset = ((index - 1) % 5) * 36;
  return {
    id: crypto.randomUUID(),
    name: `Player ${index}`,
    sourceId,
    position: { x: -220 + offset, y: 60 - offset * 0.45 },
    rotation: 0,
    scale: 1,
    mediaRotation: 0,
    mediaScale: 1,
    visual: { ...DEFAULT_PLAYER_VISUAL },
    opacity: 1,
    volume: 0.8,
    muted: false,
    loop: true,
    rate: 1,
    visible: true,
    locked: false,
    mode: 'quick',
    quickCorners: rectangleCorners(),
    nodes: [],
    border: [],
    autoplay: true,
    domeWarp: false,
    domePrewarped: false,
    domeOrientation: 'manual',
    domeOrientationReference: 'center',
  };
}

export const INITIAL_PROJECT_NAME = 'Untitled workspace';
