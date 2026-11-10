import { describe, expect, it, vi } from 'vitest';
import {
  attachProviderAdBlock,
  DEFAULT_PROVIDER_AD_BLOCK_RULES,
  MAX_PROVIDER_AD_BLOCK_RULES,
  normalizeProviderAdBlockRule,
  normalizeProviderAdBlockSettings,
  parseProviderAdBlockRules,
  shouldBlockProviderRequest,
} from '../../electron/providerAdBlock.js';
import {
  defaultProviderAdBlockSettings,
  loadProviderAdBlockSettings,
  PROVIDER_AD_BLOCK_STORAGE_KEY,
  saveProviderAdBlockSettings,
} from '../../src/lib/providerAdBlockSettings';

const defaults = defaultProviderAdBlockSettings();

describe('provider ad-block domain rules', () => {
  it('normalizes optional subdomain syntax, case, trailing dots, blank lines, and duplicates', () => {
    expect(normalizeProviderAdBlockRule(' *.Ads.Example.COM. ')).toBe('ads.example.com');
    expect(parseProviderAdBlockRules('Ads.Example.com\n\n*.ads.example.com.\r\n tracker.example ')).toEqual([
      'ads.example.com',
      'tracker.example',
    ]);
  });

  it.each([
    'https://ads.example.com/banner.js',
    'ads.example.com/banner.js',
    '*ads.example.com',
    '||ads.example.com^',
    'ads..example.com',
    '-ads.example.com',
    'ads_example.com',
    'user@ads.example.com',
    'ads.example.com:443',
    '.example.com',
  ])('rejects ambiguous or unsupported rule %s', (rule) => {
    expect(() => normalizeProviderAdBlockRule(rule)).toThrow(/Invalid blocked domain/);
  });

  it('identifies the source line of an invalid editable rule', () => {
    expect(() => parseProviderAdBlockRules('ads.example.com\nhttps://tracker.example/x')).toThrow(/^Line 2:/);
  });

  it('validates the settings envelope and bounds rule count', () => {
    expect(normalizeProviderAdBlockSettings({ enabled: false, rules: ['Ads.Example.com'] })).toEqual({
      enabled: false,
      rules: ['ads.example.com'],
    });
    expect(() => normalizeProviderAdBlockSettings({ enabled: 'yes', rules: [] })).toThrow(/true\/false/);
    expect(() => normalizeProviderAdBlockSettings({ enabled: true, rules: 'ads.example.com' })).toThrow(/as a list/);
    expect(() => normalizeProviderAdBlockSettings({ enabled: true, rules: Array(MAX_PROVIDER_AD_BLOCK_RULES + 1).fill('ads.example.com') })).toThrow(/at most/);
  });

  it('matches exact hosts and subdomains without suffix lookalikes', () => {
    const settings = { enabled: true, rules: ['ads.example.com'] };
    expect(shouldBlockProviderRequest('https://ads.example.com/banner', settings)).toBe(true);
    expect(shouldBlockProviderRequest('wss://pixel.ads.example.com/socket', settings)).toBe(true);
    expect(shouldBlockProviderRequest('https://ADS.EXAMPLE.COM./banner', settings)).toBe(true);
    expect(shouldBlockProviderRequest('https://ads.example.com.evil.test/banner', settings)).toBe(false);
    expect(shouldBlockProviderRequest('https://evilads.example.com.attacker.test/banner', settings)).toBe(false);
    expect(shouldBlockProviderRequest('https://notads.example.com/banner', settings)).toBe(false);
    expect(shouldBlockProviderRequest('file:///ads.example.com/banner', settings)).toBe(false);
    expect(shouldBlockProviderRequest('not a URL', settings)).toBe(false);
  });

  it('fails open when disabled and preserves provider and media CDN origins with default rules', () => {
    expect(shouldBlockProviderRequest('https://ads.example.com/banner', { enabled: false, rules: ['ads.example.com'] })).toBe(false);
    expect(shouldBlockProviderRequest('https://embed.vidrift.net/embed/movie/1368337', defaults)).toBe(false);
    expect(shouldBlockProviderRequest('https://media.example.com/movie/segment.ts', defaults)).toBe(false);
    expect(shouldBlockProviderRequest('https://doubleclick.net/ad', defaults)).toBe(true);
    expect(shouldBlockProviderRequest('https://pixel.doubleclick.net/ad', defaults)).toBe(true);
  });
});

