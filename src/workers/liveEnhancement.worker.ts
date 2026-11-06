/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web/webgpu';
import { liveEnhancementWasmThreads } from '../lib/liveEnhancement';
import type {
  LiveEnhancementBackend,
  LiveEnhancementWorkerRequest,
  LiveEnhancementWorkerResponse,
} from '../lib/liveEnhancementMessages';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const MODEL_SCALE = 4;
let session: ort.InferenceSession | null = null;
let backend: LiveEnhancementBackend = 'wasm';
let model: Uint8Array | null = null;
let wasmPaths = '';
let tileSize = 64;
let tilePad = 8;

function post(message: LiveEnhancementWorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

function clamp(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadModel(request: Extract<LiveEnhancementWorkerRequest, { type: 'init' }>) {
  post({ type: 'status', detail: 'Opening the verified AI model cache…' });
  let buffer: ArrayBuffer | null = null;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(request.modelCache);
    const cached = await cache.match(request.modelUrl);
    if (cached) buffer = await cached.arrayBuffer();
  } catch {
    cache = null;
  }

  if (!buffer) {
    post({ type: 'status', detail: 'Downloading the 4.9 MB Real-ESRGAN model…' });
    const response = await fetch(request.modelUrl, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`Model download failed (${response.status}).`);
    buffer = await response.arrayBuffer();
  }
  post({ type: 'status', detail: 'Verifying the AI model size and SHA-256…' });
  if (buffer.byteLength !== request.modelBytes) throw new Error('The AI model has an unexpected file size.');
  if (await sha256(buffer) !== request.modelSha256) throw new Error('The AI model failed its integrity check.');
  if (cache) {
    try {
      await cache.put(request.modelUrl, new Response(buffer.slice(0), {
        headers: { 'Content-Type': 'application/octet-stream' },
      }));
    } catch {
      // A verified in-memory model still works when persistent caching is unavailable.
    }
  }
  return new Uint8Array(buffer);
}

async function createSession(kind: LiveEnhancementBackend) {
  if (!model) throw new Error('The AI model is not loaded.');
  const label = kind.toUpperCase();
  post({ type: 'status', detail: `Creating the ${label} inference session…` });
  const executionProviders = kind === 'webgpu'
    ? [{ name: 'webgpu', preferredLayout: 'NCHW' as const }]
    : ['wasm' as const];
  const nextSession = await ort.InferenceSession.create(model, {
    executionProviders,
    graphOptimizationLevel: 'all',
  });
  const feeds: Record<string, ort.Tensor> = {};
  feeds[nextSession.inputNames[0]] = new ort.Tensor('float32', new Float32Array(3 * 16 * 16), [1, 3, 16, 16]);
  post({ type: 'status', detail: `Warming up the ${label} inference session…` });
  const warmup = await nextSession.run(feeds);
  Object.values(feeds).forEach((tensor) => tensor.dispose());
  Object.values(warmup).forEach((tensor) => tensor.dispose());
  return nextSession;
}

async function useBackend(kind: LiveEnhancementBackend) {
  const nextSession = await createSession(kind);
  if (session) await session.release();
  session = nextSession;
  backend = kind;
  tileSize = kind === 'webgpu' ? 128 : 64;
  tilePad = kind === 'webgpu' ? 12 : 8;
}

async function initialize(request: Extract<LiveEnhancementWorkerRequest, { type: 'init' }>) {
  wasmPaths = request.wasmPaths;
  ort.env.wasm.wasmPaths = wasmPaths;
  ort.env.wasm.numThreads = liveEnhancementWasmThreads(
    navigator.hardwareConcurrency,
    typeof SharedArrayBuffer !== 'undefined',
  );
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'warning';
  model = await loadModel(request);
  post({ type: 'status', detail: 'Starting the AI inference engine…' });

  const gpu = (navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<unknown | null> };
  }).gpu;
  let gpuAvailable = false;
  if (gpu) {
    try {
      post({ type: 'status', detail: 'Requesting a WebGPU adapter…' });
      gpuAvailable = Boolean(await gpu.requestAdapter());
    } catch {
      gpuAvailable = false;
    }
  }
  if (gpuAvailable) {
    try {
      await useBackend('webgpu');
      post({ type: 'ready', backend });
      return;
    } catch {
      // Some devices reject this model at runtime. WASM remains a functional fallback.
    }
  }
  await useBackend('wasm');
  post({ type: 'ready', backend });
}

