import Hls from 'hls.js';
import hlsWorkerUrl from 'hls.js/dist/hls.worker.js?url';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { formatTime } from '../lib/format';
import { useWorkspace } from '../store/useWorkspace';
import type { MediaSource, Player, TestPatternKind } from '../types';
import { useMedia, type TextureSource } from './MediaContext';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 360;

function mediaCrossOrigin(uri: string): 'anonymous' | undefined {
  return /^(?:https?:|freeform-media:)/i.test(uri) ? 'anonymous' : undefined;
}

function fitsCanvas(element: TextureSource): boolean {
  if (element instanceof HTMLVideoElement) return element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  if (element instanceof HTMLImageElement) return element.complete && element.naturalWidth > 0;
  return true;
}

function useTextureRegistration(playerId: string, ref: RefObject<TextureSource | null>) {
  const { registerTexture } = useMedia();
  const refresh = useCallback(() => {
    const element = ref.current;
    if (element && fitsCanvas(element)) registerTexture(playerId, element);
  }, [playerId, ref, registerTexture]);

  useEffect(() => {
    refresh();
    return () => registerTexture(playerId, null);
  }, [playerId, refresh, registerTexture]);

  return refresh;
}

function useControlRegistration(playerId: string, ref: RefObject<HTMLMediaElement | null>) {
  const { registerControl } = useMedia();
  useEffect(() => {
    registerControl(playerId, ref.current);
    return () => registerControl(playerId, null);
  }, [playerId, ref, registerControl]);
}

function useMediaSource(
  ref: RefObject<HTMLMediaElement | null>,
  source: MediaSource,
  player: Player,
) {
  const updateSource = useWorkspace((state) => state.updateSource);
  const pushToast = useWorkspace((state) => state.pushToast);
  const autoplayRef = useRef(player.autoplay);
  autoplayRef.current = player.autoplay;

  useEffect(() => {
    const element = ref.current;
    const uri = source.uri;
    if (!element || !uri || !source.connected) return;
    let disposed = false;
    let hls: Hls | null = null;
    const isHls = /mpegurl/i.test(source.mime ?? '') || /\.m3u8(?:$|[?#])/i.test(uri);

    const fail = (detail: string) => {
      if (disposed) return;
      updateSource(source.id, { connected: false, detail });
      pushToast({ title: `Could not play ${source.name}`, detail, tone: 'error' });
    };

    const attemptPlayback = () => {
      if (!autoplayRef.current || disposed) return;
      void element.play().catch(() => {
        // Browsers can require one explicit press of Play; the transport remains available.
      });
    };

    element.addEventListener('loadedmetadata', attemptPlayback);
    element.addEventListener('canplay', attemptPlayback);

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        workerPath: hlsWorkerUrl,
        backBufferLength: 30,
      });
      hls.on(Hls.Events.MANIFEST_PARSED, attemptPlayback);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || disposed) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hls) {
          hls.recoverMediaError();
          return;
        }
        fail(data.details || 'The HLS stream could not be loaded. Check its URL and CORS policy.');
      });
      hls.loadSource(uri);
      hls.attachMedia(element);
    } else {
      element.src = uri;
      element.load();
    }

    return () => {
      disposed = true;
      element.removeEventListener('loadedmetadata', attemptPlayback);
      element.removeEventListener('canplay', attemptPlayback);
      element.pause();
      hls?.destroy();
      element.removeAttribute('src');
      element.load();
    };
  }, [pushToast, ref, source.connected, source.id, source.name, source.uri, updateSource]);
}

function useMediaProperties(
  ref: RefObject<HTMLMediaElement | null>,
  player: Player,
  live: boolean,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.volume = player.volume;
    element.muted = player.muted;
    if (!live) element.loop = player.loop;
    if (!live && Math.abs(element.playbackRate - player.rate) > 0.001) {
      element.playbackRate = player.rate;
    }
  }, [live, player.loop, player.muted, player.rate, player.volume, ref]);
}

function drawFrameLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number) {
  context.font = '12px "Fira Mono", monospace';
  context.fillStyle = 'rgba(235,235,235,.72)';
  context.fillText(label, x, y);
}

