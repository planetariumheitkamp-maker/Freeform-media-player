import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import { parseProject, serializeProject } from '../../src/lib/project';
import {
  createDiagnosticsReport,
  readDiagnostics,
  readRecoveryGenerations,
  recordDiagnostic,
  writeRecoveryGeneration,
} from '../../src/lib/recovery';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

function projectContent(name: string) {
  return serializeProject({ projectName: name, sources: [TEST_SOURCE], players: [createPlayer(1)], groups: [] });
}

describe('recovery generations and diagnostics', () => {
  let storage: MemoryStorage;
  beforeEach(() => { storage = new MemoryStorage(); });

  it('rotates exactly five generations, newest first', () => {
    for (let index = 1; index <= 7; index += 1) {
      expect(writeRecoveryGeneration(storage, projectContent(`Version ${index}`), `2026-10-28T00:00:0${index}.000Z`)).toBe(index <= 5 ? index : index - 5);
    }
    const generations = readRecoveryGenerations(storage);
    expect(generations).toHaveLength(5);
    expect(generations.map((generation) => generation.generation)).toEqual([2, 1, 5, 4, 3]);
    expect(generations.map((generation) => parseProject(generation.content).name)).toEqual([
      'Version 7', 'Version 6', 'Version 5', 'Version 4', 'Version 3',
    ]);
  });

  it('skips malformed envelopes and projects to fall back to older valid snapshots', () => {
    writeRecoveryGeneration(storage, projectContent('Good older'), '2026-10-28T00:00:01.000Z');
    writeRecoveryGeneration(storage, '{broken project', '2026-10-28T00:00:02.000Z');
    storage.setItem('freeform.workspace.autosave.v1.3', '{bad envelope');
    const generations = readRecoveryGenerations(storage);
    const valid = generations.map((generation) => {
      try { return parseProject(generation.content).name; } catch { return null; }
    }).filter(Boolean);
    expect(valid).toEqual(['Good older']);
  });

  it('supports the previous autosave key without writing it again', () => {
    storage.setItem('freeform.workspace.autosave.v1', projectContent('Legacy'));
    expect(readRecoveryGenerations(storage)[0].generation).toBe(0);
    writeRecoveryGeneration(storage, projectContent('Current'));
    expect(storage.getItem('freeform.workspace.autosave.v1')).toBeNull();
    expect(readRecoveryGenerations(storage).map((generation) => generation.generation)).toEqual([1]);
  });

  it('keeps only sixty diagnostic events and omits saved media paths from reports', () => {
    for (let index = 0; index < 70; index += 1) recordDiagnostic(storage, 'info', `Event ${index}`);
    expect(readDiagnostics(storage)).toHaveLength(60);
    expect(readDiagnostics(storage)[0].message).toBe('Event 10');
    vi.stubGlobal('window', { devicePixelRatio: 1, innerWidth: 1200, innerHeight: 800 });
    const report = createDiagnosticsReport({
      projectName: 'Diagnostics', players: [], outputSize: { width: 1600, height: 900 }, planetariumSettings: {},
      sources: [{ name: 'Movie', kind: 'file', connected: false, path: 'C:/private/movie.mp4' }],
    }, storage);
    expect(report).not.toContain('C:/private/movie.mp4');
    expect(JSON.parse(report).workspace.sources[0].pathState).toBe('saved path present');
    vi.unstubAllGlobals();
  });
});
