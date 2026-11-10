export interface ProviderAdBlockSettings {
  enabled: boolean;
  rules: string[];
}

export const MAX_PROVIDER_AD_BLOCK_RULES: number;
export const DEFAULT_PROVIDER_AD_BLOCK_RULES: readonly string[];
export function normalizeProviderAdBlockRule(value: unknown): string;
export function normalizeProviderAdBlockRules(values: unknown): string[];
export function parseProviderAdBlockRules(text: unknown): string[];
export function normalizeProviderAdBlockSettings(input: unknown): ProviderAdBlockSettings;
export function shouldBlockProviderRequest(value: unknown, settings: ProviderAdBlockSettings): boolean;

interface ProviderRequestDetails {
  url?: string;
  resourceType?: string;
}

interface ProviderRequestSession {
  webRequest: {
    onBeforeRequest(
      filter: { urls: string[] } | null,
      listener?: ((details: ProviderRequestDetails, callback: (response: { cancel?: boolean }) => void) => void) | null,
    ): void;
  };
}

export function attachProviderAdBlock(
  providerSession: ProviderRequestSession,
  getSettings: () => ProviderAdBlockSettings,
  onBlocked?: (details: ProviderRequestDetails) => void,
): () => void;
