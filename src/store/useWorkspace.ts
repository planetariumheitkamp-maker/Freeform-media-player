import { create } from 'zustand';
import {
  createPlayer as makePlayer,
  INITIAL_PROJECT_NAME,
  rectangleCorners,
  TEST_SOURCE,
} from '../data/defaults';
import {
  borderPoints,
  createAdvancedFromQuick,
  isSimplePolygon,
  nearestBorderSegment,
  pointInPolygon,
  polygonArea,
  sampleShapeUv,
  squareToQuad,
} from '../lib/geometry';
import { DEFAULT_BACKGROUND_COLOR, normalizeBackgroundColor, normalizePlayerVisual } from '../lib/appearance';
import { DEFAULT_PLANETARIUM_SETTINGS, normalizePlanetariumSettings } from '../lib/dome';
import { DEFAULT_GRID_GEOMETRY, normalizeGridGeometry } from '../lib/grid';
import { DEFAULT_OUTPUT_SIZE, normalizeOutputOpacity, normalizeOutputSize } from '../lib/output';
import { DEFAULT_RENDER_QUALITY, normalizeRenderQuality } from '../lib/quality';
import { normalizeGroups } from '../lib/groups';
import { createInteriorTraceNodes, createTracedShape } from '../lib/trace';
import { DEFAULT_TRACE_SETTINGS, normalizeTraceSettings } from '../lib/traceSettings';
import {
  capturePresentLayout,
  DEFAULT_PRESENT_SETTINGS,
  normalizePresentSettings,
  restorePresentLayout,
} from '../lib/present';
import {
  alignPlayers,
  distributePlayers,
  resizePlayers,
  type DistributionAxis,
  type HorizontalAlignment,
  type VerticalAlignment,
} from '../lib/workflow';
import type {
  EditorMode,
  EditorTool,
  LinkGroup,
  MediaSource,
  MeshNode,
  Player,
  ProjectFile,
  RenderQuality,
  ToastMessage,
  Vec2,
  WorkspaceBackground,
  WorkspaceGridGeometry,
  WorkspaceOutputSize,
  WorkspacePlanetariumSettings,
  WorkspacePresentSettings,
  WorkspacePresentSettingsInput,
  WorkspaceTraceSettings,
} from '../types';

