export function isPrivateIpAddress(value: unknown): boolean;
export function parseCustomSourceUrl(value: unknown): URL | null;
export function isCustomWebPlayerUrl(value: unknown): boolean;
export function isCustomPlaybackUrl(value: unknown, approvedOrigin: unknown): boolean;
export function validateCustomSourceInput(input: unknown): {
  kind: 'media' | 'web-player';
  url: string;
  origin: string;
};
