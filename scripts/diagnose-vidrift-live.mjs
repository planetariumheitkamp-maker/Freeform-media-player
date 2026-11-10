import { expect, _electron as electron } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const outputDirectory = path.join(root, 'artifacts', 'vidrift-live-check');
const profileDirectory = path.join(root, 'test-results', 'vidrift-live-profile');
const expectedUrl = 'https://embed.vidrift.net/embed/movie/1368337';
await rm(outputDirectory, { recursive: true, force: true });
await rm(profileDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

let electronApp;
let providerPage;
const report = {
  provider: 'vidrift',
  tmdbId: '1368337',
  expectedUrl,
  console: [],
  pageErrors: [],
  requestFailures: [],
};
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
  await expect(page.locator('canvas.warp-canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('vidrift');
  await page.getByLabel('TMDB ID', { exact: true }).fill('1368337');
  await page.getByLabel(/I confirm I am authorized/).check();
  const windowEvent = electronApp.waitForEvent('window', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Open player window', exact: true }).click();
  providerPage = await windowEvent;
  providerPage.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) report.console.push({ type: message.type(), text: message.text() });
  });
  providerPage.on('pageerror', (error) => report.pageErrors.push(error.message));
  providerPage.on('requestfailed', (request) => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  await providerPage.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch((error) => {
    report.loadError = error.message;
  });
  await providerPage.waitForTimeout(15_000);
  report.state = await providerPage.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body?.innerText.slice(0, 6000),
    frames: [...document.querySelectorAll('iframe')].map((frame) => ({
      src: frame.src,
      sandbox: frame.getAttribute('sandbox'),
      allow: frame.getAttribute('allow'),
    })),
    videos: [...document.querySelectorAll('video')].map((video) => ({
      src: video.currentSrc || video.src,
      error: video.error ? { code: video.error.code, message: video.error.message } : null,
      readyState: video.readyState,
      paused: video.paused,
    })),
    buttons: [...document.querySelectorAll('button, [role="button"]')].slice(0, 40).map((button) => ({
      text: button.textContent?.trim().slice(0, 160),
      ariaLabel: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
    })),
  }));
  report.appState = await page.locator('.provider-capture-prototype').innerText();
  const preferences = await electronApp.evaluate(({ BrowserWindow }) => {
    const playerWindow = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('https://embed.vidrift.net/'));
    if (!playerWindow) return null;
    const current = playerWindow.webContents.getLastWebPreferences();
    return { sandbox: current.sandbox, contextIsolation: current.contextIsolation, nodeIntegration: current.nodeIntegration, webSecurity: current.webSecurity };
  });
  report.webPreferences = preferences;
  await providerPage.screenshot({ path: path.join(outputDirectory, 'vidrift-live.png'), timeout: 15_000 }).catch(() => undefined);
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.fatalError = String(error?.stack ?? error);
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  try { if (providerPage && !providerPage.isClosed()) await providerPage.close(); } catch { /* app close follows */ }
  if (electronApp) await electronApp.close();
}
