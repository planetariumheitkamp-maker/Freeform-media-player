import type { WorkspaceGridGeometry, WorkspacePlanetariumSettingsInput } from '../types';

export interface DomePreset {
  id: string;
  name: string;
  description: string;
  settings: WorkspacePlanetariumSettingsInput;
  grid: Partial<WorkspaceGridGeometry>;
}

export const DOME_PROJECTION_MODELS = [
  { id: 'equidistant', name: 'Equidistant', description: 'Radius is proportional to angle. The usual starting point for a fulldome fisheye.' },
  { id: 'equisolid', name: 'Equisolid angle', description: 'Uses 2 sin(θ/2), common in circular fisheye lenses.' },
  { id: 'stereographic', name: 'Stereographic', description: 'Uses 2 tan(θ/2). A 179° rim keeps the compatible 180° preset finite.' },
] as const;

export const DOME_PRESETS: DomePreset[] = [
  {
    id: 'hemisphere', name: 'Hemisphere 180°',
    description: 'Centered equidistant hemisphere using the current circular-grid radius.',
    settings: { enabled: true, model: 'equidistant', fov: 180, tilt: 0, offsetX: 0, offsetY: 0, truncation: 100 },
    grid: { kind: 'circular' },
  },
  {
    id: 'full-frame', name: 'Full-frame fisheye',
    description: 'A centered 180° circle fitted to the short edge of the output. This is not a 360° projection.',
    settings: { enabled: true, model: 'equidistant', fov: 180, tilt: 0, offsetX: 0, offsetY: 0, truncation: 100 },
    grid: { kind: 'circular', radius: 100 },
  },
  {
    id: 'truncated', name: 'Truncated dome',
    description: 'Maps a 135° angular cap to the full fisheye radius (75% of a 180° hemisphere).',
    settings: { enabled: true, model: 'equidistant', fov: 180, tilt: 0, offsetX: 0, offsetY: 0, truncation: 75 },
    grid: { kind: 'circular', radius: 100 },
  },
  {
    id: 'tilted', name: 'Tilted dome',
    description: 'A 15° dome-axis tilt with a small downward output offset.',
    settings: { enabled: true, model: 'equidistant', fov: 180, tilt: 15, offsetX: 0, offsetY: -8, truncation: 100 },
    grid: { kind: 'circular', radius: 100 },
  },
  {
    id: 'off-center', name: 'Off-center fisheye',
    description: 'An equisolid-angle lens with the optical center shifted right and up.',
    settings: { enabled: true, model: 'equisolid', fov: 180, tilt: 0, offsetX: 18, offsetY: 8, truncation: 100 },
    grid: { kind: 'circular', radius: 85 },
  },
];
