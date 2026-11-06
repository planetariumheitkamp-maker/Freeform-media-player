export type LiveEnhancementBackend = 'webgpu' | 'wasm';

export interface LiveEnhancementFrameResult {
  pixels: ArrayBuffer;
  width: number;
  height: number;
  backend: LiveEnhancementBackend;
  inferenceMs: number;
}

export type LiveEnhancementWorkerRequest =
  | {
    type: 'init';
    modelUrl: string;
    modelBytes: number;
    modelSha256: string;
    modelCache: string;
    wasmPaths: string;
  }
  | {
    type: 'frame';
    jobId: number;
    pixels: ArrayBuffer;
    width: number;
    height: number;
  }
  | { type: 'dispose' };

export type LiveEnhancementWorkerResponse =
  | { type: 'status'; detail: string }
  | { type: 'ready'; backend: LiveEnhancementBackend }
  | { type: 'backendChanged'; backend: LiveEnhancementBackend }
  | ({ type: 'frameResult'; jobId: number } & LiveEnhancementFrameResult)
  | { type: 'error'; jobId?: number; message: string; fatal: boolean };
