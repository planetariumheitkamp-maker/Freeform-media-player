import cdt2d from 'cdt2d';
import type { MeshNode, Player, Vec2 } from '../types';

export type Matrix3 = [number, number, number, number, number, number, number, number, number];
export type Triangle = [number, number, number];

export interface MeshBuild {
  positions: number[];
  uvs: number[];
  indices: number[];
  triangles: Triangle[];
}

export type MeshShape = Pick<Player, 'mode' | 'quickCorners' | 'nodes' | 'border'>;

function solveLinearSystem(matrix: number[][], values: number[]): number[] {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) {
      throw new Error('The selected corners do not form a usable perspective transform.');
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= size; entry += 1) augmented[column][entry] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

export function squareToQuad(corners: [Vec2, Vec2, Vec2, Vec2]): Matrix3 {
  const source: Vec2[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  const matrix: number[][] = [];
  const values: number[] = [];

  source.forEach((point, index) => {
    const target = corners[index];
    matrix.push([
      point.x, point.y, 1, 0, 0, 0,
      -target.x * point.x, -target.x * point.y,
    ]);
    values.push(target.x);
    matrix.push([
      0, 0, 0, point.x, point.y, 1,
      -target.y * point.x, -target.y * point.y,
    ]);
    values.push(target.y);
  });

  const solved = solveLinearSystem(matrix, values);
  return [...solved, 1] as Matrix3;
}

export function applyMatrix(matrix: Matrix3, u: number, v: number): Vec2 {
  const denominator = matrix[6] * u + matrix[7] * v + matrix[8];
  return {
    x: (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator,
    y: (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator,
  };
}

export function invertMatrix(matrix: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw new Error('The perspective transform is not invertible.');
  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

export function buildQuickMesh(corners: [Vec2, Vec2, Vec2, Vec2], segments = 20): MeshBuild {
  const matrix = squareToQuad(corners);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const triangles: Triangle[] = [];

  for (let row = 0; row <= segments; row += 1) {
    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const v = row / segments;
      const point = applyMatrix(matrix, u, v);
      positions.push(point.x, point.y, 0);
      uvs.push(u, 1 - v);
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * (segments + 1) + column;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
      triangles.push([a, c, b], [b, c, d]);
    }
  }
  return { positions, uvs, indices, triangles };
}

export function buildAdvancedMesh(nodes: MeshNode[], border: string[]): MeshBuild {
  if (nodes.length < 3 || border.length < 3) {
    return { positions: [], uvs: [], indices: [], triangles: [] };
  }
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = border.map((id, index) => {
    const next = border[(index + 1) % border.length];
    return [nodeIndex.get(id), nodeIndex.get(next)] as [number, number];
  });
  if (edges.some(([a, b]) => a === undefined || b === undefined)) {
    return { positions: [], uvs: [], indices: [], triangles: [] };
  }

  const triangles = cdt2d(
    nodes.map((node) => [node.x, node.y] as [number, number]),
    edges,
    { exterior: false, interior: true, delaunay: true },
  );
  const positions = nodes.flatMap((node) => [node.x, node.y, 0]);
  const uvs = nodes.flatMap((node) => [node.u, 1 - node.v]);
  return {
    positions,
    uvs,
    indices: triangles.flat(),
    triangles,
  };
}

export function buildPlayerMesh(player: MeshShape): MeshBuild {
  if (player.mode === 'advanced' && player.nodes.length >= 3) {
    return buildAdvancedMesh(player.nodes, player.border);
  }
  return buildQuickMesh(player.quickCorners);
}

export function createAdvancedFromQuick(
  corners: [Vec2, Vec2, Vec2, Vec2],
  gridSize = 4,
): { nodes: MeshNode[]; border: string[] } {
  const matrix = squareToQuad(corners);
  const nodes: MeshNode[] = [];
  const ids: string[][] = [];

  for (let row = 0; row <= gridSize; row += 1) {
    const idRow: string[] = [];
    for (let column = 0; column <= gridSize; column += 1) {
      const u = column / gridSize;
      const v = row / gridSize;
      const point = applyMatrix(matrix, u, v);
      const isBorder = row === 0 || column === 0 || row === gridSize || column === gridSize;
      const isCorner = (row === 0 || row === gridSize) && (column === 0 || column === gridSize);
      const id = crypto.randomUUID();
      nodes.push({
        id,
        ...point,
        u,
        v,
        kind: isCorner ? 'corner' : isBorder ? 'edge' : 'interior',
      });
      idRow.push(id);
    }
    ids.push(idRow);
  }

  const border: string[] = [];
  for (let column = 0; column <= gridSize; column += 1) border.push(ids[0][column]);
  for (let row = 1; row <= gridSize; row += 1) border.push(ids[row][gridSize]);
  for (let column = gridSize - 1; column >= 0; column -= 1) border.push(ids[gridSize][column]);
  for (let row = gridSize - 1; row >= 1; row -= 1) border.push(ids[row][0]);
  return { nodes, border };
}

function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function polygonArea(points: Vec2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return area / 2;
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const epsilon = 1e-7;
  return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
}

export function isSimplePolygon(points: Vec2[]): boolean {
  if (points.length < 3 || Math.abs(polygonArea(points)) < 1) return false;
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(
        points[first], points[firstNext], points[second], points[secondNext],
      )) return false;
    }
  }
  return true;
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-12) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function nearestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): { point: Vec2; t: number; distance: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return {
    point: projected,
    t,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

export interface BorderSegmentHit {
  index: number;
  point: Vec2;
  t: number;
  distance: number;
}

export function nearestBorderSegment(nodes: MeshNode[], border: string[], point: Vec2): BorderSegmentHit | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  let best: BorderSegmentHit | null = null;
  for (let index = 0; index < border.length; index += 1) {
    const start = nodeMap.get(border[index]);
    const end = nodeMap.get(border[(index + 1) % border.length]);
    if (!start || !end) continue;
    const candidate = nearestPointOnSegment(point, start, end);
    if (!best || candidate.distance < best.distance) best = { index, ...candidate };
  }
  return best;
}

export function sampleShapeUv(shape: MeshShape, point: Vec2): Vec2 & { u: number; v: number } {
  if (shape.mode === 'quick' || shape.nodes.length < 3) {
    const inverse = invertMatrix(squareToQuad(shape.quickCorners));
    const source = applyMatrix(inverse, point.x, point.y);
    return { ...point, u: source.x, v: source.y };
  }

  const mesh = buildAdvancedMesh(shape.nodes, shape.border);
  for (const triangle of mesh.triangles) {
    const [ia, ib, ic] = triangle;
    const a = shape.nodes[ia];
    const b = shape.nodes[ib];
    const c = shape.nodes[ic];
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-9) continue;
    const wa = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
    const wb = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
    const wc = 1 - wa - wb;
    const epsilon = -1e-6;
    if (wa >= epsilon && wb >= epsilon && wc >= epsilon) {
      return {
        ...point,
        u: wa * a.u + wb * b.u + wc * c.u,
        v: wa * a.v + wb * b.v + wc * c.v,
      };
    }
  }
  return { ...point, u: 0.5, v: 0.5 };
}

