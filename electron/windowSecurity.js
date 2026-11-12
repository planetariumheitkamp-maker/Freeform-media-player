export function isMainWindowFrame(frame, window) {
  try {
    if (!frame || !window || window.isDestroyed() || frame.isDestroyed()) return false;
    const contents = window.webContents;
    if (contents.isDestroyed()) return false;
    const mainFrame = contents.mainFrame;
    return !mainFrame.isDestroyed() && frame.frameTreeNodeId === mainFrame.frameTreeNodeId;
  } catch {
    return false;
  }
}
