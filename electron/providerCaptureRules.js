const VIDQUEEN_ORIGIN = 'https://vidqueen.st';
const VIDQUEEN_PATH = /^\/embed\/(?:movie\/\d+|tv\/\d+\/\d+\/\d+)$/;
const PLAYER_VARIANTS = new Set([
  'artplayer',
  'vidstack',
  'plyr',
  'videojs',
  'mediachrome',
  'mc-capsule',
  'mc-slate',
  'onyx',
]);

function parseUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isVidqueenPage(url) {
  return Boolean(
    url
    && url.origin === VIDQUEEN_ORIGIN
    && !url.username
    && !url.password
    && VIDQUEEN_PATH.test(url.pathname)
  );
}

export function isVidqueenEmbedUrl(value) {
  const url = parseUrl(value);
  if (!isVidqueenPage(url) || url.hash) return false;
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== 'autoplay' && key !== 'player')) return false;
  if (new Set(keys).size !== keys.length) return false;
  if (url.searchParams.get('autoplay') !== 'false') return false;
  const player = url.searchParams.get('player');
  return player === null || PLAYER_VARIANTS.has(player);
}

export function isVidqueenPlaybackUrl(value) {
  return isVidqueenPage(parseUrl(value));
}

const BUILT_IN_PROVIDERS = {
  vidrift: { origin: 'https://embed.vidrift.net', path: /^\/embed\/(?:movie\/\d+|tv\/\d+\/\d+\/\d+)$/ },
  vidbolt: { origin: 'https://vidbolt.xyz', path: /^\/(?:movie\/\d+|tv\/\d+\/\d+\/\d+)$/, autoplay: 'autoPlay' },
  cinezo: { origin: 'https://player.cinezo.live', path: /^\/embed\/(?:movie\/\d+|tv\/\d+\/\d+\/\d+)$/ },
  vidlink: { origin: 'https://vidlink.pro', path: /^\/(?:movie\/\d+|tv\/\d+\/\d+\/\d+)$/, autoplay: 'autoplay' },
};

function builtInPage(providerId, value) {
  const adapter = BUILT_IN_PROVIDERS[providerId];
  const url = parseUrl(value);
  return adapter && url && url.origin === adapter.origin && !url.username && !url.password && adapter.path.test(url.pathname)
    ? { adapter, url }
    : null;
}

export function isBuiltInProviderEmbedUrl(providerId, value) {
  if (providerId === 'vidqueen') return isVidqueenEmbedUrl(value);
  const page = builtInPage(providerId, value);
  if (!page || page.url.hash) return false;
  const keys = [...page.url.searchParams.keys()];
  if (!page.adapter.autoplay) return keys.length === 0;
  return keys.length === 1 && keys[0] === page.adapter.autoplay && page.url.searchParams.get(page.adapter.autoplay) === 'false';
}

export function isBuiltInProviderPlaybackUrl(providerId, value) {
  if (providerId === 'vidqueen') return isVidqueenPlaybackUrl(value);
  return Boolean(builtInPage(providerId, value));
}

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

export function getLiveCaptureFrame(window, isAllowedUrl) {
  try {
    if (!window || window.isDestroyed()) return null;
    const contents = window.webContents;
    if (contents.isDestroyed()) return null;
    const frame = contents.mainFrame;
    if (frame.isDestroyed() || typeof isAllowedUrl !== 'function'
      || !isAllowedUrl(frame.url || contents.getURL())) return null;
    return frame;
  } catch {
    return null;
  }
}

export function getLiveVidqueenFrame(window) {
  return getLiveCaptureFrame(window, isVidqueenPlaybackUrl);
}

export function getPlayerCaptureStreams(frame, withAudio) {
  return {
    video: frame,
    // A WebFrameMain captures only this player's WebContents audio. Never use
    // the system loopback device for provider or custom-player recordings.
    ...(withAudio ? { audio: frame, enableLocalEcho: true } : {}),
  };
}
