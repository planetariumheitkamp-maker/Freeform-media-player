import { expect, _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDirectory = path.join(root, 'test-results', 'desktop-packaged');
const profileDirectory = path.join(root, 'test-results', 'desktop-profile');
const executablePath = path.resolve(root, process.argv[2] ?? path.join('release', 'win-unpacked', 'Freeform.exe'));
const autosaveKey = 'freeform.workspace.autosave.v1';

await rm(outputDirectory, { recursive: true, force: true });
await rm(profileDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const runtimeErrors = [];
const checks = [];
let electronApp;

try {
  electronApp = await electron.launch({
    executablePath,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')),
    args: [
      `--user-data-dir=${profileDirectory}`,
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--enable-webgl',
      '--autoplay-policy=no-user-gesture-required',
    ],
    timeout: 60_000,
  });
  const page = await electronApp.firstWindow();
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.freeform?.isDesktop), true);
  const appInfo = await electronApp.evaluate(({ app }) => ({
    name: app.getName(),
    version: app.getVersion(),
    packaged: app.isPackaged,
  }));
  assert.equal(appInfo.packaged, true);
  checks.push('Packaged executable starts with the desktop preload and WebGL canvas.');

  const setInput = async (selector, value) => {
    await page.locator(selector).evaluate((input, next) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, String(next));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  for (const color of ['#1a1d1b', '#141615', '#000000', '#f4f1e8', '#1e3448', '#402b4b']) {
    await page.getByRole('button', { name: `Use background color ${color}`, exact: true }).click();
    await expect(page.getByLabel('Background color', { exact: true })).toHaveValue(color);
    await expect(canvas).toHaveAttribute('data-background-color', color);
  }
  await setInput('input[aria-label="Background color"]', '#28445f');
  await expect(canvas).toHaveAttribute('data-background-color', '#28445f');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.getByRole('button', { name: 'Hide all control panels', exact: true }).click();
  await expect(page.locator('.top-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show control panels', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.top-bar')).toBeVisible();
  await expect(page.locator('.source-rail')).toBeVisible();
  await expect(page.locator('.inspector')).toBeVisible();

  const visualFields = [
    { field: 'brightness', label: 'Brightness', value: 1.45, initial: 1 },
    { field: 'contrast', label: 'Contrast', value: 1.35, initial: 1 },
    { field: 'saturation', label: 'Saturation', value: 0.6, initial: 1 },
    { field: 'gamma', label: 'Gamma', value: 1.3, initial: 1 },
    { field: 'hue', label: 'Hue', value: 65, initial: 0 },
    { field: 'temperature', label: 'Temperature', value: 45, initial: 0 },
  ];
  const expectCanvasChange = async (previousFrame, label) => {
    try {
      await expect.poll(() => canvas.evaluate((element) => element.toDataURL()), { timeout: 30_000 }).not.toBe(previousFrame);
    } catch (error) {
      throw new Error(`${label} did not update the packaged canvas.`, { cause: error });
    }
  };
  let previousAppearanceFrame = await canvas.evaluate((element) => element.toDataURL());
  for (const visual of visualFields) {
    await setInput(`input[data-visual-field="${visual.field}"]`, visual.value);
    await expect(page.getByRole('slider', { name: visual.label, exact: true })).toHaveValue(String(visual.value));
    await expectCanvasChange(previousAppearanceFrame, `Visual field "${visual.field}"`);
    previousAppearanceFrame = await canvas.evaluate((element) => element.toDataURL());
  }
  await page.getByRole('button', { name: 'Reset visual settings', exact: true }).click();
  for (const visual of visualFields) {
    await expect(page.getByRole('slider', { name: visual.label, exact: true })).toHaveValue(String(visual.initial));
  }
  await setInput('input[data-visual-field="brightness"]', 1.25);
  checks.push('Every background preset, global panel controls, and every visual slider work in the packaged app; visual reset restores neutral values.');

  await page.getByRole('button', { name: 'Planetarium', exact: true }).click();
  await page.getByLabel('Enable planetarium mode', { exact: true }).check();
  await page.getByLabel('Dome field of view', { exact: true }).fill('160');
  await page.getByLabel('Dome tilt', { exact: true }).fill('10');
  await page.getByLabel('Projection center X', { exact: true }).fill('8');
  await page.getByLabel('Projection center Y', { exact: true }).fill('-6');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.circular-grid-labels')).toBeVisible();
  const domeToggle = page.getByLabel('Dome warp', { exact: true });
  await expect(domeToggle).toBeEnabled();
  const unwarpedFrame = await canvas.evaluate((element) => element.toDataURL());
  await domeToggle.check();
  await expectCanvasChange(unwarpedFrame, 'Dome warp');
  checks.push('Planetarium controls and per-player dome warp change packaged rendering.');

  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.player-row')).toHaveCount(1);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.player-row')).toHaveCount(2);
  checks.push('Ctrl+Z and Ctrl+Y undo and redo a packaged player operation.');

  const standardWidth = await canvas.evaluate((element) => element.width);
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByLabel('Projection quality', { exact: true }).selectOption('high');
  await expect(canvas).toHaveAttribute('data-render-quality', 'high');
  await expect.poll(() => canvas.evaluate((element) => element.width)).toBeGreaterThan(standardWidth);
  const highSize = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
  await expect(page.getByLabel('Render resolution', { exact: true })).toHaveText(`${highSize.width} × ${highSize.height} px`);
  await expect(page.getByLabel('Render frame rate', { exact: true })).toHaveText(/^\d+(?:\.\d+)? fps$/);
  await expect(page.getByLabel('Render frame time', { exact: true })).toHaveText(/^\d+(?:\.\d+)? ms$/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push('High quality and live resolution, frame-rate, and frame-time readouts work in the packaged app.');

  await expect.poll(async () => page.evaluate((key) => {
    const generations = Object.keys(localStorage)
      .filter((candidate) => candidate.startsWith(`${key}.`))
      .map((candidate) => {
        try { return JSON.parse(localStorage.getItem(candidate) ?? '{}'); } catch { return null; }
      })
      .filter((envelope) => envelope?.version === 1
        && typeof envelope.savedAt === 'string' && typeof envelope.content === 'string')
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    const project = JSON.parse(generations[0]?.content ?? localStorage.getItem(key) ?? '{}');
    return project.players?.length === 2
      && project.players?.[0]?.domeWarp === true
      && project.players?.[0]?.visual?.brightness === 1.25
      && project.backgroundColor === '#28445f'
      && project.planetarium?.enabled === true
      && project.grid?.kind === 'circular'
      && project.quality === 'high';
  }, autosaveKey)).toBe(true);

  await page.reload();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-render-quality', 'high');
  await expect(canvas).toHaveAttribute('data-background-color', '#28445f');
  await expect(page.locator('.player-row')).toHaveCount(2);
  await expect(page.getByRole('slider', { name: 'Brightness', exact: true })).toHaveValue('1.25');
  await expect(page.getByLabel('Dome warp', { exact: true })).toBeChecked();
  await expect(page.locator('.circular-grid-labels')).toBeVisible();
  await page.getByRole('button', { name: 'Planetarium', exact: true }).click();
  await expect(page.getByLabel('Enable planetarium mode', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Dome field of view', { exact: true })).toHaveValue('160');
  await expect(page.getByLabel('Dome tilt', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Projection center X', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('Projection center Y', { exact: true })).toHaveValue('-6');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByLabel('Projection quality', { exact: true })).toHaveValue('high');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push('Players, dome settings, dome toggles, circular grid, and High quality survive reload.');

  await page.locator('.warp-workspace').screenshot({
    path: path.join(outputDirectory, 'desktop-planetarium.png'),
  });
  assert.deepEqual(runtimeErrors, []);
  checks.push('No renderer console errors or uncaught page errors were observed.');

  await writeFile(path.join(outputDirectory, 'desktop-verification.json'), JSON.stringify({
    executablePath,
    appInfo,
    checks,
    runtimeErrors,
  }, null, 2));
  console.log(JSON.stringify({ appInfo, checks, runtimeErrors }, null, 2));
} catch (error) {
  if (electronApp) {
    for (const [index, window] of electronApp.windows().entries()) {
      try {
        await window.screenshot({ path: path.join(outputDirectory, `desktop-failure-${index}.png`), timeout: 5000 });
      } catch {
        // Preserve the original failure if the renderer is also unresponsive.
      }
    }
  }
  throw new Error(`Packaged desktop verification failed. Runtime errors: ${runtimeErrors.join(' | ') || 'none'}`, { cause: error });
} finally {
  if (electronApp) await electronApp.close();
  await rm(profileDirectory, { recursive: true, force: true });
}
