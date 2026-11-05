import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import { DEFAULT_PLANETARIUM_SETTINGS } from '../../src/lib/dome';
import { DEFAULT_TRACE_SETTINGS } from '../../src/lib/traceSettings';
import { useWorkspace } from '../../src/store/useWorkspace';
import type { MediaSource } from '../../src/types';

const alternateSource: MediaSource = {
  id: 'source:alternate',
  kind: 'file',
  mediaType: 'video',
  name: 'Alternate movie',
  uri: 'blob:alternate',
  live: false,
  connected: true,
};

function reset() {
  const first = createPlayer(1);
  const second = createPlayer(2, alternateSource.id);
  useWorkspace.setState({
    projectName: 'Test workspace',
    sources: [TEST_SOURCE, alternateSource],
    players: [first, second],
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
    selectedIds: [first.id, second.id],
    activeId: second.id,
    tool: 'select',
    showMesh: true,
    presentation: false,
    toasts: [],
  });
  return { first, second };
}

describe('workspace players and link groups', () => {
  beforeEach(reset);

  it('links a selected subset to the leader source and then assigns together', () => {
    const { first, second } = reset();
    const groupId = useWorkspace.getState().createGroup([first.id, second.id]);
    expect(groupId).toBeTruthy();
    let state = useWorkspace.getState();
    expect(state.players.every((player) => player.sourceId === alternateSource.id)).toBe(true);
    expect(state.players.every((player) => player.groupId === groupId)).toBe(true);
    state.assignSource(first.id, TEST_SOURCE.id);
    state = useWorkspace.getState();
    expect(state.players.every((player) => player.sourceId === TEST_SOURCE.id)).toBe(true);
    expect(state.groups[0].mode).toBe('transport');
    state.updateGroup(groupId as string, { mode: 'source' });
    expect(useWorkspace.getState().groups[0].mode).toBe('source');
  });

  it('dissolves a group without resetting its current sources', () => {
    const { first, second } = reset();
    const groupId = useWorkspace.getState().createGroup([first.id, second.id]) as string;
    useWorkspace.getState().removeGroup(groupId);
    const state = useWorkspace.getState();
    expect(state.groups).toHaveLength(0);
    expect(state.players.every((player) => !player.groupId && player.sourceId === alternateSource.id)).toBe(true);
  });

  it('duplicates geometry without sharing mutable references', () => {
    const { first } = reset();
    useWorkspace.getState().duplicatePlayer(first.id);
    const duplicate = useWorkspace.getState().players[2];
    expect(duplicate.sourceId).toBe(first.sourceId);
    expect(duplicate.quickCorners).not.toBe(first.quickCorners);
    expect(duplicate.position).not.toBe(first.position);
    expect(duplicate.id).not.toBe(first.id);
  });

  it('copies and pastes multiple players with independent geometry and remapped groups', () => {
    const { first, second } = reset();
    const originalGroupId = useWorkspace.getState().createGroup([first.id, second.id]) as string;
    useWorkspace.getState().updatePlayer(first.id, {
      locked: true,
      autoplay: false,
      mediaRotation: 0.6,
      mediaScale: 1.8,
    });
    expect(useWorkspace.getState().copyPlayers([first.id, second.id])).toBe(2);
    expect(useWorkspace.getState().pastePlayers()).toBe(2);

    let state = useWorkspace.getState();
    const originals = state.players.slice(0, 2);
    const pasted = state.players.slice(2);
    expect(state.players).toHaveLength(4);
    expect(state.groups).toHaveLength(2);
    expect(state.selectedIds).toEqual(pasted.map((player) => player.id));
    expect(state.activeId).toBe(pasted[1].id);
    expect(pasted[0].id).not.toBe(originals[0].id);
    expect(pasted[1].id).not.toBe(originals[1].id);
    expect(pasted[0].name).toBe('Player 1 copy');
    expect(pasted[0].groupId).toBe(pasted[1].groupId);
    expect(pasted[0].groupId).not.toBe(originalGroupId);
    expect(pasted[0].sourceId).toBe(originals[0].sourceId);
    expect(pasted[0].mediaRotation).toBe(0.6);
    expect(pasted[0].mediaScale).toBe(1.8);
    expect(pasted[0].locked).toBe(false);
    expect(pasted[0].autoplay).toBe(true);
    expect(pasted[0].position).toEqual({
      x: originals[0].position.x + 48,
      y: originals[0].position.y - 36,
    });
    expect(pasted[0].quickCorners).toEqual(originals[0].quickCorners);
    expect(pasted[0].quickCorners).not.toBe(originals[0].quickCorners);
    expect(pasted[0].nodes).not.toBe(originals[0].nodes);
    expect(pasted[0].border).not.toBe(originals[0].border);

    expect(useWorkspace.getState().pastePlayers()).toBe(2);
    state = useWorkspace.getState();
    const pastedAgain = state.players.slice(4);
    expect(state.players).toHaveLength(6);
    expect(pastedAgain[0].quickCorners).not.toBe(pasted[0].quickCorners);
    expect(pastedAgain[0].position).toEqual({
      x: originals[0].position.x + 96,
      y: originals[0].position.y - 72,
    });
    expect(state.selectedIds).toEqual(pastedAgain.map((player) => player.id));

    expect(useWorkspace.getState().copyPlayers([originals[0].id])).toBe(1);
    expect(useWorkspace.getState().pastePlayers()).toBe(1);
    state = useWorkspace.getState();
    expect(state.players.at(-1)?.groupId).toBeUndefined();
    expect(state.selectedIds).toEqual([state.players.at(-1)?.id]);
  });

  it('adds and safely removes advanced border and interior nodes', () => {
    const { first } = reset();
    useWorkspace.getState().setMode(first.id, 'advanced');
    const borderNode = useWorkspace.getState().addNode(first.id, 'border', { x: 60, y: 135 });
    expect(borderNode).toBeTruthy();
    const interiorNode = useWorkspace.getState().addNode(first.id, 'interior', { x: 30, y: 45 });
    expect(interiorNode).toBeTruthy();
    expect(useWorkspace.getState().players[0].nodes).toHaveLength(27);
    expect(useWorkspace.getState().players[0].border).toHaveLength(17);
    useWorkspace.getState().deleteNode(first.id, borderNode as string);
    useWorkspace.getState().deleteNode(first.id, interiorNode as string);
    expect(useWorkspace.getState().players[0].nodes).toHaveLength(25);
    expect(useWorkspace.getState().players[0].border).toHaveLength(16);
  });

  it('rejects a node insertion too close to an existing node', () => {
    const { first } = reset();
    useWorkspace.getState().setMode(first.id, 'advanced');
    const result = useWorkspace.getState().addNode(first.id, 'interior', { x: 0, y: 0 });
    expect(result).toBeNull();
    expect(useWorkspace.getState().players[0].nodes).toHaveLength(25);
  });

  it('creates and selects a traced player, then appends an interior path', () => {
    reset();
    const id = useWorkspace.getState().tracePlayer([
      { x: -120, y: 80 }, { x: 120, y: 80 }, { x: 120, y: -80 }, { x: -120, y: -80 },
    ]);
    let state = useWorkspace.getState();
    const created = state.players.find((player) => player.id === id);
    expect(state.players).toHaveLength(3);
    expect(state.selectedIds).toEqual([id]);
    expect(state.activeId).toBe(id);
    expect(created?.name).toBe('Player 3');
    expect(created?.sourceId).toBe(alternateSource.id);
    expect(created?.mode).toBe('advanced');
    expect(created?.border).toHaveLength(4);

    const added = useWorkspace.getState().traceInterior(id, [{ x: -60, y: 0 }, { x: 60, y: 0 }]);
    state = useWorkspace.getState();
    const updated = state.players.find((player) => player.id === id);
    expect(added).toBe(6);
    expect(updated?.nodes).toHaveLength(10);
    expect(updated?.nodes.filter((node) => node.kind === 'interior')).toHaveLength(6);
    expect(updated?.border).toHaveLength(4);
  });

  it('leaves the workspace unchanged when a traced border is invalid', () => {
    reset();
    const before = useWorkspace.getState().players;
    expect(() => useWorkspace.getState().tracePlayer([
      { x: 0, y: 0 }, { x: 120, y: 120 }, { x: 120, y: 0 }, { x: 0, y: 120 },
    ])).toThrow(/simple, non-overlapping/);
    expect(useWorkspace.getState().players).toBe(before);
    expect(useWorkspace.getState().players).toHaveLength(2);
  });

  it('normalizes a one-player remainder after removal', () => {
    const { first, second } = reset();
    useWorkspace.getState().createGroup([first.id, second.id]);
    useWorkspace.getState().removePlayers([first.id]);
    const state = useWorkspace.getState();
    expect(state.players).toHaveLength(1);
    expect(state.groups).toHaveLength(0);
    expect(state.players[0].groupId).toBeUndefined();
  });

  it('dissolves a one-player remainder when a member unlinks', () => {
    const { first, second } = reset();
    useWorkspace.getState().createGroup([first.id, second.id]);
    useWorkspace.getState().setPlayerGroup(first.id);
    const state = useWorkspace.getState();
    expect(state.groups).toHaveLength(0);
    expect(state.players.every((player) => player.groupId === undefined)).toBe(true);
    expect(state.players[1].sourceId).toBe(alternateSource.id);
  });
});
