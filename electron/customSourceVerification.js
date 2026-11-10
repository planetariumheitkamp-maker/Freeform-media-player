import { lookup } from 'node:dns/promises';
import { net } from 'electron';
import { isPrivateIpAddress, validateCustomSourceInput } from './customSourceRules.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HLS_TYPES = new Set(['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl']);

async function assertPublicDns(url) {
  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`The hostname ${url.hostname} could not be resolved.`);
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error('The URL resolves to a local or private network address, which is not allowed.');
  }
}

function mediaTypeFor(contentType, finalUrl) {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (HLS_TYPES.has(mime) || /\.m3u8(?:$|[?#])/i.test(finalUrl)) return 'video';
  return 'unknown';
}

async function cancelResponse(response) {
  try { await response.body?.cancel(); } catch { /* The response may already be consumed or closed. */ }
}

export async function verifyCustomSource(input) {
  const requested = validateCustomSourceInput(input);
  let current = new URL(requested.url);
  let response;
  const warnings = [];

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicDns(current);
    try {
      response = await net.fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Range: 'bytes=0-0',
          Accept: requested.kind === 'web-player' ? 'text/html,application/xhtml+xml' : 'video/*,audio/*,application/vnd.apple.mpegurl,application/x-mpegurl,*/*;q=0.1',
        },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      throw new Error(`The source could not be reached: ${error instanceof Error ? error.message : 'network request failed'}`);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      await cancelResponse(response);
      if (!location) throw new Error(`The source returned HTTP ${response.status} without a redirect location.`);
      if (redirects === 3) throw new Error('The source exceeded the three-redirect verification limit.');
      const next = validateCustomSourceInput({ kind: requested.kind, url: new URL(location, current).toString() });
      current = new URL(next.url);
      response = null;
      continue;
    }
    break;
  }

  if (!response) throw new Error('The source did not return a verification response.');
  const status = response.status;
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || 'unknown';
  const cors = response.headers.get('access-control-allow-origin');
  const finalUrl = current.toString();
  const finalOrigin = current.origin;
  const mediaType = mediaTypeFor(contentType, finalUrl);
  await cancelResponse(response);

  if (status < 200 || status >= 300) {
    throw new Error(`The source returned HTTP ${status}. Check the URL, authentication, and server configuration.`);
  }
  if (requested.kind === 'web-player' && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
    throw new Error(`A web player must return text/html; this URL returned ${contentType}.`);
  }
  if (requested.kind === 'media' && mediaType === 'unknown' && contentType !== 'application/octet-stream') {
    throw new Error(`This does not look like a direct video, audio, or HLS response (${contentType}). Choose Web player for an HTML page.`);
  }
  if (requested.kind === 'media' && contentType === 'application/octet-stream') {
    warnings.push('The server used a generic content type. The manual media preview must confirm codec compatibility.');
  }
  if (requested.kind === 'media' && !cors) {
    warnings.push('No Access-Control-Allow-Origin header was reported. The browser preview must confirm CORS access.');
  }
  if (requested.kind === 'web-player' && finalOrigin !== requested.origin) {
    warnings.push('Verification followed a redirect to a different HTTPS origin. Capture will remain on that final origin.');
  }

  return {
    kind: requested.kind,
    originalUrl: requested.url,
    finalUrl,
    finalOrigin,
    status,
    contentType,
    mediaType: requested.kind === 'web-player' ? 'web-player' : mediaType,
    cors,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
