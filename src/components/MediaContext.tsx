import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWorkspace } from '../store/useWorkspace';

export type TextureSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

interface MediaContextValue {
  version: number;
  remoteOutputActive: boolean;
  setRemoteOutputActive: (active: boolean) => void;
  textureSources: React.MutableRefObject<Map<string, TextureSource>>;
  controlElements: React.MutableRefObject<Map<string, HTMLMediaElement>>;
  getStream: (sourceId: string) => MediaStream | undefined;
  setStream: (sourceId: string, stream: MediaStream) => void;
  acquireStream: (sourceId: string) => void;
  releaseStream: (sourceId: string) => void;
  stopStream: (sourceId: string) => void;
  registerTexture: (playerId: string, element: TextureSource | null) => void;
  registerControl: (playerId: string, element: HTMLMediaElement | null) => void;
}

const MediaContext = createContext<MediaContextValue | null>(null);

export function MediaProvider({ children }: { children: ReactNode }) {
  const textureSources = useRef(new Map<string, TextureSource>());
  const controlElements = useRef(new Map<string, HTMLMediaElement>());
  const streams = useRef(new Map<string, MediaStream>());
  const streamReferences = useRef(new Map<string, number>());
  const stopTimers = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const [remoteOutputActive, setRemoteOutputActive] = useState(false);
  const invalidate = useCallback(() => setVersion((value) => value + 1), []);

  const getStream = useCallback((sourceId: string) => streams.current.get(sourceId), []);

  const setStream = useCallback((sourceId: string, stream: MediaStream) => {
    const timer = stopTimers.current.get(sourceId);
    if (timer) window.clearTimeout(timer);
    stopTimers.current.delete(sourceId);
    const previous = streams.current.get(sourceId);
    if (previous && previous.id !== stream.id) previous.getTracks().forEach((track) => track.stop());
    streams.current.set(sourceId, stream);
    invalidate();
  }, [invalidate]);

  const acquireStream = useCallback((sourceId: string) => {
    const timer = stopTimers.current.get(sourceId);
    if (timer) window.clearTimeout(timer);
    stopTimers.current.delete(sourceId);
    streamReferences.current.set(sourceId, (streamReferences.current.get(sourceId) ?? 0) + 1);
  }, []);

  const releaseStream = useCallback((sourceId: string) => {
    const remaining = (streamReferences.current.get(sourceId) ?? 1) - 1;
    if (remaining > 0) {
      streamReferences.current.set(sourceId, remaining);
      return;
    }
    streamReferences.current.delete(sourceId);
    if (stopTimers.current.has(sourceId)) return;
    // Deferred cleanup survives React StrictMode's effect cleanup/setup cycle.
    const timer = window.setTimeout(() => {
      stopTimers.current.delete(sourceId);
      const stream = streams.current.get(sourceId);
      stream?.getTracks().forEach((track) => track.stop());
      if (stream) {
        streams.current.delete(sourceId);
        useWorkspace.getState().updateSource(sourceId, {
          connected: false,
          detail: 'Capture stopped because no player is using it. Reconnect to restart.',
        });
        invalidate();
      }
    }, 40);
    stopTimers.current.set(sourceId, timer);
  }, [invalidate]);

  const stopStream = useCallback((sourceId: string) => {
    const timer = stopTimers.current.get(sourceId);
    if (timer) window.clearTimeout(timer);
    stopTimers.current.delete(sourceId);
    streamReferences.current.delete(sourceId);
    const stream = streams.current.get(sourceId);
    stream?.getTracks().forEach((track) => track.stop());
    if (stream) {
      streams.current.delete(sourceId);
      useWorkspace.getState().updateSource(sourceId, { connected: false });
      invalidate();
    }
  }, [invalidate]);

  const registerTexture = useCallback((playerId: string, element: TextureSource | null) => {
    if (element) textureSources.current.set(playerId, element);
    else textureSources.current.delete(playerId);
    invalidate();
  }, [invalidate]);

  const registerControl = useCallback((playerId: string, element: HTMLMediaElement | null) => {
    if (element) controlElements.current.set(playerId, element);
    else controlElements.current.delete(playerId);
    invalidate();
  }, [invalidate]);

  const value = useMemo<MediaContextValue>(() => ({
    version,
    remoteOutputActive,
    setRemoteOutputActive,
    textureSources,
    controlElements,
    getStream,
    setStream,
    acquireStream,
    releaseStream,
    stopStream,
    registerTexture,
    registerControl,
  }), [
    version,
    remoteOutputActive,
    getStream,
    setStream,
    acquireStream,
    releaseStream,
    stopStream,
    registerTexture,
    registerControl,
  ]);

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

export function useMedia(): MediaContextValue {
  const context = useContext(MediaContext);
  if (!context) throw new Error('useMedia must be used within MediaProvider.');
  return context;
}
