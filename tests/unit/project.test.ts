import { describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import { parseProject, reauthorizeProjectFiles, serializeProject } from '../../src/lib/project';
import type { MediaSource } from '../../src/types';

function localSource(): MediaSource {
  return {
    id: 'source:local',
    kind: 'file',
    mediaType: 'video',
    name: 'Local movie',
    path: '/media/movie.webm',
    uri: 'freeform-media://local/movie',
    live: false,
    connected: true,
  };
}

describe('project persistence', () => {
  it('round-trips sources, groups, and player geometry', () => {
    const player = createPlayer(1, 'source:local');
    const content = serializeProject({
      projectName: 'Projection study',
      sources: [TEST_SOURCE, localSource()],
      players: [player],
      groups: [],
    });
    const project = parseProject(content);
    expect(project.name).toBe('Projection study');
    expect(project.players[0].quickCorners).toEqual(player.quickCorners);
    expect(project.sources[1].path).toBe('/media/movie.webm');
    expect(project.format).toBe('freeform-workspace');
  });

  it('exports local references without session URLs or live connection state', () => {
    const browserFile = { ...localSource(), path: undefined, uri: 'blob:session-only' };
    const content = serializeProject({
      projectName: 'Portable references',
      sources: [browserFile],
      players: [createPlayer(1, browserFile.id)],
      groups: [],
    });
    const project = parseProject(content);
    expect(project.sources[0].uri).toBeUndefined();
    expect(project.sources[0].connected).toBe(false);
    expect(content).not.toContain('blob:session-only');
    expect(content).not.toContain('freeform-media://');
  });

  it('drops groups with fewer than two members during import', () => {
    const player = { ...createPlayer(1), groupId: 'group:solo' };
    const content = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Solo group', sources: [TEST_SOURCE], players: [player],
      groups: [{ id: 'group:solo', name: 'Solo', mode: 'transport' }],
    });
    const project = parseProject(content);
    expect(project.groups).toHaveLength(0);
    expect(project.players[0].groupId).toBeUndefined();
  });

  it('clamps numeric properties and reconnects missing source references to the test card', () => {
    const player = { ...createPlayer(1, 'source:missing'), scale: 900, opacity: -4, volume: 7, rate: 0 };
    const content = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Clamped', sources: [TEST_SOURCE], players: [player], groups: [],
    });
    const project = parseProject(content);
    expect(project.players[0].sourceId).toBe(TEST_SOURCE.id);
    expect(project.players[0].scale).toBe(20);
    expect(project.players[0].opacity).toBe(0);
    expect(project.players[0].volume).toBe(1);
    expect(project.players[0].rate).toBe(0.1);
  });

  it('rejects malformed projects and oversized meshes', () => {
    expect(() => parseProject('{}')).toThrow('not a supported');
    const player = createPlayer(1);
    const content = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Invalid', sources: [TEST_SOURCE],
      players: [{ ...player, scale: Number.POSITIVE_INFINITY }], groups: [],
    });
    expect(() => parseProject(content)).toThrow();
  });

  it('reauthorizes available local paths and marks missing files disconnected', async () => {
    const source = localSource();
    const updates = await reauthorizeProjectFiles([source], async () => ({
      '/media/movie.webm': 'freeform-media://local/reconnected',
    }));
    expect(updates.get(source.id)).toEqual({
      uri: 'freeform-media://local/reconnected', connected: true, detail: undefined,
    });
    const missing = await reauthorizeProjectFiles([source], async () => ({}));
    expect(missing.get(source.id)?.connected).toBe(false);
    expect(missing.get(source.id)?.detail).toContain('unavailable');
  });
});
