import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

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

function monitorRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return () => expect(errors, 'Browser console and page errors').toEqual([]);
}

async function linkTwoPlayers(page: Page) {
  const rows = page.locator('.player-row');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await page.locator('.player-actions button').nth(1).click();
  await expect(page.locator('.group-controls')).toBeVisible();
}

test('perspective editing, advanced nodes, and selected-subset grouping', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await expect(page.locator('.player-row')).toHaveCount(1);
  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  await linkTwoPlayers(page);

  const corner = await page.locator('.node-hit').first().boundingBox();
  if (!corner) throw new Error('Quick corner handle was not rendered.');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 32, corner.y + corner.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[1]?.quickCorners?.[0]?.x;
  }, AUTOSAVE_KEY)).not.toBe(-240);

  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(page.locator('.node-hit')).toHaveCount(25);
  await page.locator('.workspace-toolbar button').filter({ hasText: 'Interior node' }).click();
  const points = await page.locator('.node-hit').evaluateAll((nodes) => nodes.map((node) => {
    const bounds = node.getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }));
  const center = points.reduce((sum, point) => ({
    x: sum.x + point.x / points.length,
    y: sum.y + point.y / points.length,
  }), { x: 0, y: 0 });
  await page.mouse.click(center.x + 31, center.y + 17);
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[1]?.nodes?.length;
  }, AUTOSAVE_KEY)).toBe(26);
  assertNoRuntimeErrors();
});

test('whole-source freehand tracing creates a persistent advanced player', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const workspace = page.locator('.warp-workspace');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  const bounds = await workspace.boundingBox();
  if (!bounds) throw new Error('Workspace was not laid out.');
  const at = (x: number, y: number) => ({
    x: bounds.x + bounds.width * x,
    y: bounds.y + bounds.height * y,
  });

  await page.getByRole('button', { name: 'Trace settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trace settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Crop to shape/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Whole source in shape/ }).click();
  await expect(page.getByRole('button', { name: /Whole source in shape/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Border smoothing', { exact: true }).fill('12');
  await page.getByLabel('Interior node spacing', { exact: true }).fill('64');
  await page.getByRole('button', { name: 'Apply settings', exact: true }).click();
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.trace?.interiorSpacing;
  }, AUTOSAVE_KEY)).toBe(64);

  await page.getByRole('button', { name: 'Trace', exact: true }).click();
  const outline = [
    at(0.55, 0.30), at(0.82, 0.30), at(0.82, 0.68),
    at(0.70, 0.68), at(0.70, 0.49), at(0.55, 0.49), at(0.55, 0.30),
  ];
  await page.mouse.move(outline[0].x, outline[0].y);
  await page.mouse.down();
  for (const point of outline.slice(1)) {
    await page.mouse.move(point.x, point.y, { steps: 7 });
  }
  await expect(page.locator('.trace-preview-border')).toBeVisible();
  await page.mouse.up();

  await expect(page.locator('.player-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Interior trace', exact: true })).toHaveClass(/active/);
  await expect(page.locator('.trace-preview-border')).toHaveCount(0);
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[1]?.border?.length;
  }, AUTOSAVE_KEY)).toBe(6);
  const traced = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(traced.trace).toEqual({ smoothing: 12, interiorSpacing: 64, sourceMapping: 'whole' });
  expect(traced.players[1].mode).toBe('advanced');
  expect(traced.players[1].nodes).toHaveLength(6);
  expect(traced.players[1].nodes.every((node: { kind: string }) => node.kind === 'edge')).toBe(true);
  expect(traced.players[1].nodes.every((node: { u: number; v: number }) => (
    node.u === 0 || node.u === 1 || node.v === 0 || node.v === 1
  ))).toBe(true);

  const interiorStart = at(0.58, 0.39);
  const interiorEnd = at(0.78, 0.39);
  await page.mouse.move(interiorStart.x, interiorStart.y);
  await page.mouse.down();
  await page.mouse.move(interiorEnd.x, interiorEnd.y, { steps: 16 });
  await expect(page.locator('.trace-preview-interior')).toHaveCount(1);
  await expect(page.locator('.trace-preview-interior')).toHaveAttribute('points', /,/);
  await page.mouse.up();
  await expect(page.locator('.trace-preview-interior')).toHaveCount(0);
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[1]?.nodes?.length;
  }, AUTOSAVE_KEY)).toBeGreaterThan(6);

  const saved = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  const interiorNodes = saved.players[1].nodes.filter((node: { kind: string }) => node.kind === 'interior');
  expect(interiorNodes.length).toBeGreaterThan(3);
  expect(interiorNodes.length).toBeLessThan(10);
  expect(saved.players[1].nodes).toHaveLength(6 + interiorNodes.length);
  expect(saved.players[1].border).toHaveLength(6);
  await workspace.screenshot({ path: testInfo.outputPath('traced-border-and-interior.png') });

  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Trace settings', exact: true }).click();
  await expect(page.getByLabel('Border smoothing', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Interior node spacing', { exact: true })).toHaveValue('64');
  await expect(page.getByRole('button', { name: /Whole source in shape/ })).toHaveAttribute('aria-pressed', 'true');
  assertNoRuntimeErrors();
});

