import { expect, test, type Page } from '@playwright/test';

const AUTOSAVE_KEY = 'freeform.workspace.autosave.v1';
const SMALL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==', 'base64');

async function readProject(page: Page): Promise<any> {
  return page.evaluate((key) => {
    const generations = Object.keys(localStorage)
      .filter((candidate) => candidate.startsWith(`${key}.`))
      .map((candidate) => {
        try { return JSON.parse(localStorage.getItem(candidate) ?? '{}'); } catch { return null; }
      })
      .filter((envelope) => envelope?.version === 1
        && typeof envelope.savedAt === 'string' && typeof envelope.content === 'string')
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

async function enterPresent(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.keyboard.press('h');
  await expect(page.getByRole('region', { name: 'Present mode controls' })).toBeVisible();
}

test('ambient styles and tuning persist while browser-only transparency is safely disabled', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await enterPresent(page);
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toHaveAttribute('data-transparency', 'opaque');
  await expect(canvas).toHaveAttribute('data-ambient-enabled', 'false');
  await expect(page.getByRole('button', { name: /Transparent background/ })).toBeDisabled();
  const originalFrame = await canvas.evaluate((source) => (source as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: /Ambient lighting/ }).click();
  await expect(canvas).toHaveAttribute('data-ambient-enabled', 'true');
  await expect.poll(async () => (await canvas.evaluate((source) => (source as HTMLCanvasElement).toDataURL())) !== originalFrame).toBe(true);
  await page.getByRole('button', { name: 'Average color', exact: true }).click();
  await setRange(page, 'Ambient intensity', 1.5);
  await setRange(page, 'Ambient spread', 96);
  await setRange(page, 'Ambient smoothing', 0.36);
  await expect(canvas).toHaveAttribute('data-ambient-style', 'average');
  await expect(canvas).toHaveAttribute('data-ambient-intensity', '1.50');
  await expect(canvas).toHaveAttribute('data-ambient-spread', '96');
  await expect(canvas).toHaveAttribute('data-ambient-smoothing', '0.36');
  await page.screenshot({ path: testInfo.outputPath('present-average-ambient.png') });
  await expect.poll(async () => (await readProject(page)).present?.ambient).toEqual({
    enabled: true, style: 'average', intensity: 1.5, spread: 96, smoothing: 0.36,
  });
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  expect((await readProject(page)).present?.ambient).toEqual({
    enabled: true, style: 'average', intensity: 1.5, spread: 96, smoothing: 0.36,
  });
  expect(errors).toEqual([]);
});

test('global layout lock blocks Present dragging and retains a restorable snapshot', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.locator('.player-actions button').first().click();
  await expect.poll(async () => (await readProject(page)).players?.length).toBe(2);
  const before = await readProject(page);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.keyboard.press('h');
  const lock = page.getByRole('button', { name: /Layout \+ window/ });
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await readProject(page)).present?.layoutLocked).toBe(true);
  const locked = await readProject(page);
  expect(locked.present.lockedLayout.players).toHaveLength(before.players.length);
  expect(locked.present.lockedLayout.output).toEqual(before.output);
  const bounds = await page.locator('.warp-workspace').boundingBox();
  if (!bounds) throw new Error('Presentation workspace was not laid out.');
  const fit = Math.min(bounds.width / before.output.width, bounds.height / before.output.height) * 0.9;
  const x = bounds.x + bounds.width / 2 + before.players[0].position.x * fit;
  const y = bounds.y + bounds.height / 2 - before.players[0].position.y * fit;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 160, y + 80, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(850);
  expect((await readProject(page)).players[0].position).toEqual(before.players[0].position);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  const restored = await readProject(page);
  expect(restored.present.layoutLocked).toBe(true);
  expect(restored.present.lockedLayout.players[0].position).toEqual(before.players[0].position);
  expect(restored.present.lockedLayout.players[0].locked).toBe(before.players[0].locked);
});

