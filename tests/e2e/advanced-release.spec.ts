import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const AUTOSAVE_KEY = 'freeform.workspace.autosave.v1';

function monitorRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return () => expect(errors, 'Browser console and page errors').toEqual([]);
}

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

async function canvasFrame(page: Page): Promise<string> {
  return page.locator('canvas.warp-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}

async function settleRender(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function pngFixture(page: Page, color: string): Promise<Buffer> {
  const encoded = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Fixture canvas is unavailable.');
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#c5ffc3';
    context.lineWidth = 3;
    for (let x = 0; x <= canvas.width; x += 20) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 15) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return Buffer.from(encoded, 'base64');
}

async function uploadMedia(page: Page, name: string, buffer: Buffer) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer });
  await expect(page.locator('.source-row').filter({ hasText: name })).toBeVisible();
}

async function openPlanetarium(page: Page) {
  await page.getByRole('button', { name: 'Planetarium', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Planetarium mode', exact: true })).toBeVisible();
}

test('startup rejects a corrupt newest autosave and restores the older valid generation', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await page.getByLabel('Project name', { exact: true }).fill('Last known good');
  await expect.poll(async () => (await readProject(page)).name).toBe('Last known good');
  await page.evaluate((key) => {
    const good = JSON.parse(localStorage.getItem(`${key}.1`) ?? '{}');
    localStorage.setItem(`${key}.1`, JSON.stringify({ ...good, savedAt: '2026-10-28T00:00:01.000Z' }));
    localStorage.setItem(`${key}.2`, JSON.stringify({
      version: 1, savedAt: '2026-10-28T00:00:02.000Z', content: '{broken project',
    }));
    localStorage.setItem('freeform.workspace.recovery.index.v1', '2');
  }, AUTOSAVE_KEY);

  await page.reload();
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Last known good');
  await expect(page.getByText('Recovered an earlier workspace snapshot', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recovery and diagnostics', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Recovery & diagnostics', exact: true })).toBeVisible();
  expect(await page.locator('.recovery-row').count()).toBeGreaterThanOrEqual(2);
  assertNoRuntimeErrors();
});

test('portable export embeds media and grid images and restores them without local paths', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await page.getByLabel('Project name', { exact: true }).fill('Portable master');
  const media = await pngFixture(page, '#172019');
  await uploadMedia(page, 'portable-image.png', media);
  await expect(page.locator('.media-layer img')).toHaveAttribute('src', /^blob:/);

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  const gridChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import image', exact: true }).click();
  await (await gridChooser).setFiles({ name: 'portable-grid.png', mimeType: 'image/png', buffer: media });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Portable', exact: true }).click();
  const download = await downloadEvent;
  const portablePath = testInfo.outputPath('portable.freeform.json');
  await download.saveAs(portablePath);
  const portable = JSON.parse(await readFile(portablePath, 'utf8'));
  const embedded = portable.sources.find((source: { name: string }) => source.name === 'portable-image.png');
  expect(embedded.uri).toMatch(/^data:image\/png;base64,/);
  expect(embedded.connected).toBe(true);
  expect(portable.background.uri).toMatch(/^data:image\/png;base64,/);

  await page.getByLabel('Project name', { exact: true }).fill('Temporary changes');
  const openChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await openChooser).setFiles(portablePath);
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Portable master');
  await expect(page.locator('.media-layer img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect.poll(async () => (await readProject(page)).background?.uri).toMatch(/^data:image\/png;base64,/);
  assertNoRuntimeErrors();
});

test('reference-only project files reconnect missing media through filename batch relinking', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const media = await pngFixture(page, '#10182c');
  await uploadMedia(page, 'relink-image.png', media);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save file', exact: true }).click();
  const download = await downloadEvent;
  const referencePath = testInfo.outputPath('reference.freeform.json');
  await download.saveAs(referencePath);
  const reference = JSON.parse(await readFile(referencePath, 'utf8'));
  const source = reference.sources.find((candidate: { name: string }) => candidate.name === 'relink-image.png');
  expect(source.uri).toBeUndefined();
  expect(source.connected).toBe(false);

  const openChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await openChooser).setFiles(referencePath);
  await expect(page.getByText('RECONNECT REQUIRED', { exact: true })).toBeVisible();
  const relink = page.getByRole('button', { name: 'Relink missing media', exact: true });
  await expect(relink).toBeEnabled();
  const relinkChooser = page.waitForEvent('filechooser');
  await relink.click();
  await (await relinkChooser).setFiles({ name: 'relink-image.png', mimeType: 'image/png', buffer: media });
  await expect(page.getByText('CONNECTED', { exact: true })).toBeVisible();
  await expect(page.getByText('1 source relinked', { exact: true })).toBeVisible();
  await expect(page.locator('.media-layer img')).toHaveAttribute('src', /^blob:/);
  assertNoRuntimeErrors();
});

