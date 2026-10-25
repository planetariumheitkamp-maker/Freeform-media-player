import { beforeEach, describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
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