interface WorkspaceState {
  projectName: string;
  sources: MediaSource[];
  players: Player[];
  groups: LinkGroup[];
  background: WorkspaceBackground | null;
  backgroundColor: string;
  gridGeometry: WorkspaceGridGeometry;
  gridSnapping: boolean;
  outputSize: WorkspaceOutputSize;
  outputOpacity: number;
  renderQuality: RenderQuality;
  traceSettings: WorkspaceTraceSettings;
  planetariumSettings: WorkspacePlanetariumSettings;
  presentSettings: WorkspacePresentSettings;
  selectedIds: string[];
  selectedNodes: Record<string, string[]>;
  activeId: string | null;
  tool: EditorTool;
  showMesh: boolean;
  presentation: boolean;
  toasts: ToastMessage[];
  historyPast: string[];
  historyFuture: string[];
  setProjectName: (name: string) => void;
  setBackground: (background: WorkspaceBackground | null, record?: boolean) => void;
  setBackgroundColor: (color: string) => void;
  setGridGeometry: (patch: Partial<WorkspaceGridGeometry>) => void;
  setGridSnapping: (value: boolean) => void;
  setOutputSize: (size: WorkspaceOutputSize) => void;
  setOutputOpacity: (opacity: number) => void;
  setRenderQuality: (quality: RenderQuality) => void;
  setTraceSettings: (patch: Partial<WorkspaceTraceSettings>) => void;
  setPlanetariumSettings: (patch: Partial<WorkspacePlanetariumSettings>) => void;
  addPlayer: (sourceId?: string) => string;
  tracePlayer: (points: Vec2[]) => string;
  traceInterior: (id: string, points: Vec2[]) => number;
  duplicatePlayer: (id: string) => void;
  copyPlayers: (ids: string[]) => number;
  pastePlayers: () => number;
  removePlayers: (ids: string[]) => void;
  selectPlayer: (id: string, additive?: boolean) => void;
  selectPlayers: (ids: string[], additive?: boolean) => void;
  selectNodes: (selection: Record<string, string[]>, additive?: boolean) => void;
  clearSelection: () => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  updatePlayers: (ids: string[], patch: Partial<Player>) => void;
  movePlayer: (id: string, delta: Vec2) => void;
  movePlayers: (ids: string[], delta: Vec2) => void;
  alignSelected: (horizontal?: HorizontalAlignment, vertical?: VerticalAlignment) => void;
  distributeSelected: (axis: DistributionAxis) => void;
  resizeSelected: (width?: number, height?: number) => void;
  setMode: (id: string, mode: EditorMode) => void;
  updateQuickCorner: (id: string, index: number, point: Vec2) => void;
  moveNode: (id: string, nodeId: string, point: Vec2) => void;
  moveNodes: (moves: Record<string, Record<string, Vec2>>) => void;
  addNode: (id: string, kind: 'border' | 'interior', point: Vec2) => string | null;
  deleteNode: (id: string, nodeId: string) => void;
  resetShape: (id: string) => void;
  registerSources: (sources: MediaSource[]) => void;
  updateSource: (id: string, patch: Partial<MediaSource>) => void;
  removeSource: (id: string) => void;
  assignSource: (playerId: string, sourceId: string) => void;
  createGroup: (ids: string[]) => string | null;
  updateGroup: (id: string, patch: Partial<LinkGroup>) => void;
  removeGroup: (id: string) => void;
  setPlayerGroup: (playerId: string, groupId?: string) => void;
  setTool: (tool: EditorTool) => void;
  setShowMesh: (value: boolean) => void;
  setPresentation: (value: boolean) => void;
  setPresentSettings: (patch: WorkspacePresentSettingsInput) => void;
  lockPresentLayout: (windowPlacement?: WorkspacePresentSettings['windowPlacement']) => void;
  canUndo: boolean;
  canRedo: boolean;
  beginHistory: (label?: string) => void;
  endHistory: () => void;
  resetHistory: () => void;
  undo: () => void;
  redo: () => void;
  loadProject: (project: ProjectFile) => void;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}

type HistorySnapshot = Pick<WorkspaceState,
  'projectName' | 'players' | 'groups' | 'background' | 'backgroundColor' | 'gridGeometry' | 'gridSnapping'
  | 'outputSize' | 'outputOpacity' | 'renderQuality' | 'traceSettings' | 'planetariumSettings'
>;

interface HistoryEntry {
  snapshot: HistorySnapshot;
  label: string;
}

const HISTORY_KEYS = [
  'projectName', 'players', 'groups', 'background', 'backgroundColor', 'gridGeometry', 'gridSnapping',
  'outputSize', 'outputOpacity', 'renderQuality', 'traceSettings', 'planetariumSettings',
] as const;
const HISTORY_LIMIT = 100;
const PLAYBACK_FIELDS = new Set(['volume', 'muted', 'loop', 'rate', 'autoplay']);

function captureHistory(state: WorkspaceState): HistorySnapshot {
  return structuredClone({
    projectName: state.projectName,
    players: state.players,
    groups: state.groups,
    background: state.background,
    backgroundColor: state.backgroundColor,
    gridGeometry: state.gridGeometry,
    gridSnapping: state.gridSnapping,
    outputSize: state.outputSize,
    outputOpacity: state.outputOpacity,
    renderQuality: state.renderQuality,
    traceSettings: state.traceSettings,
    planetariumSettings: state.planetariumSettings,
  });
}

function historyChanged(before: WorkspaceState, after: WorkspaceState): boolean {
  return HISTORY_KEYS.some((key) => before[key] !== after[key]);
}

function validSelectedNodes(selection: Record<string, string[]>, players: Player[]): Record<string, string[]> {
  return Object.fromEntries(players.flatMap((player) => {
    const nodeIds = new Set(player.nodes.map((node) => node.id));
    const selected = (selection[player.id] ?? []).filter((id) => nodeIds.has(id));
    return selected.length ? [[player.id, selected]] : [];
  }));
}