test('floating Present window starts on the left, drags, resets, and can stay pinned', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await enterPresent(page);
  const controls = page.locator('.present-controls');
  const heading = page.locator('.present-control-heading');
  await expect(controls).toHaveCSS('left', '16px');
  await expect(controls).toHaveCSS('top', '16px');
  await expect(controls).toHaveCSS('transform', 'none');
  await page.getByRole('button', { name: 'Keep Present controls open', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Keep Present controls open', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(4500);
  await expect(page.getByRole('region', { name: 'Present mode controls' })).toBeVisible();

  const bounds = await heading.boundingBox();
  if (!bounds) throw new Error('The floating Present heading was not laid out.');
  await page.mouse.move(bounds.x + 80, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 260, bounds.y + bounds.height / 2 + 140, { steps: 10 });
  await page.mouse.up();
  await expect(controls).toHaveCSS('left', '196px');
  await expect(controls).toHaveCSS('top', '156px');
  await page.screenshot({ path: testInfo.outputPath('present-floating-dragged.png') });
  await page.getByRole('button', { name: 'Reset Present panel position', exact: true }).click();
  await expect(controls).toHaveCSS('left', '16px');
  await expect(controls).toHaveCSS('top', '16px');
  await page.screenshot({ path: testInfo.outputPath('present-floating-left.png') });
  expect(errors).toEqual([]);
});

test('floating Present controls resize by pointer and keyboard without clipping their views', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await enterPresent(page);
  const panel = page.getByRole('region', { name: 'Present mode controls' });
  const resizeHandle = panel.getByRole('button', { name: 'Resize Present controls', exact: true });
  await panel.getByRole('button', { name: 'Keep Present controls open', exact: true }).click();
  const readSize = async () => {
    const bounds = await panel.boundingBox();
    if (!bounds) throw new Error('The floating Present panel was not laid out.');
    return { width: Math.round(bounds.width), height: Math.round(bounds.height) };
  };
  const dragResize = async (x: number, y: number) => {
    const bounds = await resizeHandle.boundingBox();
    if (!bounds) throw new Error('The Present resize handle was not laid out.');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + x, bounds.y + bounds.height / 2 + y, { steps: 8 });
    await page.mouse.up();
  };

  const initial = await readSize();
  expect(initial.width).toBe(384);
  await dragResize(120, 90);
  const resized = await readSize();
  expect(resized).toEqual({ width: initial.width + 120, height: initial.height + 90 });
  await expect(page.locator('.present-controls')).toHaveCSS('left', '16px');
  await expect(page.locator('.present-controls')).toHaveCSS('top', '16px');
  await page.screenshot({ path: testInfo.outputPath('present-floating-resized.png') });

  await panel.getByRole('button', { name: 'Media', exact: true }).click();
  await expect(panel.locator('.sources-section')).toBeVisible();
  const mediaBounds = await panel.locator('.present-source-browser').boundingBox();
  const panelBounds = await panel.boundingBox();
  if (!mediaBounds || !panelBounds) throw new Error('The resized Media view was not laid out.');
  expect(mediaBounds.height).toBeGreaterThanOrEqual(panelBounds.height - 78);
  expect(mediaBounds.y + mediaBounds.height).toBeLessThanOrEqual(panelBounds.y + panelBounds.height + 1);
  await panel.getByRole('button', { name: 'Present', exact: true }).click();

  await resizeHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await readSize()).width).toBe(resized.width + 16);
  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await readSize()).height).toBe(resized.height + 32);
  await page.keyboard.press('Home');
  await expect.poll(readSize).toEqual(initial);

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await readSize()).width).toBe(initial.width + 16);
  await resizeHandle.dblclick();
  await expect.poll(readSize).toEqual(initial);

  await dragResize(2000, 2000);
  const maximum = await readSize();
  const maximumBounds = await panel.boundingBox();
  if (!maximumBounds) throw new Error('The maximized Present panel was not laid out.');
  expect(maximum.width).toBe(720);
  expect(maximumBounds.y + maximumBounds.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight) - 7);
  await resizeHandle.dblclick();
  await expect.poll(readSize).toEqual(initial);
  expect(errors).toEqual([]);
});

