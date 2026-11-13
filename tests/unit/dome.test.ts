import { describe, expect, it } from 'vitest';
import { createPlayer } from '../../src/data/defaults';
import {
  DEFAULT_PLANETARIUM_SETTINGS,
  domeAzimuthElevation,
  domeCenter,
  domeDirectionToScreen,
  domeLocalToWorld,
  domePlayerRotation,
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

  it('faces each selected side toward or away from the grid center with a rotation offset', () => {
    const grid = { ...gridGeometry, rotation: 0 };
    const settings = { ...DEFAULT_PLANETARIUM_SETTINGS, enabled: true };
    const player = { ...createPlayer(1), position: { x: 160, y: 0 }, domeWarp: true };
    expect(domePlayerRotation({ ...player, rotation: 0.23 }, outputSize, grid, settings)).toBeCloseTo(0.23);
    expect(domePlayerRotation({ ...player, domeOrientation: 'top-toward' }, outputSize, grid, settings)).toBeCloseTo(Math.PI / 2);
    expect(domePlayerRotation({ ...player, domeOrientation: 'top-away' }, outputSize, grid, settings)).toBeCloseTo(Math.PI * 1.5);
    expect(domePlayerRotation({ ...player, domeOrientation: 'right-toward' }, outputSize, grid, settings)).toBeCloseTo(Math.PI);
    expect(domePlayerRotation({ ...player, domeOrientation: 'right-away' }, outputSize, grid, settings)).toBeCloseTo(Math.PI * 2);
    expect(domePlayerRotation({ ...player, domeOrientation: 'top-toward', rotation: 0.2 }, outputSize, grid, settings)).toBeCloseTo(Math.PI / 2 + 0.2);

    const topToward = domeWorldToPosition(domeLocalToWorld(
      { ...player, domeOrientation: 'top-toward' }, { x: 0, y: 30 }, outputSize, grid, settings,
    ), outputSize, grid, settings);
    const topAway = domeWorldToPosition(domeLocalToWorld(
      { ...player, domeOrientation: 'top-away' }, { x: 0, y: 30 }, outputSize, grid, settings,
    ), outputSize, grid, settings);
    const rightToward = domeWorldToPosition(domeLocalToWorld(
      { ...player, domeOrientation: 'right-toward' }, { x: 30, y: 0 }, outputSize, grid, settings,
    ), outputSize, grid, settings);
    const rightAway = domeWorldToPosition(domeLocalToWorld(
      { ...player, domeOrientation: 'right-away' }, { x: 30, y: 0 }, outputSize, grid, settings,
    ), outputSize, grid, settings);
    expect(Math.hypot(topToward.x, topToward.y)).toBeLessThan(160);
    expect(Math.hypot(topAway.x, topAway.y)).toBeGreaterThan(160);
    expect(Math.hypot(rightToward.x, rightToward.y)).toBeLessThan(160);
    expect(Math.hypot(rightAway.x, rightAway.y)).toBeGreaterThan(160);
  });

  it('retargets named calibration references and remains finite at a coincident reference', () => {
    const grid = { ...gridGeometry, rotation: 0 };
    const settings = normalizePlanetariumSettings({
      enabled: true,
      calibrationPoints: [
        { id: 'east', name: 'East', azimuth: 0, elevation: 30, observed: { x: 0, y: 0 } },
        { id: 'west', name: 'West', azimuth: 180, elevation: 30, observed: { x: 0, y: 0 } },
      ],
    });
    const player = {
      ...createPlayer(1), position: { x: 160, y: 0 }, rotation: 0.15,
      domeWarp: true, domeOrientation: 'right-toward' as const, domeOrientationReference: 'east',
    };
    expect(domePlayerRotation(player, outputSize, grid, settings)).toBeCloseTo(0.15);
    expect(domePlayerRotation({ ...player, domeOrientationReference: 'west' }, outputSize, grid, settings)).toBeCloseTo(Math.PI + 0.15);
    expect(domePlayerRotation({ ...player, domeOrientationReference: 'deleted-point' }, outputSize, grid, settings)).toBeCloseTo(Math.PI + 0.15);

    const east = domeWorldToPosition(domeDirectionToScreen(
      domeAzimuthElevation(0, 30), outputSize, grid, settings,
    ), outputSize, grid, settings);
    const coincident = { ...player, position: east, domeOrientation: 'top-away' as const };
    expect(domePlayerRotation(coincident, outputSize, grid, settings)).toBe(0.15);
    expect(Number.isFinite(domeLocalToWorld(coincident, { x: 30, y: 15 }, outputSize, grid, settings).x)).toBe(true);
  });

  it('round-trips local points in every automatic facing mode with calibration references', () => {
    const settings = normalizePlanetariumSettings({
      enabled: true, tilt: 12, offsetX: 8, offsetY: -5,
      calibrationPoints: [{ id: 'front', name: 'Front', azimuth: 40, elevation: 25, observed: { x: 0, y: 0 } }],
    });
    const player = {
      ...createPlayer(1), position: { x: 90, y: -45 }, rotation: 0.17, scale: 1.15,
      domeWarp: true, domeOrientationReference: 'front',
    };
    const local = { x: 25, y: -40 };
    for (const domeOrientation of ['top-toward', 'top-away', 'right-toward', 'right-away'] as const) {
      const oriented = { ...player, domeOrientation };
      const world = domeLocalToWorld(oriented, local, outputSize, gridGeometry, settings);
      const restored = domeWorldToLocal(oriented, world, outputSize, gridGeometry, settings);
      expect(restored.x).toBeCloseTo(local.x, 8);
      expect(restored.y).toBeCloseTo(local.y, 8);
    }
  });
});
