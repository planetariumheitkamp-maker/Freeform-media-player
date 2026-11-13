import type {
  Player,
  Vec2,
  WorkspaceGridGeometry,
  WorkspaceOutputSize,
  WorkspacePlanetariumSettings,
  WorkspacePlanetariumSettingsInput,
} from '../types';

export const DEFAULT_PLANETARIUM_SETTINGS: WorkspacePlanetariumSettings = {
  enabled: false,
  fov: 180,
  tilt: 0,
  offsetX: 0,
  offsetY: 0,
  model: 'equidistant',
  truncation: 100,
  preview: 'projector',
  comparison: false,
  calibrationPoints: [],
  installation: {
    domeDiameter: 10,
    springLine: 0,
    projectorHeight: 1.5,
    lensThrow: 1,
    notes: '',
  },
};

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface CenterFrame {
  center: Vec3;
  basisX: Vec3;
  basisY: Vec3;
}

function clamp(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function rotateX(vector: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: vector.x,
    y: vector.y * cosine - vector.z * sine,
    z: vector.y * sine + vector.z * cosine,
  };
}

function rotateAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const cross = {
    x: axis.y * vector.z - axis.z * vector.y,
    y: axis.z * vector.x - axis.x * vector.z,
    z: axis.x * vector.y - axis.y * vector.x,
  };
  const projection = dot(axis, vector) * (1 - cosine);
  return {
    x: vector.x * cosine + cross.x * sine + axis.x * projection,
    y: vector.y * cosine + cross.y * sine + axis.y * projection,
    z: vector.z * cosine + cross.z * sine + axis.z * projection,
  };
}

export function normalizePlanetariumSettings(
  settings: WorkspacePlanetariumSettingsInput = {},
): WorkspacePlanetariumSettings {
  const installation = settings.installation ?? DEFAULT_PLANETARIUM_SETTINGS.installation;
  return {
    enabled: settings.enabled ?? DEFAULT_PLANETARIUM_SETTINGS.enabled,
    fov: clamp(settings.fov ?? DEFAULT_PLANETARIUM_SETTINGS.fov, DEFAULT_PLANETARIUM_SETTINGS.fov, 90, 180),
    tilt: clamp(settings.tilt ?? DEFAULT_PLANETARIUM_SETTINGS.tilt, DEFAULT_PLANETARIUM_SETTINGS.tilt, -45, 45),
    offsetX: clamp(settings.offsetX ?? DEFAULT_PLANETARIUM_SETTINGS.offsetX, 0, -50, 50),
    offsetY: clamp(settings.offsetY ?? DEFAULT_PLANETARIUM_SETTINGS.offsetY, 0, -50, 50),
    model: ['equidistant', 'equisolid', 'stereographic'].includes(settings.model ?? '')
      ? settings.model as WorkspacePlanetariumSettings['model']
      : DEFAULT_PLANETARIUM_SETTINGS.model,
    truncation: clamp(settings.truncation ?? DEFAULT_PLANETARIUM_SETTINGS.truncation, 100, 50, 100),
    preview: ['projector', 'unwarped', 'audience'].includes(settings.preview ?? '')
      ? settings.preview as WorkspacePlanetariumSettings['preview']
      : DEFAULT_PLANETARIUM_SETTINGS.preview,
    comparison: settings.comparison ?? DEFAULT_PLANETARIUM_SETTINGS.comparison,
    calibrationPoints: (settings.calibrationPoints ?? []).slice(0, 100).map((point, index) => ({
      id: point.id || crypto.randomUUID(),
      name: point.name || `Point ${index + 1}`,
      azimuth: clamp(point.azimuth, 0, -180, 180),
      elevation: clamp(point.elevation, 0, 0, 90),
      observed: {
        x: clamp(point.observed.x, 0, -10000, 10000),
        y: clamp(point.observed.y, 0, -10000, 10000),
      },
    })),
    installation: {
      domeDiameter: clamp(installation.domeDiameter, 10, 0.1, 1000),
      springLine: clamp(installation.springLine, 0, -100, 100),
      projectorHeight: clamp(installation.projectorHeight, 1.5, -100, 100),
      lensThrow: clamp(installation.lensThrow, 1, 0.01, 100),
      notes: installation.notes ?? '',
    },
  };
}

