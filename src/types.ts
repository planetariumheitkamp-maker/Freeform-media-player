export type SourceKind = 'test' | 'file' | 'stream' | 'desktop' | 'device';
export type MediaType = 'video' | 'audio' | 'image' | 'capture' | 'test';
export type LinkMode = 'source' | 'transport';
export type EditorTool = 'select' | 'add-border' | 'add-interior' | 'trace-border' | 'trace-interior';
export type EditorMode = 'quick' | 'advanced';
export type TestPatternKind = 'orientation' | 'crosshatch' | 'starfield' | 'convergence' | 'latitude';
export type DomeProjectionModel = 'equidistant' | 'equisolid' | 'stereographic';
export type DomePreviewMode = 'projector' | 'unwarped' | 'audience';

export interface Vec2 {
  x: number;
  y: number;
}

export interface MeshNode extends Vec2 {
  id: string;
  u: number;
  v: number;
  kind: 'corner' | 'edge' | 'interior';
}

export interface MediaSource {
  id: string;
  kind: SourceKind;
  mediaType: MediaType;
  name: string;
  uri?: string;
  path?: string;
  mime?: string;
  desktopId?: string;
  deviceId?: string;
  withAudio?: boolean;
  testPattern?: TestPatternKind;
  live: boolean;
  connected: boolean;
  detail?: string;
}

export interface PlayerVisualSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
  hue: number;
  temperature: number;
}

export type PlayerVisualSettingsInput = Partial<PlayerVisualSettings>;

export interface Player {
  id: string;
  name: string;
  sourceId: string;
  groupId?: string;
  position: Vec2;
  rotation: number;
  scale: number;
  mediaRotation: number;
  mediaScale: number;
  visual?: PlayerVisualSettingsInput;
  opacity: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  rate: number;
  visible: boolean;
  locked: boolean;
  mode: EditorMode;
  quickCorners: [Vec2, Vec2, Vec2, Vec2];
  nodes: MeshNode[];
  border: string[];
  autoplay: boolean;
  domeWarp: boolean;
  domePrewarped: boolean;
}

export interface WorkspaceBackground {
  name: string;
  uri?: string;
  path?: string;
  mime?: string;
}

export type BuiltInGridKind = 'cartesian' | 'circular';

export interface WorkspaceGridGeometry {
  kind: BuiltInGridKind;
  spacing: number;
  rotation: number;
  skewX: number;
  skewY: number;
  rings: number;
  spokes: number;
  radius: number;
}

export type WorkspaceGridGeometryInput = Omit<WorkspaceGridGeometry, 'kind' | 'rings' | 'spokes' | 'radius'> & {
  kind?: BuiltInGridKind;
  rings?: number;
  spokes?: number;
  radius?: number;
};

export interface WorkspaceOutputSize {
  width: number;
  height: number;
}

export type RenderQuality = 'standard' | 'high' | 'ultra';

export type TraceSourceMapping = 'crop' | 'whole';

export interface WorkspaceTraceSettings {
  smoothing: number;
  interiorSpacing: number;
  sourceMapping: TraceSourceMapping;
}

export type WorkspaceTraceSettingsInput = Omit<WorkspaceTraceSettings, 'sourceMapping'> & {
  sourceMapping?: TraceSourceMapping;
};

export interface DomeCalibrationPoint {
  id: string;
  name: string;
  azimuth: number;
  elevation: number;
  observed: Vec2;
}

export interface DomeInstallationProfile {
  domeDiameter: number;
  springLine: number;
  projectorHeight: number;
  lensThrow: number;
  notes: string;
}

export interface WorkspacePlanetariumSettings {
  enabled: boolean;
  fov: number;
  tilt: number;
  offsetX: number;
  offsetY: number;
  model: DomeProjectionModel;
  truncation: number;
  preview: DomePreviewMode;
  comparison: boolean;
  calibrationPoints: DomeCalibrationPoint[];
  installation: DomeInstallationProfile;
}

export type WorkspacePlanetariumSettingsInput = Partial<WorkspacePlanetariumSettings>;

export interface LinkGroup {
  id: string;
  name: string;
  mode: LinkMode;
}

export interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export interface ProjectFile {
  format: 'freeform-workspace';
  version: 1;
  name: string;
  savedAt: string;
  sources: MediaSource[];
  players: Player[];
  groups: LinkGroup[];
  background?: WorkspaceBackground | null;
  backgroundColor?: string;
  grid?: WorkspaceGridGeometry;
  gridSnapping?: boolean;
  output?: WorkspaceOutputSize;
  outputOpacity?: number;
  quality?: RenderQuality;
  trace?: WorkspaceTraceSettings;
  planetarium?: WorkspacePlanetariumSettings;
}

export interface OpenedMedia {
  name: string;
  url: string;
  path?: string;
  mime?: string;
  mediaType: 'video' | 'audio' | 'image';
}

export interface DesktopSourceInfo {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string;
  displayId?: string;
}

export interface SaveProjectResult {
  canceled: boolean;
  path?: string;
}

export interface OpenProjectResult {
  canceled: boolean;
  path?: string;
  content?: string;
}

export interface FreeformBridge {
  isDesktop: boolean;
  platform: string;
  openLocalFiles(): Promise<OpenedMedia[]>;
  openBackgroundImage(): Promise<OpenedMedia | null>;
  authorizeMedia(paths: string[]): Promise<Record<string, string>>;
  listDesktopSources(): Promise<DesktopSourceInfo[]>;
  prepareDesktopCapture(id: string, withAudio: boolean): Promise<void>;
  saveProject(defaultName: string, content: string): Promise<SaveProjectResult>;
  openProject(): Promise<OpenProjectResult>;
  setFullscreen(value: boolean): Promise<void>;
}
