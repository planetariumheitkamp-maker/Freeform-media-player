import { expect, test, type Page } from '@playwright/test';
import { domeLocalToWorld, domeWorldToPosition } from '../../src/lib/dome';
import { localToWorld } from '../../src/lib/geometry';

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

async function settleRender(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function enterPresent(page: Page) {
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await expect(page.getByRole('button', { name: /Exit presentation/ })).toBeVisible();
  await expect(page.locator('.presentation-hint')).toContainText('DRAG A PLAYER TO REPOSITION · ESC EXITS');
  await expect(page.locator('.node-hit')).toHaveCount(0);
  await expect(page.locator('.viewport-zoom')).toHaveCount(0);
  await settleRender(page);
}

async function playerScreenPoint(page: Page, project: any, playerIndex: number) {
  const player = project.players[playerIndex];
  const local = { x: 0, y: 0 };
  const world = project.planetarium?.enabled && player.domeWarp && !player.domePrewarped
    ? domeLocalToWorld(player, local, project.output, project.grid, project.planetarium)
    : localToWorld(player, local);
  const bounds = await page.locator('.warp-workspace').boundingBox();
  if (!bounds) throw new Error('Presentation workspace was not laid out.');
  const fit = Math.min(bounds.width / project.output.width, bounds.height / project.output.height) * 0.9;
  return {
    x: bounds.x + bounds.width / 2 + world.x * fit,
    y: bounds.y + bounds.height / 2 - world.y * fit,
    world,
    fit,
  };
}

test('Present mode drags only the topmost player, disables editor zoom, and persists after reload', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.locator('.player-actions button').first().click();
  await expect(page.locator('.player-row')).toHaveCount(2);
  await expect.poll(async () => (await readProject(page)).players?.length).toBe(2);
  const before = await readProject(page);
  await enterPresent(page);

  const start = await playerScreenPoint(page, before, 1);
  const delta = { x: 120, y: -70 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 12 });
  await page.mouse.up();

  const expected = {
    x: before.players[1].position.x + delta.x / start.fit,
    y: before.players[1].position.y - delta.y / start.fit,
  };
  await expect.poll(async () => (await readProject(page)).players[1].position.x).toBeCloseTo(expected.x, 4);
  await expect.poll(async () => (await readProject(page)).players[1].position.y).toBeCloseTo(expected.y, 4);
  const moved = await readProject(page);
  expect(moved.players[0].position).toEqual(before.players[0].position);
  expect(moved.players[1].quickCorners).toEqual(before.players[1].quickCorners);
  expect(moved.players[1].mediaRotation).toBe(before.players[1].mediaRotation);
  expect(moved.players[1].mediaScale).toBe(before.players[1].mediaScale);
  await expect(page.locator('.smart-guide')).toHaveCount(0);

  const beforeZoom = await page.locator('canvas.warp-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.keyboard.press('f');
  await settleRender(page);
  expect(await page.locator('canvas.warp-canvas').evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(beforeZoom);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('present-mode-drag.png') });

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Present', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  const restored = await readProject(page);
  expect(restored.players[1].position.x).toBeCloseTo(expected.x, 4);
  expect(restored.players[1].position.y).toBeCloseTo(expected.y, 4);
  expect(restored.players[0].position).toEqual(before.players[0].position);
  assertNoRuntimeErrors();
});

test('locked players do not move when dragged in Present mode', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByTitle('Lock geometry', { exact: true }).click();
  await expect.poll(async () => (await readProject(page)).players?.[0]?.locked).toBe(true);
  const before = await readProject(page);
  await enterPresent(page);

  const start = await playerScreenPoint(page, before, 0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 140, start.y + 65, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  const after = await readProject(page);
  expect(after.players[0].position).toEqual(before.players[0].position);
  expect(after.players[0].locked).toBe(true);

  await page.getByRole('button', { name: /Exit presentation/ }).click();
  await expect(page.getByTitle('Unlock geometry', { exact: true })).toBeVisible();
  assertNoRuntimeErrors();
});

test('dome-warped players follow Present-mode drags through the projection equations', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('canvas.warp-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Planetarium', exact: true }).click();
  await page.getByLabel('Enable planetarium mode', { exact: true }).check();
  await page.getByLabel('Dome field of view', { exact: true }).fill('160');
  await page.getByLabel('Dome tilt', { exact: true }).fill('10');
  await page.getByLabel('Projection center X', { exact: true }).fill('8');
  await page.getByLabel('Projection center Y', { exact: true }).fill('-6');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Dome warp', { exact: true }).check();
  await expect.poll(async () => (await readProject(page)).players?.[0]?.domeWarp).toBe(true);
  const before = await readProject(page);
  await enterPresent(page);

  const start = await playerScreenPoint(page, before, 0);
  const delta = { x: 90, y: 40 };
  const endWorld = {
    x: start.world.x + delta.x / start.fit,
    y: start.world.y - delta.y / start.fit,
  };
  const startPosition = domeWorldToPosition(start.world, before.output, before.grid, before.planetarium);
  const endPosition = domeWorldToPosition(endWorld, before.output, before.grid, before.planetarium);
  const expected = {
    x: before.players[0].position.x + endPosition.x - startPosition.x,
    y: before.players[0].position.y + endPosition.y - startPosition.y,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await readProject(page)).players[0].position.x).toBeCloseTo(expected.x, 3);
  await expect.poll(async () => (await readProject(page)).players[0].position.y).toBeCloseTo(expected.y, 3);
  const moved = await readProject(page);
  expect(moved.players[0].quickCorners).toEqual(before.players[0].quickCorners);
  expect(moved.players[0].domeWarp).toBe(true);
  expect(moved.planetarium).toEqual(before.planetarium);
  await page.locator('.warp-workspace').screenshot({ path: testInfo.outputPath('present-mode-dome-drag.png') });
  assertNoRuntimeErrors();
});
