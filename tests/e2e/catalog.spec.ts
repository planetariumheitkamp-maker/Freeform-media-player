import { expect, test, type Page } from '@playwright/test';

const AUTOSAVE_KEY = 'freeform.workspace.autosave.v1';

declare global {
  interface Window {
    readFreeformAutosave(key: string): any;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.readFreeformAutosave = (key: string) => {
      const generations = Object.keys(localStorage)
        .filter((candidate) => candidate.startsWith(`${key}.`))
        .map((candidate) => {
          try { return JSON.parse(localStorage.getItem(candidate) ?? '{}'); } catch { return null; }
        })
        .filter((envelope) => envelope?.version === 1 && typeof envelope.content === 'string')
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      return JSON.parse(generations[0]?.content ?? localStorage.getItem(key) ?? '{}');
    };
  });
});

function monitorRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status}: ${response.url()}`);
  });
  return () => expect(errors, 'Browser console, page, and HTTP errors').toEqual([]);
}

test('Catalog is a provider-only dropdown and makes no automatic external requests', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (/https?:\/\/(?:vidqueen|vidrift|vidmario|vidcine|vidbolt|cinezo|vidlink|vidup|vsembed)/i.test(request.url())) {
      externalRequests.push(request.url());
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Providers', exact: true })).toBeVisible();
  await expect(page.locator('.catalog-shell')).toHaveCSS('opacity', '1');
  const provider = page.getByRole('combobox', { name: 'Provider', exact: true });
  await expect(provider).toBeVisible();
  await expect(provider.locator('option')).toHaveText(['Vidqueen', 'Vidrift', 'Vidbolt', 'Cinezo', 'VidLink']);
  await expect(provider).toHaveValue('vidqueen');
  await expect(page.getByLabel('Search Catalog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Browse', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to providers', exact: true })).toHaveCount(0);
  await expect(page.locator('.catalog-card, .provider-row, .catalog-shell iframe')).toHaveCount(0);
  await expect(page.locator('.provider-player')).toHaveAttribute('aria-label', 'Vidqueen provider player');
  await expect(page.locator('.provider-output-empty')).toContainText('No player window open');
  await expect(page.getByRole('region', { name: 'Desktop ad blocking', exact: true })).toBeVisible();
  await expect(page.getByLabel('Block matching ad and tracker requests', { exact: true })).toBeDisabled();
  await expect(page.getByText('Browser popups are isolated and cannot be filtered by Freeform.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catalog-provider-dropdown.png') });
  expect(externalRequests).toEqual([]);
  assertNoRuntimeErrors();
});

test('provider forms validate IDs and open isolated mocked movie and episode popups', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  const providerRequests: string[] = [];
  await page.context().route(/https:\/\/(?:vidqueen\.st|vidlink\.pro)\/.*/, async (route) => {
    const url = route.request().url();
    providerRequests.push(url);
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><title>Mock provider window</title></head><body style="margin:0;background:#101311;color:#c5ffc3;font:20px monospace;display:grid;place-items:center;height:100vh"><div><strong>MOCK PROVIDER WINDOW</strong><p>No external media was requested.</p><code>${url}</code></div></body></html>`,
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  const loadButton = page.getByRole('button', { name: 'Open player window', exact: true });
  await expect(loadButton).toBeDisabled();
  await page.getByLabel('TMDB ID', { exact: true }).fill('1e3');
  await page.getByLabel(/I confirm I am authorized/).check();
  await expect(loadButton).toBeEnabled();
  await loadButton.click();
  await expect(page.getByRole('alert')).toContainText('TMDB ID must be a decimal integer');
  expect(providerRequests).toEqual([]);

  await page.getByLabel('TMDB ID', { exact: true }).fill('1399');
  await page.getByRole('button', { name: 'Series', exact: true }).click();
  await page.getByLabel('Season', { exact: true }).fill('0');
  await page.getByLabel('Episode', { exact: true }).fill('1');
  await page.getByRole('combobox', { name: 'Player variant', exact: true }).selectOption('vidstack');
  await expect(page.locator('.provider-output-empty')).toContainText('No player window open');
  await page.screenshot({ path: testInfo.outputPath('provider-setup.png') });
  expect(providerRequests).toEqual([]);

  const firstUrl = 'https://vidqueen.st/embed/tv/1399/0/1?autoplay=false&player=vidstack';
  const firstPopupEvent = page.waitForEvent('popup');
  await loadButton.click();
  const firstPopup = await firstPopupEvent;
  await firstPopup.waitForURL(firstUrl);
  await expect(firstPopup.getByText('MOCK PROVIDER WINDOW')).toBeVisible();
  expect(await firstPopup.evaluate(() => window.opener)).toBeNull();
  await expect(page.locator('.catalog-shell iframe')).toHaveCount(0);
  await expect(page.locator('.provider-output-topline')).toContainText('POPUP REQUESTED');
  await expect(page.locator('.provider-url code')).toHaveText(firstUrl);
  await expect(page.getByRole('button', { name: 'Open popup again', exact: true })).toBeVisible();
  await expect(page.locator('.provider-capture-unavailable')).toContainText('available only in the Freeform desktop app');
  await expect(page.getByRole('button', { name: 'Add captured window to mesh', exact: true })).toHaveCount(0);
  expect(providerRequests).toEqual([firstUrl]);
  await page.screenshot({ path: testInfo.outputPath('provider-window-requested.png') });

  await page.getByLabel('Episode', { exact: true }).fill('2');
  await expect(page.locator('.provider-output-empty')).toContainText('No player window open');
  expect(providerRequests).toEqual([firstUrl]);
  const secondUrl = 'https://vidqueen.st/embed/tv/1399/0/2?autoplay=false&player=vidstack';
  const secondPopupEvent = page.waitForEvent('popup');
  await loadButton.click();
  const secondPopup = await secondPopupEvent;
  await secondPopup.waitForURL(secondUrl);
  await expect(secondPopup.getByText('MOCK PROVIDER WINDOW')).toBeVisible();
  expect(providerRequests).toEqual([firstUrl, secondUrl]);
  await firstPopup.close();
  await secondPopup.close();

  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('vidlink');
  await expect(page.locator('.provider-player')).toHaveAttribute('aria-label', 'VidLink provider player');
  await expect(page.getByRole('combobox', { name: 'Player variant' })).toHaveCount(0);
  await page.getByLabel('TMDB ID', { exact: true }).fill('603');
  await page.getByLabel(/I confirm I am authorized/).check();
  const thirdUrl = 'https://vidlink.pro/movie/603?autoplay=false';
  const thirdPopupEvent = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open player window', exact: true }).click();
  const thirdPopup = await thirdPopupEvent;
  await thirdPopup.waitForURL(thirdUrl);
  await expect(thirdPopup.getByText('MOCK PROVIDER WINDOW')).toBeVisible();
  expect(await thirdPopup.evaluate(() => window.opener)).toBeNull();
  expect(providerRequests).toEqual([firstUrl, secondUrl, thirdUrl]);
  await thirdPopup.close();

  const externalSources = await page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.sources?.filter((source: any) => ['vidqueen', 'vidrift', 'vidbolt', 'cinezo', 'vidlink'].includes(source.catalog?.providerId));
  }, AUTOSAVE_KEY);
  expect(externalSources ?? []).toEqual([]);
  assertNoRuntimeErrors();
});

test('Catalog stays reachable without top-bar overflow at 1080px', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.setViewportSize({ width: 1080, height: 800 });
  await page.goto('/');
  await expect(page.locator('.top-bar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => page.locator('.top-actions').evaluate((actions) => {
    const last = actions.lastElementChild?.getBoundingClientRect();
    const title = document.querySelector<HTMLElement>('.project-title');
    return Boolean(last && title && last.right <= window.innerWidth
      && title.scrollWidth <= title.clientWidth + 1
      && title.getBoundingClientRect().right <= actions.getBoundingClientRect().left);
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('catalog-topbar-1080.png') });
  await page.getByRole('button', { name: 'Catalog', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Providers', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Provider', exact: true }).selectOption('cinezo');
  await expect(page.locator('.provider-setup')).toBeVisible();
  await expect(page.locator('.provider-output-empty')).toBeVisible();
  await expect.poll(() => page.locator('.catalog-shell').evaluate((shell) => shell.scrollWidth <= shell.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('provider-player-1080.png') });
  assertNoRuntimeErrors();
});
