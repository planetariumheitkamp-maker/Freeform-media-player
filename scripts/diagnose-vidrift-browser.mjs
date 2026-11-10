import { chromium, expect } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDirectory = path.join(root, 'artifacts', 'vidrift-browser-check');
const expectedUrl = 'https://embed.vidrift.net/embed/movie/1368337';
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
const report = { provider: 'vidrift', mode: 'browser-popup', tmdbId: '1368337', expectedUrl, console: [], pageErrors: [], requestFailures: [] };
let browser;
let popup;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:7100/', { timeout: 30_000 });
  await expect(page.locator('canvas.warp-canvas')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('vidrift');
  await page.getByLabel('TMDB ID', { exact: true }).fill('1368337');
  await page.getByLabel(/I confirm I am authorized/).check();
  const popupEvent = page.waitForEvent('popup', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Open player window', exact: true }).click();
  popup = await popupEvent;
  popup.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) report.console.push({ type: message.type(), text: message.text() });
  });
  popup.on('pageerror', (error) => report.pageErrors.push(error.message));
  popup.on('requestfailed', (request) => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  await popup.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch((error) => { report.loadError = error.message; });
  await popup.waitForTimeout(15_000);
  report.state = await popup.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body?.innerText.slice(0, 6000),
    openerIsNull: window.opener === null,
    frames: [...document.querySelectorAll('iframe')].map((frame) => ({ src: frame.src, sandbox: frame.getAttribute('sandbox'), allow: frame.getAttribute('allow') })),
    videos: [...document.querySelectorAll('video')].map((video) => ({
      src: video.currentSrc || video.src,
      error: video.error ? { code: video.error.code, message: video.error.message } : null,
      readyState: video.readyState,
      paused: video.paused,
    })),
  }));
  await popup.screenshot({ path: path.join(outputDirectory, 'vidrift-browser-live.png'), timeout: 15_000 }).catch(() => undefined);
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.fatalError = String(error?.stack ?? error);
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  try { if (popup && !popup.isClosed()) await popup.close(); } catch { /* browser close follows */ }
  if (browser) await browser.close();
}
