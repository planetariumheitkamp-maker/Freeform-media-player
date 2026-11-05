export const RECOVERY_KEY = 'freeform.workspace.autosave.v1';
export const RECOVERY_GENERATION_COUNT = 5;
const RECOVERY_INDEX_KEY = 'freeform.workspace.recovery.index.v1';
const DIAGNOSTICS_KEY = 'freeform.diagnostics.v1';

export interface RecoveryGeneration {
  generation: number;
  savedAt: string;
  content: string;
}

interface RecoveryEnvelope {
  version: 1;
  savedAt: string;
  content: string;
}

function generationKey(generation: number): string {
  return `${RECOVERY_KEY}.${generation}`;
}

export function writeRecoveryGeneration(storage: Storage, content: string, savedAt = new Date().toISOString()): number {
  const previous = Number(storage.getItem(RECOVERY_INDEX_KEY));
  const generation = Number.isInteger(previous) && previous >= 1 && previous <= RECOVERY_GENERATION_COUNT
    ? previous % RECOVERY_GENERATION_COUNT + 1
    : 1;
  const envelope: RecoveryEnvelope = { version: 1, savedAt, content };
  storage.setItem(generationKey(generation), JSON.stringify(envelope));
  storage.setItem(RECOVERY_INDEX_KEY, String(generation));
  storage.removeItem(RECOVERY_KEY);
  return generation;
}

export function readRecoveryGenerations(storage: Storage): RecoveryGeneration[] {
  const generations: RecoveryGeneration[] = [];
  for (let generation = 1; generation <= RECOVERY_GENERATION_COUNT; generation += 1) {
    const raw = storage.getItem(generationKey(generation));
    if (!raw) continue;
    try {
      const envelope = JSON.parse(raw) as Partial<RecoveryEnvelope>;
      if (envelope.version !== 1 || typeof envelope.content !== 'string' || typeof envelope.savedAt !== 'string') continue;
      generations.push({ generation, savedAt: envelope.savedAt, content: envelope.content });
    } catch {
      // Invalid generations are skipped so an older valid snapshot can recover the workspace.
    }
  }
  const legacy = storage.getItem(RECOVERY_KEY);
  if (legacy) generations.push({ generation: 0, savedAt: '', content: legacy });
  return generations.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface DiagnosticEvent {
  timestamp: string;
  level: DiagnosticLevel;
  message: string;
  detail?: string;
}

export function readDiagnostics(storage: Storage): DiagnosticEvent[] {
  try {
    const value = JSON.parse(storage.getItem(DIAGNOSTICS_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is DiagnosticEvent => (
      typeof entry === 'object' && entry !== null
      && typeof entry.timestamp === 'string' && typeof entry.message === 'string'
      && ['info', 'warning', 'error'].includes(entry.level)
    )).slice(-60);
  } catch {
    return [];
  }
}

export function recordDiagnostic(storage: Storage, level: DiagnosticLevel, message: string, detail?: string): void {
  try {
    const event: DiagnosticEvent = { timestamp: new Date().toISOString(), level, message, ...(detail ? { detail: detail.slice(0, 4000) } : {}) };
    storage.setItem(DIAGNOSTICS_KEY, JSON.stringify([...readDiagnostics(storage), event].slice(-60)));
  } catch {
    // Diagnostics must never prevent the editor from running.
  }
}

export function createDiagnosticsReport(state: {
  projectName: string;
  players: unknown[];
  sources: { name: string; kind: string; connected: boolean; path?: string }[];
  outputSize: unknown;
  planetariumSettings: unknown;
}, storage: Storage): string {
  return JSON.stringify({
    format: 'freeform-diagnostics',
    version: 1,
    createdAt: new Date().toISOString(),
    runtime: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    workspace: {
      projectName: state.projectName,
      playerCount: state.players.length,
      sources: state.sources.map((source) => ({
        name: source.name, kind: source.kind, connected: source.connected,
        pathState: source.path ? 'saved path present' : 'no saved path',
      })),
      outputSize: state.outputSize,
      planetariumSettings: state.planetariumSettings,
    },
    recovery: readRecoveryGenerations(storage).map((generation) => ({
      generation: generation.generation,
      savedAt: generation.savedAt,
      bytes: generation.content.length,
    })),
    events: readDiagnostics(storage),
  }, null, 2);
}
