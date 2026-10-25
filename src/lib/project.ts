import { TEST_SOURCE } from '../data/defaults';
import { normalizeGroups } from './groups';
import type { LinkGroup, MediaSource, Player, ProjectFile } from '../types';

interface ProjectState {
  projectName: string;
  sources: MediaSource[];
  players: Player[];
  groups: LinkGroup[];
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
  const booleanFields = ['muted', 'loop', 'visible', 'locked', 'autoplay'];
  if (!booleanFields.every((field) => typeof value[field] === 'boolean')) return false;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.border)) return false;
  if (value.nodes.length > 2000 || !value.border.every((id) => typeof id === 'string')) return false;
  return value.nodes.every((node) => isRecord(node)
    && typeof node.id === 'string'
    && isPoint(node)
    && isFiniteNumber(node.u)
    && isFiniteNumber(node.v));
}

function isGroup(value: unknown): value is LinkGroup {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.mode === 'source' || value.mode === 'transport');
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
  if (!value.sources.every(isSource)) throw new Error('The workspace contains an invalid media source.');
  if (!value.players.every(isPlayer)) throw new Error('The workspace contains an invalid player or mesh.');
  if (!value.groups.every(isGroup)) throw new Error('The workspace contains an invalid link group.');

  const sourceIds = new Set(value.sources.map((source) => source.id));
  const players = value.players.map((player) => ({
    ...player,
    sourceId: sourceIds.has(player.sourceId) ? player.sourceId : TEST_SOURCE.id,
    scale: Math.max(0.05, Math.min(20, player.scale)),
    opacity: Math.max(0, Math.min(1, player.opacity)),
    volume: Math.max(0, Math.min(1, player.volume)),
    rate: Math.max(0.1, Math.min(4, player.rate)),
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
  };
}

export function serializeProject(state: ProjectState): string {
  const project: ProjectFile = {
    format: 'freeform-workspace',
    version: 1,
    name: state.projectName,
    savedAt: new Date().toISOString(),
    sources: state.sources.map((source) => {
      if (source.kind === 'file') return { ...source, uri: undefined, connected: false };
      if (source.live) return { ...source, connected: false };
      return source;
    }),
    players: state.players,
    groups: state.groups,
  };
  return JSON.stringify(project, null, 2);
}

export async function reauthorizeProjectFiles(
  sources: MediaSource[],
  authorize: (paths: string[]) => Promise<Record<string, string>>,
): Promise<Map<string, { uri?: string; connected: boolean; detail?: string }>> {
  const paths = sources.flatMap((source) => source.kind === 'file' && source.path ? [source.path] : []);
  const urls = paths.length ? await authorize(paths) : {};
  const updates = new Map<string, { uri?: string; connected: boolean; detail?: string }>();
  sources.forEach((source) => {
    if (source.kind !== 'file') return;
    if (source.path && urls[source.path]) {
      updates.set(source.id, { uri: urls[source.path], connected: true, detail: undefined });
    } else {
      updates.set(source.id, {
        connected: false,
        detail: source.path ? 'File unavailable at the saved path' : 'Re-add the local file to reconnect it',
      });
    }
  });
  return updates;
}
