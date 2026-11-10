import type { CustomSourceVerification, MediaSource } from '../types';

function isPrivateIpAddress(value: string): boolean {
  const address = value.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return parts.some((part) => part > 255) || a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
      || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
  }
  if (!/^[\da-f:.]+$/.test(address) || !address.includes(':')) return false;
  const [head, tail = ''] = address.split('::');
  if (address.includes('::') && address.split('::').length > 2) return true;
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const ipv4 = right.at(-1)?.includes('.') ? right.pop() : left.at(-1)?.includes('.') ? left.pop() : null;
  const words = [...left, ...right];
  if (ipv4) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ipv4) || ipv4.split('.').some((part) => Number(part) > 255)) return true;
    const [a, b, c, d] = ipv4.split('.').map(Number);
    words.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }
  if (words.some((word) => !/^[\da-f]{1,4}$/.test(word))) return true;
  const missing = 8 - words.length;
  if (missing < 0 || (!address.includes('::') && missing !== 0)) return true;
  const expansion = address.includes('::') ? left.length : 0;
  const parsed = [...words.slice(0, expansion), ...Array(missing).fill(0), ...words.slice(expansion)]
    .map((word) => Number.parseInt(word, 16));
  if (parsed.slice(0, 5).every((word) => word === 0) && (parsed[5] === 0 || parsed[5] === 0xffff)) {
    const [a, b, c, d] = [(parsed[6] >> 8) & 255, parsed[6] & 255, (parsed[7] >> 8) & 255, parsed[7] & 255];
    return isPrivateIpAddress([a, b, c, d].join('.'));
  }
  return (parsed[0] & 0xfe00) === 0xfc00 || (parsed[0] & 0xffc0) === 0xfe80
    || (parsed[0] & 0xff00) === 0xff00 || (parsed[0] === 0x2001 && [0, 0xdb8].includes(parsed[1]))
    || parsed[0] === 0x2002;
}

export function validateCustomSourceUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a complete HTTPS URL.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (value.length > 4096 || url.protocol !== 'https:' || url.username || url.password
    || (url.port && url.port !== '443')) {
    throw new Error('Use a public HTTPS URL without credentials or a custom port.');
  }
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal') || isPrivateIpAddress(hostname)) {
    throw new Error('Localhost and private-network URLs are not allowed for custom sources.');
  }
  return url;
}

export async function verifyCustomSourceInBrowser(input: {
  kind: 'media' | 'web-player';
  url: string;
}): Promise<CustomSourceVerification> {
  const requested = validateCustomSourceUrl(input.url);
  let response: Response;
  try {
    response = await fetch(requested.toString(), {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new Error(`The browser could not verify this source. Check CORS, TLS, and network access. ${error instanceof Error ? error.message : ''}`.trim());
  }
  await response.body?.cancel().catch(() => undefined);
  const finalUrl = validateCustomSourceUrl(response.url || requested.toString()).toString();
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || 'unknown';
  if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);
  if (input.kind === 'web-player' && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
    throw new Error(`A web player must return HTML; this URL returned ${contentType}.`);
  }
  const isHls = /(?:mpegurl|\.m3u8(?:$|[?#]))/i.test(`${contentType} ${finalUrl}`);
  const mediaType = contentType.startsWith('video/') || isHls ? 'video'
    : contentType.startsWith('audio/') ? 'audio' : 'unknown';
  if (input.kind === 'media' && mediaType === 'unknown' && contentType !== 'application/octet-stream') {
    throw new Error(`This is not a direct video, audio, or HLS response (${contentType}).`);
  }
  return {
    kind: input.kind,
    originalUrl: requested.toString(),
    finalUrl,
    finalOrigin: new URL(finalUrl).origin,
    status: response.status,
    contentType,
    mediaType: input.kind === 'web-player' ? 'web-player' : mediaType,
    cors: response.headers.get('access-control-allow-origin'),
    warnings: mediaType === 'unknown' ? ['The server used a generic content type. Confirm playback in the manual preview.'] : [],
    checkedAt: new Date().toISOString(),
  };
}

export function sourceFromCustomMedia(verification: CustomSourceVerification, label: string, previewType?: 'video' | 'audio'): MediaSource {
  const mediaType = verification.mediaType === 'video' || verification.mediaType === 'audio'
    ? verification.mediaType
    : previewType;
  if (verification.kind !== 'media' || !mediaType) {
    throw new Error('The technical check did not identify playable media. Confirm the preview before adding this source.');
  }
  return {
    id: crypto.randomUUID(),
    kind: 'stream',
    mediaType,
    name: label.trim() || new URL(verification.finalUrl).hostname,
    uri: verification.finalUrl,
    mime: verification.contentType === 'unknown' ? undefined : verification.contentType,
    live: false,
    connected: true,
    detail: `Verified custom ${/mpegurl|\.m3u8/i.test(`${verification.contentType} ${verification.finalUrl}`) ? 'HLS' : 'media'} source`,
  };
}
