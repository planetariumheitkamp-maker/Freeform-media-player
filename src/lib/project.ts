import { TEST_SOURCE } from '../data/defaults';
import { DEFAULT_BACKGROUND_COLOR, isBackgroundColor, isPlayerVisual, normalizeBackgroundColor, normalizePlayerVisual } from './appearance';
import { DEFAULT_GRID_GEOMETRY, normalizeGridGeometry } from './grid';
import { DEFAULT_OUTPUT_SIZE, normalizeOutputOpacity, normalizeOutputSize } from './output';
import { isRenderQuality, normalizeRenderQuality } from './quality';
import { DEFAULT_PLANETARIUM_SETTINGS, normalizePlanetariumSettings } from './dome';
import { normalizeGroups } from './groups';
import { DEFAULT_TRACE_SETTINGS, normalizeTraceSettings } from './traceSettings';
import { DEFAULT_PRESENT_SETTINGS, normalizePresentSettings } from './present';
import type { LinkGroup, MediaSource, Player, ProjectFile, RenderQuality, WorkspaceBackground, WorkspaceGridGeometryInput, WorkspaceOutputSize, WorkspacePlanetariumSettingsInput, WorkspacePresentSettingsInput, WorkspaceTraceSettingsInput } from '../types';

interface ProjectState {
  projectName: string;
  sources: MediaSource[];
  players: Player[];
  groups: LinkGroup[];
  background?: WorkspaceBackground | null;
  backgroundColor?: string;
  gridGeometry?: WorkspaceGridGeometryInput;
  gridSnapping?: boolean;
  outputSize?: WorkspaceOutputSize;
  outputOpacity?: number;
  renderQuality?: RenderQuality;
  traceSettings?: WorkspaceTraceSettingsInput;
  planetariumSettings?: WorkspacePlanetariumSettingsInput;
  presentSettings?: WorkspacePresentSettingsInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPoint(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isSource(value: unknown): value is MediaSource {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && ['test', 'file', 'stream', 'desktop', 'device'].includes(String(value.kind))
    && ['video', 'audio', 'image', 'capture', 'test'].includes(String(value.mediaType))
    && typeof value.live === 'boolean'
    && typeof value.connected === 'boolean'
    && (value.uri === undefined || typeof value.uri === 'string')
    && (value.path === undefined || typeof value.path === 'string');
}

function isBackground(value: unknown): value is WorkspaceBackground {
  return isRecord(value)
    && typeof value.name === 'string'
    && (value.uri === undefined || typeof value.uri === 'string')
    && (value.path === undefined || typeof value.path === 'string')
    && (value.mime === undefined || typeof value.mime === 'string');
}

function isGridGeometry(value: unknown): value is WorkspaceGridGeometryInput {
  return isRecord(value)
    && isFiniteNumber(value.spacing)
    && isFiniteNumber(value.rotation)
    && isFiniteNumber(value.skewX)
    && isFiniteNumber(value.skewY)
    && (value.kind === undefined || value.kind === 'cartesian' || value.kind === 'circular')
    && (value.rings === undefined || isFiniteNumber(value.rings))
    && (value.spokes === undefined || isFiniteNumber(value.spokes))
    && (value.radius === undefined || isFiniteNumber(value.radius));
}

function isOutputSize(value: unknown): value is WorkspaceOutputSize {
  return isRecord(value)
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height);
}

function isTraceSettings(value: unknown): value is WorkspaceTraceSettingsInput {
  return isRecord(value)
    && isFiniteNumber(value.smoothing)
    && isFiniteNumber(value.interiorSpacing)
    && (value.sourceMapping === undefined || value.sourceMapping === 'crop' || value.sourceMapping === 'whole');
}

function isPlanetariumSettings(value: unknown): value is WorkspacePlanetariumSettingsInput {
  if (!isRecord(value)) return false;
  const installation = value.installation;
  return isRecord(value)
    && (value.enabled === undefined || typeof value.enabled === 'boolean')
    && ['fov', 'tilt', 'offsetX', 'offsetY', 'truncation'].every((field) => (
      value[field] === undefined || isFiniteNumber(value[field])
    ))
    && (value.model === undefined || ['equidistant', 'equisolid', 'stereographic'].includes(String(value.model)))
    && (value.preview === undefined || ['projector', 'unwarped', 'audience'].includes(String(value.preview)))
    && (value.comparison === undefined || typeof value.comparison === 'boolean')
    && (value.calibrationPoints === undefined || (Array.isArray(value.calibrationPoints)
      && value.calibrationPoints.length <= 100
      && value.calibrationPoints.every((point) => isRecord(point)
        && typeof point.id === 'string'
        && typeof point.name === 'string'
        && isFiniteNumber(point.azimuth)
        && isFiniteNumber(point.elevation)
        && isPoint(point.observed))))
    && (installation === undefined || (isRecord(installation)
      && ['domeDiameter', 'springLine', 'projectorHeight', 'lensThrow'].every((field) => isFiniteNumber(installation[field]))
      && typeof installation.notes === 'string'));
}

function isPlayer(value: unknown): value is Player {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.sourceId !== 'string') {
    return false;
  }
  if (!isPoint(value.position) || !Array.isArray(value.quickCorners) || value.quickCorners.length !== 4) {
    return false;
  }
  if (!value.quickCorners.every(isPoint)) return false;
  const numericFields = ['rotation', 'scale', 'opacity', 'volume', 'rate'];
  if (!numericFields.every((field) => isFiniteNumber(value[field]))) return false;
  if (value.mediaRotation !== undefined && !isFiniteNumber(value.mediaRotation)) return false;
  if (value.mediaScale !== undefined && !isFiniteNumber(value.mediaScale)) return false;
  if (value.visual !== undefined && !isPlayerVisual(value.visual)) return false;
  const booleanFields = ['muted', 'loop', 'visible', 'locked', 'autoplay'];
  if (!booleanFields.every((field) => typeof value[field] === 'boolean')) return false;
  if (value.domeWarp !== undefined && typeof value.domeWarp !== 'boolean') return false;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.border)) return false;
  if (value.nodes.length > 2000 || !value.border.every((id) => typeof id === 'string')) return false;
  return value.nodes.every((node) => isRecord(node)
    && typeof node.id === 'string'
    && isPoint(node)
    && isFiniteNumber(node.u)
    && isFiniteNumber(node.v));
}