async function generateVideo(page: Page): Promise<string> {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d');
    if (!context || !canvas.captureStream || typeof MediaRecorder === 'undefined') {
      reject(new Error('MediaRecorder fixture generation is unavailable.'));
      return;
    }
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    let frame = 0;
    let interval = 0;
    const draw = () => {
      context.fillStyle = '#172019';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#c5ffc3';
      context.fillRect((frame * 7) % 300, 45, 20, 90);
      context.fillStyle = '#ebebeb';
      context.font = '18px sans-serif';
      context.fillText(`FRAME ${frame}`, 90, 95);
      frame += 1;
      track.requestFrame?.();
    };
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      window.clearInterval(interval);
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      reject(new Error('MediaRecorder fixture generation failed.'));
    };
    recorder.onstop = () => {
      window.clearInterval(interval);
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (!blob.size) {
        reject(new Error('MediaRecorder produced an empty video fixture.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Generated fixture could not be read.'));
      reader.readAsDataURL(blob);
    };
    draw();
    recorder.start();
    interval = window.setInterval(draw, 50);
    window.setTimeout(() => recorder.stop(), 1800);
  }));
}

test('generated video plays across linked players and exports references only', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const encoded = await generateVideo(page);
  const fixture = testInfo.outputPath('generated-fixture.webm');
  await writeFile(fixture, Buffer.from(encoded, 'base64'));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.source-actions button').first().click();
  await (await chooser).setFiles(fixture);
  await expect(page.locator('.media-layer video')).toHaveCount(1);
  await expect.poll(() => page.locator('.media-layer video').evaluate(
    (video) => (video as HTMLVideoElement).readyState,
  )).toBeGreaterThan(0);
  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.media-layer video')).toHaveCount(2);
  await expect.poll(() => page.locator('.media-layer video').evaluateAll(
    (videos) => videos.every((video) => (video as HTMLVideoElement).readyState > 0),
  )).toBe(true);
  await linkTwoPlayers(page);

  const play = page.locator('.play-button');
  const videos = page.locator('.media-layer video');
  if (await videos.nth(1).evaluate((video: HTMLVideoElement) => video.paused)) await play.click();
  await expect.poll(async () => videos.evaluateAll((elements) => elements.map((element) => (element as HTMLVideoElement).paused))).toEqual([false, false]);
  await page.locator('.transport-options select').selectOption('2');
  await expect.poll(async () => videos.evaluateAll((elements) => elements.map((element) => (element as HTMLVideoElement).playbackRate))).toEqual([2, 2]);
  await play.click();
  await expect.poll(async () => videos.evaluateAll((elements) => elements.map((element) => (element as HTMLVideoElement).paused))).toEqual([true, true]);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save file', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  if (!path) throw new Error('Project export did not produce a file.');
  const project = JSON.parse(await readFile(path, 'utf8'));
  expect(project.format).toBe('freeform-workspace');
  expect(project.players).toHaveLength(2);
  expect(project.groups).toHaveLength(1);
  expect(project.sources.some((source: { uri?: string }) => source.uri?.startsWith('data:'))).toBe(false);
  expect(project.sources.some((source: { uri?: string }) => source.uri?.startsWith('blob:'))).toBe(false);
  assertNoRuntimeErrors();
});