test('multi-player alignment, distribution, marquee selection, resize, and history stay consistent', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByLabel('Project name', { exact: true }).fill('Alignment test');
  await expect.poll(async () => (await readProject(page)).players?.length).toBe(1);
  await page.locator('.player-actions button').first().click();
  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(3);
  const positions = [
    { x: '-420', y: '120' }, { x: '100', y: '0' }, { x: '420', y: '-120' },
  ];
  for (let index = 0; index < positions.length; index += 1) {
    await page.locator('.player-row').nth(index).click();
    await page.getByLabel('X', { exact: true }).fill(positions[index].x);
    await page.getByLabel('Y', { exact: true }).fill(positions[index].y);
  }
  const rows = page.locator('.player-row');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.locator('.selection-notice')).toContainText('3 players selected');

  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await expect.poll(async () => {
    const project = await readProject(page);
    const tops = project.players.map((player: any) => player.position.y + Math.max(...player.quickCorners.map((point: any) => point.y)) * player.scale);
    return Math.max(...tops) - Math.min(...tops);
  }).toBeLessThan(0.000001);

  await page.getByLabel('Selection width', { exact: true }).fill('1200');
  await expect.poll(async () => {
    const project = await readProject(page);
    const left = Math.min(...project.players.map((player: any) => player.position.x + Math.min(...player.quickCorners.map((point: any) => point.x)) * player.scale));
    const right = Math.max(...project.players.map((player: any) => player.position.x + Math.max(...player.quickCorners.map((point: any) => point.x)) * player.scale));
    return right - left;
  }).toBeCloseTo(1200, 6);

  await page.getByRole('button', { name: 'Distribute X', exact: true }).click();
  await expect.poll(async () => {
    const project = await readProject(page);
    const centers = project.players.map((player: any) => player.position.x).sort((a: number, b: number) => a - b);
    return Math.abs((centers[1] - centers[0]) - (centers[2] - centers[1]));
  }).toBeLessThan(0.000001);
  const distributed = await readProject(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await readProject(page)).players[1].position.x).not.toBe(distributed.players[1].position.x);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await readProject(page)).players[1].position.x).toBeCloseTo(distributed.players[1].position.x, 8);

  const bounds = await page.locator('.warp-workspace').boundingBox();
  if (!bounds) throw new Error('Workspace was not laid out.');
  await page.mouse.move(bounds.x + 12, bounds.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 12, bounds.y + bounds.height - 12, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.selection-notice')).toContainText('3 players selected');
  assertNoRuntimeErrors();
});

