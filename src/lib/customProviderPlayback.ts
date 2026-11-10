import type { CatalogMediaKind, ProviderDefinition } from '../types';
import { validateCustomSourceUrl } from './customSource';

export interface CustomProviderUrlTemplates {
  movieUrlTemplate: string;
  episodeUrlTemplate?: string;
}

export interface CustomProviderPlaybackRequest {
  mediaKind: CatalogMediaKind;
  tmdbId: string | number;
  seasonNumber?: string | number;
  episodeNumber?: string | number;
}

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

function validateTemplate(templateValue: string, mediaKind: CatalogMediaKind, verifiedUrl: string): string {
  const template = templateValue.trim();
  if (!template) throw new Error(`${mediaKind === 'movie' ? 'Movie' : 'Episode'} URL pattern is required.`);
  if (template.length > 4096) throw new Error('Provider URL patterns must not exceed 4096 characters.');
  const remainder = template.replace(/\{(?:tmdb|season|episode)\}/g, '');
  if (/[{}]/.test(remainder)) throw new Error('Use only {tmdb}, {season}, and {episode} placeholders.');
  if (!template.includes('{tmdb}')) throw new Error('The provider URL pattern must contain {tmdb}.');
  if (mediaKind === 'movie' && (template.includes('{season}') || template.includes('{episode}'))) {
    throw new Error('Movie URL patterns cannot contain season or episode placeholders.');
  }
  if (mediaKind === 'series' && (!template.includes('{season}') || !template.includes('{episode}'))) {
    throw new Error('Episode URL patterns must contain {tmdb}, {season}, and {episode}.');
  }
  const sample = template
    .replace(/\{tmdb\}/g, '603')
    .replace(/\{season\}/g, '1')
    .replace(/\{episode\}/g, '1');
  const parsed = validateCustomSourceUrl(sample);
  if (parsed.origin !== new URL(verifiedUrl).origin) {
    throw new Error('Provider URL patterns must stay on the verified player origin.');
  }
  return template;
}

export function validateCustomProviderUrlTemplates(
  templates: CustomProviderUrlTemplates,
  verifiedUrl: string,
): CustomProviderUrlTemplates {
  const movieUrlTemplate = validateTemplate(templates.movieUrlTemplate, 'movie', verifiedUrl);
  const episodeValue = templates.episodeUrlTemplate?.trim();
  return {
    movieUrlTemplate,
    ...(episodeValue ? { episodeUrlTemplate: validateTemplate(episodeValue, 'series', verifiedUrl) } : {}),
  };
}

export function suggestCustomProviderUrlTemplates(finalUrl: string): {
  movieUrlTemplate: string;
  episodeUrlTemplate: string;
} {
  const canonical = validateCustomSourceUrl(finalUrl).toString();
  const url = new URL(canonical);
  const segments = url.pathname.split('/');
  const numericIndexes = segments.flatMap((segment, index) => /^\d+$/.test(segment) ? [index] : []);
  let movieUrlTemplate = canonical;
  let episodeUrlTemplate = '';

  if (/(?:^|\/)movies?(?:\/|$)/i.test(url.pathname) && numericIndexes.length) {
    const next = [...segments];
    next[numericIndexes.at(-1)!] = '{tmdb}';
    movieUrlTemplate = canonical.replace(url.pathname, next.join('/'));
  }
  if (/(?:^|\/)(?:tv|series|episodes?)(?:\/|$)/i.test(url.pathname) && numericIndexes.length >= 3) {
    const next = [...segments];
    const selected = numericIndexes.slice(-3);
    next[selected[0]] = '{tmdb}';
    next[selected[1]] = '{season}';
    next[selected[2]] = '{episode}';
    episodeUrlTemplate = canonical.replace(url.pathname, next.join('/'));
  }
  return { movieUrlTemplate, episodeUrlTemplate };
}

export function buildCustomProviderPlaybackUrl(
  provider: ProviderDefinition,
  request: CustomProviderPlaybackRequest,
): string {
  if (!provider.customUrl) throw new Error('The custom provider is missing its verified sample URL.');
  const mediaKind = request.mediaKind;
  if (mediaKind !== 'movie' && mediaKind !== 'series') throw new Error('Choose Movie or Series.');
  const template = mediaKind === 'movie' ? provider.customMovieUrlTemplate : provider.customEpisodeUrlTemplate;
  if (!template) {
    throw new Error(mediaKind === 'series'
      ? 'Add an episode URL pattern to this provider before loading a series.'
      : 'Add a movie URL pattern to this provider before loading a movie.');
  }
  validateTemplate(template, mediaKind, provider.customUrl);
  const tmdbId = decimalInteger(request.tmdbId, 'TMDB ID', 1);
  let season = 0;
  let episode = 0;
  if (mediaKind === 'series') {
    season = decimalInteger(request.seasonNumber, 'Season', 0);
    episode = decimalInteger(request.episodeNumber, 'Episode', 1);
    if (season > 10000 || episode > 10000) throw new Error('Season and episode numbers must not exceed 10000.');
  }
  const url = template
    .replace(/\{tmdb\}/g, String(tmdbId))
    .replace(/\{season\}/g, String(season))
    .replace(/\{episode\}/g, String(episode));
  const parsed = validateCustomSourceUrl(url);
  if (parsed.origin !== new URL(provider.customUrl).origin) {
    throw new Error('The generated player origin is not allowed.');
  }
  return parsed.toString();
}
