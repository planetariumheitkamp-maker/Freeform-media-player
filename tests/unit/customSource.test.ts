import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sourceFromCustomMedia,
  validateCustomSourceUrl,
  verifyCustomSourceInBrowser,
} from '../../src/lib/customSource';
import type { CustomSourceVerification } from '../../src/types';

function response({
  url = 'https://media.example.com/movie.webm',
  status = 206,
  type = 'video/webm',
  cors = '*',
}: { url?: string; status?: number; type?: string; cors?: string } = {}) {
  const headers = new Headers({ 'content-type': `${type}; charset=binary` });
  if (cors) headers.set('access-control-allow-origin', cors);
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers,
    body: { cancel: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('browser custom-source verification', () => {
  it.each([
    'http://example.com/video.webm',
    'https://localhost/video.webm',
    'https://127.1/video.webm',
    'https://192.168.0.1/video.webm',
    'https://[::1]/video.webm',
    'https://[::ffff:7f00:1]/video.webm',
    'https://[fe80::1]/video.webm',
  ])('blocks a URL before any fetch: %s', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyCustomSourceInBrowser({ kind: 'media', url })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(() => validateCustomSourceUrl(url)).toThrow();
  });

  it('performs a credentialed-less ranged CORS request and cancels its body', async () => {
    const result = response();
    const fetchMock = vi.fn().mockResolvedValue(result);
    vi.stubGlobal('fetch', fetchMock);
    const verified = await verifyCustomSourceInBrowser({ kind: 'media', url: 'https://media.example.com/movie.webm' });
    expect(fetchMock).toHaveBeenCalledWith('https://media.example.com/movie.webm', expect.objectContaining({
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    }));
    expect(result.body?.cancel).toHaveBeenCalledOnce();
    expect(verified).toMatchObject({
      kind: 'media',
      mediaType: 'video',
      contentType: 'video/webm',
      status: 206,
      finalOrigin: 'https://media.example.com',
      cors: '*',
    });
  });

  it('recognizes HLS manifests and direct audio responses', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ url: 'https://media.example.com/live', type: 'application/vnd.apple.mpegurl' }))
      .mockResolvedValueOnce(response({ url: 'https://media.example.com/audio', type: 'audio/mpeg' })));
    await expect(verifyCustomSourceInBrowser({ kind: 'media', url: 'https://media.example.com/live' })).resolves.toMatchObject({ mediaType: 'video' });
    await expect(verifyCustomSourceInBrowser({ kind: 'media', url: 'https://media.example.com/audio' })).resolves.toMatchObject({ mediaType: 'audio' });
  });

  it('requires HTML for web players and rejects non-media direct responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ type: 'video/webm' })));
    await expect(verifyCustomSourceInBrowser({ kind: 'web-player', url: 'https://example.com/embed' })).rejects.toThrow('must return HTML');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ type: 'text/html' })));
    await expect(verifyCustomSourceInBrowser({ kind: 'media', url: 'https://example.com/movie' })).rejects.toThrow('not a direct video');
  });

  it('rejects an HTTP error, private redirect, and failed network request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ status: 404 })));
    await expect(verifyCustomSourceInBrowser({ kind: 'media', url: 'https://example.com/movie' })).rejects.toThrow('HTTP 404');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ url: 'https://[::1]/movie' })));
    await expect(verifyCustomSourceInBrowser({ kind: 'media', url: 'https://example.com/movie' })).rejects.toThrow('private-network');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS denied')));
    await expect(verifyCustomSourceInBrowser({ kind: 'media', url: 'https://example.com/movie' })).rejects.toThrow('CORS denied');
  });
});

describe('verified custom media sources', () => {
  const verification: CustomSourceVerification = {
    kind: 'media',
    originalUrl: 'https://media.example.com/audio.mp3',
    finalUrl: 'https://media.example.com/audio.mp3',
    finalOrigin: 'https://media.example.com',
    status: 206,
    contentType: 'audio/mpeg',
    mediaType: 'audio',
    cors: '*',
    warnings: [],
    checkedAt: new Date().toISOString(),
  };

  it('preserves verified audio metadata for native playback', () => {
    const source = sourceFromCustomMedia(verification, '  Calibration audio  ', 'video');
    expect(source).toMatchObject({
      kind: 'stream',
      mediaType: 'audio',
      name: 'Calibration audio',
      uri: verification.finalUrl,
      mime: 'audio/mpeg',
      connected: true,
      live: false,
    });
    expect(source.detail).toContain('Verified custom media');
  });

  it('uses the manually identified media type for generic responses', () => {
    const generic = { ...verification, contentType: 'application/octet-stream', mediaType: 'unknown' as const };
    expect(sourceFromCustomMedia(generic, '', 'video')).toMatchObject({ name: 'media.example.com', mediaType: 'video' });
    expect(() => sourceFromCustomMedia(generic, '')).toThrow('did not identify playable media');
    expect(() => sourceFromCustomMedia({ ...verification, kind: 'web-player' }, '', 'video')).toThrow();
  });
});
