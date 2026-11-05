import { describe, expect, it } from 'vitest';
import {
  MAX_WORKSPACE_SAVES,
  putWorkspaceSave,
  readWorkspaceSaves,
  removeWorkspaceSave,
  serializeWorkspaceSaves,
  type WorkspaceSave,
} from '../../src/lib/workspaceSaves';

function saved(id: string, overrides: Partial<WorkspaceSave> = {}): WorkspaceSave {
  return {
    id,
    name: `Workspace ${id}`,
    savedAt: '2026-10-26T20:00:00.000Z',
    content: `project:${id}`,
    ...overrides,
  };
}

describe('internal workspace saves', () => {
  it('adds a named save at the front and trims its name', () => {
    const next = putWorkspaceSave([saved('existing')], {
      name: '  Planetarium study  ',
      content: 'new-project',
    }, new Date('2026-10-26T21:00:00.000Z'));

    expect(next).toHaveLength(2);
    expect(next[0].name).toBe('Planetarium study');
    expect(next[0].content).toBe('new-project');
    expect(next[0].savedAt).toBe('2026-10-26T21:00:00.000Z');
    expect(next[0].id).not.toBe('existing');
    expect(next[1].id).toBe('existing');
  });

  it('overwrites a slot, moves it to the front, and preserves its identity', () => {
    const next = putWorkspaceSave([saved('a'), saved('b')], {
      id: 'b',
      name: 'Updated workspace',
      content: 'replacement',
    }, new Date('2026-10-26T22:00:00.000Z'));

    expect(next.map((save) => save.id)).toEqual(['b', 'a']);
    expect(next[0]).toMatchObject({
      id: 'b',
      name: 'Updated workspace',
      content: 'replacement',
      savedAt: '2026-10-26T22:00:00.000Z',
    });
  });

  it('enforces ten slots while allowing overwrites and deletion', () => {
    const saves = Array.from({ length: MAX_WORKSPACE_SAVES }, (_, index) => saved(String(index)));
    expect(() => putWorkspaceSave(saves, { name: 'One too many', content: 'overflow' }))
      .toThrow('All 10 save slots are used');

    const overwritten = putWorkspaceSave(saves, { id: '4', name: 'Replacement', content: 'updated' });
    expect(overwritten).toHaveLength(MAX_WORKSPACE_SAVES);
    expect(overwritten[0].id).toBe('4');

    const removed = removeWorkspaceSave(overwritten, '4');
    expect(removed).toHaveLength(MAX_WORKSPACE_SAVES - 1);
    expect(removed.some((save) => save.id === '4')).toBe(false);
    expect(() => putWorkspaceSave(removed, { name: 'New slot', content: 'valid' })).not.toThrow();
  });

  it('rejects blank names and stale overwrite targets', () => {
    expect(() => putWorkspaceSave([], { name: '   ', content: 'empty' })).toThrow('Enter a name');
    expect(() => putWorkspaceSave([], { id: 'missing', name: 'Stale', content: 'empty' }))
      .toThrow('no longer exists');
  });

  it('reads only valid records, caps stored slots, and tolerates malformed storage', () => {
    expect(readWorkspaceSaves(null)).toEqual([]);
    expect(readWorkspaceSaves('not-json')).toEqual([]);
    expect(readWorkspaceSaves('{}')).toEqual([]);

    const records = [
      saved('valid', { name: '  Trimmed  ' }),
      { id: 'missing-content', name: 'Invalid', savedAt: '2026-10-26T20:00:00.000Z' },
      ...Array.from({ length: 12 }, (_, index) => saved(`extra-${index}`)),
    ];
    const parsed = readWorkspaceSaves(JSON.stringify(records));
    expect(parsed).toHaveLength(MAX_WORKSPACE_SAVES);
    expect(parsed[0].name).toBe('Trimmed');
    expect(parsed.some((save) => save.id === 'missing-content')).toBe(false);
    expect(readWorkspaceSaves(serializeWorkspaceSaves(records.filter((record): record is WorkspaceSave => 'content' in record)))).toHaveLength(MAX_WORKSPACE_SAVES);
  });
});