test('dome presets, lens models, and prewarped bypass persist without a second warp', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  await openPlanetarium(page);
  await page.getByLabel('Enable planetarium mode', { exact: true }).check();
  await page.getByRole('button', { name: /Off-center fisheye/ }).click();
  await expect(page.getByLabel('Projection center X', { exact: true })).toHaveValue('18');
  await expect(page.getByLabel('Projection center Y', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('Projection model', { exact: true })).toHaveValue('equisolid');
  await page.getByLabel('Projection model', { exact: true }).selectOption('stereographic');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await settleRender(page);
  const flatFrame = await canvasFrame(page);

  await page.getByLabel('Dome warp', { exact: true }).check();
  await expect.poll(() => canvasFrame(page)).not.toBe(flatFrame);
  await page.getByLabel('Media is prewarped', { exact: true }).check();
  await expect(page.getByLabel('Dome warp', { exact: true })).toBeDisabled();
  await expect.poll(() => canvasFrame(page)).toBe(flatFrame);
  await expect.poll(async () => (await readProject(page)).players[0].domePrewarped).toBe(true);
  const saved = await readProject(page);
  expect(saved.planetarium).toMatchObject({ model: 'stereographic', offsetX: 18, offsetY: 8, fov: 180 });
  expect(saved.grid).toMatchObject({ kind: 'circular', radius: 85 });

  await page.reload();
  await expect(canvas).toBeVisible();
  await expect(page.getByLabel('Media is prewarped', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Dome warp', { exact: true })).toBeDisabled();
  await openPlanetarium(page);
  await expect(page.getByLabel('Projection model', { exact: true })).toHaveValue('stereographic');
  await expect(page.getByLabel('Projection center X', { exact: true })).toHaveValue('18');
  assertNoRuntimeErrors();
});

test('grid-relative player orientation follows named references and survives reload', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  const orientation = page.getByLabel('Grid-relative orientation', { exact: true });
  const reference = page.getByLabel('Orientation reference point', { exact: true });
  await expect(orientation).toBeDisabled();
  await openPlanetarium(page);
  await page.getByLabel('Enable planetarium mode', { exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Dome warp', { exact: true }).check();
  await expect(orientation).toBeEnabled();
  await expect(reference).toBeDisabled();
  await settleRender(page);
  let previousFrame = await canvasFrame(page);

  for (const mode of ['top-toward', 'top-away', 'right-toward', 'right-away']) {
    await orientation.selectOption(mode);
    await expect.poll(() => canvasFrame(page)).not.toBe(previousFrame);
    previousFrame = await canvasFrame(page);
  }
  await page.getByLabel('Rotation offset', { exact: true }).fill('25');
  await expect.poll(() => canvasFrame(page)).not.toBe(previousFrame);
  previousFrame = await canvasFrame(page);

  await openPlanetarium(page);
  await page.getByRole('tab', { name: 'Calibration', exact: true }).click();
  await page.getByRole('button', { name: 'Add reference', exact: true }).click();
  await page.getByLabel('Point 1 name', { exact: true }).fill('Front');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await reference.selectOption({ label: 'Front' });
  await expect.poll(() => canvasFrame(page)).not.toBe(previousFrame);
  previousFrame = await canvasFrame(page);
  const pointId = (await readProject(page)).planetarium.calibrationPoints[0].id;
  await expect.poll(async () => (await readProject(page)).players[0].domeOrientationReference).toBe(pointId);

  await openPlanetarium(page);
  await page.getByRole('tab', { name: 'Calibration', exact: true }).click();
  await page.getByLabel('Front azimuth', { exact: true }).fill('90');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => canvasFrame(page)).not.toBe(previousFrame);
  await expect.poll(async () => (await readProject(page)).planetarium.calibrationPoints[0].azimuth).toBe(90);

  await page.reload();
  await expect(canvas).toBeVisible();
  await expect(orientation).toHaveValue('right-away');
  await expect(reference).toHaveValue(pointId);
  await expect(page.getByLabel('Rotation offset', { exact: true })).toHaveValue('25');
  const restored = await readProject(page);
  expect(restored.players[0]).toMatchObject({
    domeOrientation: 'right-away', domeOrientationReference: pointId, rotation: 25 * Math.PI / 180,
  });
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('grid-relative-orientation.png') });
  await page.locator('.inspector').screenshot({ path: testInfo.outputPath('grid-relative-inspector.png') });
  await openPlanetarium(page);
  await page.getByRole('tab', { name: 'Calibration', exact: true }).click();
  await page.locator('.planetarium-panel').screenshot({ path: testInfo.outputPath('orientation-calibration-reference.png') });
  assertNoRuntimeErrors();
});

