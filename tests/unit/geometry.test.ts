import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../src/types';
import { rectangleCorners } from '../../src/data/defaults';
import {
  applyMatrix,
  buildAdvancedMesh,
  buildQuickMesh,
  canMoveNode,
  createAdvancedFromQuick,
  invertMatrix,
  isSimplePolygon,
  localToWorld,
  sampleShapeUv,
  squareToQuad,
  worldToLocal,
} from '../../src/lib/geometry';

describe('projective and mesh geometry', () => {
  it('maps every source corner to its exact destination', () => {
    const corners: [Vec2, Vec2, Vec2, Vec2] = [
      { x: -200, y: 160 }, { x: 260, y: 110 }, { x: 180, y: -150 }, { x: -230, y: -80 },
    ];
    const matrix = squareToQuad(corners);
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], index) => {
      const point = applyMatrix(matrix, u, v);
      expect(point.x).toBeCloseTo(corners[index].x, 8);
      expect(point.y).toBeCloseTo(corners[index].y, 8);
    });
    const destination = applyMatrix(matrix, 0.37, 0.62);
    const roundTrip = applyMatrix(invertMatrix(matrix), destination.x, destination.y);
    expect(roundTrip.x).toBeCloseTo(0.37, 8);
    expect(roundTrip.y).toBeCloseTo(0.62, 8);
  });

  it('builds a subdivided quick mesh with top-down source UVs', () => {
    const mesh = buildQuickMesh(rectangleCorners(), 20);
    expect(mesh.positions.length / 3).toBe(441);
    expect(mesh.indices).toHaveLength(20 * 20 * 6);
    expect(mesh.uvs.slice(0, 4)).toEqual([0, 1, 0.05, 1]);
    expect(mesh.triangles).toHaveLength(800);
  });

  it('converts quick mode into a constrained advanced mesh without losing UV anchors', () => {
    const advanced = createAdvancedFromQuick(rectangleCorners());
    expect(advanced.nodes).toHaveLength(25);
    expect(advanced.border).toHaveLength(16);
    const mesh = buildAdvancedMesh(advanced.nodes, advanced.border);
    expect(mesh.triangles.length).toBeGreaterThan(20);
    expect(mesh.indices.length % 3).toBe(0);
    const center = advanced.nodes.find((node) => node.u === 0.5 && node.v === 0.5);
    expect(center).toBeDefined();
    const sampled = sampleShapeUv({ mode: 'advanced', quickCorners: rectangleCorners(), ...advanced }, { x: 0, y: 0 });
    expect(sampled.u).toBeCloseTo(0.5, 6);
    expect(sampled.v).toBeCloseTo(0.5, 6);
  });

  it('rejects self-intersecting borders and unsafe node moves', () => {
    expect(isSimplePolygon([
      { x: -1, y: 1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: -1 },
    ])).toBe(false);
    const { nodes, border } = createAdvancedFromQuick(rectangleCorners());
    const center = nodes.find((node) => node.u === 0.5 && node.v === 0.5);
    const occupied = nodes.find((node) => node.u === 0.75 && node.v === 0.25);
    expect(center && occupied && canMoveNode(nodes, border, center.id, occupied)).toBe(false);
    expect(center && canMoveNode(nodes, border, center.id, { x: 12, y: -9 })).toBe(true);
  });

  it('round-trips player transforms', () => {
    const transform = { position: { x: 140, y: -55 }, rotation: Math.PI / 5, scale: 1.7 };
    const world = localToWorld(transform, { x: 80, y: -25 });
    const local = worldToLocal(transform, world);
    expect(local.x).toBeCloseTo(80, 8);
    expect(local.y).toBeCloseTo(-25, 8);
  });
});
