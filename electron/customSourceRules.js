import { isIP } from 'node:net';

const MAX_URL_LENGTH = 4096;

function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 192 && b === 0 && parts[2] === 2)
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0 && parts[2] === 113);
}

function ipv6Words(address) {
  const [head, tail = ''] = address.split('::');
  if (address.includes('::') && address.split('::').length > 2) return null;
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const ipv4 = right.at(-1)?.includes('.') ? right.pop() : left.at(-1)?.includes('.') ? left.pop() : null;
  const words = [...left, ...right];
  if (ipv4) {
    if (isIP(ipv4) !== 4) return null;
    const [a, b, c, d] = ipv4.split('.').map(Number);
    words.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
  }
  if (words.some((word) => !/^[\da-f]{1,4}$/.test(word))) return null;
  const missing = 8 - words.length;
  if (missing < 0 || (!address.includes('::') && missing !== 0)) return null;
  const expansion = address.includes('::') ? left.length : 0;
  return [...words.slice(0, expansion), ...Array(missing).fill(0), ...words.slice(expansion)]
    .map((word) => Number.parseInt(word, 16));
}

export function isPrivateIpAddress(value) {
  const address = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (isIP(address) === 4) return isPrivateIPv4(address);
  if (isIP(address) !== 6) return true;
  const words = ipv6Words(address);
  if (!words) return true;
  // Reject unspecified, loopback, IPv4-mapped/compatible, unique-local,
  // link-local, multicast, documentation, discard-only, and 6to4 addresses.
  // A public IPv4 address may only be embedded in a publicly routed prefix.
  if (words.slice(0, 5).every((word) => word === 0) && (words[5] === 0 || words[5] === 0xffff)) {
    const [a, b, c, d] = [(words[6] >> 8) & 255, words[6] & 255, (words[7] >> 8) & 255, words[7] & 255];
    return isPrivateIPv4([a, b, c, d].join('.'));
  }
  return (words[0] & 0xfe00) === 0xfc00
    || (words[0] & 0xffc0) === 0xfe80
    || (words[0] & 0xff00) === 0xff00
    || (words[0] === 0x2001 && words[1] === 0x0db8)
    || (words[0] === 0x2001 && words[1] === 0x0000)
    || words[0] === 0x2002;
}

export function parseCustomSourceUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.port && url.port !== '443') return null;
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')
      || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
    if (isIP(hostname) && isPrivateIpAddress(hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function isCustomWebPlayerUrl(value) {
  return Boolean(parseCustomSourceUrl(value));
}

export function isCustomPlaybackUrl(value, approvedOrigin) {
  const url = parseCustomSourceUrl(value);
  return Boolean(url && typeof approvedOrigin === 'string' && url.origin === approvedOrigin);
}

export function validateCustomSourceInput(input) {
  const kind = input?.kind === 'web-player' ? 'web-player' : input?.kind === 'media' ? 'media' : null;
  const url = parseCustomSourceUrl(input?.url);
  if (!kind) throw new Error('Choose direct media or a sandboxed web player.');
  if (!url) throw new Error('Use a public HTTPS URL without credentials, a custom port, or a local/private network address.');
  return { kind, url: url.toString(), origin: url.origin };
}
