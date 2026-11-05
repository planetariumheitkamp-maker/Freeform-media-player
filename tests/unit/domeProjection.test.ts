import { describe, expect, it } from 'vitest';
import { createPlayer } from '../../src/data/defaults';
import {
  DEFAULT_PLANETARIUM_SETTINGS,
  domeAngleToRadius,
  domeAzimuthElevation,
  domeDirectionToScreen,
  domeLocalToWorld,
  domeRadiusToAngle,
  domeScreenToDirection,
  domeWorldToLocal,
  isDomeWarpActive,
  normalizePlanetariumSettings,
} from '../../src/lib/dome';
import { solveDomeCalibration } from '../../src/lib/domeCalibration';
import type { DomeProjectionModel, WorkspaceGridGeometry, WorkspaceOutputSize } from '../../src/types';

const output: WorkspaceOutputSize = { width: 1600, height: 900 };
const grid: WorkspaceGridGeometry = { kind: 'circular', spacing: 50, rotation: 12, skewX: 0, skewY: 0, rings: 8, spokes: 24, radius: 90 };

describe('lens models, truncation, and calibration', () => {
  it.each(['equidistant', 'equisolid', 'stereographic'] as DomeProjectionModel[])('round-trips directions and local mesh points for %s', (model) => {
    const settings = normalizePlanetariumSettings({ enabled: true, model, fov: 175, tilt: 17, offsetX: 8, offsetY: -4, truncation: 82 });
    const direction = domeAzimuthElevation(41, 36);
    const point = domeDirectionToScreen(direction, output, grid, settings);
    const restored = domeScreenToDirection(point, output, grid, settings);
    expect(restored.x).toBeCloseTo(direction.x, 8);
    expect(restored.y).toBeCloseTo(direction.y, 8);
    expect(restored.z).toBeCloseTo(direction.z, 8);
    const player = { ...createPlayer(1), position: { x: 80, y: -40 }, rotation: 0.2, scale: 1.3 };
    const local = { x: 35, y: -20 };
    const localRestored = domeWorldToLocal(player, domeLocalToWorld(player, local, output, grid, settings), output, grid, settings);
    expect(localRestored.x).toBeCloseTo(local.x, 7);
    expect(localRestored.y).toBeCloseTo(local.y, 7);
  });

  it('uses the documented angular truncation and bypasses prewarped media', () => {
    const settings = normalizePlanetariumSettings({ enabled: true, truncation: 75, fov: 180 });
    expect(domeRadiusToAngle(1, settings) * 180 / Math.PI).toBeCloseTo(67.5);
    expect(domeAngleToRadius(Math.PI * 67.5 / 180, settings)).toBeCloseTo(1);
    const player = { ...createPlayer(1), domeWarp: true, domePrewarped: true };
    expect(isDomeWarpActive(player, settings)).toBe(false);
    expect(isDomeWarpActive({ ...player, domePrewarped: false }, settings)).toBe(true);
  });

  it('solves synthetic reference points and reports small residuals', () => {
    const truth = normalizePlanetariumSettings({ enabled: true, fov: 170, tilt: 11, offsetX: 7, offsetY: -5, truncation: 85 });
    const truthGrid = { ...grid, rotation: 19 };
    const references = [[-120, 12], [-35, 30], [55, 20], [135, 45], [10, 68], [-150, 58]];
    const calibrationPoints = references.map(([azimuth, elevation], index) => ({
      id: `p${index}`, name: `P${index}`, azimuth, elevation,
      observed: domeDirectionToScreen(domeAzimuthElevation(azimuth, elevation), output, truthGrid, truth),
    }));
    const initial = normalizePlanetariumSettings({ ...truth, tilt: 3, offsetX: 0, offsetY: 0, calibrationPoints });
    const result = solveDomeCalibration(initial, output, { ...truthGrid, rotation: 0 });
    expect(result.settings.tilt).toBeCloseTo(11, 2);
    expect(result.settings.offsetX).toBeCloseTo(7, 2);
    expect(result.settings.offsetY).toBeCloseTo(-5, 2);
    expect(result.gridRotation).toBeCloseTo(19, 2);
    expect(result.rms).toBeLessThan(0.01);
    expect(result.residuals).toHaveLength(6);
  });

  it('rejects insufficient and duplicate calibration points explicitly', () => {
    expect(() => solveDomeCalibration(DEFAULT_PLANETARIUM_SETTINGS, output, grid)).toThrow('at least four distinct');
    const point = { id: 'one', name: 'One', azimuth: 0, elevation: 30, observed: { x: 0, y: 0 } };
    expect(() => solveDomeCalibration(normalizePlanetariumSettings({ calibrationPoints: [point, point, point, point] }), output, grid)).toThrow('distinct');
  });
});
