import { describe, expect, it } from 'vitest';
import { canUseMainWindowCapture } from '../../electron/capturePermissions.js';

const contents = (id: number, destroyed = false) => ({
  id,
  isDestroyed: () => destroyed,
});
const windowWith = (webContents: ReturnType<typeof contents>, destroyed = false) => ({
  webContents,
  isDestroyed: () => destroyed,
});
const mainFrame = { isMainFrame: true };

describe('main-window capture permissions', () => {
  it.each(['media', 'display-capture'])('allows the live main Freeform frame to use %s', (permission) => {
    const owner = contents(7);
    expect(canUseMainWindowCapture(owner, windowWith(owner), permission, mainFrame)).toBe(true);
  });

  it.each(['media', 'display-capture'])('denies a null %s requester without throwing', (permission) => {
    const owner = contents(7);
    expect(() => canUseMainWindowCapture(null, windowWith(owner), permission, mainFrame)).not.toThrow();
    expect(canUseMainWindowCapture(null, windowWith(owner), permission, mainFrame)).toBe(false);
  });

  it('denies missing, destroyed, and foreign requesters or windows', () => {
    const owner = contents(7);
    expect(canUseMainWindowCapture(contents(8), windowWith(owner), 'media', mainFrame)).toBe(false);
    expect(canUseMainWindowCapture(contents(7, true), windowWith(owner), 'media', mainFrame)).toBe(false);
    expect(canUseMainWindowCapture(owner, windowWith(owner, true), 'media', mainFrame)).toBe(false);
    expect(canUseMainWindowCapture(owner, windowWith(contents(7, true)), 'media', mainFrame)).toBe(false);
    expect(canUseMainWindowCapture(owner, null, 'media', mainFrame)).toBe(false);
  });

  it('denies non-main frames even when they share the main webContents ID', () => {
    const owner = contents(7);
    expect(canUseMainWindowCapture(owner, windowWith(owner), 'display-capture', { isMainFrame: false })).toBe(false);
    expect(canUseMainWindowCapture(owner, windowWith(owner), 'display-capture', undefined)).toBe(false);
  });

  it('does not grant unrelated permissions', () => {
    const owner = contents(7);
    expect(canUseMainWindowCapture(owner, windowWith(owner), 'clipboard-read', mainFrame)).toBe(false);
    expect(canUseMainWindowCapture(owner, windowWith(owner), 'fullscreen', mainFrame)).toBe(false);
  });
});
