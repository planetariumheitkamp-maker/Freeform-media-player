import { create } from 'zustand';
import {
  createPlayer as makePlayer,
  INITIAL_PROJECT_NAME,
  rectangleCorners,
  TEST_SOURCE,
} from '../data/defaults';
import {
  borderPoints,
  canMoveNode,
  createAdvancedFromQuick,
  isSimplePolygon,
  nearestBorderSegment,
  pointInPolygon,
  polygonArea,
  sampleShapeUv,
  squareToQuad,
} from '../lib/geometry';
import { normalizeGroups } from '../lib/groups';
import type {
  EditorMode,
  EditorTool,
  LinkGroup,
  MediaSource,
  MeshNode,
  Player,
  ProjectFile,
  ToastMessage,
  Vec2,
} from '../types';

interface WorkspaceState {
  projectName: string;
  sources: MediaSource[];
  players: Player[];
  groups: LinkGroup[];
  selectedIds: string[];
  activeId: string | null;
  tool: EditorTool;
  showMesh: boolean;
  presentation: boolean;
  toasts: ToastMessage[];
  setProjectName: (name: string) => void;
  addPlayer: (sourceId?: string) => string;
  duplicatePlayer: (id: string) => void;
  removePlayers: (ids: string[]) => void;
  selectPlayer: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  updatePlayer: (id: string, patch: Partial<Player>) => void;
  movePlayer: (id: string, delta: Vec2) => void;
  setMode: (id: string, mode: EditorMode) => void;
  updateQuickCorner: (id: string, index: number, point: Vec2) => void;
  moveNode: (id: string, nodeId: string, point: Vec2) => void;
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
  loadProject: (project: ProjectFile) => void;
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
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

export const useWorkspace = create<WorkspaceState>()((set, get) => {
  const firstPlayer = makePlayer(1);
  return {
    projectName: INITIAL_PROJECT_NAME,
    sources: [TEST_SOURCE],
    players: [firstPlayer],
    groups: [],
    selectedIds: [firstPlayer.id],
    activeId: firstPlayer.id,
    tool: 'select',
    showMesh: true,
    presentation: false,
    toasts: [],

    setProjectName: (projectName) => set({ projectName }),

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

    removePlayers: (ids) => set((state) => {
      const removed = new Set(ids);
      const remaining = state.players.filter((player) => !removed.has(player.id));
      const { players, groups } = normalizeGroups(remaining, state.groups);
      const selectedIds = state.selectedIds.filter((id) => !removed.has(id));
      return {
        players,
        groups,
        selectedIds,
        activeId: selectedIds.at(-1) ?? players[0]?.id ?? null,
      };
    }),

    selectPlayer: (id, additive = false) => set((state) => {
      if (!state.players.some((player) => player.id === id)) return state;
      if (!additive) return { selectedIds: [id], activeId: id };
      const selectedIds = state.selectedIds.includes(id)
        ? state.selectedIds.filter((selected) => selected !== id)
        : [...state.selectedIds, id];
      return {
        selectedIds,
        activeId: selectedIds.at(-1) ?? null,
      };
    }),

    clearSelection: () => set({ selectedIds: [], activeId: null }),

    updatePlayer: (id, patch) => set((state) => ({
      players: state.players.map((player) => player.id === id ? { ...player, ...patch } : player),
    })),

    movePlayer: (id, delta) => set((state) => ({
      players: state.players.map((player) => {
        if (player.id !== id || player.locked) return player;
        return {
          ...player,
          position: {
            x: player.position.x + delta.x,
            y: player.position.y + delta.y,
          },
        };
      }),
    })),

    setMode: (id, mode) => set((state) => ({
      players: state.players.map((player) => {
        if (player.id !== id) return player;
        if (mode === 'advanced') return { ...ensureAdvanced(player), mode };
        return { ...player, mode };
      }),
    })),

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
    })),

    moveNode: (id, nodeId, point) => set((state) => ({
      players: state.players.map((player) => {
        if (player.id !== id || player.locked || player.mode !== 'advanced') return player;
        if (!canMoveNode(player.nodes, player.border, nodeId, point)) return player;
        return {
          ...player,
          nodes: player.nodes.map((node) => node.id === nodeId ? { ...node, ...point } : node),
        };
      }),
    })),

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

    registerSources: (incoming) => set((state) => {
      const sources = [...state.sources];
      incoming.forEach((source) => {
        const index = sources.findIndex((candidate) => candidate.id === source.id);
        if (index >= 0) sources[index] = source;
        else sources.push(source);
      });
      return { sources };
    }),

    updateSource: (id, patch) => set((state) => ({
      sources: state.sources.map((source) => source.id === id ? { ...source, ...patch } : source),
    })),

    removeSource: (id) => set((state) => {
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
    setPresentation: (presentation) => set({ presentation }),

    loadProject: (project) => {
      const sources = project.sources.map((source) => ({
        ...source,
        connected: source.kind === 'stream' || source.kind === 'test' ? true : false,
      }));
      if (!sources.some((source) => source.id === TEST_SOURCE.id)) sources.unshift(TEST_SOURCE);
      const players = project.players.map((player) => ({
        ...player,
        autoplay: false,
      }));
      const normalized = normalizeGroups(players, project.groups);
      set({
        projectName: project.name,
        sources,
        players: normalized.players,
        groups: normalized.groups,
        selectedIds: players[0] ? [players[0].id] : [],
        activeId: players[0]?.id ?? null,
        tool: 'select',
        presentation: false,
      });
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
