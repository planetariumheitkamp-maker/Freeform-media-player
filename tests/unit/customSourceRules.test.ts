import { describe, expect, it } from 'vitest';
import {
  isCustomPlaybackUrl,
  isCustomWebPlayerUrl,
  isPrivateIpAddress,
  parseCustomSourceUrl,
  validateCustomSourceInput,
} from '../../electron/customSourceRules.js';
import { getLiveCaptureFrame } from '../../electron/providerCaptureRules.js';

const blockedUrls = [
  'http://example.com/player',
  'https://localhost/player',
  'https://player.localhost/',
  'https://player.local/',
  'https://player.internal/',
  'https://user:password@example.com/player',
  'https://example.com:8443/player',
  'https://127.0.0.1/player',
  'https://127.1/player',
  'https://2130706433/player',
  'https://0x7f000001/player',
  'https://10.0.0.1/player',
  'https://172.16.0.1/player',
  'https://172.31.255.255/player',
  'https://192.168.1.1/player',
  'https://169.254.1.1/player',
  'https://100.64.0.1/player',
  'https://0.0.0.0/player',
  'https://224.0.0.1/player',
  'https://[::1]/player',
  'https://[::]/player',
  'https://[fc00::1]/player',
  'https://[fd12:3456::1]/player',
  'https://[fe80::1]/player',
  'https://[ff02::1]/player',
  'https://[2001:db8::1]/player',
  'https://[::ffff:127.0.0.1]/player',
  'https://[::ffff:7f00:1]/player',
  'https://[::ffff:a00:1]/player',
  'https://[::ffff:192.168.1.1]/player',
  'not a URL',
  '',
];

describe('custom public HTTPS source rules', () => {
  it.each(blockedUrls)('rejects a local, private, or ambiguous URL: %s', (url) => {
    expect(parseCustomSourceUrl(url)).toBeNull();
    expect(isCustomWebPlayerUrl(url)).toBe(false);
    expect(() => validateCustomSourceInput({ kind: 'web-player', url })).toThrow();
  });

  it.each([
    'https://example.com/player',
    'https://media.example.com/movie.webm?token=public-token',
    'https://example.com:443/player',
    'https://8.8.8.8/player',
    'https://[2606:4700:4700::1111]/player',
    'https://[::ffff:8.8.8.8]/player',
  ])('accepts a public HTTPS URL without changing its meaning: %s', (value) => {
    expect(parseCustomSourceUrl(value)?.toString()).toBe(new URL(value).toString());
    expect(validateCustomSourceInput({ kind: 'media', url: value }).kind).toBe('media');
  });

  it('requires a supported source kind', () => {
    expect(() => validateCustomSourceInput({ kind: 'json-api', url: 'https://example.com' })).toThrow('Choose direct media');
    expect(() => validateCustomSourceInput(null)).toThrow('Choose direct media');
  });

  it('allows custom playback only on the exact approved HTTPS origin', () => {
    const origin = 'https://player.example.com';
    expect(isCustomPlaybackUrl('https://player.example.com/embed/42?next=/play', origin)).toBe(true);
    expect(isCustomPlaybackUrl('https://player.example.com.evil.example/embed/42', origin)).toBe(false);
    expect(isCustomPlaybackUrl('https://other.example.com/embed/42', origin)).toBe(false);
    expect(isCustomPlaybackUrl('http://player.example.com/embed/42', origin)).toBe(false);
    expect(isCustomPlaybackUrl('https://127.0.0.1/embed/42', 'https://127.0.0.1')).toBe(false);
    expect(isCustomPlaybackUrl('https://[::1]/embed/42', 'https://[::1]')).toBe(false);
    expect(isCustomPlaybackUrl('https://player.example.com/embed/42', null)).toBe(false);
  });

  it('rejects private IPv4-mapped and reserved IPv6 addresses directly', () => {
    expect(isPrivateIpAddress('[::1]')).toBe(true);
    expect(isPrivateIpAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIpAddress('::ffff:7f00:1')).toBe(true);
    expect(isPrivateIpAddress('2001:db8:0:0:0:0:0:1')).toBe(true);
    expect(isPrivateIpAddress('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIpAddress('not-an-ip')).toBe(true);
  });

  it('returns only a live custom player main frame on the approved origin', () => {
    const mainFrame = { frameTreeNodeId: 1, url: 'https://player.example.com/embed', isDestroyed: () => false };
    const window = {
      isDestroyed: () => false,
      webContents: {
        mainFrame,
        isDestroyed: () => false,
        getURL: () => mainFrame.url,
      },
    };
    const allowed = (url: string) => isCustomPlaybackUrl(url, 'https://player.example.com');
    expect(getLiveCaptureFrame(window, allowed)).toBe(mainFrame);
    mainFrame.url = 'https://other.example.com/embed';
    expect(getLiveCaptureFrame(window, allowed)).toBeNull();
    mainFrame.url = 'https://[::1]/embed';
    expect(getLiveCaptureFrame(window, allowed)).toBeNull();
  });
});
