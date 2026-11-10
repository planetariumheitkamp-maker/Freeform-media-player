import {
  DEFAULT_PROVIDER_AD_BLOCK_RULES,
  normalizeProviderAdBlockSettings,
} from '../../electron/providerAdBlock.js';
import type { ProviderAdBlockSettings } from '../types';

export const PROVIDER_AD_BLOCK_STORAGE_KEY = 'freeform.provider-ad-block.v1';

type ProviderStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('Provider filtering storage is unavailable in this runtime.');
  return localStorage;
}

export function defaultProviderAdBlockSettings(): ProviderAdBlockSettings {
  return { enabled: true, rules: [...DEFAULT_PROVIDER_AD_BLOCK_RULES] };
}

export function loadProviderAdBlockSettings(storage: ProviderStorage = browserStorage()): ProviderAdBlockSettings {
  try {
    const stored = storage.getItem(PROVIDER_AD_BLOCK_STORAGE_KEY);
    if (!stored) return defaultProviderAdBlockSettings();
    return normalizeProviderAdBlockSettings(JSON.parse(stored));
  } catch {
    return defaultProviderAdBlockSettings();
  }
}

export function saveProviderAdBlockSettings(
  settings: ProviderAdBlockSettings,
  storage: ProviderStorage = browserStorage(),
): ProviderAdBlockSettings {
  const normalized = normalizeProviderAdBlockSettings(settings);
  storage.setItem(PROVIDER_AD_BLOCK_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
