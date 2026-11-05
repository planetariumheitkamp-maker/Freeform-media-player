import { rectangleCorners } from '../data/defaults';
import type { MeshNode, Player, TraceSourceMapping, Vec2 } from '../types';
import {
  borderPoints,
  isSimplePolygon,
  nearestBorderSegment,
  nearestPointOnSegment,
  pointInPolygon,
  polygonArea,
  sampleShapeUv,
} from './geometry';
import { DEFAULT_TRACE_SETTINGS } from './traceSettings';

const MAX_BORDER_NODES = 96;
const MAX_INTERIOR_NODES_PER_STROKE = 80;
const MAX_PROJECT_NODES = 2000;
const MIN_NODE_DISTANCE = 4;

export interface TracedShape {
  mode: 'advanced';
  position: Vec2;
  quickCorners: Player['quickCorners'];
  nodes: MeshNode[];
  border: string[];
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cleanStroke(points: Vec2[], minimumDistance: number): Vec2[] {
  const cleaned: Vec2[] = [];
  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (!cleaned.length || distance(cleaned[cleaned.length - 1], point) >= minimumDistance) {
      cleaned.push({ x: point.x, y: point.y });
    }
  });
  return cleaned;
}

function simplifyOpenStroke(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const candidate = nearestPointOnSegment(points[index], points[first], points[last]).distance;
      if (candidate > farthestDistance) {
        farthest = index;
        farthestDistance = candidate;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_point, index) => keep[index] === 1).map((point) => ({ ...point }));
}

function simplifyClosedStroke(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 3) return points.map((point) => ({ ...point }));
  let splitIndex = 1;
  let splitDistance = -1;
  for (let index = 1; index < points.length; index += 1) {
    const candidate = distance(points[0], points[index]);
    if (candidate > splitDistance) {
      splitIndex = index;
      splitDistance = candidate;
    }
  }
  const firstHalf = simplifyOpenStroke(points.slice(0, splitIndex + 1), tolerance);
  const secondHalf = simplifyOpenStroke([...points.slice(splitIndex), points[0]], tolerance);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

function simplifyBorderStroke(points: Vec2[], smoothing: number): Vec2[] {
  const cleaned = cleanStroke(points, 1.5);
  while (cleaned.length > 3 && distance(cleaned[0], cleaned[cleaned.length - 1]) < 3) cleaned.pop();
  let simplified = cleaned;
  let tolerance = Math.max(0, smoothing);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    simplified = simplifyClosedStroke(cleaned, tolerance);
    if (simplified.length <= MAX_BORDER_NODES) break;
    tolerance = tolerance > 0 ? tolerance * 1.5 : 0.5;
  }
  return simplified;
}

function mapWholeSourceToBorder(points: Vec2[]): Array<{ u: number; v: number }> {
  let start = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].x - points[index].y < points[start].x - points[start].y) start = index;
  }
  const direction = polygonArea(points) <= 0 ? 1 : -1;
  const indexAt = (order: number) => (start + direction * order + points.length * 2) % points.length;
  const lengths = points.map((_point, order) => distance(points[indexAt(order)], points[indexAt(order + 1)]));
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  const uvs: Array<{ u: number; v: number }> = new Array(points.length);
  let travelled = 0;

  for (let order = 0; order < points.length; order += 1) {
    const progress = travelled / perimeter;
    let uv: { u: number; v: number };
    if (progress <= 0.25) uv = { u: progress * 4, v: 0 };
    else if (progress <= 0.5) uv = { u: 1, v: progress * 4 - 1 };
    else if (progress <= 0.75) uv = { u: 3 - progress * 4, v: 1 };
    else uv = { u: 0, v: 4 - progress * 4 };
    uvs[indexAt(order)] = uv;
    travelled += lengths[order];
  }
  return uvs;
}

