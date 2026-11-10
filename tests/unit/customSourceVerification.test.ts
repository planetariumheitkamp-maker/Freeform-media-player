import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { net } from 'electron';
import { verifyCustomSource } from '../../electron/customSourceVerification.js';

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

function response(status: number, headers: Record<string, string> = {}) {
  return {
    status,
    headers: new Headers(headers),
    body: { cancel: vi.fn().mockResolvedValue(undefined) },
  };
}

beforeEach(() => {
  vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
});

describe('desktop custom-source verification', () => {
  it('checks public DNS and uses a bounded manual ranged request', async () => {
    vi.mocked(net.fetch).mockResolvedValue(response(206, {
      'content-type': 'video/webm; charset=binary',
      'access-control-allow-origin': '*',
    }) as any);
    const result = await verifyCustomSource({ kind: 'media', url: 'https://media.example.com/movie.webm' });
    expect(lookup).toHaveBeenCalledWith('media.example.com', { all: true, verbatim: true });
    expect(net.fetch).toHaveBeenCalledWith('https://media.example.com/movie.webm', expect.objectContaining({
      method: 'GET',
      redirect: 'manual',
      headers: expect.objectContaining({ Range: 'bytes=0-0' }),
    }));
    expect(result).toMatchObject({ kind: 'media', mediaType: 'video', contentType: 'video/webm', status: 206 });
  });

  it('rejects a hostname resolving to any private address before fetching', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '::1', family: 6 },
    ] as any);
    await expect(verifyCustomSource({ kind: 'media', url: 'https://media.example.com/movie' })).rejects.toThrow('private network');
    expect(net.fetch).not.toHaveBeenCalled();
  });

  it('revalidates redirect destinations and reports a final-origin warning', async () => {
    vi.mocked(net.fetch)
      .mockResolvedValueOnce(response(302, { location: 'https://cdn.example.net/embed' }) as any)
      .mockResolvedValueOnce(response(200, { 'content-type': 'text/html' }) as any);
    const result = await verifyCustomSource({ kind: 'web-player', url: 'https://player.example.com/embed' });
    expect(net.fetch).toHaveBeenCalledTimes(2);
    expect(result.finalOrigin).toBe('https://cdn.example.net');
    expect(result.warnings[0]).toContain('redirect to a different HTTPS origin');
  });

  it('rejects a private redirect and enforces the three-redirect limit', async () => {
    vi.mocked(net.fetch).mockResolvedValue(response(302, { location: 'https://[::1]/private' }) as any);
    await expect(verifyCustomSource({ kind: 'web-player', url: 'https://player.example.com' })).rejects.toThrow('public HTTPS');
    vi.mocked(net.fetch).mockResolvedValue(response(301, { location: '/again' }) as any);
    await expect(verifyCustomSource({ kind: 'web-player', url: 'https://player.example.com' })).rejects.toThrow('three-redirect');
    expect(net.fetch).toHaveBeenCalledTimes(5);
  });

  it('requires the correct content type and warns when media CORS is missing', async () => {
    vi.mocked(net.fetch).mockResolvedValue(response(200, { 'content-type': 'video/webm' }) as any);
    await expect(verifyCustomSource({ kind: 'web-player', url: 'https://example.com/embed' })).rejects.toThrow('must return text/html');
    const result = await verifyCustomSource({ kind: 'media', url: 'https://example.com/movie.webm' });
    expect(result.warnings[0]).toContain('No Access-Control-Allow-Origin');
  });
});
