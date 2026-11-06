import { expect, test, type Page } from '@playwright/test';

const AUTOSAVE_KEY = 'freeform.workspace.autosave.v1';

async function installMockWorker(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const testWindow = window as typeof window & { __liveAiMode?: string };
    testWindow.__liveAiMode = 'ready';
    class MockEnhancementWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;

      constructor(url: string | URL, options?: WorkerOptions) {
        if (!String(url).includes('liveEnhancement.worker')) return new NativeWorker(url, options);
      }

      postMessage(request: any) {
        if (request.type === 'init') {
          setTimeout(() => this.onmessage?.({ data: { type: 'ready', backend: 'wasm' } } as MessageEvent), 0);
          return;
        }
        if (request.type !== 'frame') return;
        const mode = testWindow.__liveAiMode;
        if (mode === 'error') {
          setTimeout(() => this.onmessage?.({ data: {
            type: 'error', jobId: request.jobId, message: 'Synthetic inference failure', fatal: false,
          } } as MessageEvent), 20);
          return;
        }
        setTimeout(() => {
          const width = request.width * 4;
          const height = request.height * 4;
          const pixels = new Uint8ClampedArray(width * height * 4);
          for (let index = 0; index < pixels.length; index += 4) {
            pixels[index] = 40;
            pixels[index + 1] = 180;
            pixels[index + 2] = 110;
            pixels[index + 3] = 255;
          }
          this.onmessage?.({ data: {
            type: 'frameResult', jobId: request.jobId, pixels: pixels.buffer,
            width, height, backend: 'wasm', inferenceMs: mode === 'late' ? 600 : 12,
          } } as MessageEvent);
        }, mode === 'late' ? 600 : 20);
      }

      terminate() {}
    }
    window.Worker = MockEnhancementWorker as unknown as typeof Worker;
  });
}

async function videoFixture(page: Page): Promise<Buffer> {
  const encoded = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context || !canvas.captureStream || typeof MediaRecorder === 'undefined') {
      reject(new Error('MediaRecorder fixture generation is unavailable.'));
      return;
    }
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    let frame = 0;
    let interval = 0;
    const draw = () => {
      context.fillStyle = '#172019';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#c5ffc3';
      context.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += 10) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 10) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
      }
      context.fillStyle = '#2cc9ff';
      context.fillRect(10 + (frame * 5) % 110, 30, 30, 30);
      frame += 1;
      track.requestFrame?.();
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      window.clearInterval(interval);
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      reject(new Error('MediaRecorder fixture generation failed.'));
    };
    recorder.onstop = () => {
      window.clearInterval(interval);
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (!blob.size) {
        reject(new Error('MediaRecorder produced an empty video fixture.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Generated fixture could not be read.'));
      reader.readAsDataURL(blob);
    };
    draw();
    recorder.start();
    interval = window.setInterval(draw, 50);
    window.setTimeout(() => recorder.stop(), 1800);
  }));
  return Buffer.from(encoded, 'base64');
}

