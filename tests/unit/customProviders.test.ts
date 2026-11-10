import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PROVIDER_STORAGE_KEY,
  loadCustomProviders,
  removeCustomProvider,
  saveCustomProvider,
} from '../../src/lib/customProviders';
import type { CustomSourceVerification } from '../../src/types';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  } as Storage & { values: Map<string, string> };
}

function verification(overrides: Partial<CustomSourceVerification> = {}): CustomSourceVerification {
  return {
    kind: 'web-player',
    originalUrl: 'https://player.example.com/embed',
    finalUrl: 'https://player.example.com/embed',
    finalOrigin: 'https://player.example.com',
    status: 206,
    contentType: 'text/html',
    mediaType: 'web-player',
    cors: '*',
    warnings: [],
    checkedAt: '2026-11-08T20:00:00.000Z',
    ...overrides,
  };
}

describe('custom provider dashboard persistence', () => {
  it('saves and reloads a verified player as an enabled provider definition', () => {
    const storage = memoryStorage();
    const { provider, created } = saveCustomProvider('  Dome player  ', verification(), storage);
    expect(created).toBe(true);
    expect(provider).toMatchObject({
      name: 'Dome player',
      origin: 'https://player.example.com',
      embedOrigin: 'https://player.example.com',
      customUrl: 'https://player.example.com/embed',
      verifiedAt: verification().checkedAt,
      enabled: true,
      playbackMode: 'embed',
    });
    expect(provider.id).toMatch(/^custom-[a-f\d-]{36}$/);
    expect(loadCustomProviders(storage)).toEqual([provider]);
  });

  it('persists validated movie and episode patterns without contacting TMDB', () => {
    const storage = memoryStorage();
    const sample = verification({ finalUrl: 'https://player.example.com/embed/movie/603' });
    const templates = {
      movieUrlTemplate: ' https://player.example.com/embed/movie/{tmdb} ',
      episodeUrlTemplate: 'https://player.example.com/embed/tv/{tmdb}/{season}/{episode}',
    };
    const first = saveCustomProvider('Mapped player', sample, storage, templates).provider;
    expect(first).toMatchObject({
      customMovieUrlTemplate: templates.movieUrlTemplate.trim(),
      customEpisodeUrlTemplate: templates.episodeUrlTemplate,
    });
    expect(loadCustomProviders(storage)).toEqual([first]);
    const updated = saveCustomProvider('Renamed mapped player', sample, storage).provider;
    expect(updated.customMovieUrlTemplate).toBe(first.customMovieUrlTemplate);
    expect(updated.customEpisodeUrlTemplate).toBe(first.customEpisodeUrlTemplate);
    expect(storage.values.get(CUSTOM_PROVIDER_STORAGE_KEY)).not.toContain('themoviedb');
    expect(() => saveCustomProvider('Bad route', sample, storage, {
      movieUrlTemplate: 'https://player.example.com/embed/movie/{tmdb}',
      episodeUrlTemplate: 'https://player.example.com/embed/tv/{tmdb}/1/2',
    })).toThrow('must contain {tmdb}, {season}, and {episode}');
    expect(loadCustomProviders(storage)).toEqual([updated]);
  });

  it('rejects malformed stored patterns while preserving valid legacy entries', () => {
    const storage = memoryStorage();
    const entry = {
      id: `custom-${crypto.randomUUID()}`,
      name: 'Stored player',
      url: 'https://player.example.com/embed/movie/603',
      verifiedAt: '2026-11-08T20:00:00.000Z',
    };
    for (const templates of [
      { movieUrlTemplate: 'https://other.example.com/embed/movie/{tmdb}' },
      { movieUrlTemplate: 'https://player.example.com/embed/movie/{tmdb}', episodeUrlTemplate: 'https://player.example.com/embed/tv/{tmdb}/{episode}' },
      { movieUrlTemplate: 'https://player.example.com/embed/movie/{unknown}' },
      { movieUrlTemplate: 603 },
      { episodeUrlTemplate: 'https://player.example.com/embed/tv/{tmdb}/{season}/{episode}' },
    ]) {
      storage.setItem(CUSTOM_PROVIDER_STORAGE_KEY, JSON.stringify([{ ...entry, ...templates }]));
      expect(loadCustomProviders(storage)).toEqual([]);
    }
    storage.setItem(CUSTOM_PROVIDER_STORAGE_KEY, JSON.stringify([entry]));
    expect(loadCustomProviders(storage)).toHaveLength(1);
    expect(loadCustomProviders(storage)[0].customMovieUrlTemplate).toBeUndefined();
  });

  it('updates the existing entry for the same verified URL instead of duplicating it', () => {
    const storage = memoryStorage();
    const first = saveCustomProvider('First name', verification(), storage).provider;
    const second = saveCustomProvider('Renamed player', verification({ checkedAt: '2026-11-08T21:00:00.000Z' }), storage);
    expect(second.created).toBe(false);
    expect(second.provider.id).toBe(first.id);
    expect(second.provider.name).toBe('Renamed player');
    expect(loadCustomProviders(storage)).toHaveLength(1);
  });

  it('rejects direct media, unsafe URLs, and inconsistent verification origins', () => {
    const storage = memoryStorage();
    expect(() => saveCustomProvider('Media', verification({ kind: 'media', mediaType: 'video' }), storage)).toThrow('Only a verified embedded web player');
    expect(() => saveCustomProvider('Private', verification({ finalUrl: 'https://127.0.0.1/embed', finalOrigin: 'https://127.0.0.1' }), storage)).toThrow();
    expect(() => saveCustomProvider('Mismatch', verification({ finalOrigin: 'https://other.example.com' }), storage)).toThrow('origin does not match');
    expect(loadCustomProviders(storage)).toEqual([]);
  });

  it('ignores malformed or tampered stored entries', () => {
    const storage = memoryStorage();
    storage.setItem(CUSTOM_PROVIDER_STORAGE_KEY, JSON.stringify([
      null,
      { id: 'custom-not-a-uuid', name: 'Bad ID', url: 'https://player.example.com', verifiedAt: '2026-11-08T20:00:00.000Z' },
      { id: `custom-${crypto.randomUUID()}`, name: 'Private', url: 'https://localhost/embed', verifiedAt: '2026-11-08T20:00:00.000Z' },
      { id: `custom-${crypto.randomUUID()}`, name: 'Bad date', url: 'https://player.example.com', verifiedAt: 'never' },
    ]));
    expect(loadCustomProviders(storage)).toEqual([]);
    storage.setItem(CUSTOM_PROVIDER_STORAGE_KEY, '{broken');
    expect(loadCustomProviders(storage)).toEqual([]);
  });

  it('removes only the requested saved provider', () => {
    const storage = memoryStorage();
    const first = saveCustomProvider('First', verification(), storage).provider;
    const second = saveCustomProvider('Second', verification({ finalUrl: 'https://other.example.com/embed', finalOrigin: 'https://other.example.com' }), storage).provider;
    const remaining = removeCustomProvider(first.id, storage);
    expect(remaining.map((provider) => provider.id)).toEqual([second.id]);
    expect(loadCustomProviders(storage).map((provider) => provider.id)).toEqual([second.id]);
  });
});
