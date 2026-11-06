import { describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import {
  DEFAULT_PLAYER_LIVE_ENHANCEMENT,
  fitLiveEnhancementInput,
  isPlayerLiveEnhancement,
  liveEnhancementFrameIsFresh,
  liveEnhancementRetryDelay,
  liveEnhancementWasmThreads,
  normalizePlayerLiveEnhancement,
} from '../../src/lib/liveEnhancement';
import { parseProject, serializeProject } from '../../src/lib/project';
import { useWorkspace } from '../../src/store/useWorkspace';

describe('live AI settings and frame safety', () => {
  it('defaults to disabled with conservative strength and input dimensions', () => {
    expect(createPlayer(1).enhancement).toEqual(DEFAULT_PLAYER_LIVE_ENHANCEMENT);
    expect(normalizePlayerLiveEnhancement()).toEqual({ enabled: false, strength: 0.8, inputSize: 320 });
  });

  it('clamps strength and accepts only the offered input sizes', () => {
    expect(normalizePlayerLiveEnhancement({ enabled: true, strength: 4, inputSize: 640 })).toEqual({
      enabled: true, strength: 1, inputSize: 640,
    });
    expect(normalizePlayerLiveEnhancement({ strength: -1, inputSize: 999 as 320 })).toEqual({
      enabled: false, strength: 0, inputSize: 320,
    });
    expect(isPlayerLiveEnhancement({ enabled: true, strength: 0.6, inputSize: 480 })).toBe(true);
    expect(isPlayerLiveEnhancement({ strength: 'high' })).toBe(false);
    expect(isPlayerLiveEnhancement(null)).toBe(false);
  });

  it('uses a bounded WASM thread pool only when shared memory is available', () => {
    expect(liveEnhancementWasmThreads(12, false)).toBe(1);
    expect(liveEnhancementWasmThreads(2, true)).toBe(1);
    expect(liveEnhancementWasmThreads(4, true)).toBe(2);
    expect(liveEnhancementWasmThreads(12, true)).toBe(4);
    expect(liveEnhancementWasmThreads(Number.NaN, true)).toBe(1);
  });

  it('caps the long edge, retains aspect ratio, and never enlarges a small source', () => {
    expect(fitLiveEnhancementInput(1920, 1080, 320)).toEqual({ width: 320, height: 180 });
    expect(fitLiveEnhancementInput(1080, 1920, 480)).toEqual({ width: 270, height: 480 });
    expect(fitLiveEnhancementInput(160, 90, 640)).toEqual({ width: 160, height: 90 });
    expect(fitLiveEnhancementInput(0, 0, 320)).toEqual({ width: 2, height: 2 });
  });

  it('drops late playing frames and backs off after three, but accepts paused frames', () => {
    expect(liveEnhancementFrameIsFresh(100, 450, 10, 10.1, false)).toBe(true);
    expect(liveEnhancementFrameIsFresh(100, 451, 10, 10.1, false)).toBe(false);
    expect(liveEnhancementFrameIsFresh(100, 200, 10, 10.4, false)).toBe(false);
    expect(liveEnhancementFrameIsFresh(100, 30_100, 10, 10, true)).toBe(true);
    expect(liveEnhancementRetryDelay(1)).toBe(0);
    expect(liveEnhancementRetryDelay(3)).toBe(2000);
  });

  it('round-trips live AI settings and rejects malformed imported values', () => {
    const player = createPlayer(1);
    player.enhancement = { enabled: true, strength: 0.65, inputSize: 480 };
    const content = serializeProject({ projectName: 'AI study', sources: [TEST_SOURCE], players: [player], groups: [] });
    expect(parseProject(content).players[0].enhancement).toEqual(player.enhancement);

    const legacy = JSON.parse(content);
    delete legacy.players[0].enhancement;
    expect(parseProject(JSON.stringify(legacy)).players[0].enhancement).toEqual(DEFAULT_PLAYER_LIVE_ENHANCEMENT);
    legacy.players[0].enhancement = { strength: 'more' };
    expect(() => parseProject(JSON.stringify(legacy))).toThrow('invalid player or mesh');
  });

  it('keeps edits independent, supports undo, and restores normalized project settings', () => {
    const first = createPlayer(1);
    const second = createPlayer(2);
    useWorkspace.setState({ players: [first, second], selectedIds: [first.id], activeId: first.id, sources: [TEST_SOURCE] });
    useWorkspace.getState().resetHistory();
    useWorkspace.getState().updatePlayer(first.id, { enhancement: { enabled: true, strength: 2, inputSize: 640 } });
    expect(useWorkspace.getState().players[0].enhancement).toEqual({ enabled: true, strength: 1, inputSize: 640 });
    expect(useWorkspace.getState().players[1].enhancement).toEqual(DEFAULT_PLAYER_LIVE_ENHANCEMENT);
    useWorkspace.getState().undo();
    expect(useWorkspace.getState().players[0].enhancement).toEqual(DEFAULT_PLAYER_LIVE_ENHANCEMENT);
    useWorkspace.getState().redo();

    const project = parseProject(serializeProject(useWorkspace.getState()));
    project.players[0].enhancement = { enabled: true, strength: -5, inputSize: 480 };
    useWorkspace.getState().loadProject(project);
    expect(useWorkspace.getState().players[0].enhancement).toEqual({ enabled: true, strength: 0, inputSize: 480 });
  });

  it('keeps runtime status out of undo history and avoids identical updates', () => {
    const player = createPlayer(1);
    useWorkspace.setState({ players: [player], selectedIds: [player.id], activeId: player.id, liveEnhancementStatus: {} });
    useWorkspace.getState().resetHistory();
    const status = { phase: 'active' as const, detail: 'WASM · test', backend: 'wasm' as const, inferenceMs: 42 };
    useWorkspace.getState().setLiveEnhancementStatus(player.id, status);
    const statusMap = useWorkspace.getState().liveEnhancementStatus;
    useWorkspace.getState().setLiveEnhancementStatus(player.id, { ...status });
    expect(useWorkspace.getState().liveEnhancementStatus).toBe(statusMap);
    expect(useWorkspace.getState().liveEnhancementStatus[player.id]).toEqual(status);
    expect(useWorkspace.getState().canUndo).toBe(false);
  });
});
