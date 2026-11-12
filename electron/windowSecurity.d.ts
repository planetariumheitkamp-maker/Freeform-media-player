export interface MainWindowFrame {
  readonly frameTreeNodeId: number;
  isDestroyed(): boolean;
}

export interface MainWindow {
  readonly webContents: {
    readonly mainFrame: MainWindowFrame;
    isDestroyed(): boolean;
  };
  isDestroyed(): boolean;
}

export function isMainWindowFrame(
  frame: MainWindowFrame | null | undefined,
  window: MainWindow | null | undefined,
): boolean;
