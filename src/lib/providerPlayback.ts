import { providerById } from '../data/providers';
import type { CatalogMediaKind } from '../types';

interface ProviderPlaybackRequest {
  providerId: string;
  mediaKind: CatalogMediaKind;
  tmdbId: string | number;
  seasonNumber?: string | number;
  episodeNumber?: string | number;
  playerVariant?: string;
}

interface ProviderAdapter {
  origin: string;
  moviePath: (tmdbId: number) => string;
  episodePath: (tmdbId: number, season: number, episode: number) => string;
  autoplayParameter?: 'autoplay' | 'autoPlay';
}

const ADAPTERS = {
  vidqueen: {
    origin: 'https://vidqueen.st',
    moviePath: (id) => `/embed/movie/${id}`,
    episodePath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
    autoplayParameter: 'autoplay',
  },
  vidrift: {
    origin: 'https://embed.vidrift.net',
    moviePath: (id) => `/embed/movie/${id}`,
    episodePath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
  },
  vidbolt: {
    origin: 'https://vidbolt.xyz',
    moviePath: (id) => `/movie/${id}`,
    episodePath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    autoplayParameter: 'autoPlay',
  },
  cinezo: {
    origin: 'https://player.cinezo.live',
    moviePath: (id) => `/embed/movie/${id}`,
    episodePath: (id, season, episode) => `/embed/tv/${id}/${season}/${episode}`,
  },
  vidlink: {
    origin: 'https://vidlink.pro',
    moviePath: (id) => `/movie/${id}`,
    episodePath: (id, season, episode) => `/tv/${id}/${season}/${episode}`,
    autoplayParameter: 'autoplay',
  },
} as const satisfies Record<string, ProviderAdapter>;

function decimalInteger(value: string | number | undefined, label: string, minimum: number): number {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`${label} is required.`);
  }
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label} must be a decimal integer.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be at least ${minimum}.`);
  }
  return parsed;
}

export function buildProviderPlaybackUrl(request: ProviderPlaybackRequest): string {
  const adapter = ADAPTERS[request.providerId as keyof typeof ADAPTERS] as ProviderAdapter | undefined;
  const provider = providerById(request.providerId);
  if (!adapter || !provider?.enabled || provider.playbackMode !== 'embed' || provider.embedOrigin !== adapter.origin) {
    throw new Error('Unknown or disabled external provider.');
  }

  const tmdbId = decimalInteger(request.tmdbId, 'TMDB ID', 1);
  let path: string;
  if (request.mediaKind === 'movie') {
    path = adapter.moviePath(tmdbId);
  } else if (request.mediaKind === 'series') {
    const season = decimalInteger(request.seasonNumber, 'Season', 0);
    const episode = decimalInteger(request.episodeNumber, 'Episode', 1);
    if (season > 10000 || episode > 10000) throw new Error('Season and episode numbers must not exceed 10000.');
    path = adapter.episodePath(tmdbId, season, episode);
  } else {
    throw new Error('Choose Movie or Series.');
  }

  const url = new URL(path, adapter.origin);
  if (adapter.autoplayParameter) url.searchParams.set(adapter.autoplayParameter, 'false');
  if (request.playerVariant && request.playerVariant !== 'default') {
    const supported = provider.playerVariants?.some((variant) => variant.value === request.playerVariant);
    if (!supported) throw new Error('This player variant is not supported by the selected provider.');
    url.searchParams.set('player', request.playerVariant);
  }
  if (url.origin !== adapter.origin) throw new Error('The generated embed origin is not allowed.');
  return url.toString();
}
