import { describe, expect, it, vi } from 'vitest';
import { createPlayer, TEST_SOURCE } from '../../src/data/defaults';
import { createPortableProject, parseProject, reauthorizeProjectFiles, relinkSourcesByFilename } from '../../src/lib/project';
import type { MediaSource } from '../../src/types';

function fileSource(id: string, name: string, connected = false): MediaSource {
  return {
    id, kind: 'file', mediaType: 'image', name, path: `C:/old/${name}`,
    uri: connected ? `blob:${id}` : undefined, live: false, connected,
  };
}

describe('portable projects and relinking', () => {
  it('retains embedded sources and grids through ordinary serialization and reauthorization', async () => {
    const embedded = { ...fileSource('image', 'still.png', true), uri: 'data:image/png;base64,AAAA' };
    const state = {
      projectName: 'Embedded', sources: [TEST_SOURCE, embedded], players: [createPlayer(1, embedded.id)], groups: [],
      background: { name: 'grid.png', uri: 'data:image/png;base64,BBBB', mime: 'image/png' },
    };
    const portable = await createPortableProject(state);
    const parsed = parseProject(portable);
    expect(parsed.sources[1].uri).toBe('data:image/png;base64,AAAA');
    expect(parsed.sources[1].connected).toBe(true);
    expect(parsed.background?.uri).toBe('data:image/png;base64,BBBB');
    const updates = await reauthorizeProjectFiles(parsed.sources, async () => { throw new Error('No file access expected'); });
    expect(updates.get(embedded.id)?.connected).toBe(true);
    expect(parseProject(portable).sources[1].uri).toBe('data:image/png;base64,AAAA');
  });

  it('embeds fetched local media and refuses disconnected sources', async () => {
    class Reader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result = '';
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onload?.();
        });
      }
    }
    vi.stubGlobal('FileReader', Reader);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['pixels'], { type: 'image/png' }), { status: 200 })));
    const source = { ...fileSource('image', 'still.png', true), mime: 'image/png' };
    const portable = await createPortableProject({
      projectName: 'Fetched', sources: [source], players: [createPlayer(1, source.id)], groups: [],
    });
    expect(parseProject(portable).sources[0].uri).toBe('data:image/png;base64,cGl4ZWxz');
    await expect(createPortableProject({
      projectName: 'Missing', sources: [fileSource('missing', 'missing.png')], players: [], groups: [],
    })).rejects.toThrow('disconnected');
    vi.unstubAllGlobals();
  });

  it('relinks disconnected files by case-insensitive basename without reusing a selected file', () => {
    const sources = [fileSource('a', 'One.png'), fileSource('b', 'TWO.PNG'), fileSource('connected', 'three.png', true)];
    const result = relinkSourcesByFilename(sources, [
      { name: 'one.PNG', url: 'blob:one', path: 'D:/new/one.PNG', mime: 'image/png', mediaType: 'image' },
      { name: 'two.png', url: 'blob:two', path: 'D:/new/two.png', mime: 'image/png', mediaType: 'image' },
      { name: 'two.png', url: 'blob:duplicate', path: 'D:/new/duplicate.png', mime: 'image/png', mediaType: 'image' },
    ]);
    expect(result.count).toBe(2);
    expect(result.sources[0].uri).toBe('blob:one');
    expect(result.sources[1].uri).toBe('blob:two');
    expect(result.sources[2]).toBe(sources[2]);
    expect(relinkSourcesByFilename(sources, []).count).toBe(0);
  });
});
