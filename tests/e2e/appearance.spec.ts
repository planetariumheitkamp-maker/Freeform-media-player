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
        .filter((envelope) => envelope?.version === 1
          && typeof envelope.savedAt === 'string' && typeof envelope.content === 'string')
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      return JSON.parse(generations[0]?.content ?? localStorage.getItem(key) ?? '{}');
    };
  });
});

function monitorRuntime(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => errors.push(`Failed request: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  return () => expect(errors, 'Browser errors and failed requests').toEqual([]);
}

async function setInput(page: Page, selector: string, value: string | number) {
  await page.locator(selector).evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function canvasFrame(page: Page) {
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  return page.locator('canvas.warp-canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
}

async function savedValue(page: Page, read: (project: any) => unknown, field?: string) {
  return page.evaluate(({ key, source, name }) => {
    const project = window.readFreeformAutosave(key);
    return new Function('project', 'field', `return (${source})(project);`)(project, { field: name });
  }, { key: AUTOSAVE_KEY, source: read.toString(), name: field });
}

test('background colors render, survive presentation and reload, and reset', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntime(page);
  await page.goto('/');
  const initialFrame = await canvasFrame(page);
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace background' })).toBeVisible();
  await setInput(page, 'input[aria-label="Background color"]', '#28445f');
  await expect(page.getByLabel('Background color value')).toHaveText('#28445F');
  await expect(page.locator('canvas.warp-canvas')).toHaveAttribute('data-background-color', '#28445f');
  await expect.poll(() => canvasFrame(page)).not.toBe(initialFrame);
  for (const color of ['#1a1d1b', '#141615', '#000000', '#f4f1e8', '#1e3448', '#402b4b']) {
    await page.getByRole('button', { name: `Use background color ${color}`, exact: true }).click();
    await expect(page.getByLabel('Background color', { exact: true })).toHaveValue(color);
    await expect(page.locator('canvas.warp-canvas')).toHaveAttribute('data-background-color', color);
  }
  await setInput(page, 'input[aria-label="Background color"]', '#28445f');
  await expect(page.locator('canvas.warp-canvas')).toHaveAttribute('data-background-color', '#28445f');
  await page.screenshot({ path: testInfo.outputPath('background-color-dialog.png') });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect.poll(() => savedValue(page, (project) => project.backgroundColor)).toBe('#28445f');

  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Present controls', exact: true })).toBeVisible();
  await expect(page.locator('.top-bar')).toHaveCount(0);
  await expect(page.locator('canvas.warp-canvas')).toHaveAttribute('data-background-color', '#28445f');
  await expect.poll(() => page.locator('canvas.warp-canvas').evaluate((source) => {
    const sample = document.createElement('canvas');
    sample.width = sample.height = 1;
    const context = sample.getContext('2d');
    context?.drawImage(source as HTMLCanvasElement, 0, 0, 1, 1, 0, 0, 1, 1);
    const pixel = context?.getImageData(0, 0, 1, 1).data;
    return pixel ? `#${[...pixel.slice(0, 3)].map((channel) => channel.toString(16).padStart(2, '0')).join('')}` : '';
  })).toBe('#28445f');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toHaveAttribute('data-background-color', '#28445f');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.getByLabel('Background color', { exact: true })).toHaveValue('#28445f');
  await page.getByRole('button', { name: 'Reset color', exact: true }).click();
  await expect(page.getByLabel('Background color', { exact: true })).toHaveValue('#1a1d1b');
  await expect(page.locator('canvas.warp-canvas')).toHaveAttribute('data-background-color', '#1a1d1b');
  assertNoRuntimeErrors();
});

test('hide-all restores independent panel states and supports keyboard controls', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntime(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  const initialBounds = await canvas.boundingBox();
  if (!initialBounds) throw new Error('Canvas did not have an initial layout.');
  await page.getByRole('button', { name: 'Minimize sources and players panel', exact: true }).click();
  await page.getByRole('button', { name: 'Hide all control panels', exact: true }).click();
  for (const selector of ['.top-bar', '.source-rail', '.inspector', '.workspace-toolbar', '.transport-bar', '.panel-restore']) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'Show control panels', exact: true })).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())?.width).toBeGreaterThan(initialBounds.width);
  await page.screenshot({ path: testInfo.outputPath('focus-mode.png') });

  await page.keyboard.press('Escape');
  await expect(page.locator('.top-bar')).toBeVisible();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('.source-rail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore sources and players panel', exact: true })).toBeVisible();
  await page.keyboard.press('Shift+F');
  await expect(page.locator('.app-shell')).toHaveClass(/is-focus-mode/);
  await page.keyboard.press('Shift+F');
  await expect(page.locator('.app-shell')).not.toHaveClass(/is-focus-mode/);
  await page.getByRole('button', { name: 'Hide all control panels', exact: true }).click();
  await page.getByRole('button', { name: 'Show control panels', exact: true }).click();
  await expect(page.locator('.top-bar')).toBeVisible();
  await expect(page.locator('.source-rail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore sources and players panel', exact: true }).click();
  await expect(page.locator('.source-rail')).toBeVisible();
  assertNoRuntimeErrors();
});

test('every visual slider renders and persists independently for each player', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntime(page);
  await page.goto('/');
  const fields = [
    { label: 'Brightness', field: 'brightness', value: 1.45 },
    { label: 'Contrast', field: 'contrast', value: 1.35 },
    { label: 'Saturation', field: 'saturation', value: 0.6 },
    { label: 'Gamma', field: 'gamma', value: 1.3 },
    { label: 'Hue', field: 'hue', value: 65 },
    { label: 'Temperature', field: 'temperature', value: 45 },
  ];
  let previousFrame = await canvasFrame(page);
  for (const field of fields) {
    await setInput(page, `input[data-visual-field="${field.field}"]`, field.value);
    await expect(page.getByRole('slider', { name: field.label, exact: true })).toHaveValue(String(field.value));
    await expect.poll(() => savedValue(page, (project) => project.players?.[0]?.visual?.[field.field], field.field)).toBe(field.value);
    await expect.poll(() => canvasFrame(page)).not.toBe(previousFrame);
    previousFrame = await canvasFrame(page);
  }
  await page.getByRole('button', { name: 'Reset visual settings', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('appearance-adjusted.png') });

  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  await expect.poll(() => savedValue(page, (project) => project.players?.[1]?.visual)).toEqual({
    brightness: 1, contrast: 1, saturation: 1, gamma: 1, hue: 0, temperature: 0,
  });
  await setInput(page, 'input[data-visual-field="brightness"]', 1.2);
  await expect.poll(() => savedValue(page, (project) => project.players?.[0]?.visual?.brightness)).toBe(1.45);
  await expect.poll(() => savedValue(page, (project) => project.players?.[1]?.visual?.brightness)).toBe(1.2);

  await page.reload();
  await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('1.45');
  await expect(page.getByRole('slider', { name: 'Gamma', exact: true })).toHaveValue('1.3');
  await expect(page.getByRole('slider', { name: 'Hue', exact: true })).toHaveValue('65');
  previousFrame = await canvasFrame(page);
  await page.getByRole('button', { name: 'Reset visual settings', exact: true }).click();
  await expect.poll(() => savedValue(page, (project) => project.players?.[0]?.visual)).toEqual({
    brightness: 1, contrast: 1, saturation: 1, gamma: 1, hue: 0, temperature: 0,
  });
  await expect.poll(() => savedValue(page, (project) => project.players?.[1]?.visual?.brightness)).toBe(1.2);
  await expect.poll(() => canvasFrame(page)).not.toBe(previousFrame);
  assertNoRuntimeErrors();
});