function isPresentSettings(value: unknown): value is WorkspacePresentSettingsInput {
  if (!isRecord(value)) return false;
  const ambient = value.ambient;
  const placement = value.windowPlacement;
  const layout = value.lockedLayout;
  return (value.layoutLocked === undefined || typeof value.layoutLocked === 'boolean')
    && (value.transparency === undefined || typeof value.transparency === 'boolean')
    && (ambient === undefined || (isRecord(ambient)
      && (ambient.enabled === undefined || typeof ambient.enabled === 'boolean')
      && (ambient.style === undefined || ambient.style === 'edge' || ambient.style === 'average')
      && ['intensity', 'spread', 'smoothing'].every((field) => ambient[field] === undefined || isFiniteNumber(ambient[field]))))
    && (placement == null || (isRecord(placement)
      && ['x', 'y', 'width', 'height'].every((field) => isFiniteNumber(placement[field]))
      && typeof placement.displayId === 'string'))
    && (layout == null || (isRecord(layout)
      && Array.isArray(layout.players)
      && layout.players.length <= 200
      && layout.players.every(isPlayer)
      && isOutputSize(layout.output)));
}

function isGroup(value: unknown): value is LinkGroup {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.mode === 'source' || value.mode === 'transport');
}

function migrateLegacyProject(value: Record<string, unknown>): void {
  const sources = value.sources as unknown[];
  const removedSourceIds = new Set<string>();
  sources.forEach((source) => {
    if (isRecord(source) && (source.kind === 'catalog' || source.kind === 'provider') && typeof source.id === 'string') {
      removedSourceIds.add(source.id);
    }
  });
  value.sources = sources.flatMap((source) => {
    if (!isRecord(source)) return [source];
    if (source.kind === 'catalog' || source.kind === 'provider') return [];
    const migrated = { ...source };
    ['providerCaptureId', 'providerUrl', 'providerKind', 'providerName', 'catalog'].forEach((field) => delete migrated[field]);
    return [migrated];
  });

  const migratePlayer = (player: unknown): unknown => {
    if (!isRecord(player)) return player;
    const migrated = { ...player };
    delete migrated.enhancement;
    if (typeof migrated.sourceId === 'string' && removedSourceIds.has(migrated.sourceId)) {
      migrated.sourceId = TEST_SOURCE.id;
    }
    return migrated;
  };
  value.players = (value.players as unknown[]).map(migratePlayer);

  const present = value.present;
  const lockedLayout = isRecord(present) ? present.lockedLayout : undefined;
  if (isRecord(present) && isRecord(lockedLayout) && Array.isArray(lockedLayout.players)) {
    value.present = {
      ...present,
      lockedLayout: { ...lockedLayout, players: lockedLayout.players.map(migratePlayer) },
    };
  }
}

