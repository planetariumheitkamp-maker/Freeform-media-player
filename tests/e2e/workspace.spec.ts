import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const AUTOSAVE_KEY = 'freeform.workspace.autosave.v1';

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
    const project = JSON.parse(localStorage.getItem(key) ?? '{}');
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
    const project = JSON.parse(localStorage.getItem(key) ?? '{}');
    return project.players?.[1]?.nodes?.length;
  }, AUTOSAVE_KEY)).toBe(26);
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
  await page.getByRole('button', { name: 'Export', exact: true }).click();
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