function drawTestCard(canvas: HTMLCanvasElement, pattern: TestPatternKind = 'orientation') {
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  context.fillStyle = '#111312';
  context.fillRect(0, 0, width, height);
  context.lineWidth = 1;
  if (pattern === 'starfield') {
    let seed = 971;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let index = 0; index < 220; index += 1) {
      const radius = index % 17 === 0 ? 2.1 : 0.55 + random() * 0.85;
      context.fillStyle = index % 9 === 0 ? '#2cc9ff' : '#e6ebe6';
      context.beginPath();
      context.arc(random() * width, random() * height, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#c5ffc3';
    context.font = '13px "Fira Mono", monospace';
    context.fillText('STARFIELD / FIXED SEED 971', 24, height - 24);
    return;
  }
  if (pattern === 'convergence') {
    const targets = [[0.5, 0.5], [0.18, 0.22], [0.82, 0.22], [0.18, 0.78], [0.82, 0.78]];
    targets.forEach(([x, y], index) => {
      const cx = x * width;
      const cy = y * height;
      context.strokeStyle = index ? '#2cc9ff' : '#c5ffc3';
      for (const radius of [12, 28, 48]) {
        context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke();
      }
      context.beginPath();
      context.moveTo(cx - 62, cy); context.lineTo(cx + 62, cy);
      context.moveTo(cx, cy - 62); context.lineTo(cx, cy + 62); context.stroke();
      drawFrameLabel(context, `TARGET ${index + 1}`, cx - 38, cy + 75);
    });
    return;
  }
  if (pattern === 'latitude') {
    context.save();
    context.translate(width / 2, height / 2);
    context.strokeStyle = 'rgba(44,201,255,.7)';
    for (let ring = 1; ring <= 6; ring += 1) {
      context.beginPath(); context.ellipse(0, 0, ring * 48, ring * 25, 0, 0, Math.PI * 2); context.stroke();
    }
    for (let spoke = 0; spoke < 24; spoke += 1) {
      const angle = spoke / 24 * Math.PI * 2;
      context.beginPath(); context.moveTo(0, 0); context.lineTo(Math.cos(angle) * 288, Math.sin(angle) * 150); context.stroke();
    }
    context.restore();
    context.fillStyle = '#c5ffc3';
    context.font = '13px "Fira Mono", monospace';
    context.fillText('ZENITH', width / 2 - 26, height / 2 - 12);
    drawFrameLabel(context, 'AZIMUTH 0°', width - 106, height / 2 - 12);
    return;
  }
  context.strokeStyle = pattern === 'crosshatch' ? 'rgba(197,255,195,.48)' : 'rgba(197,255,195,.22)';
  for (let x = 0; x <= width; x += 40) {
    context.lineWidth = x % 200 === 0 ? 2 : 1;
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 0; y <= height; y += 40) {
    context.lineWidth = y % 200 === 0 ? 2 : 1;
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  if (pattern === 'crosshatch') {
    context.fillStyle = '#c5ffc3';
    context.font = '13px "Fira Mono", monospace';
    context.fillText('CROSSHATCH / 40 PX', 24, height - 24);
    return;
  }
  const colors = ['#c5ffc3', '#2cc9ff', '#e6d36b', '#e78282'];
  colors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index * width / 4, 0, width / 4, 22);
  });
  context.strokeStyle = '#c5ffc3';
  context.lineWidth = 2;
  context.strokeRect(14, 14, width - 28, height - 28);
  context.beginPath();
  context.moveTo(width / 2, 30); context.lineTo(width / 2, height - 30);
  context.moveTo(30, height / 2); context.lineTo(width - 30, height / 2);
  context.stroke();
  context.fillStyle = '#ebebeb';
  context.font = '600 30px "Fira Sans", sans-serif';
  context.fillText('FREEFORM', 36, 66);
  context.font = '14px "Fira Mono", monospace';
  context.fillStyle = '#c5ffc3';
  context.fillText('CALIBRATION / 16:9', 38, 91);
  drawFrameLabel(context, 'TOP LEFT', 28, height - 28);
  drawFrameLabel(context, 'TOP RIGHT', width - 102, height - 28);
  context.save();
  context.translate(width - 40, 110);
  context.rotate(Math.PI / 2);
  drawFrameLabel(context, 'ORIENTATION', 0, 0);
  context.restore();
  context.beginPath();
  context.arc(width / 2, height / 2, 54, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(width / 2, height / 2, 4, 0, Math.PI * 2);
  context.fillStyle = '#c5ffc3';
  context.fill();
}

