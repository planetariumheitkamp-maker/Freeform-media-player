export const VIDRIFT_POPUP_PROBE_FEATURES: string;

export interface ProviderPopupDetails {
  url?: string;
  frameName?: string;
  features?: string;
  disposition?: string;
}

export function isVidriftPopupCapabilityProbe(providerId: unknown, details: ProviderPopupDetails | null | undefined): boolean;
