import type { CatalogItem } from '../types';
import { LICENSED_DEMO_PROVIDER_ID } from './providers';

const media = (id: string) => `./catalog/media/${id}.webm`;
const poster = (id: string) => `./catalog/posters/${id}.webp`;

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: 'orbital-studies',
    providerId: LICENSED_DEMO_PROVIDER_ID,
    title: 'Orbital Studies',
    mediaKind: 'movie',
    year: 2026,
    genres: ['Science', 'Motion study'],
    synopsis: 'A procedural study of orbiting bodies, elliptical paths, and scale. Designed to make geometric distortion easy to see on flat screens and domes.',
    duration: 6,
    poster: poster('orbital-studies'),
    uri: media('orbital-studies'),
  },
  {
    id: 'light-field',
    providerId: LICENSED_DEMO_PROVIDER_ID,
    title: 'Light Field',
    mediaKind: 'movie',
    year: 2026,
    genres: ['Art', 'Motion study'],
    synopsis: 'Moving bands of warm and cool light intersect with measured lines. Useful for evaluating brightness, color adjustments, and edge alignment.',
    duration: 6,
    poster: poster('light-field'),
    uri: media('light-field'),
  },
  {
    id: 'deep-sky-survey',
    providerId: LICENSED_DEMO_PROVIDER_ID,
    title: 'Deep Sky Survey',
    mediaKind: 'movie',
    year: 2025,
    genres: ['Science', 'Space'],
    synopsis: 'An original star field with concentric survey markers and subtle motion. Fine points reveal focus, sharpening, and resampling artifacts.',
    duration: 6,
    poster: poster('deep-sky-survey'),
    uri: media('deep-sky-survey'),
  },
  {
    id: 'signal-noise',
    providerId: LICENSED_DEMO_PROVIDER_ID,
    title: 'Signal / Noise',
    mediaKind: 'movie',
    year: 2026,
    genres: ['Experimental', 'Motion study'],
    synopsis: 'Layered waveforms move against a measured reference field. Continuous curves help expose mesh discontinuities and unwanted cropping.',
    duration: 6,
    poster: poster('signal-noise'),
    uri: media('signal-noise'),
  },
  {
    id: 'dome-workshop',
    providerId: LICENSED_DEMO_PROVIDER_ID,
    title: 'Dome Workshop',
    mediaKind: 'series',
    year: 2026,
    genres: ['Education', 'Planetarium'],
    synopsis: 'A short original series of visual calibration exercises for single-fisheye dome work. Each episode supplies motion and geometry that make warp changes legible.',
    duration: 12,
    poster: poster('dome-zenith'),
    episodes: [
      {
        id: 'finding-the-zenith',
        title: 'Finding the Zenith',
        seasonNumber: 1,
        episodeNumber: 1,
        duration: 6,
        uri: media('dome-zenith'),
        poster: poster('dome-zenith'),
      },
      {
        id: 'mapping-the-spring-line',
        title: 'Mapping the Spring Line',
        seasonNumber: 1,
        episodeNumber: 2,
        duration: 6,
        uri: media('dome-spring-line'),
        poster: poster('dome-spring-line'),
      },
    ],
  },
];

export const CATALOG_GENRES = [...new Set(CATALOG_ITEMS.flatMap((item) => item.genres))].sort();
