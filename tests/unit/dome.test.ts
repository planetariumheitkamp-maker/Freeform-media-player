import { describe, expect, it } from 'vitest';
import { createPlayer } from '../../src/data/defaults';
import {
  DEFAULT_PLANETARIUM_SETTINGS,
  domeCenter,
  domeLocalToWorld,
  domeRadius,
  domeWorldToLocal,
  domeWorldToPosition,
  isDomeWarpActive,
  normalizePlanetariumSettings,
} from '../../src/lib/dome';
import type { WorkspaceGridGeometry, WorkspaceOutputSize } from '../../src/types';

const outputSize: WorkspaceOutputSize = { width: 1920, height: 1080 };
const gridGeometry: WorkspaceGridGeometry = {
  kind: 'circular',
  spacing: 50,
  rotation: 27,
  skewX: 0,
  skewY: 0,
  rings: 8,
  spokes: 24,
  radius: 85,
};

describe('planetarium projection', () => {
  it('normalizes settings and calculates the dome center and radius', () => {
    const settings = normalizePlanetariumSettings({
      enabled: true,
      fov: 240,
      tilt: -80,
      offsetX: Number.NaN,
      offsetY: 100,
    });
    expect(settings).toEqual({
      ...DEFAULT_PLANETARIUM_SETTINGS,
      enabled: true, fov: 180, tilt: -45, offsetX: 0, offsetY: 50,
    });
    expect(normalizePlanetariumSettings()).toEqual(DEFAULT_PLANETARIUM_SETTINGS);
    expect(domeCenter(outputSize, { ...DEFAULT_PLANETARIUM_SETTINGS, offsetX: 10, offsetY: -20 })).toEqual({ x: 192, y: -216 });
    expect(domeRadius(outputSize, gridGeometry)).toBeCloseTo(459);
  });

  it('requires both global mode and the per-player toggle', () => {
    const player = { ...createPlayer(1), domeWarp: true };
    expect(isDomeWarpActive(player, DEFAULT_PLANETARIUM_SETTINGS)).toBe(false);
    expect(isDomeWarpActive(player, { ...DEFAULT_PLANETARIUM_SETTINGS, enabled: true })).toBe(true);
    expect(isDomeWarpActive({ ...player, domeWarp: false }, { ...DEFAULT_PLANETARIUM_SETTINGS, enabled: true })).toBe(false);
  });

  it('round-trips local points with rotation, scale, tilt, offsets, and grid rotation', () => {
    const player = {
      ...createPlayer(1),
      position: { x: 90, y: -45 },
      rotation: 0.37,
      scale: 1.15,
      domeWarp: true,
    };
    const settings = normalizePlanetariumSettings({
      enabled: true,
      fov: 170,
      tilt: 12,
      offsetX: 8,
      offsetY: -5,
    });
    const local = { x: 25, y: -40 };
    const world = domeLocalToWorld(player, local, outputSize, gridGeometry, settings);
    const restored = domeWorldToLocal(player, world, outputSize, gridGeometry, settings);
    expect(restored.x).toBeCloseTo(local.x, 8);
    expect(restored.y).toBeCloseTo(local.y, 8);

    const centerWorld = domeLocalToWorld(player, { x: 0, y: 0 }, outputSize, gridGeometry, settings);
    const centerPosition = domeWorldToPosition(centerWorld, outputSize, gridGeometry, settings);
    expect(centerPosition.x).toBeCloseTo(player.position.x, 8);
    expect(centerPosition.y).toBeCloseTo(player.position.y, 8);
  });

  it('uses field of view for radial scaling and applies projection-center offsets', () => {
    const player = { ...createPlayer(1), position: { x: 0, y: 0 }, domeWarp: true };
    const hemisphere = { ...DEFAULT_PLANETARIUM_SETTINGS, enabled: true, fov: 180 };
    const narrower = { ...hemisphere, fov: 90 };
    const local = { x: 100, y: 0 };
    const widePoint = domeLocalToWorld(player, local, outputSize, gridGeometry, hemisphere);
    const narrowPoint = domeLocalToWorld(player, local, outputSize, gridGeometry, narrower);
    expect(Math.hypot(narrowPoint.x, narrowPoint.y)).toBeGreaterThan(Math.hypot(widePoint.x, widePoint.y));

    const shifted = { ...hemisphere, offsetX: 12, offsetY: -8 };
    expect(domeLocalToWorld(player, { x: 0, y: 0 }, outputSize, gridGeometry, shifted)).toEqual(domeCenter(outputSize, shifted));
  });
});