export function localToWorld(player: Pick<Player, 'position' | 'rotation' | 'scale'>, point: Vec2): Vec2 {
  const cosine = Math.cos(player.rotation);
  const sine = Math.sin(player.rotation);
  const x = point.x * player.scale;
  const y = point.y * player.scale;
  return {
    x: player.position.x + x * cosine - y * sine,
    y: player.position.y + x * sine + y * cosine,
  };
}

export function worldToLocal(player: Pick<Player, 'position' | 'rotation' | 'scale'>, point: Vec2): Vec2 {
  const x = point.x - player.position.x;
  const y = point.y - player.position.y;
  const cosine = Math.cos(-player.rotation);
  const sine = Math.sin(-player.rotation);
  return {
    x: (x * cosine - y * sine) / player.scale,
    y: (x * sine + y * cosine) / player.scale,
  };
}

export function borderPoints(nodes: MeshNode[], border: string[]): Vec2[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return border.flatMap((id) => {
    const node = nodeMap.get(id);
    return node ? [{ x: node.x, y: node.y }] : [];
  });
}

export function canMoveNode(nodes: MeshNode[], border: string[], nodeId: string, point: Vec2): boolean {
  const candidate = nodes.map((node) => node.id === nodeId ? { ...node, ...point } : node);
  if (candidate.some((node) => Math.hypot(node.x - point.x, node.y - point.y) < 1.5 && node.id !== nodeId)) {
    return false;
  }
  const polygon = borderPoints(candidate, border);
  if (!isSimplePolygon(polygon)) return false;
  const movingBorderNode = border.includes(nodeId);
  return candidate.every((node) => {
    if (border.includes(node.id)) return true;
    if (!movingBorderNode && node.id !== nodeId) return true;
    return pointInPolygon(node, polygon);
  });
}
