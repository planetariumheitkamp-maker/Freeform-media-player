import { expect, _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const baseline = process.argv.includes('--baseline');
const outputDirectory = path.join(root, 'artifacts', 'vidrift-popup-check');
const profileDirectory = path.join(root, 'test-results', 'vidrift-popup-profile');
const embedUrl = 'https://embed.vidrift.net/embed/movie/1368337';
const probeFeatures = 'width=1,height=1,left=-9999,top=-9999';
const errorText = 'Remove sandboxing to enable playback.';
const controlledHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>Vidrift popup capability reproduction</title></head>
<body style="margin:0;background:#101820;color:#f5f5f5;font:18px system-ui;display:grid;place-items:center;min-height:100vh">
<main><h1>Vidrift popup capability reproduction</h1><p id="status">READY FOR PLAYBACK</p>
<video id="video" muted playsinline style="width:480px;max-width:90vw;background:#263c48"></video>
<button aria-label="Play or pause" style="padding:16px">Play or pause</button>
<button id="external" style="padding:16px">Test blocked external popup</button></main>
<script>
const canvas = document.createElement('canvas');
canvas.width = 640; canvas.height = 360;
const context = canvas.getContext('2d');
let frame = 0;
setInterval(() => {
  context.fillStyle = 'hsl(' + (frame++ % 360) + ' 65% 45%)';
  context.fillRect(0, 0, 640, 360);
  context.fillStyle = '#fff'; context.font = '36px sans-serif';
  context.fillText('PLAYER STILL FUNCTIONAL', 55, 190);
}, 40);
const video = document.getElementById('video');
video.srcObject = canvas.captureStream(15);
let checked = false;
document.addEventListener('click', () => {
  if (checked) return;
  checked = true;
  const popup = window.open('', '_blank', '${probeFeatures}');
  window.__probeReturned = Boolean(popup);
  if (!popup) {
    video.pause(); video.srcObject = null;
    document.body.innerHTML = '<div>${errorText}</div><div>Visit vidrift.in for more info.</div>';
    return;
  }
  try { popup.blur(); window.focus(); } catch {}
  window.__nestedPopupReturned = Boolean(popup.open('https://example.com/nested-popup', '_blank'));
  try { popup.location.href = 'https://example.com/blocked-child-navigation'; } catch {}
  const close = () => { try { if (!popup.closed) popup.close(); } catch {} };
  close(); [0, 30, 120, 400].forEach((delay) => setTimeout(close, delay));
  document.getElementById('status').textContent = 'PLAYBACK ACTIVE';
  void video.play();
}, true);
document.getElementById('external').addEventListener('click', () => {
  window.__externalPopupReturned = Boolean(window.open('https://example.com/external-popup', '_blank', '${probeFeatures}'));
});
</script></body></html>`;

await rm(outputDirectory, { recursive: true, force: true });
await rm(profileDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

let electronApp;
let providerPage;
const report = {
  mode: baseline ? 'baseline-failure-reproduction' : 'fixed-behavior-verification',
  provider: 'vidrift',
  tmdbId: '1368337',
  embedUrl,
  probeFeatures,
  runtimeErrors: [],
  controlled: {},
  live: {},
};
const saveReport = () => writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
const windowState = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({
  id: window.id,
  url: window.webContents.getURL(),
  visible: window.isVisible(),
  destroyed: window.isDestroyed(),
})));

try {
  electronApp = await electron.launch({
    executablePath: require('electron'),
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
  page.on('pageerror', (error) => report.runtimeErrors.push(`Main: ${error.message}`));
  await expect(page.locator('canvas.warp-canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('vidrift');
  await page.getByLabel('TMDB ID', { exact: true }).fill('1368337');
  await page.getByLabel(/I confirm I am authorized/).check();
  if (!baseline) {
    await electronApp.evaluate(({ app }) => {
      globalThis.__vidriftPopupDecisions = [];
      app.on('web-contents-created', (_event, contents) => {
        const nativeSetWindowOpenHandler = contents.setWindowOpenHandler.bind(contents);
        contents.setWindowOpenHandler = (handler) => nativeSetWindowOpenHandler((details) => {
          const response = handler(details);
          if (contents.getURL().startsWith('https://embed.vidrift.net/')) {
            globalThis.__vidriftPopupDecisions.push({
              url: details.url,
              frameName: details.frameName,
              features: details.features,
              disposition: details.disposition,
              action: response.action,
            });
          }
          return response;
        });
      });
    });
  }
  const providerWindowEvent = electronApp.waitForEvent('window', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Open player window', exact: true }).click();
  providerPage = await providerWindowEvent;
  providerPage.on('pageerror', (error) => report.runtimeErrors.push(`Provider: ${error.message}`));
  await providerPage.route(embedUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: controlledHtml }));
  if (baseline) {
    // Preserve the original deny behavior while observing Electron's exact
    // normalization of the native popup request. Production code is untouched.
    await electronApp.evaluate(({ BrowserWindow }) => {
      globalThis.__vidriftPopupRequests = [];
      const contents = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('https://embed.vidrift.net/'))?.webContents;
      contents?.setWindowOpenHandler((details) => {
        globalThis.__vidriftPopupRequests.push({
          url: details.url,
          frameName: details.frameName,
          features: details.features,
          disposition: details.disposition,
        });
        return { action: 'deny' };
      });
    });
  }
  if (!baseline) {
    await electronApp.evaluate(({ BrowserWindow }) => {
      globalThis.__vidriftProbeWindowSnapshots = [];
      const contents = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('https://embed.vidrift.net/'))?.webContents;
      contents?.on('did-create-window', (child) => {
        const preferences = child.webContents.getLastWebPreferences();
        globalThis.__vidriftProbeWindowSnapshots.push({
          visible: child.isVisible(),
          sandbox: preferences.sandbox,
          contextIsolation: preferences.contextIsolation,
          nodeIntegration: preferences.nodeIntegration,
          webSecurity: preferences.webSecurity,
          preload: preferences.preload,
        });
      });
    });
  }
  await providerPage.reload();
  await expect(providerPage.getByRole('heading', { name: 'Vidrift popup capability reproduction' })).toBeVisible();
  await expect.poll(() => providerPage.locator('video').evaluate((video) => video.readyState)).toBe(4);
  await providerPage.getByRole('button', { name: 'Play or pause', exact: true }).click();
  await providerPage.waitForTimeout(1_500);
  report.controlled = await providerPage.evaluate(() => ({
    bodyText: document.body.innerText,
    probeReturned: window.__probeReturned ?? null,
    nestedPopupReturned: window.__nestedPopupReturned ?? null,
    videos: [...document.querySelectorAll('video')].map((video) => ({
      readyState: video.readyState,
      paused: video.paused,
      currentTime: video.currentTime,
    })),
  }));
  report.controlled.remainingWindows = await windowState();
  if (!baseline) {
    report.controlled.nativeHandlerDecisions = await electronApp.evaluate(() => globalThis.__vidriftPopupDecisions);
    report.controlled.probeWindowSnapshots = await electronApp.evaluate(() => globalThis.__vidriftProbeWindowSnapshots);
    assert.equal(report.controlled.probeWindowSnapshots.length, 1);
    for (const snapshot of report.controlled.probeWindowSnapshots) {
      assert.equal(snapshot.visible, false, 'The capability child must never be visible.');
      assert.equal(snapshot.sandbox, false, 'The child must match the provider sandbox state required by Electron 45.');
      assert.equal(snapshot.contextIsolation, true);
      assert.equal(snapshot.nodeIntegration, false);
      assert.equal(snapshot.webSecurity, true);
      assert.equal(snapshot.preload ?? null, null, 'The provider child must not receive a preload bridge.');
    }
  }
  if (baseline) {
    report.controlled.nativeHandlerDetails = await electronApp.evaluate(() => globalThis.__vidriftPopupRequests);
    assert.equal(report.controlled.probeReturned, false);
    assert.match(report.controlled.bodyText, /Remove sandboxing to enable playback/);
    await providerPage.screenshot({ path: path.join(outputDirectory, 'baseline-failure.png') });
    report.status = 'baseline-failure-reproduced';
    await saveReport();
    console.log(JSON.stringify(report, null, 2));
  } else {
    assert.equal(report.controlled.probeReturned, true, 'The exact native capability probe must return a window.');
    assert.equal(report.controlled.nestedPopupReturned, false, 'The compatibility child must not open further popups.');
    assert.doesNotMatch(report.controlled.bodyText, /Remove sandboxing/);
    assert.match(report.controlled.bodyText, /PLAYBACK ACTIVE/);
    assert.equal(report.controlled.videos.length, 1);
    assert.equal(report.controlled.videos[0].readyState, 4);
    assert.equal(report.controlled.videos[0].paused, false);
    assert.ok(report.controlled.videos[0].currentTime > 0);
    assert.equal(report.controlled.remainingWindows.length, 2, 'The hidden probe must be gone.');
    assert.ok(report.controlled.remainingWindows.every((window) => !window.url.startsWith('https://example.com/')));
    await providerPage.getByRole('button', { name: 'Test blocked external popup', exact: true }).click();
    assert.equal(await providerPage.evaluate(() => window.__externalPopupReturned), false);
    await providerPage.waitForTimeout(500);
    assert.equal((await windowState()).length, 2, 'An external HTTPS popup must remain denied.');
    await providerPage.screenshot({ path: path.join(outputDirectory, 'controlled-playback-fixed.png') });
    assert.deepEqual(report.runtimeErrors, []);
    report.controlled.status = 'passed';

    // The real provider is not mocked or rewritten. This test-only wrapper only
    // records arguments and the actual native result, which it returns unchanged.
    await providerPage.unroute(embedUrl);
    await providerPage.addInitScript(() => {
      const nativeOpen = window.open.bind(window);
      window.__vidriftNativeOpenCalls = [];
      window.open = (...args) => {
        const result = nativeOpen(...args);
        window.__vidriftNativeOpenCalls.push({ args, returned: Boolean(result) });
        return result;
      };
    });
    await providerPage.reload();
    await expect.poll(() => providerPage.locator('video').first().evaluate((video) => video.readyState), { timeout: 60_000 }).toBe(4);
    const playButton = providerPage.getByRole('button', { name: 'Play or pause', exact: true }).first();
    await expect(playButton).toBeVisible({ timeout: 30_000 });
    await playButton.click();
    await providerPage.waitForTimeout(1_000);
    const liveVideo = providerPage.locator('video').first();
    if (await liveVideo.evaluate((video) => video.paused)) await playButton.click();
    await expect.poll(() => liveVideo.evaluate((video) => video.paused), { timeout: 20_000 }).toBe(false);
    await providerPage.waitForTimeout(1_000);
    report.live = await providerPage.evaluate(() => ({
      url: location.href,
      bodyText: document.body.innerText.slice(0, 6000),
      nativeOpenCalls: window.__vidriftNativeOpenCalls ?? [],
      videos: [...document.querySelectorAll('video')].map((video) => ({
        readyState: video.readyState,
        paused: video.paused,
        currentTime: video.currentTime,
        error: video.error ? { code: video.error.code, message: video.error.message } : null,
      })),
    }));
    report.live.remainingWindows = await windowState();
    assert.doesNotMatch(report.live.bodyText, /Remove sandboxing/);
    assert.ok(report.live.videos.some((video) => video.readyState === 4 && !video.paused && !video.error), 'The real Vidrift video must be playing after its Play button is clicked.');
    const exactProbe = report.live.nativeOpenCalls.find((call) => call.args[0] === '' && call.args[1] === '_blank' && call.args[2] === probeFeatures);
    report.live.probeObserved = Boolean(exactProbe);
    if (exactProbe) assert.equal(exactProbe.returned, true, 'The real Vidrift popup probe must return a window.');
    assert.equal(report.live.remainingWindows.length, 2, 'No real provider popup may remain open.');
    await providerPage.screenshot({ path: path.join(outputDirectory, 'vidrift-after-play-click.png'), timeout: 20_000 });
    report.live.status = 'passed';
    if (!exactProbe) report.live.note = 'Vidrift skipped its popup probe for this live session; the deterministic controlled Electron test verified the gate.';
    report.status = 'passed';
    await saveReport();
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  report.status = 'failed';
  report.fatalError = String(error?.stack ?? error);
  await saveReport();
  if (providerPage && !providerPage.isClosed()) {
    await providerPage.screenshot({ path: path.join(outputDirectory, 'failure.png'), timeout: 10_000 }).catch(() => undefined);
  }
  throw error;
} finally {
  try { if (providerPage && !providerPage.isClosed()) await providerPage.close(); } catch { /* app close follows */ }
  if (electronApp) await electronApp.close();
}
