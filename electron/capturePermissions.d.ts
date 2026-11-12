interface CaptureContents {
  readonly id: number;
  isDestroyed(): boolean;
}

interface CaptureWindow {
  readonly webContents: CaptureContents;
  isDestroyed(): boolean;
}

export function canUseMainWindowCapture(
  requester: CaptureContents | null | undefined,
  window: CaptureWindow | Array<CaptureWindow | null | undefined> | null | undefined,
  permission: string,
  details: { isMainFrame?: boolean } | null | undefined,
): boolean;
