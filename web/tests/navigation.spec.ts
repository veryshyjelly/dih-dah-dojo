import { test, expect } from '@playwright/test';

test('language destinations support direct entry, history, studio cards and compact navigation', async ({
  page,
}) => {
  await page.goto('/words');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(page.getByRole('region', { name: 'Word training', exact: true })).toBeVisible();
  await expect(page.locator('.tool-menu')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Stories', exact: true }).click();
  await expect(page).toHaveURL(/\/stories$/);
  await page.reload();
  await expect(page.locator('.story-card')).toHaveCount(6);
  await page.goBack();
  await expect(nav.getByRole('button', { name: 'Words', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.goForward();
  await expect(nav.getByRole('button', { name: 'Stories', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const width of [320, 780, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => window.dojoTheme.setTheme(t), theme);
      for (const name of ['Words', 'Stories', 'Tools']) {
        const button = nav.getByRole('button', { name, exact: true });
        await button.focus();
        await page.keyboard.press('Enter');
        await expect(button).toHaveAttribute('aria-current', 'page');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const box = await button.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      }
      await nav.getByRole('button', { name: 'Words', exact: true }).click();
      await page.screenshot({
        path: `test-results/navigation-${test.info().project.name}-${theme}-${width}.png`,
      });
    }
  }
  await nav.getByRole('button', { name: 'The studio', exact: true }).click();
  await page.locator('.feature-card').nth(1).click();
  await expect(page).toHaveURL(/\/words$/);
  await page.goBack();
  await page.locator('.feature-card').nth(2).click();
  await expect(page).toHaveURL(/\/stories$/);
});

test('leaving language playback stops audio without saving a stale completion', async ({
  page,
}) => {
  await page.goto('/words');
  await page.getByRole('button', { name: 'Start word round' }).click();
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Stories', exact: true }).click();
  await page.locator('.story-card').first().click();
  await page.getByLabel('Continuous listening').check();
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Word training', exact: true })).toBeVisible();
  const active = await page.evaluate(async () => {
    const path = '/src/audio.ts';
    return (await import(path)).audio.active;
  });
  expect(active).toBe(false);
  await page.getByRole('navigation').getByRole('button', { name: 'Stories', exact: true }).click();
  await page.locator('.story-card').first().click();
  await expect(page.getByText(/Sentence 1 \/ /)).toBeVisible();
  await page.getByText('Recent story activity (0)', { exact: true }).waitFor();
});

test('leaving while audio initializes cannot start a delayed transmission', async ({ page }) => {
  await page.goto('/words');
  await page.getByRole('button', { name: 'Start word round' }).click();
  await page.evaluate(async () => {
    const path = '/src/audio.ts';
    const { audio } = await import(path);
    const enable = audio.enable.bind(audio);
    audio.enable = async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return enable();
    };
  });
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Stories', exact: true }).click();
  await page.waitForTimeout(1200);
  expect(
    await page.evaluate(async () => {
      const path = '/src/audio.ts';
      return (await import(path)).audio.active;
    }),
  ).toBe(false);
});
