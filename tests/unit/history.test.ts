import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import { parseProject, serializeProject } from '../../src/lib/project';
import { DEFAULT_PLANETARIUM_SETTINGS } from '../../src/lib/dome';
import { DEFAULT_TRACE_SETTINGS } from '../../src/lib/traceSettings';
import { useWorkspace } from '../../src/store/useWorkspace';

function reset() {
  const player = createPlayer(1);
  useWorkspace.setState({
    projectName: 'History test',
    sources: [TEST_SOURCE],
    players: [player],
    groups: [],
    background: null,
    backgroundColor: '#1a1d1b',
    gridGeometry: {
      kind: 'cartesian', spacing: 50, rotation: 0, skewX: 0, skewY: 0,
      rings: 8, spokes: 24, radius: 90,
    },
    gridSnapping: false,
    outputSize: { width: 1600, height: 900 },
    outputOpacity: 1,
    renderQuality: 'standard',
    traceSettings: { ...DEFAULT_TRACE_SETTINGS },
    planetariumSettings: { ...DEFAULT_PLANETARIUM_SETTINGS },
    selectedIds: [player.id],
    activeId: player.id,
    tool: 'select',
    showMesh: true,
    presentation: false,
    toasts: [],
  });
  useWorkspace.getState().resetHistory();
  return player;
}

describe('workspace undo and redo', () => {
  beforeEach(reset);

  it('undoes and redoes player creation and deletion', () => {
    const original = useWorkspace.getState().players[0];
    useWorkspace.getState().addPlayer();
    expect(useWorkspace.getState().players).toHaveLength(2);
    expect(useWorkspace.getState().canUndo).toBe(true);

    useWorkspace.getState().undo();
    expect(useWorkspace.getState().players).toEqual([original]);
    expect(useWorkspace.getState().canRedo).toBe(true);
    useWorkspace.getState().redo();
    expect(useWorkspace.getState().players).toHaveLength(2);

    useWorkspace.getState().removePlayers([original.id]);
    expect(useWorkspace.getState().players).toHaveLength(1);
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().players.map((player) => player.id)).toContain(original.id);
  });

  it('coalesces a complete drag into one history step', () => {
    const original = { ...useWorkspace.getState().players[0].position };
    useWorkspace.getState().beginHistory();
    useWorkspace.getState().movePlayer(useWorkspace.getState().players[0].id, { x: 20, y: 10 });
    useWorkspace.getState().movePlayer(useWorkspace.getState().players[0].id, { x: 30, y: -5 });
    useWorkspace.getState().endHistory();
    expect(useWorkspace.getState().players[0].position).toEqual({ x: original.x + 50, y: original.y + 5 });

    useWorkspace.getState().undo();
    expect(useWorkspace.getState().players[0].position).toEqual(original);
    useWorkspace.getState().redo();
    expect(useWorkspace.getState().players[0].position).toEqual({ x: original.x + 50, y: original.y + 5 });
  });

  it('excludes playback and selection while preserving them across geometry undo', () => {
    const player = reset();
    useWorkspace.getState().updatePlayer(player.id, { rate: 2, volume: 0.25 });
    useWorkspace.getState().selectPlayer(player.id, true);
    useWorkspace.getState().setShowMesh(false);
    expect(useWorkspace.getState().canUndo).toBe(false);

    useWorkspace.getState().updatePlayer(player.id, { mediaScale: 1.75 });
    useWorkspace.getState().updatePlayer(player.id, { rate: 4 });
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().players[0].mediaScale).toBe(1);
    expect(useWorkspace.getState().players[0].rate).toBe(4);
    expect(useWorkspace.getState().players[0].volume).toBe(0.25);
    expect(useWorkspace.getState().showMesh).toBe(false);
  });

  it('clears redo after a new edit and resets history when loading a project', () => {
    useWorkspace.getState().setGridSnapping(true);
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().canRedo).toBe(true);
    useWorkspace.getState().setOutputOpacity(0.5);
    expect(useWorkspace.getState().canRedo).toBe(false);

    const project = parseProject(serializeProject(useWorkspace.getState()));
    useWorkspace.getState().loadProject(project);
    expect(useWorkspace.getState().canUndo).toBe(false);
    expect(useWorkspace.getState().canRedo).toBe(false);
  });

  it('restores projection quality through undo, redo, and project loading', () => {
    useWorkspace.getState().setRenderQuality('high');
    useWorkspace.getState().setRenderQuality('ultra');
    expect(useWorkspace.getState().renderQuality).toBe('ultra');
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().renderQuality).toBe('high');
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().renderQuality).toBe('standard');
    useWorkspace.getState().redo();
    expect(useWorkspace.getState().renderQuality).toBe('high');

    const project = parseProject(serializeProject({
      ...useWorkspace.getState(),
      renderQuality: 'ultra',
    }));
    useWorkspace.getState().loadProject(project);
    expect(useWorkspace.getState().renderQuality).toBe('ultra');
    expect(useWorkspace.getState().canUndo).toBe(false);
  });

  it('keeps player grades independent and restores appearance edits with undo and redo', () => {
    const first = useWorkspace.getState().players[0];
    const secondId = useWorkspace.getState().addPlayer();
    useWorkspace.getState().updatePlayer(secondId, { visual: { brightness: 1.4, contrast: 1.2, saturation: 0.8, gamma: 1.1, hue: 30, temperature: -20 } });
    expect(useWorkspace.getState().players[0].visual).toEqual(first.visual);
    expect(useWorkspace.getState().players[1].visual).toMatchObject({ brightness: 1.4, hue: 30 });

    useWorkspace.getState().setBackgroundColor('#123456');
    expect(useWorkspace.getState().backgroundColor).toBe('#123456');
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().backgroundColor).toBe('#1a1d1b');
    expect(useWorkspace.getState().players[1].visual).toMatchObject({ brightness: 1.4 });
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().players[1].visual).toEqual(first.visual);
    useWorkspace.getState().redo();
    expect(useWorkspace.getState().players[1].visual).toMatchObject({ brightness: 1.4, temperature: -20 });
    useWorkspace.getState().redo();
    expect(useWorkspace.getState().backgroundColor).toBe('#123456');

    const project = parseProject(serializeProject(useWorkspace.getState()));
    useWorkspace.getState().loadProject(project);
    expect(useWorkspace.getState().backgroundColor).toBe('#123456');
    expect(useWorkspace.getState().players[1].visual).toMatchObject({ brightness: 1.4, contrast: 1.2 });
  });

  it('restores planetarium settings, circular-grid activation, and player dome warp', () => {
    const player = useWorkspace.getState().players[0];
    useWorkspace.getState().setPlanetariumSettings({ enabled: true });
    expect(useWorkspace.getState().planetariumSettings.enabled).toBe(true);
    expect(useWorkspace.getState().gridGeometry.kind).toBe('circular');
    useWorkspace.getState().setPlanetariumSettings({ fov: 160 });
    useWorkspace.getState().updatePlayer(player.id, { domeWarp: true });

    useWorkspace.getState().undo();
    expect(useWorkspace.getState().players[0].domeWarp).toBe(false);
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().planetariumSettings.fov).toBe(180);
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().planetariumSettings.enabled).toBe(false);
    expect(useWorkspace.getState().gridGeometry.kind).toBe('cartesian');
    useWorkspace.getState().redo();
    expect(useWorkspace.getState().planetariumSettings.enabled).toBe(true);
    expect(useWorkspace.getState().gridGeometry.kind).toBe('circular');
  });
});
