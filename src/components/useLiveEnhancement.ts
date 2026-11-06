import { useEffect, useState, type RefObject } from 'react';
import { liveEnhancementEngine } from '../lib/liveEnhancementEngine';
import {
  fitLiveEnhancementInput,
  liveEnhancementFrameIsFresh,
  liveEnhancementRetryDelay,
} from '../lib/liveEnhancement';
import { useWorkspace } from '../store/useWorkspace';
import type { LiveEnhancementInputSize, LiveEnhancementRuntimeStatus } from '../types';

interface LiveEnhancementOptions {
  playerId: string;
  sourceKey: string;
  enabled: boolean;
  strength: number;
  inputSize: LiveEnhancementInputSize;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function useLiveEnhancement({
  playerId,
  sourceKey,
  enabled,
  strength,
  inputSize,
  videoRef,
  canvasRef,
}: LiveEnhancementOptions): boolean {
  const [displayCanvas, setDisplayCanvas] = useState(false);
  const setStatus = useWorkspace((state) => state.setLiveEnhancementStatus);
  const pushToast = useWorkspace((state) => state.pushToast);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let inFlight = false;
    let fatal = false;
    let hasEnhancedFrame = false;
    let lastCapturedTime = -1;
    let nextAttemptAt = 0;
    let consecutiveLateFrames = 0;
    const video = videoRef.current;
    const output = canvasRef.current;
    const input = document.createElement('canvas');
    const enhanced = document.createElement('canvas');

    const report = (status: LiveEnhancementRuntimeStatus) => {
      if (!disposed) setStatus(playerId, status);
    };
    const showOriginal = () => {
      hasEnhancedFrame = false;
      setDisplayCanvas(false);
    };

    setDisplayCanvas(false);
    if (!enabled) {
      report({ phase: 'off', detail: 'Off' });
      return () => {
        disposed = true;
        report({ phase: 'off', detail: 'Off' });
      };
    }
    if (!video || !output) {
      report({ phase: 'error', detail: 'Video is not available for enhancement.' });
      return () => {
        disposed = true;
        report({ phase: 'off', detail: 'Off' });
      };
    }

    const outputContext = output.getContext('2d');
    const inputContext = input.getContext('2d');
    const enhancedContext = enhanced.getContext('2d');
    if (!outputContext || !inputContext || !enhancedContext) {
      report({ phase: 'error', detail: 'A readable 2D canvas is unavailable.' });
      return () => {
        disposed = true;
        report({ phase: 'off', detail: 'Off' });
      };
    }

    report({ phase: 'loading', detail: 'Preparing live AI…' });
    const unsubscribe = liveEnhancementEngine.subscribe((status) => {
      if (!hasEnhancedFrame && status.phase === 'loading') {
        report({ phase: 'loading', detail: status.detail, backend: status.backend });
      }
    });

    const invalidate = () => {
      lastCapturedTime = -1;
      nextAttemptAt = 0;
      consecutiveLateFrames = 0;
    };
    video.addEventListener('seeked', invalidate);
    video.addEventListener('play', invalidate);
    video.addEventListener('loadeddata', invalidate);

    const tick = async (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      if (inFlight || fatal || now < nextAttemptAt || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (!video.videoWidth || !video.videoHeight || video.currentTime === lastCapturedTime) return;

      inFlight = true;
      const mediaTime = video.currentTime;
      const capturedAt = performance.now();
      lastCapturedTime = mediaTime;
      try {
        const dimensions = fitLiveEnhancementInput(video.videoWidth, video.videoHeight, inputSize);
        input.width = dimensions.width;
        input.height = dimensions.height;
        inputContext.drawImage(video, 0, 0, dimensions.width, dimensions.height);
        const image = inputContext.getImageData(0, 0, dimensions.width, dimensions.height);
        const result = await liveEnhancementEngine.process(image, () => disposed);
        inFlight = false;
        if (disposed || !result) return;

        const receivedAt = performance.now();
        const fresh = liveEnhancementFrameIsFresh(
          capturedAt,
          receivedAt,
          mediaTime,
          video.currentTime,
          video.paused,
        );
        if (!fresh) {
          consecutiveLateFrames += 1;
          showOriginal();
          nextAttemptAt = receivedAt + liveEnhancementRetryDelay(consecutiveLateFrames);
          report({
            phase: 'fallback',
            detail: consecutiveLateFrames >= 3
              ? 'AI is behind; original video is playing. Pausing allows a full enhanced frame.'
              : 'A late AI frame was dropped to protect playback.',
            backend: result.backend,
            inferenceMs: result.inferenceMs,
          });
          return;
        }

        consecutiveLateFrames = 0;
        enhanced.width = result.width;
        enhanced.height = result.height;
        enhancedContext.putImageData(new ImageData(
          new Uint8ClampedArray(result.pixels),
          result.width,
          result.height,
        ), 0, 0);
        output.width = result.width;
        output.height = result.height;
        outputContext.globalAlpha = 1;
        outputContext.drawImage(input, 0, 0, result.width, result.height);
        outputContext.globalAlpha = strength;
        outputContext.drawImage(enhanced, 0, 0);
        outputContext.globalAlpha = 1;
        hasEnhancedFrame = strength > 0;
        setDisplayCanvas(hasEnhancedFrame);
        report({
          phase: hasEnhancedFrame ? 'active' : 'fallback',
          detail: `${result.backend.toUpperCase()} · ${result.width} × ${result.height} · ${video.paused ? 'paused frame' : 'live'}`,
          backend: result.backend,
          inferenceMs: result.inferenceMs,
        });
      } catch (error) {
        inFlight = false;
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'AI is busy with other players.') {
          lastCapturedTime = -1;
          nextAttemptAt = performance.now() + 1000;
          if (!video.paused) showOriginal();
          report({ phase: 'fallback', detail: 'AI is busy with another player; original video remains available.' });
          return;
        }
        fatal = true;
        showOriginal();
        report({ phase: 'error', detail: `Original video: ${message.slice(0, 180)}` });
        pushToast({
          title: 'Live AI could not enhance this player',
          detail: `${message.slice(0, 220)} The original video remains active.`,
          tone: 'warning',
        });
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      unsubscribe();
      video.removeEventListener('seeked', invalidate);
      video.removeEventListener('play', invalidate);
      video.removeEventListener('loadeddata', invalidate);
      setDisplayCanvas(false);
      setStatus(playerId, { phase: 'off', detail: 'Off' });
    };
  }, [canvasRef, enabled, inputSize, playerId, pushToast, setStatus, sourceKey, strength, videoRef]);

  return displayCanvas;
}
