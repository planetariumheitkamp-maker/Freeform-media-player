import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const AUTOSAVE_KEY = 'freeform.workspace.autosave.v1';

function runtimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return () => expect(errors, 'Browser runtime errors').toEqual([]);
}

test('custom web players request nothing before verification and open movie and episode popups', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const assertNoErrors = runtimeErrors(page);
  const requests: string[] = [];
  const url = 'https://player.example.test/embed/movie/603';
  await page.context().route('https://player.example.test/**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'Range',
        'content-type': 'text/html; charset=utf-8',
      },
      body: '<!doctype html><html><body style="margin:0;background:#17251d;color:#c5ffc3;font:24px monospace;display:grid;place-items:center;height:100vh">VERIFIED CUSTOM PLAYER</body></html>',
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Custom / verify', exact: true }).click();
  await page.getByRole('button', { name: 'External web player', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill('Verified calibration player');
  const input = page.getByLabel('External player page URL', { exact: true });
  await expect(input).toBeVisible();
  expect(requests).toEqual([]);
  await expect(page.getByRole('button', { name: 'Verify connection', exact: true })).toBeDisabled();

  await input.fill('https://[::1]/embed');
  await page.getByRole('button', { name: 'Verify connection', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('private-network');
  expect(requests).toEqual([]);
  await input.fill('https://localhost/embed');
  await page.getByRole('button', { name: 'Verify connection', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Localhost');
  expect(requests).toEqual([]);

  await input.fill(url);
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Verify connection', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Technical verification result' })).toContainText('Technical check passed');
  const frame = page.getByTitle('Custom web-player verification preview', { exact: true });
  await expect(frame).toHaveAttribute('src', url);
  expect(await frame.getAttribute('sandbox')).toBeNull();
  await expect(page.frameLocator('iframe[title="Custom web-player verification preview"]').getByText('VERIFIED CUSTOM PLAYER')).toBeVisible();
  expect(requests.length).toBeGreaterThanOrEqual(2);
  await expect(page.getByLabel('Movie URL pattern', { exact: true })).toHaveValue('https://player.example.test/embed/movie/{tmdb}');
  await page.getByLabel(/Episode URL pattern/).fill('https://player.example.test/embed/tv/{tmdb}/{season}/{episode}');
  const confirmation = page.getByLabel(/I inspected the preview/);
  await expect(confirmation).toBeEnabled();
  await confirmation.check();
  const addProvider = page.getByRole('button', { name: 'Add to provider dashboard', exact: true });
  await expect(addProvider).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('verified-custom-player.png') });
  const requestsBeforeDashboard = requests.length;
  await addProvider.click();

  await expect(page.getByRole('dialog', { name: 'Verify a custom source', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Providers', exact: true })).toBeVisible();
  await expect(page.locator('.provider-player')).toHaveAttribute('aria-label', 'Verified calibration player provider player');
  const loadSaved = page.getByRole('button', { name: 'Open player window', exact: true });
  await expect(loadSaved).toBeDisabled();
  const tmdbInput = page.getByLabel('TMDB ID', { exact: true });
  await expect(tmdbInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'Movie', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Series', exact: true })).toBeEnabled();
  await expect(page.locator('.player-row')).toHaveCount(1);
  expect(requests.length).toBe(requestsBeforeDashboard);
  await page.screenshot({ path: testInfo.outputPath('custom-provider-dropdown.png') });
  await tmdbInput.fill('603');
  await page.getByLabel(/I confirm I am authorized/).check();
  expect(requests.length).toBe(requestsBeforeDashboard);
  const moviePopupEvent = page.waitForEvent('popup');
  await loadSaved.click();
  const moviePopup = await moviePopupEvent;
  await moviePopup.waitForURL(url);
  await expect(moviePopup.getByText('VERIFIED CUSTOM PLAYER')).toBeVisible();
  expect(await moviePopup.evaluate(() => window.opener)).toBeNull();
  await expect(page.locator('.catalog-shell iframe')).toHaveCount(0);
  await expect(page.locator('.provider-capture-unavailable')).toContainText('desktop app');
  await expect(page.getByRole('button', { name: 'Add captured window to mesh', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('custom-provider-window-requested.png') });

  await page.getByRole('button', { name: 'Series', exact: true }).click();
  await tmdbInput.fill('1399');
  await page.getByLabel('Season', { exact: true }).fill('0');
  await page.getByLabel('Episode', { exact: true }).fill('2');
  expect(requests.length).toBe(requestsBeforeDashboard + 1);
  const episodeUrl = 'https://player.example.test/embed/tv/1399/0/2';
  const episodePopupEvent = page.waitForEvent('popup');
  await loadSaved.click();
  const episodePopup = await episodePopupEvent;
  await episodePopup.waitForURL(episodeUrl);
  await expect(episodePopup.getByText('VERIFIED CUSTOM PLAYER')).toBeVisible();
  expect(await episodePopup.evaluate(() => window.opener)).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('custom-provider-series-window-requested.png') });
  await moviePopup.close();
  await episodePopup.close();

  await page.getByRole('button', { name: 'Close Catalog', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  const providerSelect = page.getByRole('combobox', { name: 'Provider', exact: true });
  await providerSelect.selectOption({ label: 'Verified calibration player (custom)' });
  await expect(page.locator('.provider-player')).toHaveAttribute('aria-label', 'Verified calibration player provider player');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Remove Verified calibration player provider', exact: true }).click();
  await expect(providerSelect.locator('option', { hasText: 'Verified calibration player' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Catalog', exact: true }).click();

  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Recording library', exact: true })).toContainText('require the Freeform desktop app');
  await expect(page.getByRole('button', { name: 'Choose save folder', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('recording-library-browser.png') });
  assertNoErrors();
});

test('verified direct media becomes a native playing mesh source', async ({ page }, testInfo) => {
  const assertNoErrors = runtimeErrors(page);
  const media = await readFile(new URL('../fixtures/live-ai-fixture.webm', import.meta.url));
  const url = 'https://media.example.test/calibration.webm';
  let verificationRequests = 0;
  await page.route(url, async (route) => {
    verificationRequests += 1;
    await route.fulfill({
      status: 206,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'Range',
        'accept-ranges': 'bytes',
        'content-range': `bytes 0-${media.length - 1}/${media.length}`,
        'content-type': 'video/webm',
      },
      body: media,
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Custom / verify', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill('Custom calibration clip');
  await page.getByLabel('Direct video, audio, or HLS URL', { exact: true }).fill(url);
  expect(verificationRequests).toBe(0);
  const addButton = page.getByRole('button', { name: 'Add verified media to a new mesh player', exact: true });
  await expect(addButton).toHaveCount(0);
  await page.getByRole('button', { name: 'Verify connection', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Technical verification result' })).toContainText('video/webm');
  const preview = page.getByLabel('Custom media verification preview', { exact: true });
  await expect.poll(() => preview.evaluate((video) => (video as HTMLVideoElement).readyState)).toBeGreaterThan(1);
  await expect(addButton).toBeDisabled();
  await page.getByLabel(/I inspected the preview/).check();
  await expect(addButton).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('verified-direct-media.png') });
  await addButton.click();
  await expect(page.getByRole('dialog', { name: 'Verify a custom source', exact: true })).toHaveCount(0);
  const video = page.locator('.media-layer video');
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThan(1);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate((key) => {
    const generations = Object.keys(localStorage).filter((candidate) => candidate.startsWith(`${key}.`));
    const project = JSON.parse(JSON.parse(localStorage.getItem(generations.sort().at(-1) ?? '{}') ?? '{}').content ?? '{}');
    const source = project.sources?.find((candidate: any) => candidate.name === 'Custom calibration clip');
    return source ? `${source.kind}/${source.mediaType}/${source.live}/${source.uri}` : '';
  }, AUTOSAVE_KEY)).toBe(`stream/video/false/${url}`);
  await page.screenshot({ path: testInfo.outputPath('custom-media-native-player.png') });
  assertNoErrors();
});

test('custom source controls fit the existing source rail at 1080px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  await page.goto('/');
  const custom = page.getByRole('button', { name: 'Custom / verify', exact: true });
  const recordings = page.getByRole('button', { name: 'Recordings', exact: true });
  await expect(custom).toBeVisible();
  await expect(recordings).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await custom.evaluate((button) => button.scrollWidth <= button.clientWidth + 1)).toBe(true);
  await custom.click();
  await expect(page.getByRole('dialog', { name: 'Verify a custom source', exact: true })).toBeVisible();
  expect(await page.locator('.dialog-content').evaluate((content) => content.scrollWidth <= content.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('custom-source-1080.png') });
});
