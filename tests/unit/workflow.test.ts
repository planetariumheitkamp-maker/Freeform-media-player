import { describe, expect, it } from 'vitest';
import { createPlayer } from '../../src/data/defaults';
import { alignPlayers, distributePlayers, resizePlayers, selectionBounds, smartSnap } from '../../src/lib/workflow';

function players() {
  const first = { ...createPlayer(1), position: { x: -400, y: 0 } };
  const second = { ...createPlayer(2), position: { x: 40, y: 180 } };
  const third = { ...createPlayer(3), position: { x: 420, y: -80 } };
  return [first, second, third];
}

describe('editor workflow geometry', () => {
  it('aligns selected unlocked players without changing others', () => {
    const items = players();
    const result = alignPlayers(items, items.map((player) => player.id), 'center', 'middle');
    const centers = result.map((player) => ({
      x: player.position.x,
      y: player.position.y,
    }));
    expect(new Set(centers.map((center) => center.x)).size).toBe(1);
    expect(new Set(centers.map((center) => center.y)).size).toBe(1);
  });

  it('distributes three players between the outer anchors', () => {
    const items = players();
    const result = distributePlayers(items, items.map((player) => player.id), 'horizontal');
    expect(selectionBounds(result).width).toBeCloseTo(selectionBounds(items).width);
    expect(result[1].position.x).not.toBe(items[1].position.x);
    expect(result[0].position).toEqual(items[0].position);
    expect(result[2].position).toEqual(items[2].position);
  });

  it('resizes the complete unlocked selection around its center and respects locks', () => {
    const items = players();
    const locked = { ...items[2], locked: true };
    items[2] = locked;
    const before = selectionBounds([items[0], items[1]]);
    const result = resizePlayers(items, items.map((player) => player.id), 200, 100);
    const after = selectionBounds([result[0], result[1]]);
    expect(after.width).toBeCloseTo(200);
    expect(after.height).toBeCloseTo(100);
    expect(after.center).toEqual(before.center);
    expect(result[2]).toBe(locked);
  });

  it('resizes rotated geometry in world axes without changing its player rotation', () => {
    const item = { ...createPlayer(1), rotation: Math.PI / 4 };
    const [result] = resizePlayers([item], [item.id], 640, 360);
    expect(selectionBounds([result]).width).toBeCloseTo(640);
    expect(selectionBounds([result]).height).toBeCloseTo(360);
    expect(result.rotation).toBe(item.rotation);
  });

  it('snaps nearby moving bounds and returns a visible guide', () => {
    const items = players();
    const result = smartSnap(items, [items[0].id], { x: items[1].position.x - items[0].position.x + 2, y: 0 }, 8);
    expect(result.delta.x).toBeCloseTo(items[1].position.x - items[0].position.x);
    expect(result.guides.some((guide) => guide.axis === 'x')).toBe(true);
  });
});
