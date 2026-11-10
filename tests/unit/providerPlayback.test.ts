import { describe, expect, it } from 'vitest';
import { buildProviderPlaybackUrl } from '../../src/lib/providerPlayback';

const movieCases = [
  ['vidqueen', 'https://vidqueen.st/embed/movie/603?autoplay=false'],
  ['vidrift', 'https://embed.vidrift.net/embed/movie/603'],
  ['vidbolt', 'https://vidbolt.xyz/movie/603?autoPlay=false'],
  ['cinezo', 'https://player.cinezo.live/embed/movie/603'],
  ['vidlink', 'https://vidlink.pro/movie/603?autoplay=false'],
] as const;

const seriesCases = [
  ['vidqueen', 'https://vidqueen.st/embed/tv/1399/1/2?autoplay=false'],
  ['vidrift', 'https://embed.vidrift.net/embed/tv/1399/1/2'],
  ['vidbolt', 'https://vidbolt.xyz/tv/1399/1/2?autoPlay=false'],
  ['cinezo', 'https://player.cinezo.live/embed/tv/1399/1/2'],
  ['vidlink', 'https://vidlink.pro/tv/1399/1/2?autoplay=false'],
] as const;

describe('official provider playback URLs', () => {
  it.each(movieCases)('builds the documented movie route for %s', (providerId, expected) => {
    expect(buildProviderPlaybackUrl({ providerId, mediaKind: 'movie', tmdbId: '603' })).toBe(expected);
  });

  it.each(seriesCases)('builds the documented episode route for %s', (providerId, expected) => {
    expect(buildProviderPlaybackUrl({
      providerId,
      mediaKind: 'series',
      tmdbId: 1399,
      seasonNumber: 1,
      episodeNumber: 2,
    })).toBe(expected);
  });

  it('accepts season zero for specials and normalizes decimal ID strings', () => {
    expect(buildProviderPlaybackUrl({
      providerId: 'vidrift',
      mediaKind: 'series',
      tmdbId: '001399',
      seasonNumber: '0',
      episodeNumber: '1',
    })).toBe('https://embed.vidrift.net/embed/tv/1399/0/1');
  });

  it.each(['artplayer', 'vidstack', 'plyr', 'videojs', 'mediachrome', 'mc-capsule', 'mc-slate', 'onyx'])(
    'supports the documented Vidqueen %s variant',
    (playerVariant) => {
      const url = new URL(buildProviderPlaybackUrl({
        providerId: 'vidqueen',
        mediaKind: 'movie',
        tmdbId: 603,
        playerVariant,
      }));
      expect(url.origin).toBe('https://vidqueen.st');
      expect(url.searchParams.get('player')).toBe(playerVariant);
      expect(url.searchParams.get('autoplay')).toBe('false');
    },
  );

  it('omits the player parameter for the default Vidqueen variant', () => {
    const url = new URL(buildProviderPlaybackUrl({
      providerId: 'vidqueen',
      mediaKind: 'movie',
      tmdbId: 603,
      playerVariant: 'default',
    }));
    expect(url.searchParams.has('player')).toBe(false);
  });

  it.each(['', '0', '-1', '1.5', '1e3', 'https://example.com/603', '603/1/1', 'abc', '9007199254740992'])(
    'rejects invalid TMDB ID %s',
    (tmdbId) => {
      expect(() => buildProviderPlaybackUrl({ providerId: 'vidqueen', mediaKind: 'movie', tmdbId })).toThrow();
    },
  );

  it('rejects non-finite and unsafe numeric TMDB IDs', () => {
    for (const tmdbId of [Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, -1, 1.5]) {
      expect(() => buildProviderPlaybackUrl({ providerId: 'vidqueen', mediaKind: 'movie', tmdbId })).toThrow();
    }
  });

  it('requires series numbers and rejects invalid episodes and excessive season numbers', () => {
    const base = { providerId: 'vidqueen', mediaKind: 'series' as const, tmdbId: 1399 };
    expect(() => buildProviderPlaybackUrl({ ...base, episodeNumber: 1 })).toThrow('Season is required');
    expect(() => buildProviderPlaybackUrl({ ...base, seasonNumber: 1 })).toThrow('Episode is required');
    for (const [seasonNumber, episodeNumber] of [[-1, 1], [1, 0], [1, -1], [1.5, 1], [1, 1.5], ['1e2', 1], [1, '1e2'], [10001, 1], [1, 10001]]) {
      expect(() => buildProviderPlaybackUrl({ ...base, seasonNumber, episodeNumber })).toThrow();
    }
  });

  it.each(['licensed-demo', 'vidmario', 'vidcine', 'vidup', 'vsembed', 'unknown', 'https://vidqueen.st'])(
    'refuses unknown, native, or review-required provider %s',
    (providerId) => {
      expect(() => buildProviderPlaybackUrl({ providerId, mediaKind: 'movie', tmdbId: 603 })).toThrow('Unknown or disabled');
    },
  );

  it('rejects unsupported player variants and unsupported media types', () => {
    expect(() => buildProviderPlaybackUrl({ providerId: 'vidqueen', mediaKind: 'movie', tmdbId: 603, playerVariant: 'jw' })).toThrow('not supported');
    expect(() => buildProviderPlaybackUrl({ providerId: 'vidlink', mediaKind: 'movie', tmdbId: 603, playerVariant: 'artplayer' })).toThrow('not supported');
    expect(() => buildProviderPlaybackUrl({ providerId: 'vidqueen', mediaKind: 'anime' as never, tmdbId: 603 })).toThrow('Choose Movie or Series');
  });

  it('keeps every generated URL on its exact approved embed origin', () => {
    const origins = new Set(['https://vidqueen.st', 'https://embed.vidrift.net', 'https://vidbolt.xyz', 'https://player.cinezo.live', 'https://vidlink.pro']);
    for (const [providerId] of [...movieCases, ...seriesCases]) {
      for (const mediaKind of ['movie', 'series'] as const) {
        const url = new URL(buildProviderPlaybackUrl({
          providerId,
          mediaKind,
          tmdbId: 603,
          seasonNumber: 1,
          episodeNumber: 1,
        }));
        expect(url.origin).toBe(new URL(movieCases.find(([id]) => id === providerId)?.[1] ?? seriesCases.find(([id]) => id === providerId)?.[1]!).origin);
        expect(origins.has(url.origin)).toBe(true);
        expect(url.username).toBe('');
        expect(url.password).toBe('');
      }
    }
  });
});
