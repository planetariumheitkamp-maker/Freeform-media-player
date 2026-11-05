import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID_GEOMETRY, normalizeGridGeometry, snapToCircularGrid } from '../../src/lib/grid';

const circularGrid = {
  kind: 'circular' as const, spacing: 50, rotation: 0, skewX: 0, skewY: 0,
  rings: 4, spokes: 8, radius: 100,
};
const outputSize = { width: 1000, height: 500 };

describe('circular grid snapping', () => {
  it('snaps nearby points to ring and spoke intersections, including grid rotation', () => {
    expect(snapToCircularGrid({ x: 130, y: 0 }, circularGrid, outputSize, 1)).toEqual({ x: 125, y: 0 });
    const rotated = snapToCircularGrid(
      { x: 4, y: 128 },
      { ...circularGrid, spokes: 4, rotation: 90 },
      outputSize,
      1,
    );
    expect(rotated.x).toBeCloseTo(0, 8);
    expect(rotated.y).toBeCloseTo(125, 8);
  });

  it('supports a shifted projection center without changing existing callers', () => {
    const center = { x: 100, y: -70 };
    expect(snapToCircularGrid({ x: 230, y: -70 }, circularGrid, outputSize, 1, 12, center)).toEqual({ x: 225, y: -70 });
    expect(snapToCircularGrid({ x: 230, y: -70 }, circularGrid, outputSize, 1)).toEqual({ x: 230, y: -70 });
  });

  it('uses a screen-space tolerance and leaves distant points unchanged', () => {
    const distant = { x: 140, y: 20 };
    expect(snapToCircularGrid(distant, circularGrid, outputSize, 1)).toEqual(distant);
    expect(snapToCircularGrid({ x: 137, y: 0 }, circularGrid, outputSize, 1)).toEqual({ x: 125, y: 0 });
    expect(snapToCircularGrid({ x: 137, y: 0 }, circularGrid, outputSize, 1.1)).toEqual({ x: 137, y: 0 });
  });

  it('does not snap when the built-in grid is Cartesian', () => {
    const point = { x: 130, y: 0 };
    expect(snapToCircularGrid(point, { ...circularGrid, kind: 'cartesian' }, outputSize, 1)).toEqual(point);
  });
});

describe('built-in grid geometry', () => {
  it('uses a 50-unit unrotated Cartesian grid with circular defaults', () => {
    expect(DEFAULT_GRID_GEOMETRY).toEqual({
      kind: 'cartesian', spacing: 50, rotation: 0, skewX: 0, skewY: 0,
      rings: 8, spokes: 24, radius: 90,
    });
  });

  it('preserves valid Cartesian geometry, supplies legacy defaults, and clamps unsafe values', () => {
    expect(normalizeGridGeometry({ spacing: 95, rotation: 25, skewX: 18, skewY: -12 })).toEqual({
      ...DEFAULT_GRID_GEOMETRY, spacing: 95, rotation: 25, skewX: 18, skewY: -12,
    });
    expect(normalizeGridGeometry({ spacing: 1000, rotation: -500, skewX: 80, skewY: -90 })).toEqual({
      ...DEFAULT_GRID_GEOMETRY, spacing: 400, rotation: -180, skewX: 45, skewY: -45,
    });
    expect(normalizeGridGeometry({ spacing: Number.NaN, rotation: 0, skewX: 0, skewY: 0 }).spacing).toBe(50);
  });

  it('normalizes circular rings, spokes, radius, and rotation independently', () => {
    expect(normalizeGridGeometry({
      kind: 'circular', spacing: 50, rotation: 15.4, skewX: 0, skewY: 0,
      rings: 12.4, spokes: 36.4, radius: 75.4,
    })).toEqual({
      kind: 'circular', spacing: 50, rotation: 15.4, skewX: 0, skewY: 0,
      rings: 12, spokes: 36, radius: 75,
    });
    expect(normalizeGridGeometry({
      kind: 'circular', spacing: 50, rotation: 0, skewX: 0, skewY: 0,
      rings: 99, spokes: 2, radius: 120,
    })).toEqual({
      kind: 'circular', spacing: 50, rotation: 0, skewX: 0, skewY: 0,
      rings: 32, spokes: 4, radius: 100,
    });
  });
});