test('side panels minimize independently and restore the original layout', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  const initial = await canvas.boundingBox();
  if (!initial) throw new Error('Workspace canvas was not laid out.');

  await page.getByRole('button', { name: 'Minimize sources and players panel', exact: true }).click();
  await expect(page.locator('.source-rail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore sources and players panel', exact: true })).toBeVisible();
  const leftMinimized = await canvas.boundingBox();
  expect(leftMinimized?.width).toBeGreaterThan(initial.width + 200);

  await page.getByRole('button', { name: 'Minimize inspector panel', exact: true }).click();
  await expect(page.locator('.inspector')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore inspector panel', exact: true })).toBeVisible();
  const bothMinimized = await canvas.boundingBox();
  expect(bothMinimized?.width).toBeGreaterThan((leftMinimized?.width ?? 0) + 200);

  await page.getByRole('button', { name: 'Restore sources and players panel', exact: true }).click();
  await page.getByRole('button', { name: 'Restore inspector panel', exact: true }).click();
  await expect(page.locator('.source-rail')).toBeVisible();
  await expect(page.locator('.inspector')).toBeVisible();
  const restored = await canvas.boundingBox();
  expect(Math.abs((restored?.width ?? 0) - initial.width)).toBeLessThan(2);
  assertNoRuntimeErrors();
});

test('custom grid imports, autosaves a reference, and restores the default', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  const initialFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  const encoded = await page.evaluate(() => {
    const image = document.createElement('canvas');
    image.width = 1600;
    image.height = 900;
    const context = image.getContext('2d');
    if (!context) throw new Error('Grid fixture canvas is unavailable.');
    context.fillStyle = '#10182c';
    context.fillRect(0, 0, image.width, image.height);
    context.strokeStyle = '#3be4ff';
    context.lineWidth = 3;
    for (let x = 0; x <= image.width; x += 100) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, image.height);
      context.stroke();
    }
    for (let y = 0; y <= image.height; y += 100) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(image.width, y);
      context.stroke();
    }
    context.strokeStyle = '#ff4fb8';
    context.lineWidth = 8;
    context.strokeRect(20, 20, image.width - 40, image.height - 40);
    return image.toDataURL('image/png').split(',')[1];
  });

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace background', exact: true })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import image', exact: true }).click();
  await (await chooser).setFiles({
    name: 'custom-alignment-grid.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(initialFrame);
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.background?.name;
  }, AUTOSAVE_KEY)).toBe('custom-alignment-grid.png');
  const saved = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(saved.background.uri).toBeUndefined();
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('custom-grid-workspace.png') });

  const beforeOutputResize = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('button', { name: /Square 2048 × 2048/ }).click();
  await page.getByRole('button', { name: 'Apply size', exact: true }).click();
  await expect(page.locator('.stage-label')).toHaveText('OUTPUT / 2048 × 2048');
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(beforeOutputResize);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('custom-grid-square-output.png') });

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByRole('button', { name: 'Use default grid', exact: true }).click();
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.background;
  }, AUTOSAVE_KEY)).toBeNull();
  assertNoRuntimeErrors();
});

test('built-in grid geometry transforms the canvas and autosaves', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  const initialFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByLabel('Grid cell size', { exact: true }).fill('95');
  await page.getByLabel('Grid rotation', { exact: true }).fill('25');
  await page.getByLabel('Grid skew X', { exact: true }).fill('18');
  await page.getByLabel('Grid skew Y', { exact: true }).fill('-12');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.grid?.spacing;
  }, AUTOSAVE_KEY)).toBe(95);
  const saved = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(saved.grid).toEqual({
    kind: 'cartesian', spacing: 95, rotation: 25, skewX: 18, skewY: -12,
    rings: 8, spokes: 24, radius: 90,
  });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(initialFrame);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('built-in-grid-geometry.png') });

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByRole('button', { name: 'Reset geometry', exact: true }).click();
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.grid?.spacing;
  }, AUTOSAVE_KEY)).toBe(50);
  const reset = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(reset.grid).toEqual({
    kind: 'cartesian', spacing: 50, rotation: 0, skewX: 0, skewY: 0,
    rings: 8, spokes: 24, radius: 90,
  });
  assertNoRuntimeErrors();
});

