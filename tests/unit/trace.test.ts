import { describe, expect, it } from 'vitest';
import { createPlayer, rectangleCorners } from '../../src/data/defaults';
import { buildAdvancedMesh, pointInPolygon, polygonArea } from '../../src/lib/geometry';
import { createInteriorTraceNodes, createTracedShape } from '../../src/lib/trace';
import type { Player, Vec2 } from '../../src/types';

function tracedPlayer(points: Vec2[]): Player {
  return { ...createPlayer(1), ...createTracedShape(points) };
}

describe('freehand border and interior tracing', () => {
  it('creates a centered advanced rectangle with border nodes and fitted UVs', () => {
    const shape = createTracedShape(rectangleCorners(240, 160));
    expect(shape.mode).toBe('advanced');
    expect(shape.position).toEqual({ x: 0, y: 0 });
    expect(shape.nodes).toHaveLength(4);
    expect(shape.border).toEqual(shape.nodes.map((node) => node.id));
    expect(shape.nodes.every((node) => node.kind === 'edge')).toBe(true);
    shape.nodes.forEach((node, index) => {
      expect(node.x).toBeCloseTo(rectangleCorners(240, 160)[index].x, 8);
      expect(node.y).toBeCloseTo(rectangleCorners(240, 160)[index].y, 8);
      expect(node.u).toBeCloseTo(index === 0 || index === 3 ? 0 : 1, 8);
      expect(node.v).toBeCloseTo(index < 2 ? 0 : 1, 8);
    });
  });

  it('removes redundant samples where a hand-drawn loop closes', () => {
    const [a, b, c, d] = rectangleCorners(240, 160);
    const shape = createTracedShape([a, b, c, d, { x: a.x, y: a.y - 40 }, a]);
    expect(shape.nodes).toHaveLength(4);
    shape.nodes.forEach((node, index) => {
      expect(node.x).toBeCloseTo(rectangleCorners(240, 160)[index].x, 8);
      expect(node.y).toBeCloseTo(rectangleCorners(240, 160)[index].y, 8);
    });
  });

  it('offsets a traced outline around its bounding-box center', () => {
    const shape = createTracedShape([
      { x: 110, y: -30 }, { x: 350, y: -30 }, { x: 350, y: 130 }, { x: 110, y: 130 },
    ]);
    expect(shape.position).toEqual({ x: 230, y: 50 });
    expect(shape.nodes[0].x).toBeCloseTo(-120, 8);
    expect(shape.nodes[0].y).toBeCloseTo(-80, 8);
  });

  it('triangulates a concave outline without filling the missing region', () => {
    const player = tracedPlayer([
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 40 },
      { x: 40, y: 40 }, { x: 40, y: 120 }, { x: 0, y: 120 },
    ]);
    const polygon = player.border.map((id) => player.nodes.find((node) => node.id === id) as Vec2);
    const mesh = buildAdvancedMesh(player.nodes, player.border);
    expect(mesh.triangles.length).toBeGreaterThanOrEqual(4);
    const area = mesh.triangles.reduce((sum, [a, b, c]) => sum + Math.abs(polygonArea([
      player.nodes[a], player.nodes[b], player.nodes[c],
    ])), 0);
    expect(area).toBeCloseTo(8000, 6);
    mesh.triangles.forEach(([a, b, c]) => {
      const centroid = {
        x: (player.nodes[a].x + player.nodes[b].x + player.nodes[c].x) / 3,
        y: (player.nodes[a].y + player.nodes[b].y + player.nodes[c].y) / 3,
      };
      expect(pointInPolygon(centroid, polygon)).toBe(true);
    });
  });

  it('wraps the complete source around a concave outline in whole-source mode', () => {
    const shape = createTracedShape([
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 40 },
      { x: 40, y: 40 }, { x: 40, y: 120 }, { x: 0, y: 120 },
    ], 2.5, 'whole');
    const mesh = buildAdvancedMesh(shape.nodes, shape.border);
    shape.nodes.forEach((node) => {
      expect(node.u).toBeGreaterThanOrEqual(0);
      expect(node.u).toBeLessThanOrEqual(1);
      expect(node.v).toBeGreaterThanOrEqual(0);
      expect(node.v).toBeLessThanOrEqual(1);
      expect(node.u === 0 || node.u === 1 || node.v === 0 || node.v === 1).toBe(true);
    });
    const uvArea = mesh.triangles.reduce((sum, [a, b, c]) => {
      const point = (index: number) => ({ x: shape.nodes[index].u, y: shape.nodes[index].v });
      return sum + Math.abs(polygonArea([point(a), point(b), point(c)]));
    }, 0);
    expect(uvArea).toBeCloseTo(1, 8);
  });

  it('keeps whole-source orientation consistent for either stroke direction', () => {
    const corners = rectangleCorners(240, 160);
    const forward = createTracedShape(corners, 2.5, 'whole');
    const reverse = createTracedShape([...corners].reverse(), 2.5, 'whole');
    forward.nodes.forEach((node) => {
      const matching = reverse.nodes.find((candidate) => Math.hypot(candidate.x - node.x, candidate.y - node.y) < 1e-8);
      expect(matching).toBeDefined();
      expect(matching?.u).toBeCloseTo(node.u, 8);
      expect(matching?.v).toBeCloseTo(node.v, 8);
    });
    const topLeft = forward.nodes.find((node) => node.x === -120 && node.y === 80);
    expect(topLeft?.u).toBe(0);
    expect(topLeft?.v).toBe(0);
  });

  it('rejects self-intersecting and unusably small outlines', () => {
    expect(() => createTracedShape([
      { x: 0, y: 0 }, { x: 120, y: 120 }, { x: 120, y: 0 }, { x: 0, y: 120 },
    ])).toThrow(/simple, non-overlapping/);
    expect(() => createTracedShape([
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 },
    ])).toThrow(/too small|at least three/);
  });

  it('simplifies dense freehand borders to a bounded node count', () => {
    const points = Array.from({ length: 320 }, (_value, index) => {
      const angle = index / 320 * Math.PI * 2;
      const radius = index % 2 === 0 ? 140 : 170;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    const shape = createTracedShape(points);
    expect(shape.nodes.length).toBeGreaterThan(3);
    expect(shape.nodes.length).toBeLessThanOrEqual(96);
  });

  it('uses adjustable smoothing to retain or remove border detail', () => {
    const points = Array.from({ length: 64 }, (_value, index) => {
      const angle = index / 64 * Math.PI * 2;
      const radius = index % 2 === 0 ? 120 : 132;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
    const detailed = createTracedShape(points, 0);
    const smoothed = createTracedShape(points, 20);
    expect(detailed.nodes.length).toBeGreaterThan(smoothed.nodes.length);
    expect(smoothed.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('resamples interior paths at even intervals and preserves source UVs', () => {
    const player = tracedPlayer(rectangleCorners(240, 160));
    const additions = createInteriorTraceNodes(player, [{ x: -60, y: 0 }, { x: 60, y: 0 }]);
    expect(additions).toHaveLength(6);
    expect(additions.map((node) => node.x)).toEqual([-60, -36, -12, 12, 36, 60]);
    additions.forEach((node) => {
      expect(node.kind).toBe('interior');
      expect(node.y).toBeCloseTo(0, 8);
      expect(node.u).toBeCloseTo((node.x + 120) / 240, 8);
      expect(node.v).toBeCloseTo(0.5, 8);
    });
  });

  it('changes interior node counts according to the requested spacing', () => {
    const player = tracedPlayer(rectangleCorners(500, 200));
    const path: Vec2[] = [{ x: -200, y: 0 }, { x: 200, y: 0 }];
    const dense = createInteriorTraceNodes(player, path, 20);
    const sparse = createInteriorTraceNodes(player, path, 80);
    expect(dense).toHaveLength(21);
    expect(sparse).toHaveLength(6);
    expect(sparse.map((node) => node.x)).toEqual([-200, -120, -40, 40, 120, 200]);
  });

  it('filters outside, border-adjacent, and duplicate interior candidates', () => {
    const player = tracedPlayer(rectangleCorners(240, 160));
    expect(createInteriorTraceNodes(player, [{ x: -60, y: 100 }, { x: 60, y: 100 }])).toEqual([]);
    expect(createInteriorTraceNodes(player, [{ x: -60, y: 78 }, { x: 60, y: 78 }])).toEqual([]);
    const existing = {
      id: 'existing-interior', x: -36, y: 0, u: 0.35, v: 0.5, kind: 'interior' as const,
    };
    const withExisting = { ...player, nodes: [...player.nodes, existing] };
    const additions = createInteriorTraceNodes(withExisting, [{ x: -60, y: 0 }, { x: 60, y: 0 }]);
    expect(additions).toHaveLength(5);
    expect(additions.some((node) => Math.hypot(node.x - existing.x, node.y - existing.y) < 4)).toBe(false);
    const merged = { ...withExisting, nodes: [...withExisting.nodes, ...additions] };
    expect(createInteriorTraceNodes(merged, [{ x: -60, y: 0 }, { x: 60, y: 0 }])).toEqual([]);
  });

  it('limits each interior stroke to 80 candidates', () => {
    const player = tracedPlayer(rectangleCorners(5000, 500));
    const additions = createInteriorTraceNodes(player, [{ x: -2000, y: 0 }, { x: 2000, y: 0 }]);
    expect(additions).toHaveLength(80);
    expect(additions[0].x).toBeCloseTo(-2000, 8);
    expect(additions[79].x).toBeCloseTo(2000, 8);
  });
});
