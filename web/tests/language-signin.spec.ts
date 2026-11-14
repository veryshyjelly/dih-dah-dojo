import { test, expect } from '@playwright/test';
test('guest setup and progress pages offer contextual sign-in in both themes', async ({ page }) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const route of [
        '/words',
        '/stories',
        '/progress?mode=words',
        '/progress?mode=stories',
      ]) {
        await page.goto(route);
        const prompt = page.getByRole('complementary', { name: 'Save progress with an account' });
        await expect(prompt).toBeVisible();
        await expect(prompt).toContainText('isn’t automatically added');
        await prompt.getByRole('button', { name: 'Sign in to sync progress', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(route);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    }
  }
  await page.goto('/words');
  await page.getByRole('button', { name: 'Start word round', exact: true }).click();
  await expect(page.locator('.progress-signin')).toHaveCount(0);
});
test('account owners do not see contextual sign-in requests', async ({ page }) => {
  const { accountFixture } = await import('./account-fixture');
  const fixture = await accountFixture(page);
  try {
    for (const route of ['/words', '/stories', '/progress?mode=words', '/progress?mode=stories']) {
      await page.goto(route);
      await expect(
        page.getByRole('button', { name: 'Sound and settings', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.progress-signin')).toHaveCount(0);
    }
  } finally {
    fixture.close();
  }
});