export function createTracedShape(
  points: Vec2[],
  smoothing = DEFAULT_TRACE_SETTINGS.smoothing,
  sourceMapping: TraceSourceMapping = DEFAULT_TRACE_SETTINGS.sourceMapping,
): TracedShape {
  const polygon = simplifyBorderStroke(points, smoothing);
  if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 36 || !isSimplePolygon(polygon)) {
    throw new Error('Draw one simple, non-overlapping closed outline with at least three distinct points.');
  }
  for (let first = 0; first < polygon.length; first += 1) {
    for (let second = first + 1; second < polygon.length; second += 1) {
      if (distance(polygon[first], polygon[second]) < 1.5) {
        throw new Error('The traced outline has points that are too close together. Draw a slightly smoother outline.');
      }
    }
  }

  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 6 || height < 6) throw new Error('The traced player is too small. Draw a larger outline.');

  const position = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const quickCorners = rectangleCorners(width, height);
  const localPoints = polygon.map((point) => ({ x: point.x - position.x, y: point.y - position.y }));
  const uvShape = { mode: 'quick' as const, quickCorners, nodes: [], border: [] };
  const wholeSourceUvs = sourceMapping === 'whole' ? mapWholeSourceToBorder(localPoints) : null;
  const nodes = localPoints.map((point, index): MeshNode => {
    const sampled = wholeSourceUvs?.[index] ?? sampleShapeUv(uvShape, point);
    return {
      id: crypto.randomUUID(),
      ...point,
      u: sampled.u,
      v: sampled.v,
      kind: 'edge',
    };
  });
  return {
    mode: 'advanced',
    position,
    quickCorners,
    nodes,
    border: nodes.map((node) => node.id),
  };
}

function pointAlongStroke(points: Vec2[], cumulative: number[], target: number): Vec2 {
  for (let index = 1; index < cumulative.length; index += 1) {
    if (cumulative[index] < target) continue;
    const start = points[index - 1];
    const end = points[index];
    const length = cumulative[index] - cumulative[index - 1];
    const t = length > 0 ? (target - cumulative[index - 1]) / length : 0;
    return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
  }
  return { ...points[points.length - 1] };
}

function resampleInteriorStroke(points: Vec2[], spacing: number): Vec2[] {
  const cleaned = cleanStroke(points, 1);
  if (cleaned.length <= 1) return cleaned;
  const cumulative = [0];
  for (let index = 1; index < cleaned.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance(cleaned[index - 1], cleaned[index]));
  }
  const total = cumulative[cumulative.length - 1];
  const targetSpacing = Math.max(MIN_NODE_DISTANCE, spacing);
  const count = Math.min(MAX_INTERIOR_NODES_PER_STROKE, Math.max(2, Math.ceil(total / targetSpacing) + 1));
  return Array.from({ length: count }, (_value, index) => pointAlongStroke(
    cleaned,
    cumulative,
    total * index / (count - 1),
  ));
}

export function createInteriorTraceNodes(
  player: Player,
  points: Vec2[],
  spacing = DEFAULT_TRACE_SETTINGS.interiorSpacing,
): MeshNode[] {
  if (player.locked || player.mode !== 'advanced' || player.nodes.length < 3 || player.border.length < 3) return [];
  const polygon = borderPoints(player.nodes, player.border);
  if (polygon.length < 3 || !isSimplePolygon(polygon)) return [];
  const available = Math.max(0, MAX_PROJECT_NODES - player.nodes.length);
  const candidates = resampleInteriorStroke(points, spacing).slice(0, available);
  const accepted: MeshNode[] = [];

  candidates.forEach((point) => {
    if (!pointInPolygon(point, polygon)) return;
    const borderHit = nearestBorderSegment(player.nodes, player.border, point);
    if (borderHit && borderHit.distance < MIN_NODE_DISTANCE) return;
    if (player.nodes.some((node) => distance(node, point) < MIN_NODE_DISTANCE)) return;
    if (accepted.some((node) => distance(node, point) < MIN_NODE_DISTANCE)) return;
    accepted.push({
      id: crypto.randomUUID(),
      ...sampleShapeUv(player, point),
      kind: 'interior',
    });
  });
  return accepted;
}