export function parseProject(content: string): ProjectFile {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isRecord(value) || value.format !== 'freeform-workspace' || value.version !== 1) {
    throw new Error('This is not a supported Freeform workspace file.');
  }
  if (typeof value.name !== 'string' || !Array.isArray(value.sources)
    || !Array.isArray(value.players) || !Array.isArray(value.groups)) {
    throw new Error('The workspace is missing required project data.');
  }
  if (value.sources.length > 500 || value.players.length > 200 || value.groups.length > 100) {
    throw new Error('The workspace exceeds the supported project size limits.');
  }
  migrateLegacyProject(value);
  if (!value.sources.every(isSource)) throw new Error('The workspace contains an invalid media source.');
  if (!value.players.every(isPlayer)) throw new Error('The workspace contains an invalid player or mesh.');
  if (!value.groups.every(isGroup)) throw new Error('The workspace contains an invalid link group.');
  if (value.background != null && !isBackground(value.background)) {
    throw new Error('The workspace contains an invalid background image.');
  }
  if (value.backgroundColor !== undefined && !isBackgroundColor(value.backgroundColor)) {
    throw new Error('The workspace contains an invalid background color.');
  }
  if (value.grid != null && !isGridGeometry(value.grid)) {
    throw new Error('The workspace contains invalid built-in grid geometry.');
  }
  if (value.gridSnapping !== undefined && typeof value.gridSnapping !== 'boolean') {
    throw new Error('The workspace contains an invalid grid snapping setting.');
  }
  if (value.output != null && !isOutputSize(value.output)) {
    throw new Error('The workspace contains an invalid output size.');
  }
  if (value.outputOpacity !== undefined && !isFiniteNumber(value.outputOpacity)) {
    throw new Error('The workspace contains an invalid output opacity.');
  }
  if (value.quality !== undefined && !isRenderQuality(value.quality)) {
    throw new Error('The workspace contains an invalid projection quality setting.');
  }
  if (value.trace != null && !isTraceSettings(value.trace)) {
    throw new Error('The workspace contains invalid trace settings.');
  }
  if (value.planetarium != null && !isPlanetariumSettings(value.planetarium)) {
    throw new Error('The workspace contains invalid planetarium settings.');
  }
  if (value.present != null && !isPresentSettings(value.present)) {
    throw new Error('The workspace contains invalid Present settings.');
  }

  const sourceIds = new Set(value.sources.map((source) => source.id));
  const players = value.players.map((player) => ({
    ...player,
    sourceId: sourceIds.has(player.sourceId) ? player.sourceId : TEST_SOURCE.id,
    scale: Math.max(0.05, Math.min(20, player.scale)),
    mediaRotation: isFiniteNumber(player.mediaRotation) ? player.mediaRotation : 0,
    mediaScale: Math.max(0.1, Math.min(10, isFiniteNumber(player.mediaScale) ? player.mediaScale : 1)),
    visual: normalizePlayerVisual(isPlayerVisual(player.visual) ? player.visual : undefined),
    opacity: Math.max(0, Math.min(1, player.opacity)),
    volume: Math.max(0, Math.min(1, player.volume)),
    rate: Math.max(0.1, Math.min(4, player.rate)),
    domeWarp: player.domeWarp === true,
    domePrewarped: player.domePrewarped === true,
  }));
  const normalized = normalizeGroups(players, value.groups);

  return {
    format: 'freeform-workspace',
    version: 1,
    name: value.name,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : new Date().toISOString(),
    sources: value.sources,
    players: normalized.players,
    groups: normalized.groups,
    background: isBackground(value.background) ? value.background : null,
    backgroundColor: normalizeBackgroundColor(value.backgroundColor ?? DEFAULT_BACKGROUND_COLOR),
    grid: normalizeGridGeometry(isGridGeometry(value.grid) ? value.grid : DEFAULT_GRID_GEOMETRY),
    gridSnapping: value.gridSnapping === true,
    output: normalizeOutputSize(isOutputSize(value.output) ? value.output : DEFAULT_OUTPUT_SIZE),
    outputOpacity: normalizeOutputOpacity(isFiniteNumber(value.outputOpacity) ? value.outputOpacity : 1),
    quality: normalizeRenderQuality(value.quality),
    trace: normalizeTraceSettings(isTraceSettings(value.trace) ? value.trace : DEFAULT_TRACE_SETTINGS),
    planetarium: normalizePlanetariumSettings(isPlanetariumSettings(value.planetarium) ? value.planetarium : DEFAULT_PLANETARIUM_SETTINGS),
    present: normalizePresentSettings(isPresentSettings(value.present) ? value.present : DEFAULT_PRESENT_SETTINGS),
  };
}

