import { expect, _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const executablePath = require('electron');
const outputDirectory = path.join(root, 'artifacts', 'custom-recording');
const recordingDirectory = path.join(outputDirectory, 'saved');
const profileDirectory = path.join(root, 'test-results', 'custom-recording-profile');
const autosaveKey = 'freeform.workspace.autosave.v1';
const playerUrl = 'https://example.com/embed/movie/603';
const customHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>Verified custom calibration player</title></head>
<body style="margin:0;width:100vw;height:100vh;overflow:hidden;background:#101820;color:white;font-family:monospace">
<div style="box-sizing:border-box;width:100%;height:100%;padding:34px;background:linear-gradient(135deg,#e63946 0 25%,#f1c453 25% 50%,#2a9d8f 50% 75%,#287bc1 75%);border:18px solid #f5f5f5">
<div style="height:100%;box-sizing:border-box;border:5px solid #101820;display:grid;grid-template-rows:1fr auto 1fr;place-items:center;background:rgba(16,24,32,.28)">
<strong style="font-size:42px;padding:14px;background:#101820">VERIFIED CUSTOM PLAYER</strong>
<span id="frame" style="font-size:24px;padding:12px;background:#f5f5f5;color:#101820">FRAME 0 / 440 HZ PLAYER AUDIO</span>
<strong style="font-size:34px;padding:14px;background:#101820">RECORD → WEBM → MESH</strong>
</div></div><script>
let frame=0;
setInterval(()=>{document.getElementById('frame').textContent='FRAME '+(++frame)+' / 440 HZ PLAYER AUDIO'},100);
window.__startSourceTone=async()=>{
  if(!window.__sourceAudioContext){
    const context=new AudioContext();
    const oscillator=context.createOscillator();
    const gain=context.createGain();
    oscillator.type='sine';
    oscillator.frequency.value=440;
    gain.gain.value=0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    window.__sourceAudioContext=context;
  }
  await window.__sourceAudioContext.resume();
  return window.__sourceAudioContext.state;
};
void window.__startSourceTone().catch(()=>{});
</script></body></html>`;

await rm(outputDirectory, { recursive: true, force: true });
await rm(profileDirectory, { recursive: true, force: true });
await mkdir(recordingDirectory, { recursive: true });

const runtimeErrors = [];
const checks = [];
let electronApp;
let customPage;

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

async function mockTechnicalCheck(url) {
  await electronApp.evaluate(async ({ net }, target) => {
    globalThis.__freeformOriginalNetFetch = net.fetch;
    net.fetch = async (input, init) => {
      if (String(input) === target) {
        return new Response('<!doctype html><title>Technical check only</title>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*' },
        });
      }
      return globalThis.__freeformOriginalNetFetch(input, init);
    };
  }, url);
}

async function restoreTechnicalCheck() {
  await electronApp.evaluate(({ net }) => {
    if (globalThis.__freeformOriginalNetFetch) {
      net.fetch = globalThis.__freeformOriginalNetFetch;
      delete globalThis.__freeformOriginalNetFetch;
    }
  });
}

async function routeCustomPlayer(page) {
  await page.route('https://example.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'Range',
      },
      body: customHtml,
    });
  });
}

async function verifyAndConfirm(page) {
  await page.getByRole('button', { name: 'Custom / verify', exact: true }).click();
  await page.getByRole('button', { name: 'External web player', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill('Desktop calibration player');
  await page.getByLabel('External player page URL', { exact: true }).fill(playerUrl);
  await page.getByRole('button', { name: 'Verify connection', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Technical verification result' })).toContainText('Technical check passed');
  const verificationFrame = page.getByTitle('Custom web-player verification preview', { exact: true });
  expect(await verificationFrame.getAttribute('sandbox')).toBeNull();
  await expect(page.frameLocator('iframe[title="Custom web-player verification preview"]').getByText('VERIFIED CUSTOM PLAYER')).toBeVisible();
  await expect(page.getByLabel('Movie URL pattern', { exact: true })).toHaveValue('https://example.com/embed/movie/{tmdb}');
  await page.getByLabel(/Episode URL pattern/).fill('https://example.com/embed/tv/{tmdb}/{season}/{episode}');
  await page.getByLabel(/I inspected the preview/).check();
  await page.getByRole('button', { name: 'Add to provider dashboard', exact: true }).click();
  await expect(page.locator('.provider-player')).toHaveAttribute('aria-label', 'Desktop calibration player provider player');
  await page.getByLabel('TMDB ID', { exact: true }).fill('603');
  await page.getByLabel(/I confirm I am authorized/).check();
  await expect(page.getByRole('button', { name: 'Open player window', exact: true })).toBeEnabled();
}

async function openCustomWindow(page) {
  const windowEvent = electronApp.waitForEvent('window', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Open player window', exact: true }).click();
  customPage = await windowEvent;
  customPage.on('pageerror', (error) => runtimeErrors.push(`Custom player: ${error.message}`));
  await routeCustomPlayer(customPage);
  await customPage.reload();
  await expect(customPage).toHaveURL(playerUrl);
  await expect(customPage.getByText('VERIFIED CUSTOM PLAYER')).toBeVisible();
  await expect(page.locator('.catalog-shell iframe')).toHaveCount(0);
  await expect(page.locator('.provider-capture-prototype .provider-form-error')).toHaveCount(0);
  await expect.poll(() => customPage.locator('#frame').textContent()).not.toBe('FRAME 0 / 440 HZ PLAYER AUDIO');
  assert.equal(await customPage.evaluate(() => window.__startSourceTone()), 'running');
  const preferences = await electronApp.evaluate(({ BrowserWindow }) => {
    const playerWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('https://example.com/'));
    if (!playerWindow) return null;
    const current = playerWindow.webContents.getLastWebPreferences();
    return { sandbox: current.sandbox, contextIsolation: current.contextIsolation, nodeIntegration: current.nodeIntegration, webSecurity: current.webSecurity };
  });
  assert.deepEqual(preferences, { sandbox: false, contextIsolation: true, nodeIntegration: false, webSecurity: true });
  const isolation = await customPage.evaluate(() => ({ requireType: typeof require, bridgeType: typeof window.freeform }));
  assert.equal(isolation.requireType, 'undefined');
  assert.equal(isolation.bridgeType, 'undefined');
}

async function chooseRecordingFolder(page) {
  await electronApp.evaluate(({ dialog }, directory) => {
    globalThis.__freeformOriginalOpenDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, recordingDirectory);
  await page.locator('.sandbox-recorder').getByRole('button', { name: 'Choose folder', exact: true }).click();
  await expect(page.locator('.recording-directory code')).toHaveText(recordingDirectory);
  await electronApp.evaluate(({ dialog }) => {
    dialog.showOpenDialog = globalThis.__freeformOriginalOpenDialog;
    delete globalThis.__freeformOriginalOpenDialog;
  });
}

async function pixelStats(video) {
  return video.evaluate((element) => {
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
}

async function audioStats(video) {
  return video.evaluate(async (element) => {
    const context = new AudioContext();
    try {
      const source = context.createMediaElementSource(element);
      const analyser = context.createAnalyser();
      const silentOutput = context.createGain();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.2;
      silentOutput.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentOutput);
      silentOutput.connect(context.destination);
      await context.resume();
      if (element.paused) await element.play();
      const samples = new Float32Array(analyser.fftSize);
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      let squaredSum = 0;
      let sampleCount = 0;
      let peak = 0;
      let peakFrequency = 0;
      for (let iteration = 0; iteration < 50; iteration += 1) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) {
          squaredSum += sample * sample;
          sampleCount += 1;
          peak = Math.max(peak, Math.abs(sample));
        }
        analyser.getFloatFrequencyData(spectrum);
        let strongestBin = 1;
        for (let bin = 2; bin < spectrum.length; bin += 1) {
          if (spectrum[bin] > spectrum[strongestBin]) strongestBin = bin;
        }
        peakFrequency = strongestBin * context.sampleRate / analyser.fftSize;
      }
      const captured = element.captureStream();
      return {
        audioTracks: captured.getAudioTracks().length,
        rms: Math.sqrt(squaredSum / Math.max(1, sampleCount)),
        peak,
        peakFrequency,
        sampleRate: context.sampleRate,
      };
    } finally {
      await context.close();
    }
  });
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
  await routeCustomPlayer(page);
  await mockTechnicalCheck(playerUrl);
  await expect(page.locator('canvas.warp-canvas')).toBeVisible({ timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.freeform?.isDesktop), true);
  await verifyAndConfirm(page);
  checks.push('The desktop technical check, unrestricted-content preview, and explicit confirmation complete before capture.');

  await openCustomWindow(page);
  await customPage.screenshot({ path: path.join(outputDirectory, 'verified-custom-window.png') });
  checks.push('A separate custom HTTPS BrowserWindow opens with sandbox disabled and no Node or Freeform bridge access.');
  await chooseRecordingFolder(page);
  await page.getByRole('button', { name: 'Record window', exact: true }).click();
  await expect(page.locator('.sandbox-recorder-heading')).toContainText('REC 00:');
  await expect(page.locator('.sandbox-recorder')).toContainText('Player audio connected');
  await page.waitForTimeout(4600);
  await page.screenshot({ path: path.join(outputDirectory, 'recording-in-progress.png') });
  await page.getByRole('button', { name: 'Stop & save', exact: true }).click();
  await expect(page.locator('.recording-saved')).toContainText('Recording saved', { timeout: 30_000 });
  const savedPath = await page.locator('.recording-saved code').textContent();
  assert.ok(savedPath?.endsWith('.webm'));
  const savedStat = await stat(savedPath);
  assert.ok(savedStat.size > 10_000, `Recording too small: ${savedStat.size}`);
  assert.equal((await readFile(savedPath)).subarray(0, 4).toString('hex'), '1a45dfa3');
  checks.push(`Manual Stop & save produced a real ${savedStat.size}-byte WebM in the selected folder.`);

  await page.getByRole('button', { name: 'Add captured window to mesh', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Providers', exact: true })).toHaveCount(0, { timeout: 30_000 });
  const captureVideo = page.locator('.media-layer video').filter({ hasNot: page.locator('[src]') });
  await expect(captureVideo).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(() => captureVideo.evaluate((element) => element.readyState), { timeout: 30_000 }).toBeGreaterThan(1);
  await expect.poll(() => captureVideo.evaluate((element) => element.currentTime), { timeout: 30_000 }).toBeGreaterThan(0);
  const captureState = await captureVideo.evaluate((element) => {
    const stream = element.srcObject;
    window.__customCaptureTrack = stream?.getVideoTracks()[0];
    return {
      isStream: stream instanceof MediaStream,
      trackState: window.__customCaptureTrack?.readyState,
      width: element.videoWidth,
      height: element.videoHeight,
      audioTracks: stream?.getAudioTracks().length,
    };
  });
  assert.equal(captureState.isStream, true);
  assert.equal(captureState.trackState, 'live');
  assert.equal(captureState.audioTracks, 0);
  const capturePixels = await pixelStats(captureVideo);
  assert.ok(capturePixels.nonBlack > 50, `Blank custom capture: ${JSON.stringify(capturePixels)}`);
  assert.ok(capturePixels.variedColors >= 8, `Capture lacks color variation: ${JSON.stringify(capturePixels)}`);
  checks.push(`The real custom-window MediaStream is ${captureState.width} × ${captureState.height}, nonblank, and mesh-ready (${capturePixels.variedColors} sampled colors).`);

  await expect.poll(async () => (await readProject(page)).sources?.some((source) => source.providerKind === 'custom')).toBe(true);
  const customProject = await readProject(page);
  const customSource = customProject.sources.find((source) => source.providerKind === 'custom');
  const customPlayer = customProject.players.find((player) => player.sourceId === customSource.id);
  assert.equal(customSource.providerUrl, playerUrl);
  await page.locator('.player-row').filter({ hasText: customPlayer.name }).click();
  const canvas = page.locator('canvas.warp-canvas');
  const beforeWarp = await canvas.evaluate((element) => element.toDataURL());
  const corner = await page.locator('.node-hit.node-corner').first().boundingBox();
  if (!corner) throw new Error('Custom player mesh corner not rendered.');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 44, corner.y + corner.height / 2 + 23, { steps: 9 });
  await page.mouse.up();
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL()), { timeout: 30_000 }).not.toBe(beforeWarp);
  const beforeBrightness = await canvas.evaluate((element) => element.toDataURL());
  await setRange(page, 'input[data-visual-field="brightness"]', 1.4);
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL()), { timeout: 30_000 }).not.toBe(beforeBrightness);
  checks.push('The custom capture can be mesh-warped and visually adjusted in the real WebGL renderer.');

  // Restore before opening WebM: the authorized local-media protocol also uses net.fetch.
  await restoreTechnicalCheck();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await expect(page.locator('.recording-library-row')).toHaveCount(1);
  await expect(page.locator('.recording-library-directory code')).toHaveText(recordingDirectory);
  await page.screenshot({ path: path.join(outputDirectory, 'recording-library.png') });
  await page.getByRole('button', { name: 'Add to player', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Recording library', exact: true })).toHaveCount(0);
  const recordedVideo = page.locator('.media-layer video[src^="freeform-media:"]');
  await expect(recordedVideo).toHaveCount(1, { timeout: 30_000 });
  await expect.poll(() => recordedVideo.evaluate((element) => element.readyState), { timeout: 30_000 }).toBeGreaterThan(1);
  await expect.poll(() => recordedVideo.evaluate((element) => element.currentTime), { timeout: 30_000 }).toBeGreaterThan(0);
  const recordingState = await recordedVideo.evaluate((element) => ({
    width: element.videoWidth,
    height: element.videoHeight,
    duration: element.duration,
    mime: element.currentSrc,
  }));
  assert.ok(recordingState.width > 0 && recordingState.height > 0);
  assert.ok(recordingState.duration > 1);
  const recordedPixels = await pixelStats(recordedVideo);
  assert.ok(recordedPixels.nonBlack > 50, `Blank saved recording: ${JSON.stringify(recordedPixels)}`);
  assert.ok(recordedPixels.variedColors >= 8, `Recording lacks color variation: ${JSON.stringify(recordedPixels)}`);
  checks.push(`The saved WebM reopened as a native ${recordingState.width} × ${recordingState.height} player, advanced playback, and produced nonblank pixels.`);
  const recordedAudio = await audioStats(recordedVideo);
  assert.equal(recordedAudio.audioTracks, 1, `Saved recording has no source audio track: ${JSON.stringify(recordedAudio)}`);
  assert.ok(recordedAudio.rms > 0.0005, `Saved source audio is silent: ${JSON.stringify(recordedAudio)}`);
  assert.ok(Math.abs(recordedAudio.peakFrequency - 440) < 30, `Unexpected recorded tone: ${JSON.stringify(recordedAudio)}`);
  checks.push(`The saved WebM contains the source player's non-silent 440 Hz tone (measured ${recordedAudio.peakFrequency.toFixed(1)} Hz, RMS ${recordedAudio.rms.toFixed(5)}), not system loopback audio.`);

  await page.screenshot({ path: path.join(outputDirectory, 'custom-capture-and-recording-mesh.png') });
  await customPage.close();
  customPage = undefined;
  await expect.poll(() => page.evaluate(() => window.__customCaptureTrack?.readyState), { timeout: 30_000 }).toBe('ended');
  checks.push('Closing the original player ends its live capture track cleanly.');

  // Exercise the other manual-stop path: closing the player window must finalize, not discard.
  await mockTechnicalCheck(playerUrl);
  await verifyAndConfirm(page);
  await openCustomWindow(page);
  await page.getByRole('button', { name: 'Record window', exact: true }).click();
  await expect(page.locator('.sandbox-recorder-heading')).toContainText('REC 00:');
  await expect(page.locator('.sandbox-recorder')).toContainText('Player audio connected');
  await page.waitForTimeout(2600);
  await customPage.close();
  customPage = undefined;
  await expect(page.locator('.sandbox-recorder')).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.freeform.listRecordings());
    return result.recordings.length;
  }, { timeout: 30_000 }).toBe(2);
  await restoreTechnicalCheck();
  const library = await page.evaluate(() => window.freeform.listRecordings());
  const second = library.recordings.find((recording) => recording.path !== savedPath);
  assert.ok(second, 'Window-close recording was not listed.');
  const secondBytes = await readFile(second.path);
  assert.ok(secondBytes.length > 5_000, `Window-close recording too small: ${secondBytes.length}`);
  assert.equal(secondBytes.subarray(0, 4).toString('hex'), '1a45dfa3');
  checks.push(`Closing a recording player window finalized a second ${secondBytes.length}-byte WebM without discarding it.`);

  await page.getByRole('button', { name: 'Close Catalog', exact: true }).click();
  assert.deepEqual(runtimeErrors, [], 'Electron runtime emitted errors');
  checks.push('No main-window or custom-player runtime errors occurred.');
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify({
    status: 'passed',
    recording: { path: savedPath, bytes: savedStat.size, ...recordingState },
    closeFinalizedRecording: { path: second.path, bytes: secondBytes.length },
    captureState,
    capturePixels,
    recordedPixels,
    recordedAudio,
    checks,
    screenshots: ['verified-custom-window.png', 'recording-in-progress.png', 'recording-library.png', 'custom-capture-and-recording-mesh.png'],
    limitations: [
      'Only the custom HTTPS page and technical network response were mocked; getDisplayMedia, MediaRecorder, MediaStreams, and file output were real.',
      'The native folder picker was mocked only to select the test artifact folder; filesystem recording and reopening were real.',
      'Content rights, every remote script’s safety, DRM behavior, third-party media/audio, real network streams, and Windows 10 were not tested.',
      'Abrupt application termination can leave an unfinalized WebM; normal Stop, dialog unmount, and player-window closure are handled.',
    ],
  }, null, 2));
  console.log(JSON.stringify({ status: 'passed', recordingBytes: savedStat.size, closeRecordingBytes: secondBytes.length, captureState, capturePixels, recordedPixels, checks }, null, 2));
} catch (error) {
  await writeFile(path.join(outputDirectory, 'failure.txt'), String(error?.stack ?? error));
  throw error;
} finally {
  try { if (electronApp) await restoreTechnicalCheck(); } catch { /* app close follows */ }
  try { if (customPage && !customPage.isClosed()) await customPage.close(); } catch { /* app close follows */ }
  if (electronApp) await electronApp.close();
}