test('circular grid labels and output backdrop opacity render and persist', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  const initialFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByRole('button', { name: 'Circular grid', exact: true }).click();
  await page.getByLabel('Circular grid rings', { exact: true }).fill('10');
  await page.getByLabel('Circular grid spokes', { exact: true }).fill('24');
  await page.getByLabel('Circular grid radius', { exact: true }).fill('75');
  await page.getByLabel('Circular grid rotation', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.circular-grid-labels')).toBeVisible();
  await expect(page.locator('.circular-grid-ring-label')).toHaveCount(10);
  await expect(page.locator('.circular-grid-spoke-label')).toHaveCount(24);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(initialFrame);
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    const grid = project.grid ?? {};
    return `${grid.kind}/${grid.rings}/${grid.spokes}/${grid.radius}/${grid.rotation}`;
  }, AUTOSAVE_KEY)).toBe('circular/10/24/75/15');
  const saved = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(saved.grid).toEqual({
    kind: 'circular', spacing: 50, rotation: 15, skewX: 0, skewY: 0,
    rings: 10, spokes: 24, radius: 75,
  });
  const circularFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());

  await page.getByRole('button', { name: 'Output', exact: true }).click();
  const opacity = page.getByLabel('Output background opacity', { exact: true });
  await opacity.focus();
  await opacity.press('Home');
  for (let step = 0; step < 7; step += 1) await opacity.press('ArrowRight');
  await expect(opacity).toHaveValue('0.35');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.outputOpacity;
  }, AUTOSAVE_KEY)).toBe(0.35);
  await page.getByRole('button', { name: 'Hide output background', exact: true }).click();
  await expect(opacity).toHaveValue('0');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.outputOpacity;
  }, AUTOSAVE_KEY)).toBe(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(circularFrame);
  await expect(page.locator('.circular-grid-labels')).toBeVisible();
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('circular-grid-hidden-output.png') });

  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await expect(page.locator('.circular-grid-ring-label')).toHaveCount(10);
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByLabel('Output background opacity', { exact: true })).toHaveValue('0');
  assertNoRuntimeErrors();
});

test('circular grid snapping aligns a dragged corner and persists the setting', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByRole('button', { name: 'Circular grid', exact: true }).click();
  await page.getByLabel('Circular grid rings', { exact: true }).fill('4');
  await page.getByLabel('Circular grid spokes', { exact: true }).fill('8');
  await page.getByLabel('Circular grid radius', { exact: true }).fill('100');
  await page.getByLabel('Circular grid rotation', { exact: true }).fill('0');
  await page.getByLabel('Snap to circular grid', { exact: true }).check();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  const bounds = await canvas.boundingBox();
  const corner = await page.locator('.node-hit').first().boundingBox();
  if (!bounds || !corner) throw new Error('Workspace or quick corner was not laid out.');
  const scale = 0.9 * Math.min(bounds.width / 1600, bounds.height / 900);
  const target = {
    x: bounds.x + bounds.width / 2 - 450 * scale,
    y: bounds.y + bounds.height / 2,
  };
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();

  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[0]?.quickCorners?.[0]?.x;
  }, AUTOSAVE_KEY)).toBeCloseTo(-230, 6);
  const saved = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(saved.players[0].quickCorners[0].y).toBeCloseTo(-60, 6);
  expect(saved.gridSnapping).toBe(true);

  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.getByLabel('Snap to circular grid', { exact: true })).toBeChecked();
  assertNoRuntimeErrors();
});

test('output size presets and custom dimensions transform the stage and autosave', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  const initialFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());

  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Output size', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Square 2048 × 2048/ }).click();
  await page.getByRole('button', { name: 'Apply size', exact: true }).click();
  await expect(page.locator('.stage-label')).toHaveText('OUTPUT / 2048 × 2048');
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(initialFrame);
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.output?.width;
  }, AUTOSAVE_KEY)).toBe(2048);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('square-output-workspace.png') });

  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByLabel('Output width', { exact: true }).fill('2400');
  await page.getByLabel('Output height', { exact: true }).fill('1200');
  await page.getByRole('button', { name: 'Apply size', exact: true }).click();
  await expect(page.locator('.stage-label')).toHaveText('OUTPUT / 2400 × 1200');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return `${project.output?.width}x${project.output?.height}`;
  }, AUTOSAVE_KEY)).toBe('2400x1200');

  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('button', { name: 'Reset size', exact: true }).click();
  await page.getByRole('button', { name: 'Apply size', exact: true }).click();
  await expect(page.locator('.stage-label')).toHaveText('OUTPUT / 1600 × 900');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return `${project.output?.width}x${project.output?.height}`;
  }, AUTOSAVE_KEY)).toBe('1600x900');
  assertNoRuntimeErrors();
});

