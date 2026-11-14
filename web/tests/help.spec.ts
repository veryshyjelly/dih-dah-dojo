import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';

const openGuide = async (page: import('@playwright/test').Page) => {
  const header = page.getByRole('button', { name: 'Help', exact: true });
  if (await header.isVisible()) await header.click();
  else await page.getByRole('button', { name: 'How the dojo works' }).click();
  const dialog = page.getByRole('dialog', { name: 'Quick guide' });
  await expect(dialog).toBeVisible();
  return dialog;
};

test('guide groups shortcuts and keeps the title and actions in view in both themes', async ({
  page,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const dialog = await openGuide(page);
      await expect(dialog.locator('.help-shortcuts > div')).toHaveCount(5);
      await expect(dialog.locator('details')).toHaveCount(3);
      await expect(dialog.locator('details[open]')).toHaveCount(0);
      await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
      await expect(dialog.getByRole('button', { name: 'Got it' })).toBeInViewport();
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(8);
      expect(bounds.y).toBeGreaterThanOrEqual(8);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 8);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 8);
      const title = (await dialog.getByRole('heading', { name: 'Quick guide' }).boundingBox())!;
      expect(title.height).toBeLessThan(40);
      await page.screenshot({
        path: `test-results/help-${test.info().project.name}-${viewport.width}-${colorScheme}.png`,
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  }
});

test('expanded guide scrolls its body while close and footer controls stay available', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 1200, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const dialog = await openGuide(page);
    const close = dialog.getByRole('button', { name: 'Close dialog' });
    const before = (await close.boundingBox())!;
    for (const summary of await dialog.locator('summary').all()) await summary.click();
    await dialog.locator('.help-content').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await dialog.locator('.help-content').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(close).toBeInViewport();
    expect((await close.boundingBox())!.y).toBeCloseTo(before.y, 0);
    await expect(dialog.getByRole('button', { name: 'Got it' })).toBeInViewport();
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `test-results/help-expanded-${test.info().project.name}-${viewport.width}.png`,
      fullPage: false,
    });
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).not.toBeVisible();
  }
});

test('help pauses recognition and Escape dismisses only the guide', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('slider', { name: 'Volume', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Try five sounds first' }).click();
  await expect(page.locator('.response-caption')).toContainText('Type the character');
  const dialog = await openGuide(page);
  await expect(dialog.getByText('Practice stays paused until you resume.')).toBeVisible();
  await page.keyboard.press('F5');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() =>
      document.activeElement?.closest('dialog')?.getAttribute('aria-label'),
    ),
  ).toBe('Quick guide');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'No rush.' })).toBeVisible();
  await expect(page.getByText('Demo complete · no account data saved')).not.toBeVisible();
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await expect(page.locator('.response-caption')).toContainText('Type the character');
  await page.keyboard.press('3');
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
  await expect(page.getByText('Demo complete · no account data saved')).toBeVisible();
});

test('reading help holds a saved summary without changing its evidence', async ({ page }) => {
  const fixture = await accountFixture(page);
  try {
    await page.goto('/practice');
    await page.getByRole('button', { name: 'Recognize a sound' }).click();
    await expect(page.locator('.response-caption')).toContainText('Type the character');
    await page.keyboard.press('K');
    await expect(page.getByText('Your answer', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
    await expect(page.getByText('Synced', { exact: true })).toBeVisible();
    const record = Buffer.from(fixture.engine.record());
    const dialog = await openGuide(page);
    await expect(dialog.getByText('Your saved summary stays held.')).toBeVisible();
    await page.waitForTimeout(3300);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Held. Already saved.')).toBeVisible();
    expect(Buffer.from(fixture.engine.record())).toEqual(record);
  } finally {
    fixture.close();
  }
});
