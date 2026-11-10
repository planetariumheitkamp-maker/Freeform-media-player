import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import { DEFAULT_PLANETARIUM_SETTINGS } from '../../src/lib/dome';
import {
  DEFAULT_PRESENT_SETTINGS,
  capturePresentLayout,
  normalizePresentSettings,
  restorePresentLayout,
} from '../../src/lib/present';
import { parseProject, serializeProject } from '../../src/lib/project';
import { DEFAULT_TRACE_SETTINGS } from '../../src/lib/traceSettings';
import { useWorkspace } from '../../src/store/useWorkspace';
import type { Player } from '../../src/types';

function changedPlayer(player: Player): Player {
  return {
    ...player,
    sourceId: 'source:current',
    position: { x: 740, y: -360 },
    rotation: 0.65,
    scale: 1.4,
    opacity: 0.65,
    volume: 0.2,
    rate: 1.5,
    locked: !player.locked,
    visual: { ...player.visual, brightness: 1.4, saturation: 0.7 },
    mediaRotation: 0.2,
    mediaScale: 1.2,
    domeWarp: !player.domeWarp,
    domePrewarped: !player.domePrewarped,
    quickCorners: player.quickCorners.map((point) => ({ x: point.x * 1.3, y: point.y * 1.3 })) as Player['quickCorners'],
  };
}

function resetWorkspace() {
  const player = createPlayer(1);
  useWorkspace.setState({
    projectName: 'Present lock test',
    sources: [TEST_SOURCE],
    players: [player],
    groups: [],
    background: null,
    backgroundColor: '#1a1d1b',
    outputSize: { width: 1600, height: 900 },
    outputOpacity: 1,
    renderQuality: 'standard',
    traceSettings: { ...DEFAULT_TRACE_SETTINGS },
    planetariumSettings: { ...DEFAULT_PLANETARIUM_SETTINGS },
    presentSettings: normalizePresentSettings(DEFAULT_PRESENT_SETTINGS),
    selectedIds: [player.id],
    activeId: player.id,
    tool: 'select',
    showMesh: true,
    presentation: false,
    toasts: [],
    historyPast: [],
    historyFuture: [],
  });
  return player;
}

describe('Present layout and ambient preferences', () => {
  beforeEach(resetWorkspace);

  it('defaults to a movable, opaque presentation without ambient lighting', () => {
    expect(normalizePresentSettings()).toEqual(DEFAULT_PRESENT_SETTINGS);
  });

  it('normalizes partial and out-of-range settings without sharing default objects', () => {
    const settings = normalizePresentSettings({
      layoutLocked: true,
      transparency: true,
      ambient: { enabled: true, style: 'average', intensity: 9, spread: -20, smoothing: 4 },
      windowPlacement: { x: -50.4, y: 70.6, width: 400, height: 9000, displayId: 'monitor-2' },
    });
    expect(settings).toMatchObject({
      layoutLocked: true,
      transparency: true,
      ambient: { enabled: true, style: 'average', intensity: 2, spread: 0, smoothing: 0.95 },
      windowPlacement: { x: -50, y: 71, width: 640, height: 8640, displayId: 'monitor-2' },
    });
    expect(normalizePresentSettings({ ambient: { intensity: Number.NaN, spread: Number.POSITIVE_INFINITY } }).ambient).toMatchObject({
      intensity: 0.85,
      spread: 56,
      smoothing: 0.72,
    });
    expect(normalizePresentSettings({ windowPlacement: { x: 0, y: 0, width: Number.NaN, height: 900, displayId: '1' } }).windowPlacement).toBeNull();
    const first = normalizePresentSettings();
    first.ambient.intensity = 1.9;
    expect(DEFAULT_PRESENT_SETTINGS.ambient.intensity).toBe(0.85);
  });

  it('restores only geometry and preserves current source, playback, appearance, and individual locks', () => {
    const original = createPlayer(1);
    original.domeWarp = true;
    const current = changedPlayer(original);
    const snapshot = capturePresentLayout([original], { width: 1920, height: 1080 });
    original.position.x = 10000;
    const restored = restorePresentLayout([current], { width: 1600, height: 900 }, snapshot);
    expect(restored.output).toEqual({ width: 1920, height: 1080 });
    expect(restored.players[0]).toMatchObject({
      sourceId: current.sourceId,
      position: snapshot.players[0].position,
      rotation: 0,
      scale: 1,
      mode: 'quick',
      quickCorners: snapshot.players[0].quickCorners,
      locked: current.locked,
      opacity: current.opacity,
      volume: current.volume,
      rate: current.rate,
      visual: current.visual,
      mediaRotation: current.mediaRotation,
      mediaScale: current.mediaScale,
      domeWarp: true,
      domePrewarped: false,
    });
    expect(restored.players[0].quickCorners).not.toBe(snapshot.players[0].quickCorners);
    expect(restorePresentLayout([current], { width: 1600, height: 900 }, null).players[0]).toBe(current);
  });

  it('prevents locked Present dragging and restores captured geometry on re-entry', () => {
    const player = resetWorkspace();
    useWorkspace.getState().lockPresentLayout({ x: 120, y: 80, width: 1280, height: 800, displayId: 'display-1' });
    useWorkspace.getState().setPresentation(true);
    const before = useWorkspace.getState().players[0];
    useWorkspace.getState().movePlayer(player.id, { x: 900, y: 500 });
    expect(useWorkspace.getState().players[0]).toBe(before);

    useWorkspace.getState().setPresentSettings({ layoutLocked: false });
    useWorkspace.getState().movePlayer(player.id, { x: 900, y: 500 });
    expect(useWorkspace.getState().players[0].position).not.toEqual(before.position);
    useWorkspace.getState().setPresentation(false);
    useWorkspace.getState().updatePlayer(player.id, { sourceId: 'source:current', locked: true, rate: 1.75 });
    useWorkspace.getState().setPresentSettings({ layoutLocked: true });
    useWorkspace.getState().setPresentation(true);
    const restored = useWorkspace.getState().players[0];
    expect(restored.position).toEqual(before.position);
    expect(restored.sourceId).toBe('source:current');
    expect(restored.locked).toBe(true);
    expect(restored.rate).toBe(1.75);
    expect(useWorkspace.getState().presentSettings.windowPlacement?.displayId).toBe('display-1');
  });

  it('round-trips Present settings and snapshots through a project file', () => {
    const player = resetWorkspace();
    useWorkspace.getState().setPresentSettings({
      transparency: true,
      ambient: { enabled: true, style: 'average', intensity: 1.3, spread: 84, smoothing: 0.5 },
    });
    useWorkspace.getState().lockPresentLayout({ x: 10, y: 20, width: 1280, height: 720, displayId: 'display-9' });
    const state = useWorkspace.getState();
    const project = parseProject(serializeProject(state));
    expect(project.present).toEqual(state.presentSettings);
    expect(project.present?.lockedLayout?.players[0].id).toBe(player.id);
    expect(parseProject(serializeProject({ ...state, presentSettings: undefined })).present).toEqual(DEFAULT_PRESENT_SETTINGS);

    const content = JSON.parse(serializeProject(state));
    content.present.ambient.intensity = 'high';
    expect(() => parseProject(JSON.stringify(content))).toThrow('The workspace contains invalid Present settings.');
    const malformedLayout = JSON.parse(serializeProject(state));
    malformedLayout.present.lockedLayout.players = [{}];
    expect(() => parseProject(JSON.stringify(malformedLayout))).toThrow('The workspace contains invalid Present settings.');
  });
});
