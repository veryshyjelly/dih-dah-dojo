import { test, expect, type Page } from '@playwright/test';

test('a failed connected page download has an explicit reload recovery', async ({ page }) => {
  await page.route('**/src/MessagePractice.tsx*', (route) => route.abort());
  await page.goto('/words?mode=messages');
  await expect(page.getByRole('alert')).toContainText('Connected listening could not be opened.');
  await expect(page.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
  await page.unroute('**/src/MessagePractice.tsx*');
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.locator('.message-practice')).toBeVisible();
});

async function openArchive(page: Page) {
  await page.evaluate(() => {
    history.pushState({}, '', '/stories');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

test('Words owns connected listening while story links remain an archive', async ({ page }) => {
  await page.goto('/words');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('button', { name: 'Stories', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Word training', exact: true })).toBeVisible();
  await expect(page.locator('.tool-menu')).toHaveCount(0);
  const activities = page.getByRole('group', { name: 'Word practice activity' });
  await activities.getByRole('button', { name: 'Phrases & messages', exact: true }).click();
  await expect(page).toHaveURL(/\/words\?mode=messages$/);
  await expect(page.locator('.message-practice')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('region', { name: 'Word training', exact: true })).toBeVisible();
  await page.goForward();
  await expect(
    activities.getByRole('button', { name: 'Phrases & messages', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('.message-practice')).toBeVisible();
  for (const width of [320, 780, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => window.dojoTheme.setTheme(t), theme);
      for (const name of ['Words', 'Tools']) {
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
    }
  }
  await nav.getByRole('button', { name: 'The studio', exact: true }).click();
  await expect(page.locator('.feature-card')).toHaveCount(4);
  await page.locator('.feature-card').nth(1).click();
  await expect(page).toHaveURL(/\/words$/);
  await page.goBack();
  await page.locator('.feature-card').nth(2).click();
  await expect(page).toHaveURL(/\/callsigns$/);
  await page.goto('/stories?story=story-1');
  await expect(
    page.getByRole('complementary', { name: 'Story archive', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.language-readout')).toHaveText('Ready when you are.');
  await expect(nav.getByRole('button', { name: 'Words', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('leaving word or archived story playback stops audio without saving a stale completion', async ({
  page,
}) => {
  await page.goto('/words');
  await page.getByRole('button', { name: 'Start word round' }).click();
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await page
    .getByRole('group', { name: 'Word practice activity' })
    .getByRole('button', { name: 'Phrases & messages', exact: true })
    .click();
  await expect(page.locator('.message-practice')).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const path = '/src/audio.ts';
      return (await import(path)).audio.active;
    }),
  ).toBe(false);
  await openArchive(page);
  await page.locator('.story-card').first().click();
  await page.getByLabel('Continuous listening').check();
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Words', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Word training', exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const path = '/src/audio.ts';
      return (await import(path)).audio.active;
    }),
  ).toBe(false);
  await page.goBack();
  await page.locator('.story-card').first().click();
  await expect(page.getByText(/Sentence 1 \/ /)).toBeVisible();
  await expect(page.locator('.language-readout')).toHaveText('Ready when you are.');
});

test('switching Words activity while audio initializes cannot start delayed playback', async ({
  page,
}) => {
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
  await page
    .getByRole('group', { name: 'Word practice activity' })
    .getByRole('button', { name: 'Phrases & messages', exact: true })
    .click();
  await page.waitForTimeout(1200);
  expect(
    await page.evaluate(async () => {
      const path = '/src/audio.ts';
      return (await import(path)).audio.active;
    }),
  ).toBe(false);
});
