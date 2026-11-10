import { describe, expect, it } from 'vitest';
import {
  buildCustomProviderPlaybackUrl,
  suggestCustomProviderUrlTemplates,
  validateCustomProviderUrlTemplates,
} from '../../src/lib/customProviderPlayback';
import type { ProviderDefinition } from '../../src/types';

function provider(overrides: Partial<ProviderDefinition> = {}): ProviderDefinition {
  return {
    id: 'custom-00000000-0000-4000-8000-000000000001',
    name: 'Example player',
    customUrl: 'https://player.example.test/embed/movie/603',
    customMovieUrlTemplate: 'https://player.example.test/embed/movie/{tmdb}',
    customEpisodeUrlTemplate: 'https://player.example.test/embed/tv/{tmdb}/{season}/{episode}',
    enabled: true,
    status: 'active',
    playbackMode: 'embed',
    meshCompatible: false,
    summary: 'Test provider',
    requirement: 'Test only',
    ...overrides,
  };
}

describe('custom provider URL patterns', () => {
  it('suggests editable movie and episode patterns from common player URLs', () => {
    expect(suggestCustomProviderUrlTemplates('https://player.example.test/embed/movie/603')).toEqual({
      movieUrlTemplate: 'https://player.example.test/embed/movie/{tmdb}',
      episodeUrlTemplate: '',
    });
    expect(suggestCustomProviderUrlTemplates('https://player.example.test/movies/603?theme=dark')).toEqual({
      movieUrlTemplate: 'https://player.example.test/movies/{tmdb}?theme=dark',
      episodeUrlTemplate: '',
    });
    expect(suggestCustomProviderUrlTemplates('https://player.example.test/embed/tv/1399/1/2')).toEqual({
      movieUrlTemplate: 'https://player.example.test/embed/tv/1399/1/2',
      episodeUrlTemplate: 'https://player.example.test/embed/tv/{tmdb}/{season}/{episode}',
    });
    expect(suggestCustomProviderUrlTemplates('https://player.example.test/embed/series/1399/0/1')).toEqual({
      movieUrlTemplate: 'https://player.example.test/embed/series/1399/0/1',
      episodeUrlTemplate: 'https://player.example.test/embed/series/{tmdb}/{season}/{episode}',
    });
    expect(suggestCustomProviderUrlTemplates('https://player.example.test/episode/1399/1/2')).toEqual({
      movieUrlTemplate: 'https://player.example.test/episode/1399/1/2',
      episodeUrlTemplate: 'https://player.example.test/episode/{tmdb}/{season}/{episode}',
    });
  });

  it('builds mapped movie and episode URLs, including season-zero specials', () => {
    expect(buildCustomProviderPlaybackUrl(provider(), {
      mediaKind: 'movie', tmdbId: '603',
    })).toBe('https://player.example.test/embed/movie/603');
    expect(buildCustomProviderPlaybackUrl(provider(), {
      mediaKind: 'series', tmdbId: '1399', seasonNumber: '0', episodeNumber: '2',
    })).toBe('https://player.example.test/embed/tv/1399/0/2');
  });

  it('rejects invalid, non-positive, or unsafe identifiers', () => {
    for (const tmdbId of ['', '0', '-1', '1.5', '603?x=1', '9007199254740992']) {
      expect(() => buildCustomProviderPlaybackUrl(provider(), { mediaKind: 'movie', tmdbId })).toThrow();
    }
    expect(() => buildCustomProviderPlaybackUrl(provider(), {
      mediaKind: 'series', tmdbId: '1399', seasonNumber: '-1', episodeNumber: '1',
    })).toThrow('Season must be a decimal integer.');
    expect(() => buildCustomProviderPlaybackUrl(provider(), {
      mediaKind: 'series', tmdbId: '1399', seasonNumber: '1', episodeNumber: '0',
    })).toThrow('Episode must be at least 1.');
    expect(() => buildCustomProviderPlaybackUrl(provider(), {
      mediaKind: 'series', tmdbId: '1399', seasonNumber: '10001', episodeNumber: '1',
    })).toThrow('must not exceed 10000');
  });

  it('requires known placeholders in the correct movie and episode patterns', () => {
    const verifiedUrl = 'https://player.example.test/embed/movie/603';
    expect(() => validateCustomProviderUrlTemplates({
      movieUrlTemplate: 'https://player.example.test/embed/movie/603',
    }, verifiedUrl)).toThrow('must contain {tmdb}');
    expect(() => validateCustomProviderUrlTemplates({
      movieUrlTemplate: 'https://player.example.test/embed/movie/{id}',
    }, verifiedUrl)).toThrow('Use only');
    expect(() => validateCustomProviderUrlTemplates({
      movieUrlTemplate: 'https://player.example.test/embed/movie/{tmdb}/{season}',
    }, verifiedUrl)).toThrow('cannot contain season');
    expect(() => validateCustomProviderUrlTemplates({
      movieUrlTemplate: 'https://player.example.test/embed/movie/{tmdb}',
      episodeUrlTemplate: 'https://player.example.test/embed/tv/{tmdb}/{episode}',
    }, verifiedUrl)).toThrow('must contain {tmdb}, {season}, and {episode}');
    expect(() => validateCustomProviderUrlTemplates({
      movieUrlTemplate: 'https://player.example.test/embed/movie/{tmdb}{unknown}',
    }, verifiedUrl)).toThrow('Use only');
    expect(validateCustomProviderUrlTemplates({
      movieUrlTemplate: '  https://player.example.test/embed/movie/{tmdb}  ',
      episodeUrlTemplate: '',
    }, verifiedUrl)).toEqual({ movieUrlTemplate: 'https://player.example.test/embed/movie/{tmdb}' });
  });

  it('rejects cross-origin, insecure, and private-network patterns', () => {
    const verifiedUrl = 'https://player.example.test/embed/movie/603';
    for (const movieUrlTemplate of [
      'https://other.example.test/embed/movie/{tmdb}',
      'http://player.example.test/embed/movie/{tmdb}',
      'https://localhost/embed/movie/{tmdb}',
      'https://user:secret@player.example.test/embed/movie/{tmdb}',
      'https://player.example.test:8443/embed/movie/{tmdb}',
    ]) {
      expect(() => validateCustomProviderUrlTemplates({ movieUrlTemplate }, verifiedUrl)).toThrow();
    }
  });

  it('requires an episode pattern before loading a series', () => {
    expect(() => buildCustomProviderPlaybackUrl(provider({ customEpisodeUrlTemplate: undefined }), {
      mediaKind: 'series', tmdbId: '1399', seasonNumber: '1', episodeNumber: '1',
    })).toThrow('Add an episode URL pattern');
    expect(() => buildCustomProviderPlaybackUrl(provider({ customUrl: undefined }), {
      mediaKind: 'movie', tmdbId: '603',
    })).toThrow('missing its verified sample URL');
    expect(() => buildCustomProviderPlaybackUrl(provider(), {
      mediaKind: 'other' as 'movie', tmdbId: '603',
    })).toThrow('Choose Movie or Series');
  });
});
