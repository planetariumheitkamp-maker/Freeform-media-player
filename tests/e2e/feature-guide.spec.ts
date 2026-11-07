import { expect, test, type Page } from '@playwright/test';
import { FEATURE_GUIDE_TOPICS } from '../../src/data/featureGuide';

function monitorRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return () => expect(errors, 'Browser console and page errors').toEqual([]);
}

async function openGuide(page: Page) {
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'What would you like to do?' })).toBeVisible();
}

test('every feature topic exposes its complete clickable walkthrough', async ({ page }) => {
  test.setTimeout(90_000);
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await openGuide(page);
  await expect(page.locator('[data-guide-topic]')).toHaveCount(FEATURE_GUIDE_TOPICS.length);

  for (const topic of FEATURE_GUIDE_TOPICS) {
    await page.locator(`[data-guide-topic="${topic.id}"]`).click();
    await expect(page.locator('.feature-guide-topic-header h3')).toHaveText(topic.title);
    await expect(page.locator('.feature-guide-topic-header p')).toHaveText(topic.summary);
    await expect(page.locator('.guide-step-list button')).toHaveCount(topic.steps.length);

    for (let index = 0; index < topic.steps.length; index += 1) {
      const step = topic.steps[index];
      await page.locator('.guide-step-list button').nth(index).click();
      await expect(page.locator('.guide-current-step h4')).toHaveText(step.title);
      await expect(page.locator('.guide-current-step > p')).toHaveText(step.detail);
      await expect(page.locator('.guide-current-step li')).toHaveCount(step.bullets?.length ?? 0);
      await expect(page.locator('.guide-step-navigation > span')).toHaveText(`Step ${index + 1} of ${topic.steps.length}`);
      if (step.action) {
        await expect(page.locator('.guide-open-controls')).toHaveText(step.action.label);
        await expect(page.locator('.guide-open-controls')).toBeEnabled();
      }
    }
  }
  assertNoRuntimeErrors();
});

test('search, step navigation, completion, restart, keyboard, and dismissal work together', async ({ page }) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await openGuide(page);

  const search = page.getByRole('textbox', { name: 'Search feature guides' });
  await expect(search).toBeFocused();
  await search.fill('output-centered');
  await expect(page.locator('[data-guide-topic]')).toHaveCount(1);
  await expect(page.locator('[data-guide-topic="calibration"]')).toBeVisible();
  await expect(page.locator('.feature-guide-topic-header h3')).toHaveText('Dome calibration walkthrough');
  await search.fill('no-such-feature-xyz');
  await expect(page.locator('[data-guide-topic]')).toHaveCount(0);
  await expect(page.locator('.feature-guide-empty')).toContainText('No matching features');
  await search.fill('');
  await page.locator('[data-guide-topic="sources"]').click();

  const previous = page.getByRole('button', { name: 'Previous step', exact: true });
  const next = page.getByRole('button', { name: 'Next step', exact: true });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(page.locator('.guide-current-step h4')).toHaveText(FEATURE_GUIDE_TOPICS[0].steps[1].title);
  await previous.click();
  await expect(page.locator('.guide-current-step h4')).toHaveText(FEATURE_GUIDE_TOPICS[0].steps[0].title);

  const lastIndex = FEATURE_GUIDE_TOPICS[0].steps.length - 1;
  await page.locator('.guide-step-list button').nth(lastIndex).click();
  await page.getByRole('button', { name: 'Complete walkthrough', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Walkthrough complete', exact: true })).toBeDisabled();
  await expect(page.locator('[data-guide-topic="sources"] .feature-guide-topic-complete')).toBeVisible();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(page.locator('.guide-current-step h4')).toHaveText(FEATURE_GUIDE_TOPICS[0].steps[0].title);
  await expect(page.locator('[data-guide-topic="sources"] .feature-guide-topic-complete')).toHaveCount(0);

  await next.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close feature guide', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(next).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.feature-guide')).toHaveCount(0);

  await openGuide(page);
  await page.locator('.feature-guide-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.feature-guide')).toHaveCount(0);
  await openGuide(page);
  await page.getByRole('button', { name: 'Close feature guide', exact: true }).click();
  await expect(page.locator('.feature-guide')).toHaveCount(0);
  assertNoRuntimeErrors();
});

test('calibration walkthrough opens the real Calibration tab and remains readable', async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = monitorRuntimeErrors(page);
  await page.goto('/');
  await openGuide(page);
  await page.locator('[data-guide-topic="calibration"]').click();
  await page.locator('.guide-step-list button').nth(2).click();
  await expect(page.locator('.guide-current-step h4')).toHaveText('Measure known sky references');
  await page.locator('.feature-guide').screenshot({ path: testInfo.outputPath('dome-calibration-guide.png') });

  await page.getByRole('button', { name: 'Open Calibration', exact: true }).click();
  await expect(page.locator('.feature-guide')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Planetarium mode', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Calibration', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Reference azimuth', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Reference elevation', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solve center, tilt & azimuth', exact: true })).toBeDisabled();
  await expect(page.locator('.calibration-points')).toContainText('Add at least four distinct directions');
  assertNoRuntimeErrors();
});
