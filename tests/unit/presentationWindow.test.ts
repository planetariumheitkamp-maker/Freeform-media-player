import { describe, expect, it } from 'vitest';
import { resizeWindowBounds, resolveWindowPlacement } from '../../electron/presentationWindow.js';

const displays = [
  { id: 101, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { id: 202, workArea: { x: 1920, y: -120, width: 2560, height: 1400 } },
];

describe('native Present window placement', () => {
  it('restores the saved monitor and normal-window bounds', () => {
    expect(resolveWindowPlacement(
      { x: 2040, y: 40, width: 1600, height: 900, displayId: '202' },
      displays,
      { x: 60, y: 70, width: 1200, height: 800 },
    )).toEqual({ x: 2040, y: 40, width: 1600, height: 900, displayId: '202' });
  });

  it('falls back to the display with greatest current overlap when a monitor disconnects', () => {
    expect(resolveWindowPlacement(
      { x: 2500, y: 200, width: 1280, height: 800, displayId: 'disconnected' },
      displays,
      { x: 2200, y: 100, width: 1000, height: 700 },
    )).toEqual({ x: 2500, y: 200, width: 1280, height: 800, displayId: '202' });
    expect(resolveWindowPlacement(
      { x: 0, y: 0, width: 1280, height: 800, displayId: 'disconnected' },
      displays,
      { x: 100, y: 80, width: 1000, height: 700 },
    )).toMatchObject({ displayId: '101' });
  });

  it('clamps size and origin to the target work area, including small displays', () => {
    expect(resolveWindowPlacement(
      { x: -2000, y: 2000, width: 8000, height: 5000, displayId: '101' },
      displays,
      { x: 0, y: 0, width: 1000, height: 700 },
    )).toEqual({ x: 0, y: 0, width: 1920, height: 1040, displayId: '101' });
    expect(resolveWindowPlacement(
      { x: 0, y: 0, width: 800, height: 600, displayId: '303' },
      [{ id: 303, workArea: { x: 100, y: 50, width: 800, height: 600 } }],
      { x: 0, y: 0, width: 1000, height: 700 },
    )).toEqual({ x: 100, y: 50, width: 800, height: 600, displayId: '303' });
  });

  it('returns null without a connected display', () => {
    expect(resolveWindowPlacement(null, [], { x: 0, y: 0, width: 1500, height: 950 })).toBeNull();
  });
});

describe('transparent editing-window resizing', () => {
  const bounds = { x: 100, y: 80, width: 1200, height: 800 };

  it('grows the south-east corner without moving the anchored top-left edge', () => {
    expect(resizeWindowBounds(bounds, { x: 60, y: 40 }, 'se')).toEqual({ x: 100, y: 80, width: 1260, height: 840 });
  });

  it('keeps opposite edges anchored for north-west and single-edge resizing', () => {
    expect(resizeWindowBounds(bounds, { x: 30, y: 25 }, 'nw')).toEqual({ x: 130, y: 105, width: 1170, height: 775 });
    expect(resizeWindowBounds(bounds, { x: 45, y: 900 }, 'e')).toEqual({ x: 100, y: 80, width: 1245, height: 800 });
    expect(resizeWindowBounds(bounds, { x: -500, y: -90 }, 'n')).toEqual({ x: 100, y: -10, width: 1200, height: 890 });
  });

  it('enforces minimum and optional maximum sizes without moving the far edge', () => {
    expect(resizeWindowBounds(bounds, { x: -900, y: -1000 }, 'se', [1080, 700])).toEqual({ x: 100, y: 80, width: 1080, height: 700 });
    expect(resizeWindowBounds(bounds, { x: 900, y: 1000 }, 'nw', [1080, 700])).toEqual({ x: 220, y: 180, width: 1080, height: 700 });
    expect(resizeWindowBounds(bounds, { x: 900, y: 700 }, 'se', [1080, 700], [1500, 1000])).toEqual({ x: 100, y: 80, width: 1500, height: 1000 });
  });

  it('rejects unsupported directions and non-finite cursor deltas', () => {
    expect(resizeWindowBounds(bounds, { x: 40, y: 40 }, 'center')).toEqual(bounds);
    expect(resizeWindowBounds(bounds, { x: Number.NaN, y: Number.POSITIVE_INFINITY }, 'se')).toEqual(bounds);
  });
});