export function serializeProject(state: ProjectState): string {
  const project: ProjectFile = {
    format: 'freeform-workspace',
    version: 1,
    name: state.projectName,
    savedAt: new Date().toISOString(),
    sources: state.sources.map((source) => {
      if (source.kind === 'file' && source.uri?.startsWith('data:')) return { ...source, connected: true };
      if (source.kind === 'file') return { ...source, uri: undefined, connected: false };
      if (source.live) return { ...source, connected: false };
      return source;
    }),
    players: state.players,
    groups: state.groups,
    background: state.background ? {
      ...state.background,
      uri: state.background.uri?.startsWith('data:') ? state.background.uri : undefined,
    } : null,
    backgroundColor: normalizeBackgroundColor(state.backgroundColor ?? DEFAULT_BACKGROUND_COLOR),
    grid: normalizeGridGeometry(state.gridGeometry ?? DEFAULT_GRID_GEOMETRY),
    gridSnapping: state.gridSnapping ?? false,
    output: normalizeOutputSize(state.outputSize ?? DEFAULT_OUTPUT_SIZE),
    outputOpacity: normalizeOutputOpacity(state.outputOpacity ?? 1),
    quality: normalizeRenderQuality(state.renderQuality),
    trace: normalizeTraceSettings(state.traceSettings ?? DEFAULT_TRACE_SETTINGS),
    planetarium: normalizePlanetariumSettings(state.planetariumSettings ?? DEFAULT_PLANETARIUM_SETTINGS),
    present: normalizePresentSettings(state.presentSettings ?? DEFAULT_PRESENT_SETTINGS),
  };
  return JSON.stringify(project, null, 2);
}

/** Keeps live session URLs and playback flags inside the two desktop renderers only. */
export function serializePresentationProject(state: ProjectState): string {
  const project = JSON.parse(serializeProject(state)) as ProjectFile;
  return JSON.stringify({
    ...project,
    sources: state.sources,
    players: state.players,
    background: state.background ?? null,
  });
}

const MAX_EMBEDDED_FILE_BYTES = 256 * 1024 * 1024;
const MAX_PORTABLE_PROJECT_BYTES = 512 * 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The media could not be encoded.'));
    reader.readAsDataURL(blob);
  });
}

