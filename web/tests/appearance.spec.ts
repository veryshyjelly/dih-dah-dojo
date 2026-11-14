import { test, expect } from '@playwright/test';
const source = 'https://github.com/veryshyjelly/dih-dah-dojo';

test('device theme applies to the first rendered studio and manual choice survives navigation and reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.getElementById('root')?.firstElementChild) {
        (window as unknown as { firstStudioTheme: string | undefined }).firstStudioTheme =
          document.documentElement.dataset.theme;
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page.evaluate(() => (window as unknown as { firstStudioTheme: string }).firstStudioTheme),
  ).toBe('dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.evaluate(() => (window as unknown as { firstStudioTheme: string }).firstStudioTheme),
  ).toBe('light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#101b19');
});

test('device changes apply until the learner makes a manual theme choice', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('theme still changes when browser storage is blocked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(errors).toEqual([]);
});

test('changing appearance during recognition preserves the response window and capture', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Try five sounds first' }).click();
  await expect(page.locator('.response-caption')).toContainText('Type the character');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.response-caption')).toContainText('Type the character');
  await page.keyboard.press('3');
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await page.waitForTimeout(350);
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
  await expect(page.getByText('Demo complete · no account data saved')).toBeVisible();
});

test('all public pages and dialogs render both themes at compact and wide sizes with a source link', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const route of [
        '/',
        '/practice',
        '/words',
        '/stories',
        '/tools',
        '/progress',
        '/settings',
        '/privacy',
      ]) {
        await page.goto(route);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const link = page
          .getByRole('contentinfo')
          .getByRole('link', { name: 'GitHub source code' });
        await expect(link).toHaveAttribute('href', source);
        await expect(link).toHaveAttribute('target', '_blank');
        await page.screenshot({
          path: `test-results/appearance-${test.info().project.name}-${width}-${theme}-${route.slice(1) || 'home'}.png`,
          fullPage: true,
        });
      }
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.screenshot({
        path: `test-results/appearance-${test.info().project.name}-${width}-${theme}-signin.png`,
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Close dialog' }).click();
    }
  }
  expect(errors).toEqual([]);
});

test('dark text and primary action keep readable contrast', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const contrasts = await page.evaluate(() => {
    const luminance = (color: string) => {
      const rgb = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((c) => {
          c /= 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    const contrast = (foreground: string, background: string) => {
      const a = luminance(foreground),
        b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const background = getComputedStyle(document.documentElement).backgroundColor;
    const button = getComputedStyle(document.querySelector('.hero .button')!);
    return {
      heading: contrast(getComputedStyle(document.querySelector('h1')!).color, background),
      body: contrast(getComputedStyle(document.querySelector('.hero-copy>p')!).color, background),
      button: contrast(button.color, button.backgroundColor),
    };
  });
  expect(contrasts.heading).toBeGreaterThanOrEqual(4.5);
  expect(contrasts.body).toBeGreaterThanOrEqual(4.5);
  expect(contrasts.button).toBeGreaterThanOrEqual(4.5);
});
