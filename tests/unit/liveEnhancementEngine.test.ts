import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveEnhancementEngine } from '../../src/lib/liveEnhancementEngine';
import type { LiveEnhancementWorkerRequest, LiveEnhancementWorkerResponse } from '../../src/lib/liveEnhancementMessages';

class MockWorker {
  static instances: MockWorker[] = [];
  onmessage: ((event: MessageEvent<LiveEnhancementWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: LiveEnhancementWorkerRequest[] = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(request: LiveEnhancementWorkerRequest) {
    this.messages.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  emit(message: LiveEnhancementWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<LiveEnhancementWorkerResponse>);
  }

  frameJobs() {
    return this.messages.filter((request) => request.type === 'frame');
  }
}

function image(): ImageData {
  return { data: new Uint8ClampedArray(16), width: 2, height: 2 } as ImageData;
}

function frameResult(jobId: number): LiveEnhancementWorkerResponse {
  return {
    type: 'frameResult', jobId, pixels: new Uint8ClampedArray(256).buffer,
    width: 8, height: 8, backend: 'wasm', inferenceMs: 12,
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('shared live AI scheduler', () => {
  let engine: LiveEnhancementEngine;

  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:4173/' },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
    engine = new LiveEnhancementEngine();
  });

  afterEach(() => {
    engine.dispose();
    vi.unstubAllGlobals();
  });

  it('shares one worker, sends initialization once, and returns complete frame results', async () => {
    const first = engine.process(image(), () => false);
    const second = engine.process(image(), () => false);
    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0];
    expect(worker.messages.filter((request) => request.type === 'init')).toHaveLength(1);
    worker.emit({ type: 'ready', backend: 'wasm' });
    await flush();
    const firstJob = (worker.frameJobs()[0] as { jobId: number }).jobId;
    worker.emit(frameResult(firstJob));
    await expect(first).resolves.toMatchObject({ width: 8, height: 8, backend: 'wasm', inferenceMs: 12 });
    await flush();
    const secondJob = (worker.frameJobs()[1] as { jobId: number }).jobId;
    worker.emit(frameResult(secondJob));
    await expect(second).resolves.toBeTruthy();
    expect(worker.frameJobs()).toHaveLength(2);
  });

  it('drops cancelled queued work before inference without cancelling the active frame', async () => {
    let cancelSecond = false;
    const first = engine.process(image(), () => false);
    const second = engine.process(image(), () => cancelSecond);
    const third = engine.process(image(), () => false);
    const worker = MockWorker.instances[0];
    worker.emit({ type: 'ready', backend: 'wasm' });
    await flush();
    cancelSecond = true;
    worker.emit(frameResult((worker.frameJobs()[0] as { jobId: number }).jobId));
    await expect(first).resolves.toBeTruthy();
    await expect(second).resolves.toBeNull();
    await flush();
    expect(worker.frameJobs()).toHaveLength(2);
    worker.emit(frameResult((worker.frameJobs()[1] as { jobId: number }).jobId));
    await expect(third).resolves.toBeTruthy();
  });

  it('caps queued frames and rejects overflow without displacing existing work', async () => {
    const jobs = [engine.process(image(), () => false)];
    const worker = MockWorker.instances[0];
    worker.emit({ type: 'ready', backend: 'wasm' });
    await flush();
    for (let index = 0; index < 4; index += 1) jobs.push(engine.process(image(), () => false));
    await expect(engine.process(image(), () => false)).rejects.toThrow('AI is busy with other players.');
    for (const [index, job] of jobs.entries()) {
      worker.emit(frameResult(index + 1));
      await expect(job).resolves.toBeTruthy();
      await flush();
    }
    expect(worker.frameJobs()).toHaveLength(5);
  });

  it('rejects pending work on a fatal failure and allows a clean retry', async () => {
    const failed = engine.process(image(), () => false);
    const queued = engine.process(image(), () => false);
    const firstWorker = MockWorker.instances[0];
    firstWorker.emit({ type: 'error', message: 'Model integrity failed', fatal: true });
    await expect(failed).rejects.toThrow('Model integrity failed');
    await expect(queued).rejects.toThrow('Model integrity failed');
    expect(firstWorker.terminated).toBe(true);

    const retry = engine.process(image(), () => false);
    expect(MockWorker.instances).toHaveLength(2);
    const secondWorker = MockWorker.instances[1];
    secondWorker.emit({ type: 'ready', backend: 'webgpu' });
    await flush();
    secondWorker.emit({
      type: 'frameResult', jobId: 3, pixels: new Uint8ClampedArray(256).buffer,
      width: 8, height: 8, backend: 'webgpu', inferenceMs: 12,
    });
    await expect(retry).resolves.toMatchObject({ backend: 'webgpu' });
  });

  it('reports the active backend and last worker stage when inference times out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      location: { href: 'http://localhost:4173/' },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    try {
      const pending = engine.process(image(), () => false);
      const worker = MockWorker.instances[0];
      worker.emit({ type: 'ready', backend: 'webgpu' });
      await flush();
      worker.emit({ type: 'status', detail: 'Running WEBGPU inference…' });
      const rejection = expect(pending).rejects.toThrow(
        'Backend: webgpu; last stage: Running WEBGPU inference…',
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await rejection;
      expect(worker.terminated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves a cancelled request immediately without starting a worker', async () => {
    await expect(engine.process(image(), () => true)).resolves.toBeNull();
    expect(MockWorker.instances).toHaveLength(0);
  });
});
