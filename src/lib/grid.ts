import type { Vec2, WorkspaceGridGeometry, WorkspaceGridGeometryInput, WorkspaceOutputSize } from '../types';

export const BUILT_IN_GRID_CELL_SIZE = 50;
export const CIRCULAR_GRID_SNAP_TOLERANCE = 12;

export const DEFAULT_GRID_GEOMETRY: WorkspaceGridGeometry = {
  kind: 'cartesian',
  spacing: BUILT_IN_GRID_CELL_SIZE,
  rotation: 0,
  skewX: 0,
  skewY: 0,
  rings: 8,
  spokes: 24,
  radius: 90,
};

function clamp(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeGridGeometry(geometry: WorkspaceGridGeometryInput): WorkspaceGridGeometry {
  return {
    kind: geometry.kind === 'circular' ? 'circular' : DEFAULT_GRID_GEOMETRY.kind,
    spacing: clamp(geometry.spacing, DEFAULT_GRID_GEOMETRY.spacing, 20, 400),
    rotation: clamp(geometry.rotation, DEFAULT_GRID_GEOMETRY.rotation, -180, 180),
    skewX: clamp(geometry.skewX, DEFAULT_GRID_GEOMETRY.skewX, -45, 45),
    skewY: clamp(geometry.skewY, DEFAULT_GRID_GEOMETRY.skewY, -45, 45),
    rings: Math.round(clamp(geometry.rings ?? DEFAULT_GRID_GEOMETRY.rings, DEFAULT_GRID_GEOMETRY.rings, 1, 32)),
    spokes: Math.round(clamp(geometry.spokes ?? DEFAULT_GRID_GEOMETRY.spokes, DEFAULT_GRID_GEOMETRY.spokes, 4, 72)),
    radius: Math.round(clamp(geometry.radius ?? DEFAULT_GRID_GEOMETRY.radius, DEFAULT_GRID_GEOMETRY.radius, 10, 100)),
  };
}

export function snapToCircularGrid(
  point: Vec2,
  geometry: WorkspaceGridGeometry,
  outputSize: WorkspaceOutputSize,
  screenScale: number,
  tolerance = CIRCULAR_GRID_SNAP_TOLERANCE,
  center: Vec2 = { x: 0, y: 0 },
): Vec2 {
  if (geometry.kind !== 'circular' || !Number.isFinite(screenScale) || screenScale <= 0) return point;
  const maxRadius = Math.min(outputSize.width, outputSize.height) * 0.5 * geometry.radius / 100;
  if (maxRadius <= 0) return point;
  const ringSpacing = maxRadius / geometry.rings;
  const relative = { x: point.x - center.x, y: point.y - center.y };
  const radius = Math.hypot(relative.x, relative.y);
  const snappedRadius = Math.min(maxRadius, Math.round(radius / ringSpacing) * ringSpacing);
  const rotation = geometry.rotation * Math.PI / 180;
  const spokeStep = Math.PI * 2 / geometry.spokes;
  const snappedAngle = rotation + Math.round((Math.atan2(relative.y, relative.x) - rotation) / spokeStep) * spokeStep;
  const candidate = {
    x: center.x + Math.cos(snappedAngle) * snappedRadius,
    y: center.y + Math.sin(snappedAngle) * snappedRadius,
  };
  return Math.hypot(candidate.x - point.x, candidate.y - point.y) * screenScale <= tolerance
    ? candidate
    : point;
}
