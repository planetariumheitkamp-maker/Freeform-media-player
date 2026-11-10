import type { CatalogEpisode, CatalogItem, CatalogMediaKind, CatalogSourceRef, MediaSource } from '../types';

export type CatalogKindFilter = 'all' | CatalogMediaKind;

export function filterCatalog(
  items: CatalogItem[],
  query: string,
  kind: CatalogKindFilter,
  genre: string,
): CatalogItem[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (kind !== 'all' && item.mediaKind !== kind) return false;
    if (genre !== 'all' && !item.genres.includes(genre)) return false;
    if (!needle) return true;
    const searchable = [
      item.title,
      item.synopsis,
      String(item.year),
      ...item.genres,
      ...(item.episodes?.map((episode) => episode.title) ?? []),
    ].join(' ').toLocaleLowerCase();
    return searchable.includes(needle);
  });
}

export function resolveCatalogEpisode(item: CatalogItem, episodeId?: string): CatalogEpisode | undefined {
  if (item.mediaKind === 'movie') return undefined;
  const episodes = item.episodes ?? [];
  return episodes.find((episode) => episode.id === episodeId) ?? episodes[0];
}

export function sourceFromCatalog(item: CatalogItem, episodeId?: string): MediaSource {
  if (item.providerId !== 'licensed-demo') throw new Error('This provider is not enabled for native mesh playback.');
  const episode = resolveCatalogEpisode(item, episodeId);
  const uri = episode?.uri ?? item.uri;
  if (!uri) throw new Error('This catalog entry has no native media.');
  if (item.mediaKind === 'series' && !episode) throw new Error('Choose an episode before assigning this series.');
  const catalog: CatalogSourceRef = {
    providerId: item.providerId,
    itemId: item.id,
    mediaKind: item.mediaKind,
    title: item.title,
    playbackMode: 'native',
    playerVariant: 'native',
    poster: episode?.poster ?? item.poster,
    ...(episode ? {
      episodeId: episode.id,
      episodeTitle: episode.title,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
    } : {}),
  };
  return {
    id: `catalog:${item.providerId}:${item.id}${episode ? `:${episode.id}` : ''}`,
    kind: 'catalog',
    mediaType: 'video',
    name: episode ? `${item.title} — ${episode.title}` : item.title,
    uri,
    mime: 'video/webm',
    live: false,
    connected: true,
    detail: episode
      ? `Freeform Demo Library · S${episode.seasonNumber} E${episode.episodeNumber} · Native / mesh ready`
      : 'Freeform Demo Library · Native / mesh ready',
    catalog,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isCatalogSourceRef(value: unknown): value is CatalogSourceRef {
  if (!isRecord(value)) return false;
  const validEpisodeNumber = (field: unknown) => field === undefined
    || (typeof field === 'number' && Number.isInteger(field) && field >= 1 && field <= 10000);
  return isOptionalString(value.providerId)
    && typeof value.providerId === 'string'
    && typeof value.itemId === 'string'
    && typeof value.title === 'string'
    && (value.mediaKind === 'movie' || value.mediaKind === 'series')
    && (value.playbackMode === 'native' || value.playbackMode === 'embed')
    && value.playerVariant === 'native'
    && isOptionalString(value.poster)
    && isOptionalString(value.episodeId)
    && isOptionalString(value.episodeTitle)
    && validEpisodeNumber(value.seasonNumber)
    && validEpisodeNumber(value.episodeNumber);
}
