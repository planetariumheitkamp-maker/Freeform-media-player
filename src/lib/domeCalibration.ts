import {
  domeAzimuthElevation,
  domeDirectionToScreen,
  normalizePlanetariumSettings,
} from './dome';
import type {
  Vec2,
  WorkspaceGridGeometry,
  WorkspaceOutputSize,
  WorkspacePlanetariumSettings,
} from '../types';

interface FitParameters {
  offsetX: number;
  offsetY: number;
  tilt: number;
  gridRotation: number;
}

export interface DomeCalibrationResult {
  settings: Pick<WorkspacePlanetariumSettings, 'offsetX' | 'offsetY' | 'tilt'>;
  gridRotation: number;
  rms: number;
  maxResidual: number;
  iterations: number;
  residuals: { id: string; distance: number }[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function solveLinear(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-14) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) augmented[row][entry] -= factor * augmented[column][entry];
    }
  }
  return augmented.map((row) => row[size]);
}

function bounded(parameters: number[]): number[] {
  return [
    clamp(parameters[0], -50, 50), clamp(parameters[1], -50, 50),
    clamp(parameters[2], -45, 45), clamp(parameters[3], -180, 180),
  ];
}

export function solveDomeCalibration(
  settings: WorkspacePlanetariumSettings,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
): DomeCalibrationResult {
  const points = settings.calibrationPoints;
  const unique = new Set(points.map((point) => `${point.azimuth.toFixed(4)}:${point.elevation.toFixed(4)}`));
  if (points.length < 4 || unique.size < 4) {
    throw new Error('Add at least four distinct reference points before solving the four calibration parameters.');
  }
  const initial: FitParameters = {
    offsetX: settings.offsetX, offsetY: settings.offsetY, tilt: settings.tilt, gridRotation: gridGeometry.rotation,
  };
  const calculate = (values: number[]): Vec2[] => {
    const next = normalizePlanetariumSettings({
      ...settings, offsetX: values[0], offsetY: values[1], tilt: values[2],
    });
    const grid = { ...gridGeometry, rotation: values[3] };
    return points.map((point) => domeDirectionToScreen(
      domeAzimuthElevation(point.azimuth, point.elevation), outputSize, grid, next,
    ));
  };
  const errors = (values: number[]): number[] => calculate(values).flatMap((predicted, index) => [
    predicted.x - points[index].observed.x, predicted.y - points[index].observed.y,
  ]);
  const squaredError = (residuals: number[]) => residuals.reduce((sum, value) => sum + value * value, 0);
  let current = bounded([initial.offsetX, initial.offsetY, initial.tilt, initial.gridRotation]);
  let residuals = errors(current);
  let error = squaredError(residuals);
  const initialError = error;
  let damping = 0.001;
  let accepted = 0;
  let iterations = 0;

  for (; iterations < 80; iterations += 1) {
    const jacobian = residuals.map(() => [0, 0, 0, 0]);
    for (let parameter = 0; parameter < 4; parameter += 1) {
      const step = parameter < 2 ? 0.001 : 0.0001;
      const plus = [...current];
      const minus = [...current];
      plus[parameter] += step;
      minus[parameter] -= step;
      const plusErrors = errors(plus);
      const minusErrors = errors(minus);
      for (let row = 0; row < residuals.length; row += 1) {
        jacobian[row][parameter] = (plusErrors[row] - minusErrors[row]) / (2 * step);
      }
    }
    const normal = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    const gradient = [0, 0, 0, 0];
    for (let row = 0; row < residuals.length; row += 1) {
      for (let a = 0; a < 4; a += 1) {
        gradient[a] += jacobian[row][a] * residuals[row];
        for (let b = 0; b < 4; b += 1) normal[a][b] += jacobian[row][a] * jacobian[row][b];
      }
    }
    for (let diagonal = 0; diagonal < 4; diagonal += 1) {
      normal[diagonal][diagonal] += damping * Math.max(1, normal[diagonal][diagonal]);
    }
    const step = solveLinear(normal, gradient.map((value) => -value));
    if (!step || step.some((value) => !Number.isFinite(value))) {
      damping *= 10;
      if (damping > 1e12) break;
      continue;
    }
    const candidate = bounded(current.map((value, index) => value + step[index]));
    const candidateResiduals = errors(candidate);
    const candidateError = squaredError(candidateResiduals);
    if (candidateError < error && Number.isFinite(candidateError)) {
      current = candidate;
      residuals = candidateResiduals;
      error = candidateError;
      damping = Math.max(1e-9, damping / 3);
      accepted += 1;
      if (Math.hypot(...step) < 1e-7) { iterations += 1; break; }
    } else {
      damping *= 10;
      if (damping > 1e12) break;
    }
  }

  if (!accepted || !Number.isFinite(error) || error > initialError) {
    throw new Error('Calibration could not find a stable improvement. Check the point coordinates and spread them across the dome.');
  }
  const distances = points.map((_, index) => Math.hypot(residuals[index * 2], residuals[index * 2 + 1]));
  return {
    settings: { offsetX: current[0], offsetY: current[1], tilt: current[2] },
    gridRotation: current[3],
    rms: Math.sqrt(error / points.length),
    maxResidual: Math.max(...distances),
    iterations,
    residuals: points.map((point, index) => ({ id: point.id, distance: distances[index] })),
  };
}
