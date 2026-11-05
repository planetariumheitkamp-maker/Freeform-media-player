import { borderPoints, localToWorld, worldToLocal } from './geometry';
import type { Player, Vec2 } from '../types';

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  center: Vec2;
}

export type HorizontalAlignment = 'left' | 'center' | 'right';
export type VerticalAlignment = 'top' | 'middle' | 'bottom';
export type DistributionAxis = 'horizontal' | 'vertical';

export interface SmartGuide {
  axis: 'x' | 'y';
  value: number;
  start: number;
  end: number;
}

export interface SmartSnap {
  delta: Vec2;
  guides: SmartGuide[];
}

export function playerWorldPoints(player: Player): Vec2[] {
  const points = player.mode === 'advanced' && player.nodes.length >= 3
    ? borderPoints(player.nodes, player.border)
    : player.quickCorners;
  return points.map((point) => localToWorld(player, point));
}

export function boundsFromPoints(points: Vec2[]): Bounds {
  if (!points.length) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, center: { x: 0, y: 0 } };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.max(...ys);
  const bottom = Math.min(...ys);
  return {
    left, right, top, bottom,
    width: right - left,
    height: top - bottom,
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
  };
}

export function playerBounds(player: Player): Bounds {
  return boundsFromPoints(playerWorldPoints(player));
}

export function selectionBounds(players: Player[]): Bounds {
  return boundsFromPoints(players.flatMap(playerWorldPoints));
}

export function alignPlayers(
  players: Player[],
  selectedIds: string[],
  horizontal?: HorizontalAlignment,
  vertical?: VerticalAlignment,
): Player[] {
  const selected = new Set(selectedIds);
  const targets = players.filter((player) => selected.has(player.id) && !player.locked);
  if (targets.length < 2 || (!horizontal && !vertical)) return players;
  const anchor = selectionBounds(targets);
  const target = horizontal === 'left' ? anchor.left : horizontal === 'right' ? anchor.right
    : horizontal === 'center' ? anchor.center.x : vertical === 'top' ? anchor.top
      : vertical === 'bottom' ? anchor.bottom : anchor.center.y;
  return players.map((player) => {
    const bounds = boundsFor(player, selected, targets);
    if (!bounds) return player;
    const dx = horizontal === 'left' ? target - bounds.left : horizontal === 'right' ? target - bounds.right
      : horizontal === 'center' ? target - bounds.center.x : 0;
    const dy = vertical === 'top' ? target - bounds.top : vertical === 'bottom' ? target - bounds.bottom
      : vertical === 'middle' ? target - bounds.center.y : 0;
    return { ...player, position: { x: player.position.x + dx, y: player.position.y + dy } };
  });
}

function boundsFor(player: Player, selected: Set<string>, targets: Player[]): Bounds | null {
  if (!selected.has(player.id) || player.locked || !targets.some((target) => target.id === player.id)) return null;
  return playerBounds(player);
}

export function distributePlayers(players: Player[], selectedIds: string[], axis: DistributionAxis): Player[] {
  const selected = new Set(selectedIds);
  const targets = players.filter((player) => selected.has(player.id) && !player.locked);
  if (targets.length < 3) return players;
  const items = targets.map((player) => ({ player, bounds: playerBounds(player) }));
  const center = (item: typeof items[number]) => axis === 'horizontal' ? item.bounds.center.x : item.bounds.center.y;
  const extent = (item: typeof items[number]) => axis === 'horizontal' ? item.bounds.width : item.bounds.height;
  const ordered = [...items].sort((a, b) => center(a) - center(b));
  const first = ordered[0];
  const last = ordered.at(-1) as typeof items[number];
  const occupied = ordered.reduce((sum, item) => sum + extent(item), 0);
  const span = center(last) - center(first);
  const gap = (span + (extent(first) + extent(last)) / 2 - occupied) / (ordered.length - 1);
  let cursor = center(first) - extent(first) / 2 + extent(first) + gap;
  const positions = new Map<string, number>([[first.player.id, center(first)]]);
  for (let index = 1; index < ordered.length - 1; index += 1) {
    const item = ordered[index];
    const nextCenter = cursor + extent(item) / 2;
    positions.set(item.player.id, nextCenter);
    cursor += extent(item) + gap;
  }
  positions.set(last.player.id, center(last));
  return players.map((player) => {
    const next = positions.get(player.id);
    if (next === undefined) return player;
    const current = playerBounds(player).center;
    return {
      ...player,
      position: axis === 'horizontal'
        ? { x: player.position.x + next - current.x, y: player.position.y }
        : { x: player.position.x, y: player.position.y + next - current.y },
    };
  });
}

