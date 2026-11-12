export function canUseMainWindowCapture(requester, windows, permission, details) {
  if (!details?.isMainFrame || (permission !== 'media' && permission !== 'display-capture')) {
    return false;
  }
  if (!requester || requester.isDestroyed()) return false;
  return (Array.isArray(windows) ? windows : [windows]).some((window) => {
    if (!window || window.isDestroyed()) return false;
    const owner = window.webContents;
    return Boolean(owner && !owner.isDestroyed() && requester.id === owner.id);
  });
}
