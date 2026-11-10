export const MAX_PROVIDER_AD_BLOCK_RULES = 500;

// Deliberately narrow hostname rules. Do not add provider or media CDN hosts:
// a request blocker cannot distinguish an advertisement from required playback
// code when both are served from the same hostname.
export const DEFAULT_PROVIDER_AD_BLOCK_RULES = Object.freeze([
  'adform.net',
  'adnxs.com',
  'adservice.google.com',
  'adsrvr.org',
  'amazon-adsystem.com',
  'bidswitch.net',
  'casalemedia.com',
  'criteo.com',
  'criteo.net',
  'doubleclick.net',
  'doubleverify.com',
  'google-analytics.com',
  'googlesyndication.com',
  'googletagmanager.com',
  'indexexchange.com',
  'media.net',
  'moatads.com',
  'openx.net',
  'outbrain.com',
  'pubmatic.com',
  'quantserve.com',
  'rubiconproject.com',
  'scorecardresearch.com',
  'sharethrough.com',
  'taboola.com',
  'teads.tv',
]);

const HOSTNAME_PATTERN = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/;
const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);

export function normalizeProviderAdBlockRule(value) {
  if (typeof value !== 'string') throw new Error('Each blocked domain must be text.');
  const original = value.trim();
  let hostname = original.toLowerCase().replace(/\.$/, '');
  if (hostname.startsWith('*.')) hostname = hostname.slice(2);
  if (!hostname || hostname.length > 253 || !HOSTNAME_PATTERN.test(hostname) || hostname.includes('..')) {
    throw new Error(`Invalid blocked domain “${original.slice(0, 100)}”. Use a hostname such as ads.example.com, without a protocol or path.`);
  }
  try {
    const parsed = new URL(`https://${hostname}/`);
    if (parsed.hostname !== hostname || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/') {
      throw new Error('Hostname mismatch');
    }
  } catch {
    throw new Error(`Invalid blocked domain “${original.slice(0, 100)}”. Use a hostname such as ads.example.com, without a protocol or path.`);
  }
  return hostname;
}

export function normalizeProviderAdBlockRules(values) {
  if (!Array.isArray(values)) throw new Error('Blocked domains must be supplied as a list.');
  if (values.length > MAX_PROVIDER_AD_BLOCK_RULES) {
    throw new Error(`Use at most ${MAX_PROVIDER_AD_BLOCK_RULES} blocked domains.`);
  }
  const rules = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value === 'string' && !value.trim()) continue;
    const rule = normalizeProviderAdBlockRule(value);
    if (seen.has(rule)) continue;
    seen.add(rule);
    rules.push(rule);
  }
  return rules;
}

export function parseProviderAdBlockRules(text) {
  if (typeof text !== 'string') throw new Error('Blocked domains must be entered as text.');
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_PROVIDER_AD_BLOCK_RULES) {
    throw new Error(`Use at most ${MAX_PROVIDER_AD_BLOCK_RULES} blocked domains.`);
  }
  try {
    return normalizeProviderAdBlockRules(lines);
  } catch (error) {
    const invalidIndex = lines.findIndex((line) => {
      if (!line.trim()) return false;
      try {
        normalizeProviderAdBlockRule(line);
        return false;
      } catch {
        return true;
      }
    });
    if (invalidIndex >= 0) throw new Error(`Line ${invalidIndex + 1}: ${error.message}`);
    throw error;
  }
}

export function normalizeProviderAdBlockSettings(input) {
  if (!input || typeof input !== 'object' || typeof input.enabled !== 'boolean') {
    throw new Error('Ad-blocking settings must include an enabled true/false value.');
  }
  return {
    enabled: input.enabled,
    rules: normalizeProviderAdBlockRules(input.rules),
  };
}

export function shouldBlockProviderRequest(value, settings) {
  if (!settings?.enabled || !Array.isArray(settings.rules) || settings.rules.length === 0) return false;
  let hostname;
  try {
    const url = new URL(value);
    if (!NETWORK_PROTOCOLS.has(url.protocol)) return false;
    hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return false;
  }
  return settings.rules.some((rule) => hostname === rule || hostname.endsWith(`.${rule}`));
}

export function attachProviderAdBlock(providerSession, getSettings, onBlocked) {
  if (!providerSession?.webRequest?.onBeforeRequest || typeof getSettings !== 'function') {
    throw new Error('A provider session and settings reader are required.');
  }
  const listener = (details, callback) => {
    let cancel = false;
    try {
      cancel = shouldBlockProviderRequest(details?.url, getSettings());
    } catch {
      // Filtering is an optional playback aid; malformed external input must not
      // become a permanent network denial for the provider session.
      cancel = false;
    }
    if (cancel && typeof onBlocked === 'function') {
      try { onBlocked({ url: details.url, resourceType: details.resourceType }); } catch { /* Metrics cannot block the callback. */ }
    }
    callback(cancel ? { cancel: true } : {});
  };
  providerSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, listener);
  return () => providerSession.webRequest.onBeforeRequest(null);
}
