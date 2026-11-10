import { captureDesktop, captureDevice, captureProvider } from './runtime';
import type { MediaSource, OpenedMedia } from '../types';

const pendingConnections = new Map<string, Promise<MediaStream>>();

export function sourceFromFile(file: OpenedMedia): MediaSource {
  return {
    id: crypto.randomUUID(),
    kind: 'file',
    mediaType: file.mediaType,
    name: file.name,
    uri: file.url,
    path: file.path,
    mime: file.mime,
    live: false,
    connected: true,
    detail: file.path ?? 'Browser session file — re-add it after reopening the project',
  };
}

export interface ProviderCaptureSourceInput {
  captureId: string;
  url: string;
  label: string;
  providerKind?: 'vidqueen' | 'builtin' | 'custom';
  providerName?: string;
}

export function sourceFromProviderCapture(input: ProviderCaptureSourceInput): MediaSource {
  const providerKind = input.providerKind ?? 'vidqueen';
  const providerName = input.providerName ?? (providerKind === 'custom' ? 'Custom player' : providerKind === 'builtin' ? 'Provider' : 'Vidqueen');
  return {
    id: crypto.randomUUID(),
    kind: 'provider',
    mediaType: 'capture',
    name: `${providerName} — ${input.label}`,
    providerCaptureId: input.captureId,
    providerUrl: input.url,
    providerKind,
    providerName,
    live: true,
    connected: false,
    detail: `Waiting for the visible ${providerName} window capture…`,
  };
}

export function readableError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Permission was denied or the source picker was closed.';
    if (error.name === 'NotFoundError') return 'The requested source is no longer available.';
    if (error.name === 'NotReadableError') return 'The source is already in use or could not be read.';
  }
  return error instanceof Error ? error.message : 'The media source could not be opened.';
}

interface ConnectOptions {
  setStream: (sourceId: string, stream: MediaStream) => void;
  updateSource: (id: string, patch: Partial<MediaSource>) => void;
}

export function connectLiveSource(
  source: MediaSource,
  withAudio: boolean,
  { setStream, updateSource }: ConnectOptions,
): Promise<MediaStream> {
  const pending = pendingConnections.get(source.id);
  if (pending) return pending;
  updateSource(source.id, { connected: false, detail: 'Waiting for capture permission…', withAudio });
  const promise = (async () => {
    try {
      let stream: MediaStream;
      if (source.kind === 'desktop') {
        stream = await captureDesktop(source.desktopId ?? 'system-picker', withAudio);
      } else if (source.kind === 'provider') {
        stream = await captureProvider(source.providerCaptureId ?? '', withAudio);
      } else {
        stream = await captureDevice(source.deviceId ?? '', withAudio);
      }
      setStream(source.id, stream);
      updateSource(source.id, {
        connected: true,
        withAudio,
        detail: stream.getAudioTracks().length
          ? 'Live video + audio'
          : 'Live video / no audio track',
      });
      return stream;
    } catch (error) {
      const detail = readableError(error);
      updateSource(source.id, { connected: false, detail });
      throw error;
    } finally {
      pendingConnections.delete(source.id);
    }
  })();
  pendingConnections.set(source.id, promise);
  return promise;
}