test('media-only transforms and player clipboard shortcuts preserve geometry', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  const initialFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());

  await page.getByLabel('Media rotation', { exact: true }).fill('45');
  await page.getByLabel('Media scale', { exact: true }).fill('1.5');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[0]?.mediaScale;
  }, AUTOSAVE_KEY)).toBe(1.5);
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(initialFrame);
  const transformed = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(transformed.players[0].mediaRotation).toBeCloseTo(Math.PI / 4, 8);
  expect(transformed.players[0].rotation).toBe(0);
  expect(transformed.players[0].scale).toBe(1);
  expect(transformed.players[0].quickCorners).toEqual([
    { x: -240, y: 135 }, { x: 240, y: 135 },
    { x: 240, y: -135 }, { x: -240, y: -135 },
  ]);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('media-only-transform.png') });

  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  await linkTwoPlayers(page);
  await page.keyboard.press('Control+c');
  await expect(page.getByText('2 players copied', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+v');
  await expect(page.getByText('2 players pasted', { exact: true })).toBeVisible();
  await expect(page.locator('.player-row')).toHaveCount(4);
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.length;
  }, AUTOSAVE_KEY)).toBe(4);

  const pastedProject = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  const [first, second, firstCopy, secondCopy] = pastedProject.players;
  expect(pastedProject.groups).toHaveLength(2);
  expect(firstCopy.id).not.toBe(first.id);
  expect(secondCopy.id).not.toBe(second.id);
  expect(firstCopy.groupId).toBe(secondCopy.groupId);
  expect(firstCopy.groupId).not.toBe(first.groupId);
  expect(firstCopy.sourceId).toBe(first.sourceId);
  expect(firstCopy.quickCorners).toEqual(first.quickCorners);
  expect(firstCopy.mediaRotation).toBeCloseTo(Math.PI / 4, 8);
  expect(firstCopy.mediaScale).toBe(1.5);
  expect(firstCopy.rotation).toBe(first.rotation);
  expect(firstCopy.scale).toBe(first.scale);
  expect(firstCopy.position).toEqual({ x: first.position.x + 48, y: first.position.y - 36 });
  assertNoRuntimeErrors();
});

test('named internal saves and workspace files restore the complete layout', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  const projectName = page.getByLabel('Project name', { exact: true });
  await projectName.fill('Planetarium master');
  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('button', { name: /Square 2048 × 2048/ }).click();
  await page.getByRole('button', { name: 'Apply size', exact: true }).click();
  await expect(page.locator('.stage-label')).toHaveText('OUTPUT / 2048 × 2048');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.getByLabel('Grid rotation', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Saved workspaces', exact: true })).toBeVisible();
  await expect(page.getByLabel('New save name', { exact: true })).toHaveValue('Planetarium master');
  await page.getByRole('button', { name: 'Save current', exact: true }).click();
  await expect(page.locator('.saved-slot')).toHaveCount(1);
  await expect(page.locator('.saved-slots-heading')).toContainText('1 / 10 slots used');
  const internalSaves = await page.evaluate(() => JSON.parse(
    localStorage.getItem('freeform.workspace.saves.v1') ?? '[]',
  ));
  const snapshot = JSON.parse(internalSaves[0].content);
  expect(snapshot.name).toBe('Planetarium master');
  expect(snapshot.players).toHaveLength(2);
  expect(snapshot.output).toEqual({ width: 2048, height: 2048 });
  expect(snapshot.grid.rotation).toBe(25);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await projectName.fill('Scratch workspace');
  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('button', { name: 'Reset size', exact: true }).click();
  await page.getByRole('button', { name: 'Apply size', exact: true }).click();
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(projectName).toHaveValue('Planetarium master');
  await expect(page.locator('.player-row')).toHaveCount(2);
  await expect(page.locator('.stage-label')).toHaveText('OUTPUT / 2048 × 2048');
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(page.getByLabel('Grid rotation', { exact: true })).toHaveValue('25');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await expect(page.locator('.saved-slot')).toHaveCount(1);
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(projectName).toHaveValue('Planetarium master');
  await expect(page.locator('.player-row')).toHaveCount(2);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save file', exact: true }).click();
  const download = await downloadEvent;
  const workspacePath = testInfo.outputPath('complete.freeform.json');
  await download.saveAs(workspacePath);
  const savedFile = JSON.parse(await readFile(workspacePath, 'utf8'));
  expect(savedFile.players).toHaveLength(2);
  expect(savedFile.output).toEqual({ width: 2048, height: 2048 });
  expect(savedFile.grid.rotation).toBe(25);

  await projectName.fill('Changed after file save');
  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(3);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await (await chooser).setFiles(workspacePath);
  await expect(projectName).toHaveValue('Planetarium master');
  await expect(page.locator('.player-row')).toHaveCount(2);
  await expect(page.locator('.stage-label')).toHaveText('OUTPUT / 2048 × 2048');
  assertNoRuntimeErrors();
});

