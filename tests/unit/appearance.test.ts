import { describe, expect, it } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_PLAYER_VISUAL,
  isDefaultPlayerVisual,
  normalizeBackgroundColor,
  normalizePlayerVisual,
} from '../../src/lib/appearance';
import { parseProject, serializeProject } from '../../src/lib/project';

function projectWith(player: unknown = createPlayer(1)) {
  return {
    format: 'freeform-workspace', version: 1, name: 'Appearance', sources: [TEST_SOURCE],
    players: [player], groups: [],
  };
}

describe('player appearance and workspace colors', () => {
  it('creates independent neutral visual settings for new players', () => {
    const first = createPlayer(1);
    const second = createPlayer(2);
    expect(first.visual).toEqual(DEFAULT_PLAYER_VISUAL);
    expect(first.visual).not.toBe(second.visual);
    expect(isDefaultPlayerVisual(first.visual)).toBe(true);
    expect(normalizePlayerVisual({
      brightness: 99, contrast: -1, saturation: 4, gamma: 0, hue: -999, temperature: 150,
    })).toEqual({ brightness: 2, contrast: 0, saturation: 2, gamma: 0.2, hue: -180, temperature: 100 });
  });

  it('round-trips each player’s visual settings and the background color', () => {
    const player = {
      ...createPlayer(1),
      visual: { brightness: 1.3, contrast: 0.85, saturation: 1.4, gamma: 1.2, hue: 45, temperature: -30 },
    };
    const saved = serializeProject({
      projectName: 'Color grade', sources: [TEST_SOURCE], players: [player], groups: [], backgroundColor: '#123456',
    });
    const restored = parseProject(saved);
    expect(restored.backgroundColor).toBe('#123456');
    expect(restored.players[0].visual).toEqual(player.visual);
    expect(restored.players[1]).toBeUndefined();
  });

  it('adds neutral defaults to legacy projects without modifying their source', () => {
    const player: Record<string, unknown> = { ...createPlayer(1) };
    delete player.visual;
    const restored = parseProject(JSON.stringify(projectWith(player)));
    expect(restored.backgroundColor).toBe(DEFAULT_BACKGROUND_COLOR);
    expect(restored.players[0].visual).toEqual(DEFAULT_PLAYER_VISUAL);
    expect(player.visual).toBeUndefined();
    expect(normalizeBackgroundColor('invalid')).toBe(DEFAULT_BACKGROUND_COLOR);
  });

  it('clamps imported appearance values and rejects malformed color data', () => {
    const base = projectWith();
    const restored = parseProject(JSON.stringify({
      ...base,
      backgroundColor: '#ABCDEF',
      players: [{ ...createPlayer(1), visual: { gamma: 90, hue: -400, temperature: -110 } }],
    }));
    expect(restored.backgroundColor).toBe('#abcdef');
    expect(restored.players[0].visual).toMatchObject({ gamma: 3, hue: -180, temperature: -100 });
    expect(() => parseProject(JSON.stringify({ ...base, backgroundColor: '#12' }))).toThrow('invalid background color');
    expect(() => parseProject(JSON.stringify({
      ...base, players: [{ ...createPlayer(1), visual: { brightness: 'bright' } }],
    }))).toThrow('invalid player or mesh');
    expect(() => parseProject(JSON.stringify({
      ...base, players: [{ ...createPlayer(1), visual: 'high contrast' }],
    }))).toThrow('invalid player or mesh');
  });
});