function nextPlayerName(players: Player[]): string {
  const highest = players.reduce((value, player) => {
    const match = /^Player (\d+)$/.exec(player.name);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return `Player ${highest + 1}`;
}

function ensureAdvanced(player: Player): Player {
  if (player.nodes.length >= 3 && player.border.length >= 3) return player;
  return { ...player, ...createAdvancedFromQuick(player.quickCorners) };
}

let playerClipboard: { players: Player[]; groups: LinkGroup[] } | null = null;
let pasteSerial = 1;

export const useWorkspace = create<WorkspaceState>()((rawSet, get) => {
  const past: HistoryEntry[] = [];
  const future: HistoryEntry[] = [];
  let activeHistory: { before: HistorySnapshot; label: string; changed: boolean } | null = null;

  const updateHistoryFlags = () => rawSet({
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    historyPast: past.map((entry) => entry.label),
    historyFuture: future.map((entry) => entry.label),
  });
  const pushHistory = (snapshot: HistorySnapshot, label: string) => {
    past.push({ snapshot, label });
    if (past.length > HISTORY_LIMIT) past.shift();
    future.length = 0;
    updateHistoryFlags();
  };
  const finishHistory = () => {
    if (!activeHistory) return;
    const completed = activeHistory;
    activeHistory = null;
    if (completed.changed) pushHistory(completed.before, completed.label);
  };
  const resetHistory = () => {
    past.length = 0;
    future.length = 0;
    activeHistory = null;
    updateHistoryFlags();
  };
  const set = (
    partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>),
    label = 'Edit workspace',
  ) => {
    const before = get();
    rawSet(partial);
    const after = get();
    if (!historyChanged(before, after)) return;
    if (activeHistory) {
      activeHistory.changed = true;
      activeHistory.label = label;
      return;
    }
    pushHistory(captureHistory(before), label);
  };
  const restoreHistory = (snapshot: HistorySnapshot) => {
    const state = get();
    const currentPlayers = new Map(state.players.map((player) => [player.id, player]));
    const sourceIds = new Set(state.sources.map((source) => source.id));
    const restored = structuredClone(snapshot);
    const players = restored.players.map((player) => {
      const current = currentPlayers.get(player.id);
      return {
        ...player,
        sourceId: sourceIds.has(player.sourceId) ? player.sourceId : TEST_SOURCE.id,
        ...(current ? {
          volume: current.volume,
          muted: current.muted,
          loop: current.loop,
          rate: current.rate,
          autoplay: current.autoplay,
        } : {}),
      };
    });
    const selectedIds = state.selectedIds.filter((id) => players.some((player) => player.id === id));
    rawSet({
      ...restored,
      players,
      selectedIds,
      selectedNodes: validSelectedNodes(state.selectedNodes, players),
      activeId: state.activeId && players.some((player) => player.id === state.activeId)
        ? state.activeId
        : selectedIds.at(-1) ?? players[0]?.id ?? null,
    });
  };

  const firstPlayer = makePlayer(1);
  return {
    projectName: INITIAL_PROJECT_NAME,
    sources: [TEST_SOURCE],
    players: [firstPlayer],
    groups: [],
    background: null,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    gridGeometry: { ...DEFAULT_GRID_GEOMETRY },
    gridSnapping: false,
    outputSize: { ...DEFAULT_OUTPUT_SIZE },
    outputOpacity: 1,
    renderQuality: DEFAULT_RENDER_QUALITY,
    traceSettings: { ...DEFAULT_TRACE_SETTINGS },
    planetariumSettings: { ...DEFAULT_PLANETARIUM_SETTINGS },
    presentSettings: normalizePresentSettings(DEFAULT_PRESENT_SETTINGS),
    selectedIds: [firstPlayer.id],
    selectedNodes: {},
    activeId: firstPlayer.id,
    tool: 'select',
    showMesh: true,
    presentation: false,
    canUndo: false,
    canRedo: false,
    historyPast: [],
    historyFuture: [],
    toasts: [],

    setProjectName: (projectName) => set({ projectName }),
    setBackground: (background, record = true) => {
      if (record) set({ background });
      else rawSet({ background });
    },
    setBackgroundColor: (color) => set({ backgroundColor: normalizeBackgroundColor(color) }, 'Change background color'),
    setGridGeometry: (patch) => set((state) => ({
      gridGeometry: normalizeGridGeometry({ ...state.gridGeometry, ...patch }),
    })),
    setGridSnapping: (gridSnapping) => set({ gridSnapping }),
    setOutputSize: (size) => set({ outputSize: normalizeOutputSize(size) }),
    setOutputOpacity: (opacity) => set({ outputOpacity: normalizeOutputOpacity(opacity) }),
    setRenderQuality: (quality) => set({ renderQuality: normalizeRenderQuality(quality) }, 'Change projection quality'),
    setTraceSettings: (patch) => set((state) => ({
      traceSettings: normalizeTraceSettings({ ...state.traceSettings, ...patch }),
    })),
    setPlanetariumSettings: (patch) => set((state) => ({
      planetariumSettings: normalizePlanetariumSettings({ ...state.planetariumSettings, ...patch }),
      gridGeometry: patch.enabled === true
        ? normalizeGridGeometry({ ...state.gridGeometry, kind: 'circular' })
        : state.gridGeometry,
    })),

    addPlayer: (sourceId = TEST_SOURCE.id) => {
      const player = makePlayer(get().players.length + 1, sourceId);
      player.name = nextPlayerName(get().players);
      set((state) => ({
        players: [...state.players, player],
        selectedIds: [player.id],
        activeId: player.id,
      }));
      return player.id;
    },

    tracePlayer: (points) => {
      const state = get();
      const shape = createTracedShape(
        points,
        state.traceSettings.smoothing,
        state.traceSettings.sourceMapping,
      );
      const sourceId = state.players.find((player) => player.id === state.activeId)?.sourceId ?? TEST_SOURCE.id;
      const player = { ...makePlayer(state.players.length + 1, sourceId), ...shape };
      player.name = nextPlayerName(state.players);
      set({
        players: [...state.players, player],
        selectedIds: [player.id],
        activeId: player.id,
      });
      return player.id;
    },

    traceInterior: (id, points) => {
      const state = get();
      const player = state.players.find((candidate) => candidate.id === id);
      if (!player) return 0;
      const additions = createInteriorTraceNodes(player, points, state.traceSettings.interiorSpacing);
      if (!additions.length) return 0;
      set({
        players: state.players.map((candidate) => candidate.id === id
          ? { ...candidate, nodes: [...candidate.nodes, ...additions] }
          : candidate),
      });
      return additions.length;
    },

    duplicatePlayer: (id) => {
      const state = get();
      const original = state.players.find((player) => player.id === id);
      if (!original) return;
      const duplicate = structuredClone(original);
      duplicate.id = crypto.randomUUID();
      duplicate.name = `${original.name} copy`;
      duplicate.position.x += 48;
      duplicate.position.y -= 36;
      duplicate.locked = false;
      duplicate.autoplay = true;
      set({
        players: [...state.players, duplicate],
        selectedIds: [duplicate.id],
        activeId: duplicate.id,
      });
    },

    copyPlayers: (ids) => {
      const requested = new Set(ids);
      const players = get().players.filter((player) => requested.has(player.id));
      if (!players.length) return 0;
      const groups = get().groups.filter((group) => (
        players.filter((player) => player.groupId === group.id).length >= 2
      ));
      playerClipboard = structuredClone({ players, groups });
      pasteSerial = 1;
      return players.length;
    },

    pastePlayers: () => {
      if (!playerClipboard?.players.length) return 0;
      const state = get();
      const clipboard = structuredClone(playerClipboard);
      const groupIds = new Map(clipboard.groups.map((group) => [group.id, crypto.randomUUID()]));
      const pastedGroups = clipboard.groups.map((group) => ({
        ...group,
        id: groupIds.get(group.id) as string,
      }));
      const offset = pasteSerial;
      const pastedPlayers = clipboard.players.map((player) => ({
        ...player,
        id: crypto.randomUUID(),
        name: `${player.name} copy`,
        groupId: player.groupId ? groupIds.get(player.groupId) : undefined,
        position: {
          x: player.position.x + 48 * offset,
          y: player.position.y - 36 * offset,
        },
        locked: false,
        autoplay: true,
      }));
      const selectedIds = pastedPlayers.map((player) => player.id);
      const normalized = normalizeGroups(
        [...state.players, ...pastedPlayers],
        [...state.groups, ...pastedGroups],
      );
      pasteSerial += 1;
      set({
        players: normalized.players,
        groups: normalized.groups,
        selectedIds,
        activeId: selectedIds.at(-1) ?? null,
      });
      return pastedPlayers.length;
    },

    removePlayers: (ids) => set((state) => {
      const removed = new Set(ids);
      const remaining = state.players.filter((player) => !removed.has(player.id));
      const { players, groups } = normalizeGroups(remaining, state.groups);
      const selectedIds = state.selectedIds.filter((id) => !removed.has(id));
      return {
        players,
        groups,
        selectedIds,
        selectedNodes: validSelectedNodes(state.selectedNodes, players),
        activeId: selectedIds.at(-1) ?? players[0]?.id ?? null,
      };
    }),

    selectPlayer: (id, additive = false) => set((state) => {
      if (!state.players.some((player) => player.id === id)) return state;
      if (!additive) return { selectedIds: [id], selectedNodes: {}, activeId: id };
      const selectedIds = state.selectedIds.includes(id)
        ? state.selectedIds.filter((selected) => selected !== id)
        : [...state.selectedIds, id];
      return {
        selectedIds,
        activeId: selectedIds.at(-1) ?? null,
      };
    }),

    selectPlayers: (ids, additive = false) => set((state) => {
      const valid = ids.filter((id) => state.players.some((player) => player.id === id));
      const selectedIds = additive ? [...new Set([...state.selectedIds, ...valid])] : valid;
      return { selectedIds, selectedNodes: {}, activeId: selectedIds.at(-1) ?? null };
    }),

    selectNodes: (selection, additive = false) => set((state) => {
      const selectedNodes = additive
        ? Object.fromEntries(Object.entries({ ...state.selectedNodes, ...selection }).map(([id, nodes]) => [id, [...new Set(nodes)]]))
        : selection;
      const selectedIds = Object.keys(selectedNodes).filter((id) => selectedNodes[id]?.length);
      return { selectedNodes, selectedIds, activeId: selectedIds.at(-1) ?? state.activeId };
    }),

    clearSelection: () => set({ selectedIds: [], selectedNodes: {}, activeId: null }),

    updatePlayer: (id, patch) => {
      const playbackOnly = Object.keys(patch).every((key) => PLAYBACK_FIELDS.has(key));
      const update = (state: WorkspaceState) => ({
        players: state.players.map((player) => player.id === id ? {
          ...player,
          ...patch,
          visual: normalizePlayerVisual({ ...player.visual, ...patch.visual }),
        } : player),
      });
      if (playbackOnly) rawSet(update);
      else set(update, 'Edit player');
    },

    updatePlayers: (ids, patch) => {
      const playbackOnly = Object.keys(patch).every((key) => PLAYBACK_FIELDS.has(key));
      const requested = new Set(ids);
      const update = (state: WorkspaceState) => ({
        players: state.players.map((player) => requested.has(player.id) ? {
          ...player,
          ...patch,
          visual: normalizePlayerVisual({ ...player.visual, ...patch.visual }),
        } : player),
      });
      if (playbackOnly) rawSet(update);
      else set(update, `Edit ${ids.length} players`);
    },

    movePlayer: (id, delta) => get().movePlayers([id], delta),

    movePlayers: (ids, delta) => set((state) => {
      if (state.presentation && state.presentSettings.layoutLocked) return state;
      const requested = new Set(ids);
      return {
        players: state.players.map((player) => requested.has(player.id) && !player.locked ? {
          ...player,
          position: { x: player.position.x + delta.x, y: player.position.y + delta.y },
        } : player),
      };
    }, `Move ${ids.length === 1 ? 'player' : `${ids.length} players`}`),

    alignSelected: (horizontal, vertical) => set((state) => ({
      players: alignPlayers(state.players, state.selectedIds, horizontal, vertical),
    }), 'Align players'),

    distributeSelected: (axis) => set((state) => ({
      players: distributePlayers(state.players, state.selectedIds, axis),
    }), `Distribute ${axis === 'horizontal' ? 'horizontally' : 'vertically'}`),

    resizeSelected: (width, height) => set((state) => ({
      players: resizePlayers(state.players, state.selectedIds, width, height),
    }), 'Resize players'),

    setMode: (id, mode) => set((state) => ({
      players: state.players.map((player) => {
        if (player.id !== id) return player;
        if (mode === 'advanced') return { ...ensureAdvanced(player), mode };
        return { ...player, mode };
      }),
    }), `Use ${mode === 'advanced' ? 'advanced mesh' : 'four-corner'} mode`),

    updateQuickCorner: (id, index, point) => set((state) => ({
      players: state.players.map((player) => {
        if (player.id !== id || player.locked) return player;
        const corners = player.quickCorners.map((corner) => ({ ...corner })) as Player['quickCorners'];
        corners[index] = point;
        if (!isSimplePolygon(corners)) return player;
        try {
          squareToQuad(corners);
        } catch {
          return player;
        }
        return { ...player, quickCorners: corners };
      }),
    }), 'Move corner'),

    moveNode: (id, nodeId, point) => get().moveNodes({ [id]: { [nodeId]: point } }),

    moveNodes: (moves) => set((state) => {
      let valid = true;
      const players = state.players.map((player) => {
        const playerMoves = moves[player.id];
        if (!playerMoves || player.locked || player.mode !== 'advanced') return player;
        const nodes = player.nodes.map((node) => playerMoves[node.id] ? { ...node, ...playerMoves[node.id] } : node);
        const polygon = borderPoints(nodes, player.border);
        if (!isSimplePolygon(polygon)
          || nodes.some((node) => !player.border.includes(node.id) && !pointInPolygon(node, polygon))
          || nodes.some((node, index) => nodes.slice(index + 1).some((other) => Math.hypot(node.x - other.x, node.y - other.y) < 1.5))) {
          valid = false;
          return player;
        }
        return { ...player, nodes };
      });
      return valid ? { players } : state;
    }, 'Move mesh nodes'),

    addNode: (id, kind, point) => {
      let createdId: string | null = null;
      set((state) => ({
        players: state.players.map((original) => {
          if (original.id !== id || original.locked) return original;
          const player = ensureAdvanced({ ...original, mode: 'advanced' });
          const nodeMap = new Map(player.nodes.map((node) => [node.id, node]));
          if (kind === 'border') {
            const nearest = nearestBorderSegment(player.nodes, player.border, point);
            if (!nearest) return original;
            const startId = player.border[nearest.index];
            const endId = player.border[(nearest.index + 1) % player.border.length];
            const start = nodeMap.get(startId);
            const end = nodeMap.get(endId);
            if (!start || !end) return original;
            if (player.nodes.some((node) => Math.hypot(node.x - nearest.point.x, node.y - nearest.point.y) < 3)) {
              return original;
            }
            createdId = crypto.randomUUID();
            const node: MeshNode = {
              id: createdId,
              ...nearest.point,
              u: start.u + (end.u - start.u) * nearest.t,
              v: start.v + (end.v - start.v) * nearest.t,
              kind: 'edge',
            };
            const border = [...player.border];
            border.splice(nearest.index + 1, 0, createdId);
            return {
              ...player,
              nodes: [...player.nodes, node],
              border,
            };
          }

          const polygon = player.border.flatMap((nodeId) => {
            const node = nodeMap.get(nodeId);
            return node ? [node] : [];
          });
          if (!pointInPolygon(point, polygon)) return original;
          if (player.nodes.some((node) => Math.hypot(node.x - point.x, node.y - point.y) < 3)) return original;
          createdId = crypto.randomUUID();
          const sampled = sampleShapeUv(player, point);
          return {
            ...player,
            nodes: [...player.nodes, {
              id: createdId,
              ...point,
              u: sampled.u,
              v: sampled.v,
              kind: 'interior',
            }],
          };
        }),
      }));
      return createdId;
    },

    deleteNode: (id, nodeId) => set((state) => ({
      players: state.players.map((player) => {
        if (player.id !== id || player.mode !== 'advanced' || player.locked) return player;
        if (player.border.includes(nodeId) && player.border.length <= 3) return player;
        const nodes = player.nodes.filter((node) => node.id !== nodeId);
        const border = player.border.filter((id) => id !== nodeId);
        if (border.length >= 3 && player.border.includes(nodeId)) {
          const polygon = borderPoints(nodes, border);
          if (!isSimplePolygon(polygon)) return player;
          const interiorsRemainInside = nodes.every((node) => border.includes(node.id) || pointInPolygon(node, polygon));
          if (!interiorsRemainInside) return player;
        }
        return { ...player, nodes, border };
      }),
    })),

    resetShape: (id) => set((state) => ({
      players: state.players.map((player) => player.id === id ? {
        ...player,
        mode: 'quick',
        quickCorners: rectangleCorners(),
        nodes: [],
        border: [],
        rotation: 0,
        scale: 1,
      } : player),
    })),

    registerSources: (incoming) => rawSet((state) => {
      const sources = [...state.sources];
      incoming.forEach((source) => {
        const index = sources.findIndex((candidate) => candidate.id === source.id);
        if (index >= 0) sources[index] = source;
        else sources.push(source);
      });
      return { sources };
    }),

    updateSource: (id, patch) => rawSet((state) => ({
      sources: state.sources.map((source) => source.id === id ? { ...source, ...patch } : source),
    })),

    removeSource: (id) => rawSet((state) => {
      if (id === TEST_SOURCE.id) return state;
      return {
        sources: state.sources.filter((source) => source.id !== id),
        players: state.players.map((player) => player.sourceId === id ? {
          ...player,
          sourceId: TEST_SOURCE.id,
          autoplay: true,
        } : player),
      };
    }),

    assignSource: (playerId, sourceId) => set((state) => {
      const target = state.players.find((player) => player.id === playerId);
      if (!target || !state.sources.some((source) => source.id === sourceId)) return state;
      const targetIds = target.groupId
        ? state.players.filter((player) => player.groupId === target.groupId).map((player) => player.id)
        : [playerId];
      const ids = new Set(targetIds);
      return {
        players: state.players.map((player) => ids.has(player.id) ? {
          ...player,
          sourceId,
          autoplay: true,
        } : player),
      };
    }),

    createGroup: (ids) => {
      const state = get();
      const selected = state.players.filter((player) => ids.includes(player.id));
      if (selected.length < 2) return null;
      const groupId = crypto.randomUUID();
      const leader = selected.find((player) => player.id === state.activeId) ?? selected[0];
      const group: LinkGroup = {
        id: groupId,
        name: `Group ${String.fromCharCode(65 + (state.groups.length % 26))}`,
        mode: 'transport',
      };
      const selectedIds = new Set(selected.map((player) => player.id));
      const players = state.players.map((player) => selectedIds.has(player.id) ? {
        ...player,
        groupId,
        sourceId: leader.sourceId,
        autoplay: true,
      } : player);
      set(normalizeGroups(players, [...state.groups, group]));
      return groupId;
    },

    updateGroup: (id, patch) => set((state) => ({
      groups: state.groups.map((group) => group.id === id ? { ...group, ...patch } : group),
    })),

    removeGroup: (id) => set((state) => ({
      groups: state.groups.filter((group) => group.id !== id),
      players: state.players.map((player) => player.groupId === id ? {
        ...player,
        groupId: undefined,
      } : player),
    })),

    setPlayerGroup: (playerId, groupId) => set((state) => {
      const target = state.players.find((player) => player.id === playerId);
      if (!target) return state;
      const nextGroupId = groupId && state.groups.some((group) => group.id === groupId)
        ? groupId
        : undefined;
      const leader = nextGroupId
        ? state.players.find((player) => player.groupId === nextGroupId && player.id !== playerId)
        : undefined;
      const players = state.players.map((player) => {
        if (player.id !== playerId) return player;
        if (!nextGroupId) return { ...player, groupId: undefined };
        return {
          ...player,
          groupId: nextGroupId,
          sourceId: leader?.sourceId ?? player.sourceId,
          autoplay: true,
        };
      });
      return normalizeGroups(players, state.groups);
    }),

    setTool: (tool) => set({ tool }),
    setShowMesh: (showMesh) => set({ showMesh }),
    setPresentation: (presentation) => {
      const state = get();
      if (!presentation || !state.presentSettings.layoutLocked) {
        rawSet({ presentation });
        return;
      }
      const restored = restorePresentLayout(
        state.players,
        state.outputSize,
        state.presentSettings.lockedLayout,
      );
      rawSet({ presentation, players: restored.players, outputSize: restored.output });
    },
    setPresentSettings: (patch) => rawSet((state) => ({
      presentSettings: normalizePresentSettings({
        ...state.presentSettings,
        ...patch,
        ambient: { ...state.presentSettings.ambient, ...patch.ambient },
      }),
    })),
    lockPresentLayout: (windowPlacement) => rawSet((state) => ({
      presentSettings: normalizePresentSettings({
        ...state.presentSettings,
        layoutLocked: true,
        lockedLayout: capturePresentLayout(state.players, state.outputSize),
        windowPlacement: windowPlacement ?? state.presentSettings.windowPlacement,
      }),
    })),
    beginHistory: (label = 'Edit workspace') => {
      if (!activeHistory) activeHistory = { before: captureHistory(get()), label, changed: false };
    },
    endHistory: finishHistory,
    resetHistory,
    undo: () => {
      finishHistory();
      const entry = past.pop();
      if (!entry) {
        updateHistoryFlags();
        return;
      }
      future.push({ snapshot: captureHistory(get()), label: entry.label });
      restoreHistory(entry.snapshot);
      updateHistoryFlags();
    },
    redo: () => {
      const entry = future.pop();
      if (!entry) {
        updateHistoryFlags();
        return;
      }
      past.push({ snapshot: captureHistory(get()), label: entry.label });
      restoreHistory(entry.snapshot);
      updateHistoryFlags();
    },

    loadProject: (project) => {
      const sources = project.sources.map((source) => ({
        ...source,
        connected: source.kind === 'stream' || source.kind === 'test',
      }));
      if (!sources.some((source) => source.id === TEST_SOURCE.id)) sources.unshift(TEST_SOURCE);
      const players = project.players.map((player) => ({
        ...player,
        visual: normalizePlayerVisual(player.visual),
        autoplay: false,
      }));
      const normalized = normalizeGroups(players, project.groups);
      rawSet({
        projectName: project.name,
        sources,
        players: normalized.players,
        groups: normalized.groups,
        background: project.background ?? null,
        backgroundColor: normalizeBackgroundColor(project.backgroundColor),
        gridGeometry: normalizeGridGeometry(project.grid ?? DEFAULT_GRID_GEOMETRY),
        gridSnapping: project.gridSnapping ?? false,
        outputSize: normalizeOutputSize(project.output ?? DEFAULT_OUTPUT_SIZE),
        outputOpacity: normalizeOutputOpacity(project.outputOpacity ?? 1),
        renderQuality: normalizeRenderQuality(project.quality),
        traceSettings: normalizeTraceSettings(project.trace ?? DEFAULT_TRACE_SETTINGS),
        planetariumSettings: normalizePlanetariumSettings(project.planetarium ?? DEFAULT_PLANETARIUM_SETTINGS),
        presentSettings: normalizePresentSettings(project.present ?? DEFAULT_PRESENT_SETTINGS),
        selectedIds: players[0] ? [players[0].id] : [],
        selectedNodes: {},
        activeId: players[0]?.id ?? null,
        tool: 'select',
        presentation: false,
      });
      resetHistory();
    },

    pushToast: (toast) => {
      const id = crypto.randomUUID();
      set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
      window.setTimeout(() => get().dismissToast(id), 4500);
    },

    dismissToast: (id) => set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  };
});

export function groupAreaIsValid(corners: [Vec2, Vec2, Vec2, Vec2]): boolean {
  return Math.abs(polygonArea(corners)) > 100;
}