test('internal save slots can be overwritten and deleted', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByLabel('Project name', { exact: true }).fill('Original slot');
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: 'Save current', exact: true }).click();
  await expect(page.locator('.saved-slot-copy strong')).toHaveText('Original slot');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByLabel('Project name', { exact: true }).fill('Overwritten slot');
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await page.getByRole('button', { name: 'Overwrite', exact: true }).click();
  await expect(page.locator('.saved-slot-copy strong')).toHaveText('Overwritten slot');
  await expect(page.locator('.saved-slot')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await expect(page.locator('.saved-slot-copy strong')).toHaveText('Overwritten slot');

  await page.getByRole('button', { name: 'Delete Overwritten slot', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.locator('.saved-slot')).toHaveCount(0);
  await expect(page.locator('.saved-slots-empty')).toBeVisible();
  await expect(page.locator('.saved-slots-heading')).toContainText('0 / 10 slots used');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Saves', exact: true }).click();
  await expect(page.locator('.saved-slots-empty')).toBeVisible();
  assertNoRuntimeErrors();
});

test('undo and redo cover one-step drags, keyboard shortcuts, and top-bar buttons', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  const corner = await page.locator('.node-hit').first().boundingBox();
  if (!corner) throw new Error('Quick corner handle was not rendered.');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 + 42, corner.y + corner.height / 2 + 18, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[0]?.quickCorners?.[0]?.x;
  }, AUTOSAVE_KEY)).toBeGreaterThan(-240);
  const dragged = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  const draggedCorner = dragged.players[0].quickCorners[0];

  await page.keyboard.press('Control+z');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[0]?.quickCorners?.[0]?.x;
  }, AUTOSAVE_KEY)).toBe(-240);
  await page.keyboard.press('Control+y');
  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[0]?.quickCorners?.[0]?.x;
  }, AUTOSAVE_KEY)).toBeCloseTo(draggedCorner.x, 8);

  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.player-row')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.player-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.player-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  assertNoRuntimeErrors();
});

test('planetarium dome warp changes the rendered player and persists across reloads', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  const canvas = page.locator('canvas.warp-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByLabel('Dome warp', { exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Planetarium', exact: true }).click();
  await page.getByLabel('Enable planetarium mode', { exact: true }).check();
  await page.getByLabel('Dome field of view', { exact: true }).fill('160');
  await page.getByLabel('Dome tilt', { exact: true }).fill('10');
  await page.getByLabel('Projection center X', { exact: true }).fill('8');
  await page.getByLabel('Projection center Y', { exact: true }).fill('-6');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.circular-grid-labels')).toBeVisible();
  await expect(page.getByLabel('Dome warp', { exact: true })).toBeEnabled();
  const unwarpedFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.getByLabel('Dome warp', { exact: true }).check();
  await expect.poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).not.toBe(unwarpedFrame);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('planetarium-dome-warp.png') });

  await expect.poll(async () => page.evaluate((key) => {
    const project = window.readFreeformAutosave(key);
    return project.players?.[0]?.domeWarp;
  }, AUTOSAVE_KEY)).toBe(true);
  const saved = await page.evaluate((key) => window.readFreeformAutosave(key), AUTOSAVE_KEY);
  expect(saved.grid.kind).toBe('circular');
  expect(saved.planetarium).toMatchObject({
    enabled: true, fov: 160, tilt: 10, offsetX: 8, offsetY: -6,
    model: 'equidistant', truncation: 100, preview: 'projector', comparison: false,
  });

  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await expect(page.getByLabel('Dome warp', { exact: true })).toBeChecked();
  await expect(page.locator('.circular-grid-labels')).toBeVisible();
  await page.getByRole('button', { name: 'Planetarium', exact: true }).click();
  await expect(page.getByLabel('Enable planetarium mode', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Dome field of view', { exact: true })).toHaveValue('160');
  await expect(page.getByLabel('Dome tilt', { exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Projection center X', { exact: true })).toHaveValue('8');
  await expect(page.getByLabel('Projection center Y', { exact: true })).toHaveValue('-6');
  assertNoRuntimeErrors();
});
