export interface ProviderCaptureFrame {
  readonly frameTreeNodeId: number;
  readonly url: string;
  isDestroyed(): boolean;
}

export interface ProviderCaptureWindow {
  readonly webContents: {
    readonly mainFrame: ProviderCaptureFrame;
    isDestroyed(): boolean;
    getURL(): string;
  };
  isDestroyed(): boolean;
}

export function isVidqueenEmbedUrl(value: unknown): boolean;
export function isVidqueenPlaybackUrl(value: unknown): boolean;
export function isBuiltInProviderEmbedUrl(providerId: string, value: unknown): boolean;
export function isBuiltInProviderPlaybackUrl(providerId: string, value: unknown): boolean;
export function isMainWindowFrame(
  frame: ProviderCaptureFrame | null | undefined,
  window: ProviderCaptureWindow | null | undefined,
): boolean;
export function getLiveCaptureFrame(
  window: ProviderCaptureWindow | null | undefined,
  isAllowedUrl: (url: string) => boolean,
): ProviderCaptureFrame | null;
export function getLiveVidqueenFrame(
  window: ProviderCaptureWindow | null | undefined,
): ProviderCaptureFrame | null;
export function getPlayerCaptureStreams<Frame>(
  frame: Frame,
  withAudio: boolean,
): { video: Frame; audio?: Frame; enableLocalEcho?: boolean };