export function domeCenter(
  outputSize: WorkspaceOutputSize,
  settings: WorkspacePlanetariumSettings,
): Vec2 {
  return {
    x: outputSize.width * settings.offsetX / 100,
    y: outputSize.height * settings.offsetY / 100,
  };
}

export function domeRadius(
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
): number {
  return Math.min(outputSize.width, outputSize.height) * 0.5 * gridGeometry.radius / 100;
}

export function isDomeWarpActive(
  player: Player,
  settings: WorkspacePlanetariumSettings,
): boolean {
  return settings.enabled && player.domeWarp && !player.domePrewarped;
}

function modelHalfFov(settings: WorkspacePlanetariumSettings): number {
  // Stereographic projection approaches infinity at the horizon. Keep a finite,
  // explicitly documented 179-degree rim when the compatible 180-degree FOV is used.
  return radians(settings.model === 'stereographic' ? Math.min(settings.fov, 179) : settings.fov) * 0.5;
}

function radialFunction(theta: number, model: WorkspacePlanetariumSettings['model']): number {
  if (model === 'equisolid') return 2 * Math.sin(theta / 2);
  if (model === 'stereographic') return 2 * Math.tan(theta / 2);
  return theta;
}

export function domeAngleToRadius(theta: number, settings: WorkspacePlanetariumSettings): number {
  const halfFov = modelHalfFov(settings);
  const edge = radialFunction(halfFov, settings.model);
  return radialFunction(Math.max(0, theta), settings.model) / edge / (settings.truncation / 100);
}

export function domeRadiusToAngle(radius: number, settings: WorkspacePlanetariumSettings): number {
  const halfFov = modelHalfFov(settings);
  const value = Math.max(0, radius) * (settings.truncation / 100) * radialFunction(halfFov, settings.model);
  if (settings.model === 'equisolid') return 2 * Math.asin(Math.min(1, value / 2));
  if (settings.model === 'stereographic') return 2 * Math.atan(value / 2);
  return value;
}

export function domeAzimuthElevation(azimuth: number, elevation: number): Vec3 {
  const horizontal = Math.cos(radians(elevation));
  return {
    x: horizontal * Math.cos(radians(azimuth)),
    y: horizontal * Math.sin(radians(azimuth)),
    z: Math.sin(radians(elevation)),
  };
}

function centerFrame(position: Vec2, radius: number, settings: WorkspacePlanetariumSettings): CenterFrame {
  const distance = Math.hypot(position.x, position.y);
  const azimuth = distance > 1e-9 ? Math.atan2(position.y, position.x) : 0;
  const elevation = domeRadiusToAngle(distance / radius, settings);
  const axis = { x: -Math.sin(azimuth), y: Math.cos(azimuth), z: 0 };
  return {
    center: rotateAxis({ x: 0, y: 0, z: 1 }, axis, elevation),
    basisX: rotateAxis({ x: 1, y: 0, z: 0 }, axis, elevation),
    basisY: rotateAxis({ x: 0, y: 1, z: 0 }, axis, elevation),
  };
}

export function domeDirectionToScreen(
  direction: Vec3,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
  settings: WorkspacePlanetariumSettings,
): Vec2 {
  const tilted = rotateX(direction, radians(settings.tilt));
  const theta = Math.acos(Math.max(-1, Math.min(1, tilted.z)));
  const azimuth = Math.atan2(tilted.y, tilted.x) + radians(gridGeometry.rotation);
  const distance = domeRadius(outputSize, gridGeometry) * domeAngleToRadius(theta, settings);
  const center = domeCenter(outputSize, settings);
  return {
    x: center.x + Math.cos(azimuth) * distance,
    y: center.y + Math.sin(azimuth) * distance,
  };
}

export function domeScreenToDirection(
  point: Vec2,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
  settings: WorkspacePlanetariumSettings,
): Vec3 {
  const center = domeCenter(outputSize, settings);
  const x = point.x - center.x;
  const y = point.y - center.y;
  const theta = domeRadiusToAngle(Math.hypot(x, y) / domeRadius(outputSize, gridGeometry), settings);
  const azimuth = Math.atan2(y, x) - radians(gridGeometry.rotation);
  return rotateX({
    x: Math.sin(theta) * Math.cos(azimuth),
    y: Math.sin(theta) * Math.sin(azimuth),
    z: Math.cos(theta),
  }, -radians(settings.tilt));
}

