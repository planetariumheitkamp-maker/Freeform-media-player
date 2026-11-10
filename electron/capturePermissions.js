export function canUseMainWindowCapture(requester, window, permission, details) {
  if (!details?.isMainFrame || (permission !== 'media' && permission !== 'display-capture')) {
    return false;
  }
  if (!requester || !window || window.isDestroyed()) return false;
  const owner = window.webContents;
  return Boolean(
    owner
    && !owner.isDestroyed()
    && !requester.isDestroyed()
    && requester.id === owner.id
  );
}