function TestCanvas({ player, source }: { player: Player; source: MediaSource }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const refresh = useTextureRegistration(player.id, ref);
  useEffect(() => {
    if (!ref.current) return;
    drawTestCard(ref.current, source.testPattern);
    refresh();
  }, [refresh, source.testPattern]);
  return <canvas ref={ref} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />;
}

function StatusCanvas({ player, source }: { player: Player; source: MediaSource }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const refresh = useTextureRegistration(player.id, ref);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.fillStyle = '#171918';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(177,177,177,.12)';
    for (let x = -canvas.height; x < canvas.width; x += 32) {
      context.beginPath();
      context.moveTo(x, canvas.height);
      context.lineTo(x + canvas.height, 0);
      context.stroke();
    }
    context.strokeStyle = source.connected ? '#2cc9ff' : '#c5ffc3';
    context.lineWidth = 2;
    context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
    context.fillStyle = '#ebebeb';
    context.font = '600 24px "Fira Sans", sans-serif';
    const title = source.connected ? 'CONNECTING SOURCE' : 'SOURCE DISCONNECTED';
    context.fillText(title, 48, 104);
    context.fillStyle = '#b1b1b1';
    context.font = '16px "Fira Sans", sans-serif';
    const name = source.name.length > 48 ? `${source.name.slice(0, 47)}…` : source.name;
    context.fillText(name, 48, 142);
    context.fillStyle = '#c5ffc3';
    context.font = '13px "Fira Mono", monospace';
    const detail = source.detail ?? (source.live ? 'Use Sources → Reconnect to start this live input.' : 'Use Sources → Reconnect or replace this media.');
    context.fillText(detail.slice(0, 76), 48, 202);
    context.fillStyle = '#777d78';
    context.fillText(`${source.kind.toUpperCase()} / ${source.mediaType.toUpperCase()}`, 48, 284);
    refresh();
  }, [refresh, source.connected, source.detail, source.kind, source.mediaType, source.live, source.name]);
  return <canvas ref={ref} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />;
}

