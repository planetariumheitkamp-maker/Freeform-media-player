import { describe, expect, it } from 'vitest';
import { CATALOG_ITEMS } from '../../src/data/catalog';
import { createPlayer } from '../../src/data/defaults';
import { LICENSED_DEMO_PROVIDER_ID, PROVIDERS } from '../../src/data/providers';
import { filterCatalog, resolveCatalogEpisode, sourceFromCatalog } from '../../src/lib/catalog';
import { createPortableProject, parseProject, serializeProject } from '../../src/lib/project';

const [movie] = CATALOG_ITEMS;
const series = CATALOG_ITEMS.find((item) => item.mediaKind === 'series');
if (!movie || !series) throw new Error('Catalog fixtures are incomplete.');

describe('licensed demo catalog', () => {
  it('registers six active entries, five official embed adapters, and four disabled candidates', () => {
    expect(PROVIDERS).toHaveLength(10);
    expect(PROVIDERS[0]).toMatchObject({
      id: LICENSED_DEMO_PROVIDER_ID,
      enabled: true,
      playbackMode: 'native',
      meshCompatible: true,
    });
    const activeEmbeds = PROVIDERS.filter((provider) => provider.enabled && provider.playbackMode === 'embed');
    expect(activeEmbeds.map((provider) => provider.id)).toEqual(['vidqueen', 'vidrift', 'vidbolt', 'cinezo', 'vidlink']);
    expect(activeEmbeds.every((provider) => !provider.meshCompatible && provider.embedOrigin && provider.documentationUrl)).toBe(true);
    const candidates = PROVIDERS.slice(1);
    const disabled = candidates.filter((provider) => !provider.enabled);
    expect(disabled.map((provider) => provider.id)).toEqual(['vidmario', 'vidcine', 'vidup', 'vsembed']);
    expect(disabled.every((provider) => provider.status === 'review-required' && provider.playbackMode === 'unknown')).toBe(true);
    expect(new Set(PROVIDERS.map((provider) => provider.id)).size).toBe(PROVIDERS.length);
    expect(new Set(candidates.map((provider) => provider.origin)).size).toBe(9);
    expect(candidates.map((provider) => provider.origin)).toEqual([
      'https://vidqueen.st',
      'https://vidrift.net',
      'https://vidmario.net',
      'https://vidcine.net',
      'https://vidbolt.xyz',
      'https://cinezo.live',
      'https://vidlink.pro',
      'https://vidup.to',
      'https://vsembed.ru',
    ]);
  });

  it('uses only bundled native media and artwork in the demo collection', () => {
    expect(CATALOG_ITEMS.length).toBeGreaterThanOrEqual(5);
    for (const item of CATALOG_ITEMS) {
      expect(item.providerId).toBe(LICENSED_DEMO_PROVIDER_ID);
      expect(item.poster).toMatch(/^\.\/catalog\/posters\/.+\.webp$/);
      if (item.uri) expect(item.uri).toMatch(/^\.\/catalog\/media\/.+\.webm$/);
      for (const episode of item.episodes ?? []) {
        expect(episode.uri).toMatch(/^\.\/catalog\/media\/.+\.webm$/);
        expect(episode.poster).toMatch(/^\.\/catalog\/posters\/.+\.webp$/);
      }
    }
  });

  it('searches episode titles and applies collection and genre filters together', () => {
    expect(filterCatalog(CATALOG_ITEMS, 'spring line', 'all', 'all').map((item) => item.id)).toEqual([series.id]);
    expect(filterCatalog(CATALOG_ITEMS, '', 'movie', 'Science').every((item) => item.mediaKind === 'movie' && item.genres.includes('Science'))).toBe(true);
    expect(filterCatalog(CATALOG_ITEMS, 'orbital', 'series', 'all')).toEqual([]);
    expect(filterCatalog(CATALOG_ITEMS, '', 'all', 'Planetarium').map((item) => item.id)).toEqual([series.id]);
  });

  it('creates deterministic native movie sources with complete catalog metadata', () => {
    const first = sourceFromCatalog(movie);
    expect(first).toEqual(sourceFromCatalog(movie));
    expect(first).toMatchObject({
      id: `catalog:${LICENSED_DEMO_PROVIDER_ID}:${movie.id}`,
      kind: 'catalog',
      mediaType: 'video',
      connected: true,
      live: false,
      uri: movie.uri,
      catalog: {
        providerId: LICENSED_DEMO_PROVIDER_ID,
        itemId: movie.id,
        mediaKind: 'movie',
        playbackMode: 'native',
        playerVariant: 'native',
      },
    });
  });

  it('resolves and assigns a specific series episode without losing its identifiers', () => {
    const episode = series.episodes?.[1];
    if (!episode) throw new Error('Second episode fixture is missing.');
    expect(resolveCatalogEpisode(series, episode.id)).toEqual(episode);
    const source = sourceFromCatalog(series, episode.id);
    expect(source.id).toBe(`catalog:${LICENSED_DEMO_PROVIDER_ID}:${series.id}:${episode.id}`);
    expect(source.uri).toBe(episode.uri);
    expect(source.name).toContain(episode.title);
    expect(source.catalog).toMatchObject({
      itemId: series.id,
      mediaKind: 'series',
      episodeId: episode.id,
      episodeTitle: episode.title,
      seasonNumber: 1,
      episodeNumber: 2,
      playbackMode: 'native',
    });
  });

  it('refuses to turn external embed providers into native mesh sources', () => {
    expect(() => sourceFromCatalog({ ...movie, providerId: 'vidqueen' })).toThrow('native mesh playback');
  });

  it('round-trips catalog references in ordinary and portable version-1 workspaces', async () => {
    const source = sourceFromCatalog(series, series.episodes?.[1]?.id);
    const state = {
      projectName: 'Catalog projection',
      sources: [source],
      players: [createPlayer(1, source.id)],
      groups: [],
    };
    const content = serializeProject(state);
    expect(content).toContain('"version": 1');
    const project = parseProject(content);
    expect(project.sources[0]).toEqual(source);
    expect(project.players[0].sourceId).toBe(source.id);
    const portable = parseProject(await createPortableProject(state));
    expect(portable.sources[0].uri).toBe(source.uri);
    expect(portable.sources[0].catalog).toEqual(source.catalog);
  });

  it('rejects malformed catalog metadata during project import', () => {
    const source = sourceFromCatalog(movie);
    const content = JSON.stringify({
      format: 'freeform-workspace',
      version: 1,
      name: 'Invalid catalog',
      sources: [{ ...source, catalog: { ...source.catalog, playbackMode: 'hidden-frame' } }],
      players: [createPlayer(1, source.id)],
      groups: [],
    });
    expect(() => parseProject(content)).toThrow('invalid media source');
  });
});