test('calibration drag history, solver results, preview modes, split pixels, and patterns render', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  await openPlanetarium(page);
  await page.getByLabel('Enable planetarium mode', { exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await openPlanetarium(page);
  await page.getByRole('tab', { name: 'Calibration', exact: true }).click();
  const references = [[0, 20], [60, 35], [120, 50], [180, 65], [240, 40], [300, 55]];
  for (const [azimuth, elevation] of references) {
    await page.getByLabel('Reference azimuth', { exact: true }).fill(String(azimuth));
    await page.getByLabel('Reference elevation', { exact: true }).fill(String(elevation));
    await page.getByRole('button', { name: 'Add reference', exact: true }).click();
  }
  await expect(page.locator('.calibration-point-row')).toHaveCount(6);
  await expect(page.locator('.calibration-residual')).toHaveCount(6);
  const originalX = await page.getByLabel('Point 1 observed X', { exact: true }).inputValue();
  const observed = await page.locator('.calibration-observed').first().boundingBox();
  if (!observed) throw new Error('Observed calibration point was not rendered.');
  await page.mouse.move(observed.x + observed.width / 2, observed.y + observed.height / 2);
  await page.mouse.down();
  await page.mouse.move(observed.x + observed.width / 2 + 24, observed.y + observed.height / 2 + 12, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel('Point 1 observed X', { exact: true })).not.toHaveValue(originalX);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Point 1 observed X', { exact: true })).toHaveValue(originalX);
  await page.getByRole('button', { name: 'Solve center, tilt & azimuth', exact: true }).click();
  await expect(page.locator('.calibration-result')).toContainText('px RMS');
  await page.locator('.calibration-plot').screenshot({ path: testInfo.outputPath('calibration-points.png') });

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await settleRender(page);
  const flatFrame = await canvasFrame(page);
  await page.getByLabel('Dome warp', { exact: true }).check();
  await expect.poll(() => canvasFrame(page)).not.toBe(flatFrame);
  await openPlanetarium(page);
  await page.getByRole('tab', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: /Unwarped source/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => canvasFrame(page)).toBe(flatFrame);

  await openPlanetarium(page);
  await page.getByRole('button', { name: /Audience geometry/ }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.audience-preview-label')).toBeVisible();
  await expect.poll(() => canvasFrame(page)).not.toBe(flatFrame);
  await expect(page.locator('.workspace-overlay')).toBeHidden();
  await expect(page.locator('.circular-grid-labels')).toBeHidden();
  await expect(page.locator('.player-label')).toBeHidden();
  await expect(page.locator('.node-hit').first()).toBeHidden();
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('audience-preview.png') });

  await openPlanetarium(page);
  await page.getByRole('button', { name: /Projector output/ }).click();
  await page.getByLabel('Split before / after comparison', { exact: true }).check();
  await page.getByLabel('Built-in test pattern', { exact: true }).selectOption('crosshatch');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.comparison-divider')).toBeVisible();
  await expect.poll(() => canvasFrame(page)).not.toBe(flatFrame);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('split-crosshatch.png') });
  const halvesDiffer = await canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    const makeHalf = (x: number, width: number) => {
      const half = document.createElement('canvas');
      half.width = width;
      half.height = source.height;
      half.getContext('2d')?.drawImage(source, x, 0, width, source.height, 0, 0, width, source.height);
      return half.toDataURL();
    };
    const leftWidth = Math.floor(source.width / 2);
    return makeHalf(0, leftWidth) !== makeHalf(source.width - leftWidth, leftWidth);
  });
  expect(halvesDiffer).toBe(true);

  let previous = await canvasFrame(page);
  for (const pattern of ['starfield', 'convergence', 'latitude', 'orientation']) {
    await openPlanetarium(page);
    await page.getByLabel('Built-in test pattern', { exact: true }).selectOption(pattern);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(() => canvasFrame(page)).not.toBe(previous);
    previous = await canvasFrame(page);
    await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath(`split-${pattern}.png`) });
  }
  const saved = await readProject(page);
  expect(saved.planetarium.preview).toBe('projector');
  expect(saved.planetarium.comparison).toBe(true);
  expect(saved.planetarium.calibrationPoints).toHaveLength(6);
  assertNoRuntimeErrors();
});

test('projection quality increases render density without changing geometry and persists with history', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  const quality = page.getByLabel('Projection quality', { exact: true });
  await expect(quality).toHaveValue('standard');
  await settleRender(page);
  const canvasSize = () => canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    return {
      width: source.width,
      height: source.height,
      quality: source.dataset.renderQuality,
      ratio: Number(source.dataset.pixelRatio),
    };
  });
  const standard = await canvasSize();

  await quality.selectOption('high');
  await expect(canvas).toHaveAttribute('data-render-quality', 'high');
  await expect.poll(async () => (await canvasSize()).width).toBeGreaterThan(standard.width);
  const high = await canvasSize();
  expect(high.height).toBeGreaterThan(standard.height);
  expect(high.ratio).toBeGreaterThan(standard.ratio);
  await expect.poll(async () => (await readProject(page)).quality).toBe('high');
  const original = await readProject(page);

  await quality.selectOption('ultra');
  await expect(canvas).toHaveAttribute('data-render-quality', 'ultra');
  await expect.poll(async () => (await canvasSize()).width).toBeGreaterThan(high.width);
  const ultra = await canvasSize();
  expect(ultra.height).toBeGreaterThan(high.height);
  await expect.poll(async () => (await readProject(page)).quality).toBe('ultra');
  expect((await readProject(page)).players).toEqual(original.players);
  await expect(page.getByLabel('Render resolution', { exact: true })).toHaveText(`${ultra.width} × ${ultra.height} px`);
  await expect(page.getByLabel('Render pixel ratio', { exact: true })).toHaveText(`${ultra.ratio.toFixed(2)}×`);
  await expect(page.getByLabel('Render frame rate', { exact: true })).toHaveText(/^\d+(?:\.\d+)? fps$/);
  await expect(page.getByLabel('Render frame time', { exact: true })).toHaveText(/^\d+(?:\.\d+)? ms$/);
  await canvas.screenshot({ path: testInfo.outputPath('projection-quality-ultra.png') });

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(quality).toHaveValue('high');
  await expect(canvas).toHaveAttribute('data-render-quality', 'high');
  await page.keyboard.press('Control+y');
  await expect(quality).toHaveValue('ultra');
  await expect(canvas).toHaveAttribute('data-render-quality', 'ultra');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.reload();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-render-quality', 'ultra');
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByLabel('Projection quality', { exact: true })).toHaveValue('ultra');
  expect((await readProject(page)).players).toEqual(original.players);
  assertNoRuntimeErrors();
});