function DirectMedia({ player, source, audioOnly = false }: { player: Player; source: MediaSource; audioOnly?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const mediaRef = audioOnly ? audioRef : videoRef;
  const updateSource = useWorkspace((state) => state.updateSource);
  useMediaSource(mediaRef, source, player);
  useMediaProperties(mediaRef, player, false);
  useControlRegistration(player.id, mediaRef);
  const refresh = useTextureRegistration(player.id, videoRef);

  if (!source.uri) return <StatusCanvas player={player} source={{ ...source, connected: false, detail: 'No media URL is stored for this source.' }} />;

  const handleError = () => {
    updateSource(source.id, {
      connected: false,
      detail: 'Unsupported codec, unavailable media, or a blocked network response.',
    });
  };
  const shared = {
    preload: 'auto',
    crossOrigin: mediaCrossOrigin(source.uri),
    onLoadedData: refresh,
    onCanPlay: refresh,
    onError: handleError,
  };

  if (audioOnly) return <audio ref={audioRef} {...shared} />;
  return <video ref={videoRef} {...shared} playsInline />;
}

function LiveMedia({ player, source, stream }: { player: Player; source: MediaSource; stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  const { acquireStream, releaseStream } = useMedia();
  const updateSource = useWorkspace((state) => state.updateSource);
  useMediaProperties(ref, player, true);
  useControlRegistration(player.id, ref);
  const refresh = useTextureRegistration(player.id, ref);

  useEffect(() => {
    acquireStream(source.id);
    return () => releaseStream(source.id);
  }, [acquireStream, releaseStream, source.id, stream.id]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    const handleEnded = () => updateSource(source.id, {
      connected: false,
      detail: 'The capture ended. Reconnect it from the Sources rail.',
    });
    stream.getVideoTracks().forEach((track) => track.addEventListener('ended', handleEnded));
    return () => {
      stream.getVideoTracks().forEach((track) => track.removeEventListener('ended', handleEnded));
      element.pause();
      element.srcObject = null;
    };
  }, [source.id, stream, updateSource]);

  return <video ref={ref} playsInline onLoadedData={refresh} onCanPlay={refresh} />;
}

function ImageMedia({ player, source }: { player: Player; source: MediaSource }) {
  const ref = useRef<HTMLImageElement>(null);
  const refresh = useTextureRegistration(player.id, ref);
  const updateSource = useWorkspace((state) => state.updateSource);
  if (!source.uri) return <StatusCanvas player={player} source={{ ...source, connected: false }} />;
  return (
    <img
      ref={ref}
      src={source.uri}
      crossOrigin={mediaCrossOrigin(source.uri)}
      alt=""
      onLoad={refresh}
      onError={() => updateSource(source.id, {
        connected: false,
        detail: 'The image could not be decoded or its server blocked access.',
      })}
    />
  );
}

function AudioSurface({ player, source }: { player: Player; source: MediaSource }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const refresh = useTextureRegistration(player.id, canvasRef);
  const updateSource = useWorkspace((state) => state.updateSource);
  useMediaSource(audioRef, source, player);
  useMediaProperties(audioRef, player, false);
  useControlRegistration(player.id, audioRef);

  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      const audio = audioRef.current;
      if (canvas && context) {
        const time = audio?.currentTime ?? 0;
        const duration = audio?.duration ?? 0;
        const progress = Number.isFinite(duration) && duration > 0 ? time / duration : 0;
        context.fillStyle = '#151817';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, 'rgba(44,201,255,.14)');
        gradient.addColorStop(1, 'rgba(197,255,195,.03)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = 'rgba(197,255,195,.28)';
        context.lineWidth = 2;
        context.beginPath();
        for (let x = 0; x <= canvas.width; x += 4) {
          const envelope = Math.sin((x / canvas.width) * Math.PI);
          const y = canvas.height / 2
            + Math.sin(x * 0.042 + time * 4) * 38 * envelope
            + Math.sin(x * 0.013 - time * 2) * 22;
          if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
        context.fillStyle = '#c5ffc3';
        context.font = '12px "Fira Mono", monospace';
        context.fillText('AUDIO / WAVEFORM VIEW', 34, 44);
        context.fillStyle = '#ebebeb';
        context.font = '600 24px "Fira Sans", sans-serif';
        context.fillText(source.name.slice(0, 40), 34, 88);
        context.fillStyle = '#2cc9ff';
        context.font = '20px "Fira Mono", monospace';
        context.fillText(`${formatTime(time)}  /  ${formatTime(duration)}`, 34, 286);
        context.fillStyle = 'rgba(235,235,235,.14)';
        context.fillRect(34, 312, canvas.width - 68, 4);
        context.fillStyle = '#c5ffc3';
        context.fillRect(34, 312, (canvas.width - 68) * progress, 4);
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    refresh();
    return () => cancelAnimationFrame(frame);
  }, [refresh, source.name]);

  if (!source.uri) return <StatusCanvas player={player} source={{ ...source, connected: false }} />;
  return (
    <>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <audio
        ref={audioRef}
        preload="auto"
        crossOrigin={mediaCrossOrigin(source.uri)}
        onError={() => updateSource(source.id, {
          connected: false,
          detail: 'Unsupported audio codec, unavailable media, or a blocked network response.',
        })}
      />
    </>
  );
}

function PlayerMedia({ player, source }: { player: Player; source: MediaSource }) {
  const { getStream } = useMedia();
  if (!source.connected) return <StatusCanvas player={player} source={source} />;
  if (source.mediaType === 'test') return <TestCanvas player={player} source={source} />;
  if (source.live) {
    const stream = getStream(source.id);
    return stream
      ? <LiveMedia player={player} source={source} stream={stream} />
      : <StatusCanvas player={player} source={{ ...source, connected: false, detail: source.detail ?? 'Live input is not active. Reconnect it from Sources.' }} />;
  }
  if (source.mediaType === 'image') return <ImageMedia player={player} source={source} />;
  if (source.mediaType === 'audio') return <AudioSurface player={player} source={source} />;
  return <DirectMedia player={player} source={source} />;
}

export function MediaLayer() {
  const players = useWorkspace((state) => state.players);
  const sources = useWorkspace((state) => state.sources);
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  return (
    <div className="media-layer" aria-hidden="true">
      {players.map((player) => {
        const source = sourceMap.get(player.sourceId);
        return source ? <PlayerMedia key={player.id} player={player} source={source} /> : null;
      })}
    </div>
  );
}
