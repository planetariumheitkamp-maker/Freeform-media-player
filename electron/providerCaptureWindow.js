import { BrowserWindow, session } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  getLiveCaptureFrame,
  getPlayerCaptureStreams,
  isMainWindowFrame,
  isBuiltInProviderEmbedUrl,
  isBuiltInProviderPlaybackUrl,
  isVidqueenEmbedUrl,
  isVidqueenPlaybackUrl,
} from './providerCaptureRules.js';
import { isCustomPlaybackUrl, isCustomWebPlayerUrl } from './customSourceRules.js';
import { isVidriftPopupCapabilityProbe } from './providerPopupRules.js';
import {
  attachProviderAdBlock,
  DEFAULT_PROVIDER_AD_BLOCK_RULES,
  normalizeProviderAdBlockSettings,
} from './providerAdBlock.js';

const PROVIDER_PARTITION = 'freeform-vidqueen-visible-prototype';

export function createProviderCaptureController({ getMainWindow, emit }) {
  let active = null;
  let pending = null;
  let providerSession = null;
  let adBlockSettings = normalizeProviderAdBlockSettings({
    enabled: true,
    rules: [...DEFAULT_PROVIDER_AD_BLOCK_RULES],
  });

  function assertMainSender(event) {
    if (!isMainWindowFrame(event.senderFrame, getMainWindow())) {
      throw new Error('Only the main Freeform window can control provider capture.');
    }
  }

  function publicAdBlockSettings() {
    return { enabled: adBlockSettings.enabled, rules: [...adBlockSettings.rules] };
  }

  function setAdBlock(event, input) {
    assertMainSender(event);
    adBlockSettings = normalizeProviderAdBlockSettings(input);
    return publicAdBlockSettings();
  }

  function ensureProviderSession() {
    if (providerSession) return providerSession;
    providerSession = session.fromPartition(PROVIDER_PARTITION);
    providerSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    providerSession.setPermissionCheckHandler(() => false);
    attachProviderAdBlock(providerSession, () => adBlockSettings);
    return providerSession;
  }

  function closeActive() {
    const current = active;
    active = null;
    pending = null;
    if (!current) return;
    if (!current.window.isDestroyed()) current.window.close();
    else emit({ id: current.id, status: 'closed' });
  }

  function open(event, input) {
    assertMainSender(event);
    const kind = input?.kind === 'custom' ? 'custom' : input?.kind === 'builtin' ? 'builtin' : 'vidqueen';
    const providerId = typeof input?.providerId === 'string' ? input.providerId : '';
    const url = typeof input?.url === 'string' ? input.url : '';
    if (kind === 'vidqueen' && !isVidqueenEmbedUrl(url)) throw new Error('Open a validated Vidqueen embed before starting capture.');
    if (kind === 'builtin' && !isBuiltInProviderEmbedUrl(providerId, url)) {
      throw new Error('Open a validated embed from an enabled built-in provider before starting capture.');
    }
    let approvedOrigin = '';
    if (kind === 'custom') {
      const verifiedUrl = typeof input?.verifiedUrl === 'string' ? input.verifiedUrl : '';
      if (!isCustomWebPlayerUrl(verifiedUrl)) throw new Error('Verify the public HTTPS sample page before starting capture.');
      approvedOrigin = new URL(verifiedUrl).origin;
      if (!isCustomWebPlayerUrl(url) || !isCustomPlaybackUrl(url, approvedOrigin)) {
        throw new Error('The custom player must remain on its verified sample page origin.');
      }
    }
    if (input?.adBlock !== undefined) adBlockSettings = normalizeProviderAdBlockSettings(input.adBlock);
    const fallbackName = kind === 'custom' ? 'Custom player' : kind === 'builtin' ? 'Provider' : 'Vidqueen';
    const providerName = String(input?.providerName || fallbackName).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) || fallbackName;
    const defaultLabel = `${providerName} capture`;
    const label = String(input?.label || defaultLabel).trim().slice(0, 160) || defaultLabel;
    const isPlaybackUrl = kind === 'custom'
      ? (targetUrl) => isCustomPlaybackUrl(targetUrl, approvedOrigin)
      : kind === 'builtin'
        ? (targetUrl) => isBuiltInProviderPlaybackUrl(providerId, targetUrl)
        : isVidqueenPlaybackUrl;
    closeActive();
    ensureProviderSession();

    const id = randomUUID();
    const window = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 640,
      minHeight: 480,
      show: true,
      title: `${providerName} — Freeform player window`,
      backgroundColor: '#101311',
      autoHideMenuBar: true,
      webPreferences: {
        partition: PROVIDER_PARTITION,
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
      },
    });
    const current = { id, window, label, url, kind, isPlaybackUrl };
    active = current;

    window.webContents.setWindowOpenHandler((details) => {
      if (!isVidriftPopupCapabilityProbe(providerId, details)) return { action: 'deny' };
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          show: false,
          skipTaskbar: true,
          autoHideMenuBar: true,
          webPreferences: {
            // Electron 45 returns null when the child and unsandboxed opener
            // have different sandbox states. Match only the existing provider
            // window's state; Node integration and the Freeform bridge stay off.
            sandbox: false,
          },
        },
      };
    });
    window.webContents.on('did-create-window', (childWindow) => {
      // Only the exact Vidrift capability probe above can reach this listener.
      // Its context isolation, web security, and other preferences stay inherited.
      childWindow.hide();
      childWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const forceClose = () => {
        if (!childWindow.isDestroyed()) childWindow.destroy();
      };
      const restrictChildNavigation = (navigationEvent, targetUrl) => {
        if (targetUrl === 'about:blank') return;
        navigationEvent.preventDefault();
        forceClose();
      };
      childWindow.webContents.on('will-navigate', restrictChildNavigation);
      childWindow.webContents.on('will-redirect', restrictChildNavigation);
      const closeTimer = setTimeout(forceClose, 1000);
      childWindow.once('closed', () => clearTimeout(closeTimer));
    });
    const restrictNavigation = (navigationEvent, targetUrl) => {
      if (!isPlaybackUrl(targetUrl)) {
        navigationEvent.preventDefault();
        emit({ id, status: 'error', detail: 'Navigation outside the approved player origin was blocked.' });
      }
    };
    window.webContents.on('will-navigate', restrictNavigation);
    window.webContents.on('will-redirect', restrictNavigation);
    window.webContents.on('did-finish-load', () => {
      if (active?.id === id) emit({ id, status: 'ready' });
    });
    window.on('closed', () => {
      if (active?.id === id) active = null;
      if (pending?.id === id) pending = null;
      emit({ id, status: 'closed' });
    });
    void window.loadURL(url).catch(() => {
      emit({
        id,
        status: 'error',
        detail: 'The player page could not be loaded. Check the connection, then reopen the capture window.',
      });
    });
    return { id, url, label, kind, adBlock: publicAdBlockSettings() };
  }

  function prepare(event, id, withAudio) {
    assertMainSender(event);
    if (typeof id !== 'string' || active?.id !== id || !getLiveCaptureFrame(active.window, active.isPlaybackUrl)) {
      throw new Error('The visible player window is unavailable. Open it again before adding it to a mesh.');
    }
    pending = { id, withAudio: Boolean(withAudio) };
  }

  function handleDisplayRequest(request, callback) {
    if (!pending) return false;
    const requested = pending;
    pending = null;
    const mainRequest = isMainWindowFrame(request.frame, getMainWindow());
    const frame = active?.id === requested.id ? getLiveCaptureFrame(active.window, active.isPlaybackUrl) : null;
    if (!mainRequest || !frame) {
      callback(null);
      return true;
    }
    try {
      callback(getPlayerCaptureStreams(frame, requested.withAudio));
    } catch {
      // A provider frame can disappear between validation and the callback.
      try { callback(null); } catch { /* The request was already cancelled. */ }
    }
    return true;
  }

  function close(event, id) {
    assertMainSender(event);
    if (active?.id === id) closeActive();
  }

  return {
    open,
    setAdBlock,
    prepare,
    close,
    handleDisplayRequest,
    cancelPending: () => { pending = null; },
    closeAll: closeActive,
  };
}