test('Present Players and Media assign, replace, and reconnect sources without leaving presentation', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await enterPresent(page);
  const panel = page.getByRole('region', { name: 'Present mode controls' });
  await panel.getByRole('button', { name: 'Keep Present controls open', exact: true }).click();
  await panel.getByRole('button', { name: 'Players', exact: true }).click();
  await expect(panel.locator('.sources-section')).toBeHidden();
  await expect(panel.locator('.players-section')).toBeVisible();
  await panel.locator('.player-actions').getByRole('button', { name: 'Add player', exact: true }).click();
  await expect(panel.locator('.player-row')).toHaveCount(2);
  await expect.poll(async () => (await readProject(page)).players?.length).toBe(2);
  await expect(panel.locator('.player-row').nth(1)).toHaveClass(/is-active/);
  await panel.locator('.player-row').first().click();
  await expect(panel.locator('.player-row').first()).toHaveClass(/is-active/);
  await panel.locator('.player-row').nth(1).click();
  await expect(panel.locator('.player-row').nth(1)).toHaveClass(/is-active/);
  await page.screenshot({ path: testInfo.outputPath('present-floating-players.png') });

  await panel.getByRole('button', { name: 'Media', exact: true }).click();
  await expect(panel.locator('.sources-section')).toBeVisible();
  await expect(panel.locator('.players-section')).toBeHidden();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: 'Files', exact: true }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'present-media.png', mimeType: 'image/png', buffer: SMALL_PNG });
  const uploadedRow = panel.locator('.source-row').filter({ hasText: 'present-media.png' });
  await expect(uploadedRow.locator('.source-status')).toHaveClass(/connected/);
  // Browser file URLs are session-only: persistence keeps a disconnected reference for explicit reauthorization.
  await expect.poll(async () => (await readProject(page)).sources?.find((source: any) => source.name === 'present-media.png')?.connected).toBe(false);
  await expect.poll(async () => (await readProject(page)).players[1]?.sourceId).toBe((await readProject(page)).sources.find((source: any) => source.name === 'present-media.png')?.id);
  await page.screenshot({ path: testInfo.outputPath('present-floating-media.png') });

  await panel.getByRole('button', { name: 'Stream', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add network media', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Add network media', exact: true })).toHaveCount(0);
  await expect(page.locator('.app-shell')).toHaveClass(/is-presenting/);
  await expect(panel).toBeVisible();

  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await expect.poll(async () => (await readProject(page)).sources?.find((source: any) => source.name === 'present-media.png')?.connected).toBe(false);
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.keyboard.press('h');
  await panel.getByRole('button', { name: 'Media', exact: true }).click();
  const replacementPromise = page.waitForEvent('filechooser');
  await panel.getByTitle('Reconnect or replace media', { exact: true }).click();
  const replacement = await replacementPromise;
  await replacement.setFiles({ name: 'present-media.png', mimeType: 'image/png', buffer: SMALL_PNG });
  await expect(uploadedRow.locator('.source-status')).toHaveClass(/connected/);
  await expect(page.getByTitle('Reconnect or replace media', { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await readProject(page)).sources?.find((source: any) => source.name === 'present-media.png')?.connected).toBe(false);
  await expect(page.locator('.app-shell')).toHaveClass(/is-presenting/);
  expect(errors).toEqual([]);
});

test('Present toolbar hides after pointer use but stays available during keyboard navigation', async ({ page }) => {
  await enterPresent(page);
  await page.getByRole('button', { name: 'Present controls', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Present mode controls' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Present controls', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Present mode controls' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Present mode controls' })).toHaveCount(0, { timeout: 6500 });
  await page.keyboard.press('h');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Keep Present controls open', exact: true })).toBeFocused();
  await page.waitForTimeout(4700);
  await expect(page.getByRole('region', { name: 'Present mode controls' })).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.getByRole('region', { name: 'Present mode controls' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Present controls', exact: true }).click();
  await page.getByRole('button', { name: 'Exit', exact: false }).click();
  await expect(page.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
});
