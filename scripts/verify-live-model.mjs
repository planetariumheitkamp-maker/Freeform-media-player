import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';

const outputDirectory = path.join(process.cwd(), 'verification', 'live-ai-real');
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

let server;
let browser;
const consoleMessages = [];
const failedRequests = [];
try {
  server = await preview({
    root: process.cwd(),
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  });
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText}`));
  await page.goto('http://127.0.0.1:4174/');

  const encoded = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Fixture canvas unavailable.');
    const stream = canvas.captureStream(12);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    const startedAt = performance.now();
    await new Promise((resolve) => {
      const draw = () => {
        const elapsed = performance.now() - startedAt;
        context.fillStyle = '#172019';
        context.fillRect(0, 0, 160, 90);
        context.strokeStyle = '#c5ffc3';
        context.lineWidth = 1;
        for (let x = 0; x <= 160; x += 8) {
          context.beginPath(); context.moveTo(x, 0); context.lineTo(x, 90); context.stroke();
        }
        for (let y = 0; y <= 90; y += 9) {
          context.beginPath(); context.moveTo(0, y); context.lineTo(160, y); context.stroke();
        }
        context.fillStyle = '#2cc9ff';
        context.fillRect(18 + (elapsed / 30) % 90, 27, 36, 36);
        context.fillStyle = '#ebebeb';
        context.font = '12px sans-serif';
        context.fillText('REAL AI', 100, 78);
        if (elapsed < 1400) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
    });
  });

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await (await chooser).setFiles({
    name: 'real-esrgan-verification.webm', mimeType: 'video/webm', buffer: Buffer.from(encoded, 'base64'),
  });
  const video = page.locator('.media-layer video');
  await page.waitForFunction(() => (document.querySelector('.media-layer video'))?.readyState >= 2);
  await page.getByRole('button', { name: 'Play / pause (Space)', exact: true }).click();
  await page.waitForFunction(() => (document.querySelector('.media-layer video'))?.paused === true);
  await video.evaluate((element) => new Promise((resolve) => {
    const media = element;
    media.currentTime = Math.min(0.8, media.duration || 0.8);
    if (media.seeking) media.addEventListener('seeked', () => resolve(), { once: true });
    else resolve();
  }));
  await page.getByLabel('Enhancement strength', { exact: true }).evaluate((input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByLabel('Live AI enhancement', { exact: true }).check();
  const status = page.locator('.live-enhancement-status');
  await status.waitFor({ state: 'visible' });
  const startedAt = Date.now();
  try {
    await page.waitForFunction(() => {
      const phase = document.querySelector('.live-enhancement-status')?.classList;
      return phase?.contains('active') || phase?.contains('error');
    }, undefined, { timeout: 150_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDirectory, 'real-model-timeout.png'), fullPage: true });
    throw new Error(`Real model did not finish: ${await status.textContent()}`, { cause: error });
  }
  const detail = await status.textContent();
  if (!(await status.evaluate((element) => element.classList.contains('active')))) {
    await page.screenshot({ path: path.join(outputDirectory, 'real-model-error.png'), fullPage: true });
    throw new Error(`Real model failed: ${detail}. Console: ${consoleMessages.join(' | ')}`);
  }

  const enhanced = page.locator('canvas[data-live-enhancement-for]');
  assert.equal(await enhanced.getAttribute('data-display-active'), 'true');
  const measurement = await enhanced.evaluate((canvas) => {
    const source = canvas;
    const context = source.getContext('2d');
    if (!context) throw new Error('Enhanced canvas is not readable.');
    const pixels = context.getImageData(0, 0, source.width, source.height).data;
    const colors = new Set();
    let nonBlack = 0;
    let opaque = 0;
    let total = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const color = `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`;
      colors.add(color);
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) nonBlack += 1;
      if (pixels[index + 3] === 255) opaque += 1;
      total += 1;
    }
    return {
      width: source.width,
      height: source.height,
      sampledColors: colors.size,
      nonBlackFraction: nonBlack / total,
      opaqueFraction: opaque / total,
      png: source.toDataURL('image/png'),
    };
  });
  assert.equal(measurement.width, 640);
  assert.equal(measurement.height, 360);
  assert.ok(measurement.sampledColors > 50, 'Expected a varied image, not a blank or constant canvas.');
  assert.ok(measurement.nonBlackFraction > 0.05, 'Expected non-black enhanced content.');
  assert.ok(measurement.opaqueFraction > 0.99, 'Expected an opaque enhanced frame.');
  await writeFile(path.join(outputDirectory, 'enhanced-frame.png'), Buffer.from(measurement.png.split(',')[1], 'base64'));
  delete measurement.png;

  const timingText = await page.locator('.live-enhancement-section .property-inline').textContent();
  const inferenceMs = Number(/([\d.]+)\s*ms/.exec(timingText || '')?.[1]);
  assert.ok(Number.isFinite(inferenceMs) && inferenceMs > 0, 'A real inference timing must be reported.');
  const acceleration = await page.evaluate(() => ({
    webGpuAdvertised: Boolean(navigator.gpu),
    hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
  }));
  await page.screenshot({ path: path.join(outputDirectory, 'real-model-active.png'), fullPage: true });
  const report = {
    result: 'passed',
    backend: detail?.split('·')[0]?.trim(),
    status: detail,
    source: { width: 160, height: 90 },
    output: measurement,
    inferenceMs,
    elapsedIncludingModelLoadMs: Date.now() - startedAt,
    acceleration,
    consoleMessages,
    failedRequests,
  };
  await writeFile(path.join(outputDirectory, 'measurement.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