async function openVideo(page: Page) {
  const buffer = await videoFixture(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await (await chooser).setFiles({ name: 'live-ai-test.webm', mimeType: 'video/webm', buffer });
  await expect(page.locator('.media-layer video')).toBeVisible();
  await expect.poll(() => page.locator('.media-layer video').evaluate((video) => (video as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);
}

async function readProject(page: Page): Promise<any> {
  return page.evaluate((key) => {
    const generations = Object.keys(localStorage)
      .filter((candidate) => candidate.startsWith(`${key}.`))
      .map((candidate) => {
        try { return JSON.parse(localStorage.getItem(candidate) ?? '{}'); } catch { return null; }
      })
      .filter((envelope) => envelope?.version === 1 && typeof envelope.content === 'string')
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return JSON.parse(generations[0]?.content ?? localStorage.getItem(key) ?? '{}');
  }, AUTOSAVE_KEY);
}

async function setRange(page: Page, label: string, value: number) {
  await page.getByRole('slider', { name: label, exact: true }).evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

function monitorErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return () => expect(errors).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await installMockWorker(page);
});

test('per-player live AI settings switch the video texture and survive reload', async ({ page }, testInfo) => {
  const assertNoErrors = monitorErrors(page);
  await page.goto('/');
  await expect(page.getByLabel('Live AI enhancement', { exact: true })).toBeDisabled();
  await openVideo(page);
  await expect(page.getByLabel('Live AI enhancement', { exact: true })).toBeEnabled();
  await page.getByLabel('Live AI enhancement', { exact: true }).check();
  const enhanced = page.locator('canvas[data-live-enhancement-for]');
  await expect(enhanced).toHaveAttribute('data-display-active', 'true');
  await expect(enhanced).toHaveJSProperty('width', 640);
  await expect(enhanced).toHaveJSProperty('height', 360);
  await expect(page.locator('.live-enhancement-status')).toContainText('WASM');
  await setRange(page, 'Enhancement strength', 0.35);
  await page.getByLabel('AI input size', { exact: true }).selectOption('480');
  await expect.poll(async () => (await readProject(page)).players?.[0]?.enhancement).toEqual({ enabled: true, strength: 0.35, inputSize: 480 });
  await page.screenshot({ path: testInfo.outputPath('live-ai-active.png') });

  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  await expect(page.getByLabel('Live AI enhancement', { exact: true })).not.toBeChecked();
  await page.getByLabel('Live AI enhancement', { exact: true }).check();
  await setRange(page, 'Enhancement strength', 0.65);
  await expect(page.locator('canvas[data-live-enhancement-for]')).toHaveCount(2);
  await expect.poll(async () => (await readProject(page)).players?.map((player: any) => player.enhancement)).toEqual([
    { enabled: true, strength: 0.35, inputSize: 480 },
    { enabled: true, strength: 0.65, inputSize: 320 },
  ]);

  await page.reload();
  await expect(page.getByLabel('Enhancement strength', { exact: true })).toHaveValue('0.35');
  await expect(page.getByLabel('Live AI enhancement', { exact: true })).toBeChecked();
  await page.locator('.player-row').nth(1).click();
  await expect(page.getByLabel('Enhancement strength', { exact: true })).toHaveValue('0.65');
  await page.locator('.player-row').first().click();
  await expect(page.getByLabel('Enhancement strength', { exact: true })).toHaveValue('0.35');
  await expect(page.getByLabel('AI input size', { exact: true })).toHaveValue('480');
  await page.getByLabel('Live AI enhancement', { exact: true }).uncheck();
  await expect.poll(async () => (await readProject(page)).players?.map((player: any) => player.enhancement.enabled)).toEqual([false, true]);
  assertNoErrors();
});

test('late playing frames fall back to video and a slow paused frame is accepted', async ({ page }) => {
  const assertNoErrors = monitorErrors(page);
  await page.goto('/');
  await openVideo(page);
  await page.evaluate(() => { (window as any).__liveAiMode = 'late'; });
  await page.getByLabel('Live AI enhancement', { exact: true }).check();
  await expect(page.locator('.live-enhancement-status')).toContainText('FALLBACK', { timeout: 10_000 });
  await expect(page.locator('canvas[data-live-enhancement-for]')).toHaveAttribute('data-display-active', 'false');
  await page.getByRole('button', { name: 'Play / pause (Space)', exact: true }).click();
  await expect.poll(() => page.locator('.media-layer video').evaluate((video) => (video as HTMLVideoElement).paused)).toBe(true);
  const time = await page.locator('.media-layer video').evaluate((video) => (video as HTMLVideoElement).currentTime);
  await page.locator('.timeline').evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, Math.min(1, time + 0.2));
  await expect(page.locator('.live-enhancement-status')).toContainText('paused frame', { timeout: 10_000 });
  await expect(page.locator('canvas[data-live-enhancement-for]')).toHaveAttribute('data-display-active', 'true');
  assertNoErrors();
});

test('inference errors retain original video and explain the fallback', async ({ page }) => {
  const assertNoErrors = monitorErrors(page);
  await page.goto('/');
  await openVideo(page);
  await page.evaluate(() => { (window as any).__liveAiMode = 'error'; });
  await page.getByLabel('Live AI enhancement', { exact: true }).check();
  await expect(page.locator('.live-enhancement-status')).toContainText('ERROR');
  await expect(page.locator('.live-enhancement-status')).toContainText('Synthetic inference failure');
  await expect(page.locator('canvas[data-live-enhancement-for]')).toHaveAttribute('data-display-active', 'false');
  await expect(page.getByText('Live AI could not enhance this player', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.media-layer video').evaluate((video) => (video as HTMLVideoElement).paused)).toBe(false);
  assertNoErrors();
});
