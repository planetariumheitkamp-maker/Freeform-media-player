import type { CustomSourceVerification, ProviderDefinition } from '../types';
import { validateCustomProviderUrlTemplates, type CustomProviderUrlTemplates } from './customProviderPlayback';
import { validateCustomSourceUrl } from './customSource';

export const CUSTOM_PROVIDER_STORAGE_KEY = 'freeform.custom-providers.v1';
export const OPEN_PROVIDER_DASHBOARD_EVENT = 'freeform:open-provider-dashboard';
export const CUSTOM_PROVIDER_LIMIT = 20;

type ProviderStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface StoredProvider {
  id: string;
  name: string;
  url: string;
  movieUrlTemplate?: string;
  episodeUrlTemplate?: string;
  verifiedAt: string;
}

function browserStorage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('Provider storage is unavailable in this runtime.');
  return localStorage;
}

function definition(value: unknown): ProviderDefinition | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StoredProvider>;
  if (typeof candidate.id !== 'string' || !/^custom-[a-f\d-]{36}$/.test(candidate.id)
    || typeof candidate.name !== 'string' || !candidate.name.trim()
    || typeof candidate.url !== 'string' || typeof candidate.verifiedAt !== 'string'
    || !Number.isFinite(Date.parse(candidate.verifiedAt))) return null;
  try {
    const customUrl = validateCustomSourceUrl(candidate.url).toString();
    const origin = new URL(customUrl).origin;
    const hasTemplates = candidate.movieUrlTemplate !== undefined || candidate.episodeUrlTemplate !== undefined;
    const templates = hasTemplates ? validateCustomProviderUrlTemplates({
      movieUrlTemplate: candidate.movieUrlTemplate ?? '',
      episodeUrlTemplate: candidate.episodeUrlTemplate,
    }, customUrl) : undefined;
    return {
      id: candidate.id,
      name: candidate.name.trim().slice(0, 80),
      origin,
      embedOrigin: origin,
      customUrl,
      ...(templates ? {
        customMovieUrlTemplate: templates.movieUrlTemplate,
        ...(templates.episodeUrlTemplate ? { customEpisodeUrlTemplate: templates.episodeUrlTemplate } : {}),
      } : {}),
      verifiedAt: candidate.verifiedAt,
      enabled: true,
      status: 'active',
      playbackMode: 'embed',
      meshCompatible: false,
      summary: templates
        ? 'Verified custom provider with saved TMDB movie and episode URL patterns.'
        : 'Verified custom embedded player saved in this Freeform profile.',
      requirement: 'Technical verification and manual confirmation were completed for the sample player. Generated URLs and later remote content require inspection and authorization before every load.',
    };
  } catch {
    return null;
  }
}

function stored(provider: ProviderDefinition): StoredProvider {
  return {
    id: provider.id,
    name: provider.name,
    url: provider.customUrl!,
    ...(provider.customMovieUrlTemplate ? { movieUrlTemplate: provider.customMovieUrlTemplate } : {}),
    ...(provider.customEpisodeUrlTemplate ? { episodeUrlTemplate: provider.customEpisodeUrlTemplate } : {}),
    verifiedAt: provider.verifiedAt!,
  };
}

export function loadCustomProviders(storage: ProviderStorage = browserStorage()): ProviderDefinition[] {
  try {
    const parsed = JSON.parse(storage.getItem(CUSTOM_PROVIDER_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, CUSTOM_PROVIDER_LIMIT)
      .map(definition)
      .filter((provider): provider is ProviderDefinition => Boolean(provider));
  } catch {
    return [];
  }
}

export function saveCustomProvider(
  label: string,
  verification: CustomSourceVerification,
  storage: ProviderStorage = browserStorage(),
  templates?: CustomProviderUrlTemplates,
): { provider: ProviderDefinition; created: boolean } {
  if (verification.kind !== 'web-player' || verification.mediaType !== 'web-player') {
    throw new Error('Only a verified embedded web player can be added to the provider dashboard.');
  }
  const customUrl = validateCustomSourceUrl(verification.finalUrl).toString();
  const origin = new URL(customUrl).origin;
  if (verification.finalOrigin !== origin) throw new Error('The verified player origin does not match its final URL.');
  const providers = loadCustomProviders(storage);
  const existing = providers.find((provider) => provider.customUrl === customUrl);
  if (!existing && providers.length >= CUSTOM_PROVIDER_LIMIT) {
    throw new Error(`The provider dashboard holds up to ${CUSTOM_PROVIDER_LIMIT} custom players. Remove one before adding another.`);
  }
  const urlTemplates = templates ? validateCustomProviderUrlTemplates(templates, customUrl) : existing?.customMovieUrlTemplate
    ? { movieUrlTemplate: existing.customMovieUrlTemplate, episodeUrlTemplate: existing.customEpisodeUrlTemplate }
    : undefined;
  const verifiedAt = Number.isFinite(Date.parse(verification.checkedAt)) ? verification.checkedAt : new Date().toISOString();
  const provider = definition({
    id: existing?.id ?? `custom-${crypto.randomUUID()}`,
    name: label.trim().slice(0, 80) || new URL(customUrl).hostname,
    url: customUrl,
    ...(urlTemplates ? {
      movieUrlTemplate: urlTemplates.movieUrlTemplate,
      ...(urlTemplates.episodeUrlTemplate ? { episodeUrlTemplate: urlTemplates.episodeUrlTemplate } : {}),
    } : {}),
    verifiedAt,
  });
  if (!provider) throw new Error('The verified player could not be saved.');
  const next = [provider, ...providers.filter((candidate) => candidate.id !== provider.id)];
  storage.setItem(CUSTOM_PROVIDER_STORAGE_KEY, JSON.stringify(next.map(stored)));
  return { provider, created: !existing };
}

export function removeCustomProvider(id: string, storage: ProviderStorage = browserStorage()): ProviderDefinition[] {
  const next = loadCustomProviders(storage).filter((provider) => provider.id !== id);
  storage.setItem(CUSTOM_PROVIDER_STORAGE_KEY, JSON.stringify(next.map(stored)));
  return next;
}
