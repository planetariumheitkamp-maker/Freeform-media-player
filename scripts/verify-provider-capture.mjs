import { expect, _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const executablePath = require('electron');
const outputDirectory = path.join(root, 'artifacts', 'provider-capture');
const profileDirectory = path.join(root, 'test-results', 'provider-capture-profile');
const autosaveKey = 'freeform.workspace.autosave.v1';
const embedUrl = 'https://vidqueen.st/embed/movie/603?autoplay=false';
const providerPattern = `<!doctype html>
<html><head><meta charset="utf-8"><title>Vidqueen visible-window test</title></head>
<body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:#101820;color:white;font-family:monospace">
<div style="box-sizing:border-box;width:100%;height:100%;padding:34px;background:linear-gradient(135deg,#e63946 0 25%,#f1c453 25% 50%,#2a9d8f 50% 75%,#287bc1 75%);border:18px solid #f5f5f5">
<div style="height:100%;box-sizing:border-box;border:5px solid #101820;display:grid;grid-template-rows:1fr auto 1fr;place-items:center;background:rgba(16,24,32,.28)">
<strong style="font-size:42px;padding:14px;background:#101820">VISIBLE PROVIDER CAPTURE</strong>
<span style="font-size:24px;padding:12px;background:#f5f5f5;color:#101820">STATIC COLOR TEST / TMDB 603</span>
<strong style="font-size:34px;padding:14px;background:#101820">REAL MEDIASTREAM → MESH</strong>
</div></div></body></html>`;

await rm(outputDirectory, { recursive: true, force: true });
await rm(profileDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const runtimeErrors = [];
const checks = [];
let electronApp;
let providerPage;

function readProject(page) {
  return page.evaluate((key) => {
    const generations = Object.keys(localStorage)
      .filter((candidate) => candidate.startsWith(`${key}.`))
      .map((candidate) => {
        try { return JSON.parse(localStorage.getItem(candidate) ?? '{}'); } catch { return null; }
      })
      .filter((envelope) => envelope?.version === 1 && typeof envelope.content === 'string')
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return JSON.parse(generations[0]?.content ?? localStorage.getItem(key) ?? '{}');
  }, autosaveKey);
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

try {
  electronApp = await electron.launch({
    executablePath,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')),
    args: [
      '.',
      `--user-data-dir=${profileDirectory}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--autoplay-policy=no-user-gesture-required',
    ],
    timeout: 60_000,
  });

  const page = await electronApp.firstWindow();
  page.on('pageerror', (error) => runtimeErrors.push(`Main page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`Main console: ${message.text()}`);
  });
  await expect(page.locator('canvas.warp-canvas')).toBeVisible({ timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.freeform?.isDesktop), true);

  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Providers', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Provider', exact: true })).toHaveValue('vidqueen');
  const adBlockToggle = page.getByLabel('Block matching ad and tracker requests', { exact: true });
  await expect(adBlockToggle).toBeChecked();
  await page.getByText('Edit blocked domains', { exact: false }).click();
  const domainList = page.getByLabel('Blocked domains', { exact: true });
  await domainList.fill(`${await domainList.inputValue()}\nads.example.com`);
  await page.getByRole('button', { name: 'Apply rules', exact: true }).click();
  await expect(page.locator('.provider-ad-block-message')).toContainText('Saved. Filtering changes apply to new requests immediately.');
  await page.getByText('Edit blocked domains', { exact: false }).click();
  checks.push('Desktop filtering defaults to enabled and accepts a saved custom hostname rule.');

  await page.getByLabel('TMDB ID', { exact: true }).fill('603');
  await page.getByLabel(/I confirm I am authorized/).check();
  const requestFailures = [];
  const requestedUrls = [];
  const providerWindowEvent = electronApp.waitForEvent('window', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Open player window', exact: true }).click();
  providerPage = await providerWindowEvent;
  providerPage.on('pageerror', (error) => runtimeErrors.push(`Provider page: ${error.message}`));
  providerPage.on('request', (request) => requestedUrls.push(request.url()));
  providerPage.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  await providerPage.route('https://vidqueen.st/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: providerPattern });
  });
  await providerPage.route('https://media.example.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'video/mp2t', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'MEDIA-OK' });
  });
  await providerPage.route('https://ads.example.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'AD-ALLOWED' });
  });
  await providerPage.reload();
  await expect(providerPage).toHaveURL(embedUrl);
  await expect(providerPage.getByText('VISIBLE PROVIDER CAPTURE')).toBeVisible();
  await expect(providerPage.getByText('STATIC COLOR TEST / TMDB 603')).toBeVisible();
  await expect(page.locator('.catalog-shell iframe')).toHaveCount(0);
  const webPreferences = await electronApp.evaluate(({ BrowserWindow }) => {
    const providerWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('https://vidqueen.st/'));
    if (!providerWindow) return null;
    const preferences = providerWindow.webContents.getLastWebPreferences();
    return {
      sandbox: preferences.sandbox,
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      webSecurity: preferences.webSecurity,
      preload: preferences.preload,
    };
  });
  assert.ok(webPreferences, 'Provider BrowserWindow preferences were unavailable.');
  assert.equal(webPreferences.sandbox, false);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.nodeIntegration, false);
  assert.equal(webPreferences.webSecurity, true);
  assert.equal(webPreferences.preload, undefined);
  const remoteIsolation = await providerPage.evaluate(() => ({ requireType: typeof require, bridgeType: typeof window.freeform }));
  assert.equal(remoteIsolation.requireType, 'undefined');
  assert.equal(remoteIsolation.bridgeType, 'undefined');
  await providerPage.screenshot({ path: path.join(outputDirectory, 'visible-provider-window.png') });
  checks.push('Authorized TMDB submission opens a dedicated provider window with sandbox disabled, context isolation and web security enabled, and no Node or Freeform bridge.');

  await providerPage.evaluate(async () => {
    try { await fetch('https://ads.example.com/banner.js'); } catch { /* The request blocker is expected to reject this fetch. */ }
  });
  await expect.poll(() => requestFailures.find((failure) => failure.url === 'https://ads.example.com/banner.js')?.error).toBe('net::ERR_BLOCKED_BY_CLIENT');
  const allowedMedia = await providerPage.evaluate(async () => {
    const response = await fetch('https://media.example.com/movie/segment.ts');
    if (!response.ok) throw new Error(`Media request returned ${response.status}`);
    return response.text();
  });
  assert.equal(allowedMedia, 'MEDIA-OK');
  assert.ok(requestedUrls.includes(embedUrl), 'Provider document did not load.');
  assert.ok(requestedUrls.includes('https://media.example.com/movie/segment.ts'), 'Media request did not run.');
  checks.push('Electron webRequest cancels a matching ad request with ERR_BLOCKED_BY_CLIENT while the provider document and media CDN request succeed.');

  await adBlockToggle.uncheck();
  await expect(page.locator('.provider-ad-block-message')).toContainText('Saved. Filtering changes apply to new requests immediately.');
  const allowedAd = await providerPage.evaluate(async () => {
    const response = await fetch('https://ads.example.com/banner.js');
    if (!response.ok) throw new Error(`Ad test request returned ${response.status}`);
    return response.text();
  });
  assert.equal(allowedAd, 'AD-ALLOWED');
  await adBlockToggle.check();
  await expect(page.locator('.provider-ad-block-message')).toContainText('Saved. Filtering changes apply to new requests immediately.');
  const savedFiltering = await page.evaluate(() => JSON.parse(localStorage.getItem('freeform.provider-ad-block.v1') ?? '{}'));
  assert.equal(savedFiltering.enabled, true);
  assert.ok(savedFiltering.rules.includes('ads.example.com'));
  await page.screenshot({ path: path.join(outputDirectory, 'provider-filter-settings.png') });
  checks.push('Disabling filtering immediately permits the same ad request; re-enabling and domain rules persist in the application profile.');

  await expect(page.getByRole('button', { name: 'Add captured window to mesh', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add captured window to mesh', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Providers', exact: true })).toHaveCount(0, { timeout: 30_000 });
  const video = page.locator('.media-layer video');
  await expect(video).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(() => video.evaluate((element) => element.readyState), { timeout: 30_000 }).toBeGreaterThan(1);
  await expect.poll(() => video.evaluate((element) => element.videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => video.evaluate((element) => element.currentTime), { timeout: 30_000 }).toBeGreaterThan(0);
  const mediaState = await video.evaluate((element) => {
    const stream = element.srcObject;
    const track = stream?.getVideoTracks()[0];
    window.__providerCaptureTrack = track;
    return {
      isStream: stream instanceof MediaStream,
      trackState: track?.readyState,
      muted: track?.muted,
      width: element.videoWidth,
      height: element.videoHeight,
      currentTime: element.currentTime,
      audioTracks: stream?.getAudioTracks().length,
    };
  });
  assert.equal(mediaState.isStream, true);
  assert.equal(mediaState.trackState, 'live');
  assert.equal(mediaState.audioTracks, 0);
  checks.push(`Real captured MediaStream is live at ${mediaState.width} × ${mediaState.height}, without requested audio.`);

  const pixelStats = await video.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Test canvas unavailable');
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let nonBlack = 0;
    for (let index = 0; index < pixels.length; index += 64) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red + green + blue > 45) nonBlack += 1;
      colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
    return { nonBlack, variedColors: colors.size };
  });
  assert.ok(pixelStats.nonBlack > 50, `Capture is blank: ${JSON.stringify(pixelStats)}`);
  assert.ok(pixelStats.variedColors >= 8, `Capture lacks color variation: ${JSON.stringify(pixelStats)}`);
  checks.push(`Captured video pixels are nonblank and color-varied (${pixelStats.variedColors} sampled colors).`);

  // Saved projects intentionally serialize live providers as disconnected.
  await expect.poll(async () => (await readProject(page)).sources?.some((source) => source.kind === 'provider')).toBe(true);
  const beforeProject = await readProject(page);
  const providerSource = beforeProject.sources.find((source) => source.kind === 'provider');
  const providerPlayer = beforeProject.players.find((player) => player.sourceId === providerSource.id);
  assert.ok(providerPlayer, 'Provider-backed mesh player was not saved.');
  assert.equal(providerSource.providerUrl, embedUrl);
  assert.equal(providerSource.providerKind, 'builtin');
  assert.equal(providerSource.providerName, 'Vidqueen');
  assert.equal(providerSource.withAudio, false);

  const canvas = page.locator('canvas.warp-canvas');
  const beforeWarpFrame = await canvas.evaluate((element) => element.toDataURL());
  const beforeCorners = JSON.stringify(providerPlayer.quickCorners);
  const corner = await page.locator('.node-hit.node-corner').first().boundingBox();
  if (!corner) throw new Error('Provider mesh corner was not rendered.');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 48, corner.y + corner.height / 2 + 27, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => {
    const project = await readProject(page);
    return JSON.stringify(project.players.find((player) => player.id === providerPlayer.id)?.quickCorners);
  }).not.toBe(beforeCorners);
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL()), { timeout: 30_000 }).not.toBe(beforeWarpFrame);
  checks.push('Dragging a mesh corner changes saved quickCorners and the captured WebGL output.');

  const beforeBrightnessFrame = await canvas.evaluate((element) => element.toDataURL());
  await setRange(page, 'input[data-visual-field="brightness"]', 1.45);
  await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('1.45');
  await expect.poll(async () => {
    const project = await readProject(page);
    return project.players.find((player) => player.id === providerPlayer.id)?.visual?.brightness;
  }).toBe(1.45);
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL()), { timeout: 30_000 }).not.toBe(beforeBrightnessFrame);
  checks.push('Brightness changes the provider player’s saved visual settings and rendered canvas.');

  await page.screenshot({ path: path.join(outputDirectory, 'provider-mesh-warped.png') });
  assert.deepEqual(runtimeErrors, [], 'Electron runtime emitted errors');
  checks.push('No main-window or provider-page runtime errors occurred.');

  await providerPage.close();
  providerPage = undefined;
  await expect.poll(() => page.evaluate(() => window.__providerCaptureTrack?.readyState), { timeout: 30_000 }).toBe('ended');
  await expect.poll(async () => {
    const project = await readProject(page);
    return project.sources.find((source) => source.id === providerSource.id)?.connected;
  }).toBe(false);
  await expect(video).toHaveCount(0);
  checks.push('Closing the provider window ends the capture track and marks the source disconnected.');

  const providerRow = page.locator('.source-row').filter({ hasText: 'Vidqueen — TMDB movie 603' });
  await providerRow.getByTitle('Remove source', { exact: true }).click();
  await expect(providerRow).toHaveCount(0);
  await expect.poll(async () => (await readProject(page)).sources?.some((source) => source.id === providerSource.id)).toBe(false);
  checks.push('Removing the provider source cleans up its workspace entry.');

  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify({
    status: 'passed',
    mediaState,
    pixelStats,
    checks,
    screenshots: ['visible-provider-window.png', 'provider-filter-settings.png', 'provider-mesh-warped.png'],
    limitations: [
      'Provider HTML, media, and advertising responses were mocked; real Vidqueen media playback was not tested.',
      'No getDisplayMedia or MediaStream mocking was used.',
      'Audio capture, protected content, real provider frame rate, and Windows 10 behavior were not verified.',
    ],
  }, null, 2));
  console.log(JSON.stringify({ status: 'passed', mediaState, pixelStats, checks }, null, 2));
} catch (error) {
  await writeFile(path.join(outputDirectory, 'failure.txt'), String(error?.stack ?? error));
  throw error;
} finally {
  try { if (providerPage && !providerPage.isClosed()) await providerPage.close(); } catch { /* app close follows */ }
  if (electronApp) await electronApp.close();
}
