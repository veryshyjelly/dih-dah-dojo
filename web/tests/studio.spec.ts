import { test, expect, type Page } from '@playwright/test';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
test('public studio and all 42 reference symbols work while accounts are unavailable', async ({
  page,
}) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'The account service is unavailable.' },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Small sounds. Endless possibilities.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'The sound library' }).click();
  await expect(page.locator('.reference-grid button')).toHaveCount(42);
  await expect(
    page.locator('.reference-grid').getByRole('button', { name: 'K -.-' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sign-in is being prepared');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.screenshot({
    path: `test-results/home-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('tool configuration validates input and preserves every character selector', async ({
  page,
}) => {
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Your own words', exact: true }).click();
  await page.getByLabel('WHAT WOULD YOU LIKE TO HEAR?').fill('HELLO @');
  await expect(page.getByText('Unsupported characters: @')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Listen to this' })).toBeDisabled();
  await page.getByRole('button', { name: 'Random groups', exact: true }).click();
  await expect(page.locator('.character-picker button')).toHaveCount(42);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Listen to this' })).toBeDisabled();
  await page.locator('.character-picker').getByRole('button', { name: 'K', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Listen to this' })).toBeEnabled();
  await page.getByRole('button', { name: 'Callsign practice', exact: true }).click();
  await expect(page.getByText(/synthetic examples/)).toBeVisible();
});
test('recognition uses the real Rust worklet, keeps digit responses visible and pauses cleanly', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('slider', { name: 'Volume', exact: true }).fill('0');
  await page.getByRole('button', { name: 'Dih Dah Dojo home' }).click();
  await page.getByRole('button', { name: 'Find your rhythm', exact: true }).click();
  await expect(page.locator('.response-caption')).toContainText('Type the character', {
    timeout: 15000,
  });
  const orb = await page.locator('.listening-orb').boundingBox();
  await page.keyboard.press('3');
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await page.waitForTimeout(350);
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await expect(page.getByText('Your answer', { exact: true })).toBeVisible();
  await expect(page.getByText('Expected character', { exact: true })).toBeVisible();
  const feedbackOrb = await page.locator('.listening-orb').boundingBox();
  expect(feedbackOrb?.y).toBeCloseTo(orb!.y, 0);
  expect(feedbackOrb?.height).toBeCloseTo(orb!.height, 0);
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await page.waitForTimeout(700);
  await expect(page.getByText('Expected character', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/recognition-feedback-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(page.locator('.response-caption')).toContainText('Type the character', {
    timeout: 15000,
  });
  await page.getByRole('button', { name: /^Pause(?: F5)?$/ }).click();
  await expect(page.getByRole('heading', { name: 'No rush.' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m ready' }).click();
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
  await expect(page.getByText('Demo complete · no account data saved')).toBeVisible();
});
test('mobile response keys and long copying transcript stay inside the viewport', async ({
  page,
}) => {
  await page.goto('/');
  const width = await page.evaluate(() => window.innerWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Touch', exact: true }).click();
  await page.getByRole('button', { name: 'Try five sounds first' }).click();
  await expect(page.locator('.response-keyboard button')).toHaveCount(42);
  await expect(page.locator('.response-caption')).toContainText('Type the character', {
    timeout: 15000,
  });
  await page.locator('.response-keyboard').getByRole('button', { name: '?', exact: true }).click();
  await expect(page.locator('.response-caption')).toHaveText('Response: ?');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
});

test('saved summary hold leaves evidence intact and reset cancellation sends no mutation', async ({
  page,
}) => {
  const { accountFixture } = await import('./account-fixture');
  const fixture = await accountFixture(page);
  try {
    await page.goto('/practice');
    await page.getByRole('button', { name: 'Recognize a sound' }).click();
    await expect(page.locator('.response-caption')).toContainText('Type the character');
    await page.keyboard.press('K');
    await expect(page.getByText('Your answer', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
    await expect(page.getByText('Synced', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Hold this moment' }).click();
    await page.waitForTimeout(3300);
    await expect(page.getByText('Held. Already saved.')).toBeVisible();
    expect(JSON.parse(fixture.engine.snapshot(Date.now())).introduced).toBe('KM');
    await page.getByRole('button', { name: 'Finish for now' }).click();
    await page.getByRole('button', { name: 'Sound and settings' }).click();
    await page.getByRole('button', { name: 'Reset progress', exact: true }).click();
    await page.getByLabel('TYPE DELETE TO CONFIRM').fill('DELET');
    await expect(
      page.getByRole('button', { name: 'Reset progress', exact: true }).last(),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Keep my progress' }).click();
    expect(fixture.resetRequests()).toBe(0);
  } finally {
    fixture.close();
  }
});

test('fast copying retains the complete tail and follows long transcripts without overflow', async ({
  page,
}) => {
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Your own words', exact: true }).click();
  await page.getByLabel('WHAT WOULD YOU LIKE TO HEAR?').fill('K');
  await page.getByRole('button', { name: 'Try copying', exact: true }).click();
  const input = page.getByLabel('Your received copy');
  await expect(input).toBeVisible();
  const text = 'KM '.repeat(80);
  await input.pressSequentially(text, { delay: 1 });
  await expect(input).toHaveValue(text);
  await input.press('Backspace');
  await expect(input).toHaveValue(text.slice(0, -1));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  await page.screenshot({
    path: `test-results/copying-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Save this block' }).click();
  await expect(page.getByText('Manual practice · not saved to an account')).toBeVisible();
});

test('oversized listening clips give a usable error and remain outside practice', async ({
  page,
}) => {
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Your own words', exact: true }).click();
  await page.getByLabel('WHAT WOULD YOU LIKE TO HEAR?').fill('M'.repeat(4096));
  await page.getByRole('button', { name: 'Listen to this' }).click();
  await expect(page.getByRole('status')).toContainText('Keep this clip under three minutes');
  await expect(page.getByRole('button', { name: 'Listen to this' })).toBeEnabled();
  await expect(page).toHaveURL(/\/tools$/);
});

test('rapid sound adjustments coalesce and leaving cancels a queued preview', async ({ page }) => {
  await page.addInitScript(() => {
    const observed: number[] = [];
    (window as unknown as { previewPrepares: number[] }).previewPrepares = observed;
    const original = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (
      message: Parameters<MessagePort['postMessage']>[0],
      options?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (message?.type === 'prepare') observed.push(performance.now());
      return Reflect.apply(original, this, [message, options]);
    };
  });
  await page.goto('/settings');
  const volume = page.getByRole('slider', { name: 'Volume', exact: true });
  await volume.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1400);
  expect(
    await page.evaluate(
      () => (window as unknown as { previewPrepares: number[] }).previewPrepares.length,
    ),
  ).toBe(1);
  await page.getByRole('slider', { name: 'Tone', exact: true }).fill('650');
  await page.getByRole('button', { name: 'Dih Dah Dojo home' }).click();
  const navigation = await page.evaluate(() => performance.now());
  await page.waitForTimeout(400);
  expect(
    await page.evaluate(
      (at) =>
        (window as unknown as { previewPrepares: number[] }).previewPrepares.filter(
          (time) => time > at,
        ).length,
      navigation,
    ),
  ).toBe(0);
});