describe('Electron webRequest integration', () => {
  it('cancels matching requests, forwards provider/media requests, and reacts to setting changes', () => {
    type RequestListener = (details: { url?: string; resourceType?: string }, callback: (response: { cancel?: boolean }) => void) => void;
    let listener: RequestListener | null | undefined;
    const onBeforeRequest = vi.fn((_filter: { urls: string[] } | null, nextListener?: RequestListener | null) => { listener = nextListener; });
    const providerSession = { webRequest: { onBeforeRequest } };
    const onBlocked = vi.fn();
    let settings = { enabled: true, rules: ['ads.example.com'] };
    const detach = attachProviderAdBlock(providerSession, () => settings, onBlocked);
    expect(onBeforeRequest).toHaveBeenCalledWith({ urls: ['*://*/*'] }, expect.any(Function));

    const respond = (url: string) => {
      const callback = vi.fn();
      listener?.({ url, resourceType: 'image' }, callback);
      return callback.mock.calls[0]?.[0];
    };
    expect(respond('https://pixel.ads.example.com/banner')).toEqual({ cancel: true });
    expect(onBlocked).toHaveBeenCalledWith({ url: 'https://pixel.ads.example.com/banner', resourceType: 'image' });
    expect(respond('https://embed.vidrift.net/embed/movie/1368337')).toEqual({});
    expect(respond('https://media.example.com/movie/segment.ts')).toEqual({});

    settings = { enabled: false, rules: ['ads.example.com'] };
    expect(respond('https://pixel.ads.example.com/banner')).toEqual({});
    detach();
    expect(onBeforeRequest).toHaveBeenLastCalledWith(null);
  });

  it('does not leave requests hanging if settings or metrics fail', () => {
    type RequestListener = (details: { url?: string }, callback: (response: { cancel?: boolean }) => void) => void;
    let listener: RequestListener | null | undefined;
    const providerSession = { webRequest: { onBeforeRequest: (_filter: { urls: string[] } | null, next?: RequestListener | null) => { listener = next; } } };
    attachProviderAdBlock(providerSession, () => { throw new Error('bad settings'); }, () => { throw new Error('metrics failed'); });
    const callback = vi.fn();
    listener?.({ url: 'https://ads.example.com/banner' }, callback);
    expect(callback).toHaveBeenCalledWith({});
  });
});

describe('saved provider filtering preferences', () => {
  it('uses independent defaults and round-trips normalized settings', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const first = defaultProviderAdBlockSettings();
    first.rules.push('new.example.com');
    expect(defaultProviderAdBlockSettings().rules).toHaveLength(DEFAULT_PROVIDER_AD_BLOCK_RULES.length);
    const saved = saveProviderAdBlockSettings({ enabled: false, rules: ['Ads.Example.com', 'ads.example.com'] }, storage);
    expect(saved).toEqual({ enabled: false, rules: ['ads.example.com'] });
    expect(values.has(PROVIDER_AD_BLOCK_STORAGE_KEY)).toBe(true);
    expect(loadProviderAdBlockSettings(storage)).toEqual(saved);
  });

  it('falls back safely for malformed, outdated, or unavailable storage', () => {
    const malformed = { getItem: () => '{broken', setItem: () => undefined };
    const invalid = { getItem: () => JSON.stringify({ enabled: true, rules: ['https://bad.example/x'] }), setItem: () => undefined };
    const unavailable = { getItem: () => { throw new Error('denied'); }, setItem: () => undefined };
    expect(loadProviderAdBlockSettings(malformed)).toEqual(defaultProviderAdBlockSettings());
    expect(loadProviderAdBlockSettings(invalid)).toEqual(defaultProviderAdBlockSettings());
    expect(loadProviderAdBlockSettings(unavailable)).toEqual(defaultProviderAdBlockSettings());
  });
});
