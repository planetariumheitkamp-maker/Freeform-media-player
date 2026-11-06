import {
  LIVE_ENHANCEMENT_MODEL_BYTES,
  LIVE_ENHANCEMENT_MODEL_CACHE,
  LIVE_ENHANCEMENT_MODEL_SHA256,
  LIVE_ENHANCEMENT_MODEL_URL,
} from './liveEnhancement';
import type {
  LiveEnhancementBackend,
  LiveEnhancementFrameResult,
  LiveEnhancementWorkerRequest,
  LiveEnhancementWorkerResponse,
} from './liveEnhancementMessages';

interface EnhancementJob {
  id: number;
  image: ImageData;
  cancelled: () => boolean;
  resolve: (result: LiveEnhancementFrameResult | null) => void;
  reject: (error: Error) => void;
}

interface EngineStatus {
  phase: 'loading' | 'ready';
  detail: string;
  backend?: LiveEnhancementBackend;
}

type StatusListener = (status: EngineStatus) => void;

const MAX_QUEUED_FRAMES = 4;
const MODEL_TIMEOUT_MS = 120_000;
const FRAME_TIMEOUT_MS = { webgpu: 30_000, wasm: 90_000 } as const;

function runtimeAssetPaths(): string {
  return import.meta.env.DEV
    ? new URL('/ort/', window.location.href).href
    : new URL('./ort/', window.location.href).href;
}

export class LiveEnhancementEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private isReady = false;
  private backend: LiveEnhancementBackend | undefined;
  private queue: EnhancementJob[] = [];
  private active: EnhancementJob | null = null;
  private listeners = new Set<StatusListener>();
  private nextJobId = 1;
  private modelTimer = 0;
  private frameTimer = 0;
  private lastStage = 'Preparing live AI…';

  private timeoutError(message: string): Error {
    return new Error(`${message} Backend: ${this.backend ?? 'not ready'}; last stage: ${this.lastStage}`);
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    if (this.ready && !this.isReady) listener({ phase: 'loading', detail: 'Preparing live AI…', backend: this.backend });
    if (this.isReady) listener({ phase: 'ready', detail: 'Live AI is ready.', backend: this.backend });
    return () => this.listeners.delete(listener);
  }

  private broadcast(status: EngineStatus) {
    this.lastStage = status.detail;
    this.listeners.forEach((listener) => listener(status));
  }

  private ensureReady(): Promise<void> {
    if (this.ready) return this.ready;
    this.isReady = false;
    const worker = new Worker(new URL('../workers/liveEnhancement.worker.ts', import.meta.url), {
      type: 'module',
      name: 'freeform-live-ai',
    });
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.broadcast({ phase: 'loading', detail: 'Preparing live AI…' });
    worker.onmessage = (event: MessageEvent<LiveEnhancementWorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      this.fail(new Error(event.message || 'The AI worker could not start.'));
    };
    const request: LiveEnhancementWorkerRequest = {
      type: 'init',
      modelUrl: LIVE_ENHANCEMENT_MODEL_URL,
      modelBytes: LIVE_ENHANCEMENT_MODEL_BYTES,
      modelSha256: LIVE_ENHANCEMENT_MODEL_SHA256,
      modelCache: LIVE_ENHANCEMENT_MODEL_CACHE,
      wasmPaths: runtimeAssetPaths(),
    };
    worker.postMessage(request);
    this.modelTimer = window.setTimeout(() => this.fail(this.timeoutError('AI model loading timed out.')), MODEL_TIMEOUT_MS);
    this.ready.catch(() => undefined);
    return this.ready;
  }

  private handleMessage(message: LiveEnhancementWorkerResponse) {
    if (message.type === 'status') {
      this.broadcast({ phase: 'loading', detail: message.detail, backend: this.backend });
      return;
    }
    if (message.type === 'ready' || message.type === 'backendChanged') {
      this.backend = message.backend;
      this.broadcast({ phase: 'ready', detail: 'Live AI is ready.', backend: this.backend });
      if (message.type === 'ready') {
        window.clearTimeout(this.modelTimer);
        this.isReady = true;
        this.readyResolve?.();
        this.pump();
      }
      return;
    }
    if (message.type === 'frameResult') {
      if (!this.active || this.active.id !== message.jobId) return;
      const job = this.active;
      this.active = null;
      window.clearTimeout(this.frameTimer);
      job.resolve({
        pixels: message.pixels,
        width: message.width,
        height: message.height,
        backend: message.backend,
        inferenceMs: message.inferenceMs,
      });
      this.pump();
      return;
    }

    const error = new Error(message.message);
    if (message.fatal) {
      this.fail(error);
      return;
    }
    if (this.active && (!message.jobId || this.active.id === message.jobId)) {
      const job = this.active;
      this.active = null;
      window.clearTimeout(this.frameTimer);
      job.reject(error);
      this.pump();
    }
  }

  private pump() {
    if (!this.worker || !this.isReady || this.active) return;
    while (this.queue.length && this.queue[0].cancelled()) {
      this.queue.shift()?.resolve(null);
    }
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    const request: LiveEnhancementWorkerRequest = {
      type: 'frame',
      jobId: job.id,
      pixels: job.image.data.buffer as ArrayBuffer,
      width: job.image.width,
      height: job.image.height,
    };
    this.worker.postMessage(request, [request.pixels]);
    this.frameTimer = window.setTimeout(
      () => this.fail(this.timeoutError('AI frame processing timed out.')),
      FRAME_TIMEOUT_MS[this.backend ?? 'wasm'],
    );
  }

  private fail(error: Error) {
    window.clearTimeout(this.modelTimer);
    window.clearTimeout(this.frameTimer);
    const worker = this.worker;
    this.worker = null;
    this.ready = null;
    this.isReady = false;
    this.backend = undefined;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    this.readyReject?.(error);
    this.readyResolve = null;
    this.readyReject = null;
    this.active?.reject(error);
    this.active = null;
    this.queue.forEach((job) => job.reject(error));
    this.queue = [];
  }

  process(image: ImageData, cancelled: () => boolean): Promise<LiveEnhancementFrameResult | null> {
    if (cancelled()) return Promise.resolve(null);
    if (this.queue.length >= MAX_QUEUED_FRAMES) {
      return Promise.reject(new Error('AI is busy with other players.'));
    }
    const job: EnhancementJob = {
      id: this.nextJobId++,
      image,
      cancelled,
      resolve: () => undefined,
      reject: () => undefined,
    };
    const result = new Promise<LiveEnhancementFrameResult | null>((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    this.queue.push(job);
    try {
      void this.ensureReady().then(() => this.pump()).catch(() => undefined);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
    this.pump();
    return result;
  }

  dispose() {
    this.fail(new Error('Live AI was stopped.'));
    this.listeners.clear();
  }
}

export const liveEnhancementEngine = new LiveEnhancementEngine();

if (import.meta.hot) import.meta.hot.dispose(() => liveEnhancementEngine.dispose());
