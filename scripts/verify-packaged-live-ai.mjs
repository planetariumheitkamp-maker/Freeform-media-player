import { expect, _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDirectory = path.join(root, 'verification', 'live-ai-packaged');
const profileDirectory = path.join(root, 'test-results', 'desktop-live-ai-profile');
const executablePath = path.resolve(root, process.argv[2]
  ?? path.join('release', 'win-unpacked', 'Freeform Live AI.exe'));

await rm(outputDirectory, { recursive: true, force: true });
await rm(profileDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

let electronApp;
let server;
const fixture = await readFile(path.join(root, 'tests', 'fixtures', 'live-ai-fixture.webm'));
assert.ok(fixture.byteLength > 0);
const consoleMessages = [];
const failedRequests = [];

try {
  electronApp = await electron.launch({
    executablePath,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')),
    args: [
      `--user-data-dir=${profileDirectory}`,
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--autoplay-policy=no-user-gesture-required',
    ],
    timeout: 60_000,
  });
  const page = await electronApp.firstWindow();
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText}`));
  await expect(page.locator('canvas.warp-canvas')).toBeVisible({ timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.freeform?.isDesktop), true);

  server = createServer((request, response) => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'no-store',
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }
    if (request.url !== '/fixture.webm' || !['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(404, corsHeaders);
      response.end();
      return;
    }
    const range = request.headers.range ? /^bytes=(\d+)-(\d*)$/.exec(request.headers.range) : null;
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), fixture.length - 1) : fixture.length - 1;
    if (start >= fixture.length || end < start) {
      response.writeHead(416, { ...corsHeaders, 'Content-Range': `bytes */${fixture.length}` });
      response.end();
      return;
    }
    const content = fixture.subarray(start, end + 1);
    response.writeHead(range ? 206 : 200, {
      ...corsHeaders,
      'Content-Type': 'video/webm',
      'Content-Length': content.length,
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${fixture.length}` } : {}),
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const mediaUrl = `http://127.0.0.1:${address.port}/fixture.webm`;

  await page.getByRole('button', { name: 'Stream', exact: true }).click();
  await page.getByLabel('Media URL', { exact: true }).fill(mediaUrl);
  await page.getByRole('button', { name: 'Add stream', exact: true }).click();
  const video = page.locator('.media-layer video');
  await expect(video).toBeVisible();
  try {
    await expect.poll(() => video.evaluate((element) => element.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  } catch (error) {
    const sources = await page.locator('.source-list').textContent();
    const mediaState = await video.count() ? await video.evaluate((element) => ({
      readyState: element.readyState,
      networkState: element.networkState,
      currentSrc: element.currentSrc,
      error: element.error?.message ?? null,
    })) : null;
    await page.screenshot({ path: path.join(outputDirectory, 'packaged-video-error.png'), fullPage: true });
    throw new Error(`Packaged video did not decode: ${JSON.stringify({
      mediaState, sources, consoleMessages, failedRequests,
    })}`, { cause: error });
  }
  if (await video.evaluate((element) => !element.paused)) {
    await page.getByRole('button', { name: 'Play / pause (Space)', exact: true }).click();
  }
  await expect.poll(() => video.evaluate((element) => element.paused), { timeout: 30_000 }).toBe(true);
  await video.evaluate((element) => new Promise((resolve) => {
    element.currentTime = Math.min(0.8, element.duration || 0.8);
    if (element.seeking) element.addEventListener('seeked', () => resolve(), { once: true });
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
  const startedAt = Date.now();
  try {
    await page.waitForFunction(() => {
      const phase = document.querySelector('.live-enhancement-status')?.classList;
      return phase?.contains('active') || phase?.contains('error');
    }, undefined, { timeout: 150_000 });
  } catch (error) {
    await page.screenshot({ path: path.join(outputDirectory, 'packaged-model-timeout.png'), fullPage: true });
    throw new Error(`Packaged model did not finish: ${await status.textContent()}`, { cause: error });
  }
  const detail = await status.textContent();
  if (!(await status.evaluate((element) => element.classList.contains('active')))) {
    await page.screenshot({ path: path.join(outputDirectory, 'packaged-model-error.png'), fullPage: true });
    throw new Error(`Packaged model failed: ${detail}. Console: ${consoleMessages.join(' | ')}`);
  }

  const enhanced = page.locator('canvas[data-live-enhancement-for]');
  await expect(enhanced).toHaveAttribute('data-display-active', 'true');
  const measurement = await enhanced.evaluate((canvas) => {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Enhanced canvas is not readable.');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let nonBlack = 0;
    let opaque = 0;
    let total = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) nonBlack += 1;
      if (pixels[index + 3] === 255) opaque += 1;
      total += 1;
    }
    return {
      width: canvas.width,
      height: canvas.height,
      sampledColors: colors.size,
      nonBlackFraction: nonBlack / total,
      opaqueFraction: opaque / total,
      png: canvas.toDataURL('image/png'),
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
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined',
    userAgent: navigator.userAgent,
  }));
  await page.screenshot({ path: path.join(outputDirectory, 'packaged-model-active.png'), fullPage: true });
  const report = {
    result: 'passed',
    executablePath,
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
  assert.deepEqual(consoleMessages.filter((message) => message.startsWith('error:') || message.startsWith('pageerror:')), []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (electronApp) await electronApp.close();
  if (server) {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await rm(profileDirectory, { recursive: true, force: true });
}