async function embedMedia(uri: string, name: string, mime: string | undefined, budget: { bytes: number }): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  let response: Response;
  try {
    response = await fetch(uri);
  } catch {
    throw new Error(`${name} is not accessible in this session. Reconnect it before portable export.`);
  }
  if (!response.ok) throw new Error(`${name} could not be read for portable export (${response.status}).`);
  const blob = await response.blob();
  if (blob.size > MAX_EMBEDDED_FILE_BYTES) throw new Error(`${name} exceeds the 256 MB per-file embedding limit.`);
  budget.bytes += blob.size;
  if (budget.bytes > MAX_PORTABLE_PROJECT_BYTES) throw new Error('Portable media exceeds the 512 MB total embedding limit.');
  const typed = mime && blob.type !== mime ? blob.slice(0, blob.size, mime) : blob;
  return blobToDataUrl(typed);
}

export async function createPortableProject(state: ProjectState): Promise<string> {
  const budget = { bytes: 0 };
  const sources = await Promise.all(state.sources.map(async (source) => {
    if (source.kind !== 'file') return source;
    if (!source.connected || !source.uri) throw new Error(`${source.name} is disconnected. Relink it before portable export.`);
    return {
      ...source,
      uri: await embedMedia(source.uri, source.name, source.mime, budget),
      connected: true,
      detail: 'Embedded portable media',
    };
  }));
  const background = state.background?.uri ? {
    ...state.background,
    uri: await embedMedia(state.background.uri, state.background.name, state.background.mime, budget),
  } : state.background;
  return serializeProject({ ...state, sources, background });
}

function fileBaseName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop()?.toLocaleLowerCase() ?? '';
}

export function relinkSourcesByFilename(
  sources: MediaSource[],
  files: { name: string; url: string; path?: string; mime?: string; mediaType: 'video' | 'audio' | 'image' }[],
): { sources: MediaSource[]; count: number } {
  const available = files.map((file, index) => ({ file, index, base: fileBaseName(file.name) }));
  const used = new Set<number>();
  let count = 0;
  const next = sources.map((source) => {
    if (source.kind !== 'file' || source.connected) return source;
    const base = fileBaseName(source.path || source.name);
    const match = available.find((candidate) => !used.has(candidate.index) && candidate.base === base);
    if (!match) return source;
    used.add(match.index);
    count += 1;
    return {
      ...source,
      name: match.file.name,
      uri: match.file.url,
      path: match.file.path,
      mime: match.file.mime,
      mediaType: match.file.mediaType,
      connected: true,
      detail: match.file.path ?? 'Browser session file',
    };
  });
  return { sources: next, count };
}

export async function reauthorizeProjectFiles(
  sources: MediaSource[],
  authorize: (paths: string[]) => Promise<Record<string, string>>,
): Promise<Map<string, { uri?: string; connected: boolean; detail?: string }>> {
  const paths = sources.flatMap((source) => source.kind === 'file' && source.path && !source.uri?.startsWith('data:') ? [source.path] : []);
  const urls = paths.length ? await authorize(paths) : {};
  const updates = new Map<string, { uri?: string; connected: boolean; detail?: string }>();
  sources.forEach((source) => {
    if (source.kind !== 'file') return;
    if (source.uri?.startsWith('data:')) {
      updates.set(source.id, { uri: source.uri, connected: true, detail: 'Embedded portable media' });
    } else if (source.path && urls[source.path]) {
      updates.set(source.id, { uri: urls[source.path], connected: true, detail: undefined });
    } else {
      updates.set(source.id, {
        uri: undefined,
        connected: false,
        detail: source.path ? 'File unavailable at the saved path' : 'Re-add the local file to reconnect it',
      });
    }
  });
  return updates;
}

export async function reauthorizeProjectBackground(
  background: WorkspaceBackground | null | undefined,
  authorize: (paths: string[]) => Promise<Record<string, string>>,
): Promise<WorkspaceBackground | null> {
  if (!background) return null;
  if (background.uri?.startsWith('data:')) return background;
  if (!background.path) return { ...background, uri: undefined };
  const urls = await authorize([background.path]);
  return { ...background, uri: urls[background.path] };
}
