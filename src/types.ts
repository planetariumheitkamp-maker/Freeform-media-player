export type SourceKind = 'test' | 'file' | 'stream' | 'catalog' | 'desktop' | 'device' | 'provider';
export type MediaType = 'video' | 'audio' | 'image' | 'capture' | 'test';
export type LinkMode = 'source' | 'transport';
export type EditorTool = 'select' | 'add-border' | 'add-interior' | 'trace-border' | 'trace-interior';
export type EditorMode = 'quick' | 'advanced';
export type TestPatternKind = 'orientation' | 'crosshatch' | 'starfield' | 'convergence' | 'latitude';
export type DomeProjectionModel = 'equidistant' | 'equisolid' | 'stereographic';
export type DomePreviewMode = 'projector' | 'unwarped' | 'audience';
export type CatalogMediaKind = 'movie' | 'series';
export type CatalogPlaybackMode = 'native' | 'embed';

export interface CatalogSourceRef {
  providerId: string;
  itemId: string;
  mediaKind: CatalogMediaKind;
  title: string;
  playbackMode: CatalogPlaybackMode;
  playerVariant: 'native';
  poster?: string;
  episodeId?: string;
  episodeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface CatalogEpisode {
  id: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  duration: number;
  uri: string;
  poster: string;
}

export interface CatalogItem {
  id: string;
  providerId: string;
  title: string;
  mediaKind: CatalogMediaKind;
  year: number;
  genres: string[];
  synopsis: string;
  duration: number;
  poster: string;
  uri?: string;
  episodes?: CatalogEpisode[];
}

export interface ProviderPlayerVariant {
  value: string;
  label: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  origin?: string;
  embedOrigin?: string;
  documentationUrl?: string;
  playerVariants?: ProviderPlayerVariant[];
  customUrl?: string;
  customMovieUrlTemplate?: string;
  customEpisodeUrlTemplate?: string;
  verifiedAt?: string;
  enabled: boolean;
  status: 'active' | 'review-required';
  playbackMode: CatalogPlaybackMode | 'unknown';
  meshCompatible: boolean;
  summary: string;
  requirement: string;
}

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
  providerCaptureId?: string;
  providerUrl?: string;
  providerKind?: ProviderCaptureKind;
  providerName?: string;
  withAudio?: boolean;
  testPattern?: TestPatternKind;
  catalog?: CatalogSourceRef;
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

export type LiveEnhancementInputSize = 320 | 480 | 640;

export interface PlayerLiveEnhancementSettings {
  enabled: boolean;
  strength: number;
  inputSize: LiveEnhancementInputSize;
}

export type PlayerLiveEnhancementInput = Partial<PlayerLiveEnhancementSettings>;

export interface LiveEnhancementRuntimeStatus {
  phase: 'off' | 'loading' | 'active' | 'fallback' | 'error';
  detail: string;
  backend?: 'webgpu' | 'wasm';
  inferenceMs?: number;
}

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
  enhancement?: PlayerLiveEnhancementInput;
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

export type AmbientLightingStyle = 'edge' | 'average';

export interface PresentAmbientSettings {
  enabled: boolean;
  style: AmbientLightingStyle;
  intensity: number;
  spread: number;
  smoothing: number;
}

export interface DesktopWindowPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId: string;
}

export interface PresentLayoutSnapshot {
  players: Player[];
  output: WorkspaceOutputSize;
}

export interface WorkspacePresentSettings {
  layoutLocked: boolean;
  lockedLayout: PresentLayoutSnapshot | null;
  windowPlacement: DesktopWindowPlacement | null;
  transparency: boolean;
  ambient: PresentAmbientSettings;
}

export type WorkspacePresentSettingsInput = Omit<Partial<WorkspacePresentSettings>, 'ambient'> & {
  ambient?: Partial<PresentAmbientSettings>;
};

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
  present?: WorkspacePresentSettings;
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

export type ProviderCaptureKind = 'vidqueen' | 'builtin' | 'custom';

export interface ProviderAdBlockSettings {
  enabled: boolean;
  rules: string[];
}

export interface ProviderCaptureWindowInfo {
  id: string;
  url: string;
  label: string;
  kind: ProviderCaptureKind;
  adBlock?: ProviderAdBlockSettings;
}

export interface ProviderCaptureState {
  id: string;
  status: 'ready' | 'closed' | 'error';
  detail?: string;
}

export interface CustomSourceVerification {
  kind: 'media' | 'web-player';
  originalUrl: string;
  finalUrl: string;
  finalOrigin: string;
  status: number;
  contentType: string;
  mediaType: 'video' | 'audio' | 'unknown' | 'web-player';
  cors: string | null;
  warnings: string[];
  checkedAt: string;
}

export interface RecordingState {
  directory: string;
  canceled?: boolean;
}

export interface RecordingStart {
  id: string;
  name: string;
  path: string;
  directory: string;
}

export interface RecordingInfo {
  id?: string;
  name: string;
  path: string;
  bytes: number;
  modifiedAt?: string;
}

export interface RecordingList {
  directory: string;
  recordings: RecordingInfo[];
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
  openProviderCapture(input: {
    url: string;
    label: string;
    kind?: ProviderCaptureKind;
    providerId?: string;
    providerName?: string;
    verifiedUrl?: string;
    adBlock?: ProviderAdBlockSettings;
  }): Promise<ProviderCaptureWindowInfo>;
  setProviderAdBlockSettings(settings: ProviderAdBlockSettings): Promise<ProviderAdBlockSettings>;
  prepareProviderCapture(id: string, withAudio: boolean): Promise<void>;
  closeProviderCapture(id: string): Promise<void>;
  onProviderCaptureState(callback: (state: ProviderCaptureState) => void): () => void;
  verifyCustomSource(input: { kind: 'media' | 'web-player'; url: string }): Promise<CustomSourceVerification>;
  getRecordingState(): Promise<RecordingState>;
  chooseRecordingDirectory(): Promise<RecordingState>;
  startRecording(input: { label: string }): Promise<RecordingStart>;
  appendRecording(id: string, chunk: ArrayBuffer): Promise<{ bytes: number }>;
  finishRecording(id: string): Promise<RecordingInfo>;
  discardRecording(id: string): Promise<{ discarded: boolean }>;
  listRecordings(): Promise<RecordingList>;
  openRecording(name: string): Promise<OpenedMedia>;
  showRecordingFolder(): Promise<RecordingState>;
  saveProject(defaultName: string, content: string): Promise<SaveProjectResult>;
  openProject(): Promise<OpenProjectResult>;
  setFullscreen(value: boolean): Promise<void>;
  getWindowPlacement(): Promise<DesktopWindowPlacement | null>;
  setWindowPlacement(placement: DesktopWindowPlacement): Promise<DesktopWindowPlacement | null>;
  setWindowLocked(value: boolean): Promise<void>;
  setTransparency(value: boolean): Promise<void>;
  beginWindowResize(direction: string, cursor: { x: number; y: number }): Promise<boolean>;
  updateWindowResize(cursor: { x: number; y: number }): Promise<DesktopWindowPlacement | null>;
  endWindowResize(): Promise<void>;
}