async function runFrame(request: Extract<LiveEnhancementWorkerRequest, { type: 'frame' }>) {
  if (!session) throw new Error('The AI inference engine is not ready.');
  post({ type: 'status', detail: `Running ${backend.toUpperCase()} inference…` });
  const startedAt = performance.now();
  const pixels = new Uint8ClampedArray(request.pixels);
  const { width, height } = request;
  const outputWidth = width * MODEL_SCALE;
  const outputHeight = height * MODEL_SCALE;
  const outputPixels = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      const tileNumber = tileY * tilesX + tileX + 1;
      const threadDetail = backend === 'wasm' ? `, ${ort.env.wasm.numThreads} threads` : '';
      post({
        type: 'status',
        detail: `Running ${backend.toUpperCase()} tile ${tileNumber}/${tilesX * tilesY}${threadDetail}…`,
      });
      const sourceX = tileX * tileSize;
      const sourceY = tileY * tileSize;
      const x0 = Math.max(0, sourceX - tilePad);
      const y0 = Math.max(0, sourceY - tilePad);
      const x1 = Math.min(width, sourceX + tileSize + tilePad);
      const y1 = Math.min(height, sourceY + tileSize + tilePad);
      const tileWidth = x1 - x0;
      const tileHeight = y1 - y0;
      const tileData = new Float32Array(3 * tileWidth * tileHeight);
      const channelSize = tileWidth * tileHeight;

      for (let row = 0; row < tileHeight; row += 1) {
        for (let column = 0; column < tileWidth; column += 1) {
          const sourceIndex = ((y0 + row) * width + x0 + column) * 4;
          const targetIndex = row * tileWidth + column;
          tileData[targetIndex] = pixels[sourceIndex] / 255;
          tileData[channelSize + targetIndex] = pixels[sourceIndex + 1] / 255;
          tileData[channelSize * 2 + targetIndex] = pixels[sourceIndex + 2] / 255;
        }
      }

      const input = new ort.Tensor('float32', tileData, [1, 3, tileHeight, tileWidth]);
      let results: ort.InferenceSession.ReturnType | null = null;
      try {
        results = await session.run({ [inputName]: input });
        const output = results[outputName];
        const outputData = await output.getData() as unknown as ArrayLike<number>;
        const isNHWC = output.dims.length === 4 && output.dims[3] <= 4 && output.dims[1] > 4;
        const padLeft = (sourceX - x0) * MODEL_SCALE;
        const padTop = (sourceY - y0) * MODEL_SCALE;
        const copyWidth = Math.min(tileSize, width - sourceX) * MODEL_SCALE;
        const copyHeight = Math.min(tileSize, height - sourceY) * MODEL_SCALE;
        const outputTileWidth = tileWidth * MODEL_SCALE;
        const outputChannelSize = outputTileWidth * tileHeight * MODEL_SCALE;

        for (let row = 0; row < copyHeight; row += 1) {
          for (let column = 0; column < copyWidth; column += 1) {
            const targetIndex = ((sourceY * MODEL_SCALE + row) * outputWidth + sourceX * MODEL_SCALE + column) * 4;
            if (isNHWC) {
              const sourceIndex = ((padTop + row) * outputTileWidth + padLeft + column) * 3;
              outputPixels[targetIndex] = clamp(outputData[sourceIndex] * 255);
              outputPixels[targetIndex + 1] = clamp(outputData[sourceIndex + 1] * 255);
              outputPixels[targetIndex + 2] = clamp(outputData[sourceIndex + 2] * 255);
            } else {
              const sourceIndex = (padTop + row) * outputTileWidth + padLeft + column;
              outputPixels[targetIndex] = clamp(outputData[sourceIndex] * 255);
              outputPixels[targetIndex + 1] = clamp(outputData[outputChannelSize + sourceIndex] * 255);
              outputPixels[targetIndex + 2] = clamp(outputData[outputChannelSize * 2 + sourceIndex] * 255);
            }
            outputPixels[targetIndex + 3] = 255;
          }
        }
      } finally {
        input.dispose();
        if (results) Object.values(results).forEach((tensor) => tensor.dispose());
      }
    }
  }

  post({
    type: 'frameResult',
    jobId: request.jobId,
    pixels: outputPixels.buffer,
    width: outputWidth,
    height: outputHeight,
    backend,
    inferenceMs: performance.now() - startedAt,
  }, [outputPixels.buffer]);
}

scope.onmessage = async (event: MessageEvent<LiveEnhancementWorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'init') {
      await initialize(request);
    } else if (request.type === 'frame') {
      try {
        await runFrame(request);
      } catch (error) {
        if (backend !== 'webgpu') throw error;
        await useBackend('wasm');
        post({ type: 'backendChanged', backend });
        await runFrame(request);
      }
    } else {
      if (session) void session.release();
      session = null;
      model = null;
      scope.close();
    }
  } catch (error) {
    post({
      type: 'error',
      jobId: request.type === 'frame' ? request.jobId : undefined,
      message: error instanceof Error ? error.message : String(error),
      fatal: request.type !== 'frame',
    });
  }
};
