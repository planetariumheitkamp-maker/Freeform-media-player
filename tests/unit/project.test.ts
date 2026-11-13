import { describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import { DEFAULT_PLANETARIUM_SETTINGS } from '../../src/lib/dome';
import { parseProject, reauthorizeProjectBackground, reauthorizeProjectFiles, serializePresentationProject, serializeProject } from '../../src/lib/project';
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

  it('keeps live session state only in presentation IPC snapshots', () => {
    const source = { ...localSource(), uri: 'blob:live-session', connected: true };
    const player = { ...createPlayer(1, source.id), autoplay: true };
    const state = { projectName: 'Live output', sources: [source], players: [player], groups: [] };
    const output = parseProject(serializePresentationProject(state));
    expect(output.sources[0].uri).toBe('blob:live-session');
    expect(output.sources[0].connected).toBe(true);
    expect(output.players[0].autoplay).toBe(true);
    const saved = parseProject(serializeProject(state));
    expect(saved.sources[0].uri).toBeUndefined();
    expect(saved.sources[0].connected).toBe(false);
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

  it('supplies legacy media transform defaults and validates independent media scaling', () => {
    const legacyPlayer: Record<string, unknown> = { ...createPlayer(1) };
    delete legacyPlayer.mediaRotation;
    delete legacyPlayer.mediaScale;
    const base = {
      format: 'freeform-workspace', version: 1, name: 'Media transforms', sources: [TEST_SOURCE],
      players: [legacyPlayer], groups: [],
    };
    const legacy = parseProject(JSON.stringify(base));
    expect(legacy.players[0].mediaRotation).toBe(0);
    expect(legacy.players[0].mediaScale).toBe(1);

    const clamped = parseProject(JSON.stringify({
      ...base,
      players: [{ ...createPlayer(1), mediaRotation: 0.75, mediaScale: 99 }],
    }));
    expect(clamped.players[0].mediaRotation).toBe(0.75);
    expect(clamped.players[0].mediaScale).toBe(10);
    expect(parseProject(JSON.stringify({
      ...base,
      players: [{ ...createPlayer(1), mediaScale: -2 }],
    })).players[0].mediaScale).toBe(0.1);
    expect(() => parseProject(JSON.stringify({
      ...base,
      players: [{ ...createPlayer(1), mediaScale: 'large' }],
    }))).toThrow('invalid player or mesh');
  });

  it('migrates legacy external sources and enhancement settings without losing local workspace data', () => {
    const local = localSource();
    const catalogPlayer = {
      ...createPlayer(1, 'source:legacy-catalog'),
      enhancement: { enabled: true, model: 'legacy-model' },
    };
    const providerPlayer = {
      ...createPlayer(2, 'source:legacy-provider'),
      enhancement: { enabled: true, model: 'legacy-model' },
    };
    const localPlayer = {
      ...createPlayer(3, local.id),
      enhancement: { enabled: true, model: 'legacy-model' },
    };
    const lockedPlayer = {
      ...createPlayer(4, 'source:legacy-provider'),
      enhancement: { enabled: true, model: 'legacy-model' },
    };
    const project = parseProject(JSON.stringify({
      format: 'freeform-workspace',
      version: 1,
      name: 'Migrated legacy workspace',
      sources: [
        TEST_SOURCE,
        local,
        {
          id: 'source:legacy-catalog', kind: 'catalog', mediaType: 'video', name: 'Bundled demo',
          uri: '/catalog/media/demo.webm', live: false, connected: true,
          catalog: { playbackMode: 'native', itemId: 'demo' },
        },
        {
          id: 'source:legacy-provider', kind: 'provider', mediaType: 'capture', name: 'External player',
          live: true, connected: true, providerCaptureId: 'temporary-window',
          providerUrl: 'https://player.example.com/embed/42', providerKind: 'custom', providerName: 'Legacy custom',
        },
      ],
      players: [catalogPlayer, providerPlayer, localPlayer],
      groups: [],
      backgroundColor: '#26352d',
      gridSnapping: true,
      output: { width: 2048, height: 1152 },
      present: {
        layoutLocked: true,
        lockedLayout: { players: [lockedPlayer], output: { width: 2048, height: 1152 } },
      },
    }));

    expect(project.sources.map((source) => source.id)).toEqual([TEST_SOURCE.id, local.id]);
    expect(project.sources[1]).toMatchObject({ kind: 'file', path: local.path, name: local.name });
    expect(project.players.map((player) => player.sourceId)).toEqual([TEST_SOURCE.id, TEST_SOURCE.id, local.id]);
    expect(project.players.every((player) => !('enhancement' in player))).toBe(true);
    expect(project.present?.lockedLayout?.players[0].sourceId).toBe(TEST_SOURCE.id);
    expect(project.present?.lockedLayout?.players.every((player) => !('enhancement' in player))).toBe(true);
    expect(project.backgroundColor).toBe('#26352d');
    expect(project.gridSnapping).toBe(true);
    expect(project.output).toEqual({ width: 2048, height: 1152 });
    expect(JSON.stringify(project)).not.toContain('providerCaptureId');
    expect(JSON.stringify(project)).not.toContain('legacy-model');
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

  it('round-trips a custom grid reference without its session URL', () => {
    const content = serializeProject({
      projectName: 'Grid study',
      sources: [TEST_SOURCE],
      players: [createPlayer(1)],
      groups: [],
      background: {
        name: 'alignment-grid.png',
        path: 'C:/grids/alignment-grid.png',
        uri: 'freeform-media://local/grid-session',
        mime: 'image/png',
      },
    });
    const project = parseProject(content);
    expect(project.background?.name).toBe('alignment-grid.png');
    expect(project.background?.path).toBe('C:/grids/alignment-grid.png');
    expect(project.background?.mime).toBe('image/png');
    expect(project.background?.uri).toBeUndefined();
    expect(content).not.toContain('freeform-media://local/grid-session');
  });

  it('reauthorizes a saved grid and leaves missing or browser-only references unavailable', async () => {
    const background = { name: 'grid.png', path: 'C:/grids/grid.png', mime: 'image/png' };
    const restored = await reauthorizeProjectBackground(background, async (paths) => {
      expect(paths).toEqual(['C:/grids/grid.png']);
      return { 'C:/grids/grid.png': 'freeform-media://local/restored-grid' };
    });
    expect(restored?.uri).toBe('freeform-media://local/restored-grid');
    const missing = await reauthorizeProjectBackground(background, async () => ({}));
    expect(missing?.uri).toBeUndefined();
    const browserOnly = await reauthorizeProjectBackground({ name: 'browser.png', uri: 'blob:grid-session' }, async () => ({}));
    expect(browserOnly?.uri).toBeUndefined();
    expect(await reauthorizeProjectBackground(null, async () => ({}))).toBeNull();
  });

  it('rejects an invalid custom grid reference', () => {
    const content = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Invalid grid', sources: [TEST_SOURCE],
      players: [createPlayer(1)], groups: [], background: { name: 42 },
    });
    expect(() => parseProject(content)).toThrow('invalid background');
  });

  it('round-trips built-in grid geometry and supplies legacy defaults', () => {
    const gridGeometry = {
      kind: 'circular' as const, spacing: 95, rotation: 25, skewX: 18, skewY: -12,
      rings: 12, spokes: 36, radius: 75,
    };
    const content = serializeProject({
      projectName: 'Geometric grid', sources: [TEST_SOURCE], players: [createPlayer(1)], groups: [], gridGeometry,
    });
    expect(parseProject(content).grid).toEqual(gridGeometry);
    const legacy = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Legacy', sources: [TEST_SOURCE],
      players: [createPlayer(1)], groups: [],
    });
    expect(parseProject(legacy).grid).toEqual({
      kind: 'cartesian', spacing: 50, rotation: 0, skewX: 0, skewY: 0,
      rings: 8, spokes: 24, radius: 90,
    });
  });

  it('clamps imported geometry and rejects malformed values', () => {
    const base = {
      format: 'freeform-workspace', version: 1, name: 'Grid limits', sources: [TEST_SOURCE],
      players: [createPlayer(1)], groups: [],
    };
    const clamped = parseProject(JSON.stringify({
      ...base,
      grid: {
        kind: 'circular', spacing: 1000, rotation: -500, skewX: 80, skewY: -90,
        rings: 99, spokes: 2, radius: 120,
      },
    }));
    expect(clamped.grid).toEqual({
      kind: 'circular', spacing: 400, rotation: -180, skewX: 45, skewY: -45,
      rings: 32, spokes: 4, radius: 100,
    });
    expect(() => parseProject(JSON.stringify({
      ...base, grid: { spacing: 'wide', rotation: 0, skewX: 0, skewY: 0 },
    }))).toThrow('invalid built-in grid geometry');
  });

  it('round-trips circular grid snapping and validates legacy and malformed values', () => {
    const content = serializeProject({
      projectName: 'Snapping study', sources: [TEST_SOURCE], players: [createPlayer(1)], groups: [],
      gridGeometry: {
        kind: 'circular', spacing: 50, rotation: 0, skewX: 0, skewY: 0,
        rings: 8, spokes: 24, radius: 90,
      },
      gridSnapping: true,
    });
    expect(parseProject(content).gridSnapping).toBe(true);
    const legacy = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Legacy snapping', sources: [TEST_SOURCE],
      players: [createPlayer(1)], groups: [],
    });
    expect(parseProject(legacy).gridSnapping).toBe(false);
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), gridSnapping: 'enabled',
    }))).toThrow('invalid grid snapping');
  });

  it('round-trips output dimensions and opacity, supplies legacy defaults, and rejects malformed values', () => {
    const content = serializeProject({
      projectName: 'Output study', sources: [TEST_SOURCE], players: [createPlayer(1)], groups: [],
      outputSize: { width: 2048, height: 2048 }, outputOpacity: 0.35,
    });
    expect(parseProject(content).output).toEqual({ width: 2048, height: 2048 });
    expect(parseProject(content).outputOpacity).toBe(0.35);
    const legacy = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Legacy output', sources: [TEST_SOURCE],
      players: [createPlayer(1)], groups: [],
    });
    expect(parseProject(legacy).output).toEqual({ width: 1600, height: 900 });
    expect(parseProject(legacy).outputOpacity).toBe(1);
    const clamped = parseProject(JSON.stringify({
      ...JSON.parse(legacy), output: { width: 1, height: 99999 }, outputOpacity: -4,
    }));
    expect(clamped.output).toEqual({ width: 160, height: 7680 });
    expect(clamped.outputOpacity).toBe(0);
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), output: { width: 'wide', height: 900 },
    }))).toThrow('invalid output size');
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), outputOpacity: 'transparent',
    }))).toThrow('invalid output opacity');
  });

  it('round-trips projection quality with legacy defaults and import validation', () => {
    const content = serializeProject({
      projectName: 'Projection quality', sources: [TEST_SOURCE], players: [createPlayer(1)], groups: [],
      renderQuality: 'ultra',
    });
    expect(parseProject(content).quality).toBe('ultra');
    const legacy = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Legacy quality', sources: [TEST_SOURCE],
      players: [createPlayer(1)], groups: [],
    });
    expect(parseProject(legacy).quality).toBe('standard');
    expect(parseProject(JSON.stringify({ ...JSON.parse(legacy), quality: 'high' })).quality).toBe('high');
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), quality: 'lossless',
    }))).toThrow('invalid projection quality');
  });

  it('round-trips trace settings, supplies legacy defaults, and validates imported values', () => {
    const content = serializeProject({
      projectName: 'Trace study', sources: [TEST_SOURCE], players: [createPlayer(1)], groups: [],
      traceSettings: { smoothing: 12, interiorSpacing: 64, sourceMapping: 'whole' },
    });
    expect(parseProject(content).trace).toEqual({ smoothing: 12, interiorSpacing: 64, sourceMapping: 'whole' });
    const legacy = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Legacy trace', sources: [TEST_SOURCE],
      players: [createPlayer(1)], groups: [],
    });
    expect(parseProject(legacy).trace).toEqual({ smoothing: 2.5, interiorSpacing: 24, sourceMapping: 'crop' });
    expect(parseProject(JSON.stringify({
      ...JSON.parse(legacy), trace: { smoothing: 12, interiorSpacing: 64 },
    })).trace).toEqual({ smoothing: 12, interiorSpacing: 64, sourceMapping: 'crop' });
    expect(parseProject(JSON.stringify({
      ...JSON.parse(legacy), trace: { smoothing: 99.25, interiorSpacing: 2.4 },
    })).trace).toEqual({ smoothing: 20, interiorSpacing: 8, sourceMapping: 'crop' });
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), trace: { smoothing: 'smooth', interiorSpacing: 24 },
    }))).toThrow('invalid trace settings');
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), trace: { smoothing: 2.5, interiorSpacing: 24, sourceMapping: 'stretch' },
    }))).toThrow('invalid trace settings');
  });

  it('round-trips planetarium settings and per-player dome warp with legacy defaults and validation', () => {
    const content = serializeProject({
      projectName: 'Dome study',
      sources: [TEST_SOURCE],
      players: [{ ...createPlayer(1), domeWarp: true, domeOrientation: 'top-toward', domeOrientationReference: 'front-reference' }],
      groups: [],
      planetariumSettings: { enabled: true, fov: 160, tilt: 12, offsetX: -8, offsetY: 15 },
    });
    const project = parseProject(content);
    expect(project.planetarium).toEqual({
      ...DEFAULT_PLANETARIUM_SETTINGS,
      enabled: true, fov: 160, tilt: 12, offsetX: -8, offsetY: 15,
    });
    expect(project.players[0].domeWarp).toBe(true);
    expect(project.players[0].domePrewarped).toBe(false);
    expect(project.players[0].domeOrientation).toBe('top-toward');
    expect(project.players[0].domeOrientationReference).toBe('front-reference');

    const legacyPlayer: Record<string, unknown> = { ...createPlayer(1) };
    delete legacyPlayer.domeWarp;
    delete legacyPlayer.domePrewarped;
    delete legacyPlayer.domeOrientation;
    delete legacyPlayer.domeOrientationReference;
    const legacy = JSON.stringify({
      format: 'freeform-workspace', version: 1, name: 'Legacy dome', sources: [TEST_SOURCE],
      players: [legacyPlayer], groups: [],
    });
    const legacyProject = parseProject(legacy);
    expect(legacyProject.players[0].domeWarp).toBe(false);
    expect(legacyProject.players[0].domePrewarped).toBe(false);
    expect(legacyProject.players[0].domeOrientation).toBe('manual');
    expect(legacyProject.players[0].domeOrientationReference).toBe('center');
    expect(legacyProject.planetarium).toEqual(DEFAULT_PLANETARIUM_SETTINGS);

    const clamped = parseProject(JSON.stringify({
      ...JSON.parse(legacy),
      planetarium: { enabled: true, fov: 240, tilt: -99, offsetX: -90, offsetY: 80 },
    }));
    expect(clamped.planetarium).toEqual({
      ...DEFAULT_PLANETARIUM_SETTINGS,
      enabled: true, fov: 180, tilt: -45, offsetX: -50, offsetY: 50,
    });
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), planetarium: { fov: 'wide' },
    }))).toThrow('invalid planetarium settings');
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), players: [{ ...createPlayer(1), domeWarp: 'yes' }],
    }))).toThrow('invalid player or mesh');
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), players: [{ ...createPlayer(1), domeOrientation: 'sideways' }],
    }))).toThrow('invalid player or mesh');
    expect(() => parseProject(JSON.stringify({
      ...JSON.parse(legacy), players: [{ ...createPlayer(1), domeOrientationReference: 42 }],
    }))).toThrow('invalid player or mesh');
  });
});
