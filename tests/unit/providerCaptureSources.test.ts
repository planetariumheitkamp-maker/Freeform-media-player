import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer } from '../../src/data/defaults';
import { parseProject, serializeProject } from '../../src/lib/project';
import { captureDesktop, captureProvider } from '../../src/lib/runtime';
import { connectLiveSource, sourceFromProviderCapture } from '../../src/lib/sourceActions';

vi.mock('../../src/lib/runtime', () => ({
  captureDesktop: vi.fn(),
  captureDevice: vi.fn(),
  captureProvider: vi.fn(),
}));

const input = {
  captureId: 'capture-window-123',
  url: 'https://vidqueen.st/embed/movie/603?autoplay=false',
  label: 'TMDB movie 603',
};

describe('provider capture sources', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates disconnected live metadata tied to the authorized visible window', () => {
    const source = sourceFromProviderCapture(input);
    expect(source).toMatchObject({
      kind: 'provider',
      mediaType: 'capture',
      name: 'Vidqueen — TMDB movie 603',
      providerCaptureId: input.captureId,
      providerUrl: input.url,
      live: true,
      connected: false,
    });
    expect(source.id).not.toBe(input.captureId);
  });

  it('names and serializes a built-in provider capture with its provider identity', () => {
    const builtInInput = {
      ...input,
      url: 'https://vidlink.pro/movie/603?autoplay=false',
      providerKind: 'builtin' as const,
      providerName: 'VidLink',
    };
    const source = { ...sourceFromProviderCapture(builtInInput), connected: true };
    expect(source).toMatchObject({
      name: 'VidLink — TMDB movie 603',
      providerKind: 'builtin',
      providerName: 'VidLink',
      providerUrl: builtInInput.url,
    });
    const content = serializeProject({
      projectName: 'Built-in provider capture',
      sources: [source],
      players: [createPlayer(1, source.id)],
      groups: [],
    });
    const saved = JSON.parse(content).sources[0];
    expect(saved.providerCaptureId).toBeUndefined();
    expect(saved.detail).toContain('authorized VidLink window');
    const restored = parseProject(content).sources[0];
    expect(restored.providerKind).toBe('builtin');
    expect(restored.providerName).toBe('VidLink');
    expect(restored.connected).toBe(false);
  });

  it('saves provider metadata without a reusable live capture ID', () => {
    const source = { ...sourceFromProviderCapture(input), connected: true, withAudio: false };
    const content = serializeProject({
      projectName: 'Provider capture',
      sources: [source],
      players: [createPlayer(1, source.id)],
      groups: [],
    });
    const saved = JSON.parse(content).sources[0];
    expect(saved.providerCaptureId).toBeUndefined();
    expect(saved.connected).toBe(false);
    expect(saved.providerUrl).toBe(input.url);
    expect(saved.detail).toContain('Reopen the authorized Vidqueen window');
    expect(content).not.toContain(input.captureId);

    const restored = parseProject(content).sources[0];
    expect(restored.kind).toBe('provider');
    expect(restored.connected).toBe(false);
    expect(restored.providerCaptureId).toBeUndefined();
  });

  it('connects through provider capture and publishes the real stream', async () => {
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    vi.mocked(captureProvider).mockResolvedValue(stream);
    const source = sourceFromProviderCapture(input);
    const setStream = vi.fn();
    const updateSource = vi.fn();
    await expect(connectLiveSource(source, false, { setStream, updateSource })).resolves.toBe(stream);
    expect(captureProvider).toHaveBeenCalledWith(input.captureId, false);
    expect(captureDesktop).not.toHaveBeenCalled();
    expect(setStream).toHaveBeenCalledWith(source.id, stream);
    expect(updateSource).toHaveBeenLastCalledWith(source.id, {
      connected: true,
      withAudio: false,
      detail: 'Live video / no audio track',
    });
  });

  it('marks failed provider connections disconnected', async () => {
    vi.mocked(captureProvider).mockRejectedValue(new Error('Visible window closed'));
    const source = sourceFromProviderCapture(input);
    const updateSource = vi.fn();
    await expect(connectLiveSource(source, true, { setStream: vi.fn(), updateSource })).rejects.toThrow('Visible window closed');
    expect(updateSource).toHaveBeenLastCalledWith(source.id, {
      connected: false,
      detail: 'Visible window closed',
    });
  });
});