export function resizePlayers(players: Player[], selectedIds: string[], width?: number, height?: number): Player[] {
  const selected = new Set(selectedIds);
  const targets = players.filter((player) => selected.has(player.id) && !player.locked);
  if (!targets.length || (width === undefined && height === undefined)) return players;
  const anchor = selectionBounds(targets);
  const xFactor = width !== undefined && anchor.width > 1e-6 ? Math.max(1, width) / anchor.width : 1;
  const yFactor = height !== undefined && anchor.height > 1e-6 ? Math.max(1, height) / anchor.height : 1;
  const scaleWorld = (point: Vec2): Vec2 => ({
    x: anchor.center.x + (point.x - anchor.center.x) * xFactor,
    y: anchor.center.y + (point.y - anchor.center.y) * yFactor,
  });
  return players.map((player) => {
    if (!selected.has(player.id) || player.locked) return player;
    const next = {
      ...player,
      position: scaleWorld(player.position),
    };
    const transform = (point: Vec2) => worldToLocal(next, scaleWorld(localToWorld(player, point)));
    return {
      ...next,
      quickCorners: player.quickCorners.map(transform) as Player['quickCorners'],
      nodes: player.nodes.map((node) => ({ ...node, ...transform(node) })),
    };
  });
}

export function pointInRect(point: Vec2, start: Vec2, end: Vec2): boolean {
  return point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y);
}

export function smartSnap(
  players: Player[],
  movingIds: string[],
  delta: Vec2,
  threshold: number,
): SmartSnap {
  const moving = players.filter((player) => movingIds.includes(player.id));
  const stationary = players.filter((player) => !movingIds.includes(player.id));
  if (!moving.length || !stationary.length) return { delta, guides: [] };
  const movingBounds = selectionBounds(moving);
  const candidates: { axis: 'x' | 'y'; moving: number; target: number; start: number; end: number }[] = [];
  stationary.forEach((player) => {
    const target = playerBounds(player);
    (['left', 'center', 'right'] as const).forEach((edge) => {
      const value = edge === 'center' ? movingBounds.center.x : movingBounds[edge];
      const targetValue = edge === 'center' ? target.center.x : target[edge];
      candidates.push({ axis: 'x', moving: value, target: targetValue, start: Math.min(movingBounds.bottom, target.bottom), end: Math.max(movingBounds.top, target.top) });
    });
    (['bottom', 'center', 'top'] as const).forEach((edge) => {
      const value = edge === 'center' ? movingBounds.center.y : movingBounds[edge];
      const targetValue = edge === 'center' ? target.center.y : target[edge];
      candidates.push({ axis: 'y', moving: value, target: targetValue, start: Math.min(movingBounds.left, target.left), end: Math.max(movingBounds.right, target.right) });
    });
  });
  const nearest = (axis: 'x' | 'y') => candidates.filter((candidate) => candidate.axis === axis)
    .map((candidate) => ({ ...candidate, distance: Math.abs(candidate.moving + delta[axis] - candidate.target) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const x = nearest('x');
  const y = nearest('y');
  const guides: SmartGuide[] = [];
  const next = { ...delta };
  if (x && x.distance <= threshold) {
    next.x += x.target - (x.moving + delta.x);
    guides.push({ axis: 'x', value: x.target, start: x.start, end: x.end });
  }
  if (y && y.distance <= threshold) {
    next.y += y.target - (y.moving + delta.y);
    guides.push({ axis: 'y', value: y.target, start: y.start, end: y.end });
  }
  return { delta: next, guides };
}