function domeOrientationReferencePosition(
  player: Player,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
  settings: WorkspacePlanetariumSettings,
): Vec2 {
  if (player.domeOrientationReference === 'center') return { x: 0, y: 0 };
  const point = settings.calibrationPoints.find((candidate) => candidate.id === player.domeOrientationReference);
  if (!point) return { x: 0, y: 0 };
  return domeWorldToPosition(
    domeDirectionToScreen(domeAzimuthElevation(point.azimuth, point.elevation), outputSize, gridGeometry, settings),
    outputSize,
    gridGeometry,
    settings,
  );
}

export function domePlayerRotation(
  player: Player,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
  settings: WorkspacePlanetariumSettings,
): number {
  if (player.domeOrientation === 'manual') return player.rotation;
  const reference = domeOrientationReferencePosition(player, outputSize, gridGeometry, settings);
  const deltaX = reference.x - player.position.x;
  const deltaY = reference.y - player.position.y;
  if (Math.hypot(deltaX, deltaY) <= 1e-9) return player.rotation;
  const direction = Math.atan2(deltaY, deltaX);
  const baseRotation = player.domeOrientation === 'top-toward'
    ? direction - Math.PI / 2
    : player.domeOrientation === 'top-away'
      ? direction + Math.PI / 2
      : player.domeOrientation === 'right-away'
        ? direction + Math.PI
        : direction;
  return baseRotation + player.rotation;
}

export function domeLocalToWorld(
  player: Player,
  point: Vec2,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
  settings: WorkspacePlanetariumSettings,
): Vec2 {
  const radius = domeRadius(outputSize, gridGeometry);
  const frame = centerFrame(player.position, radius, settings);
  const rotation = domePlayerRotation(player, outputSize, gridGeometry, settings);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const localX = point.x * player.scale;
  const localY = point.y * player.scale;
  const offsetX = (localX * cosine - localY * sine) / radius;
  const offsetY = (localX * sine + localY * cosine) / radius;
  return domeDirectionToScreen(normalize({
    x: frame.center.x + frame.basisX.x * offsetX + frame.basisY.x * offsetY,
    y: frame.center.y + frame.basisX.y * offsetX + frame.basisY.y * offsetY,
    z: frame.center.z + frame.basisX.z * offsetX + frame.basisY.z * offsetY,
  }), outputSize, gridGeometry, settings);
}

export function domeWorldToLocal(
  player: Player,
  point: Vec2,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
  settings: WorkspacePlanetariumSettings,
): Vec2 {
  const radius = domeRadius(outputSize, gridGeometry);
  const direction = domeScreenToDirection(point, outputSize, gridGeometry, settings);
  const frame = centerFrame(player.position, radius, settings);
  const denominator = dot(direction, frame.center);
  if (Math.abs(denominator) < 1e-8) return { x: Number.NaN, y: Number.NaN };
  const offsetX = radius * dot(direction, frame.basisX) / denominator;
  const offsetY = radius * dot(direction, frame.basisY) / denominator;
  const rotation = domePlayerRotation(player, outputSize, gridGeometry, settings);
  const cosine = Math.cos(-rotation);
  const sine = Math.sin(-rotation);
  return {
    x: (offsetX * cosine - offsetY * sine) / player.scale,
    y: (offsetX * sine + offsetY * cosine) / player.scale,
  };
}

export function domeWorldToPosition(
  point: Vec2,
  outputSize: WorkspaceOutputSize,
  gridGeometry: WorkspaceGridGeometry,
  settings: WorkspacePlanetariumSettings,
): Vec2 {
  const direction = domeScreenToDirection(point, outputSize, gridGeometry, settings);
  const theta = Math.acos(Math.max(-1, Math.min(1, direction.z)));
  const azimuth = Math.atan2(direction.y, direction.x);
  const distance = domeRadius(outputSize, gridGeometry) * domeAngleToRadius(theta, settings);
  return { x: Math.cos(azimuth) * distance, y: Math.sin(azimuth) * distance };
}
