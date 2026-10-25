export type SourceKind = 'test' | 'file' | 'stream' | 'desktop' | 'device';
export type MediaType = 'video' | 'audio' | 'image' | 'capture' | 'test';
export type LinkMode = 'source' | 'transport';
export type EditorTool = 'select' | 'add-border' | 'add-interior';
export type EditorMode = 'quick' | 'advanced';

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
  live: boolean;
  connected: boolean;
  detail?: string;
}

export interface Player {
  id: string;
  name: string;
  sourceId: string;
  groupId?: string;
  position: Vec2;
  rotation: number;
  scale: number;
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
}

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
  authorizeMedia(paths: string[]): Promise<Record<string, string>>;
  listDesktopSources(): Promise<DesktopSourceInfo[]>;
  prepareDesktopCapture(id: string, withAudio: boolean): Promise<void>;
  saveProject(defaultName: string, content: string): Promise<SaveProjectResult>;
  openProject(): Promise<OpenProjectResult>;
  setFullscreen(value: boolean): Promise<void>;
}
