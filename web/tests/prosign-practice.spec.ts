import { test, expect, type Page } from '@playwright/test';
import { accountFixture } from './account-fixture';

async function captureAudio(page: Page) {
  await page.addInitScript(() => {
    (window as any).prosignSounds = [];
    const send = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (message, options: any) {
      if (message?.type === 'prepare' && typeof message.text === 'string')
        (window as any).prosignSounds.push({ text: message.text, tokens: message.tokens });
      return send.call(this, message, options);
    };
  });
}

async function setup(page: Page, mode = 'Hear the signal') {
  await page.goto('/prosigns');
  await expect(
    page.getByRole('button', { name: 'Start prosign round', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click();
  await page.getByLabel('Character WPM', { exact: true }).fill('60');
  await page.getByLabel('Effective WPM', { exact: true }).fill('60');
  await page.getByLabel('Signals in this round').selectOption('5');
  const selected = page.getByRole('group', { name: 'Signals for this round' });
  for (const token of ['BT', 'SK', 'AS'])
    await selected.getByRole('button', { name: new RegExp(`^<${token}>`) }).click();
  await page.getByRole('button', { name: 'Start prosign round', exact: true }).click();
}

async function entries(page: Page) {
  return page.evaluate(async () => {
    const clientPath = '/src/engine-client.ts';
    const storePath = '/src/language-store.ts';
    const { EngineClient } = await import(clientPath);
    const { LanguageStore } = await import(storePath);
    const engine = new EngineClient();
    try {
      const store = new LanguageStore('browser-fixture', engine);
      await store.open();
      return store.entries.filter((entry: any) => entry.activity.kind === 'prosign');
    } finally {
      engine.close();
    }
  });
}

test('recognition waits for a complete token, reveals promptly and preserves the first answer through repair', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await captureAudio(page);
  try {
    await setup(page);
    await expect(page.locator('.prosign-library')).toHaveCount(0);
    await expect(page.locator('.prosign-comparison')).toHaveCount(0);
    await page.getByRole('button', { name: /^Play signal/ }).click();
    const field = page.getByLabel('Signal you heard', { exact: true });
    await expect(field).toBeEnabled();
    expect(await page.evaluate(() => (window as any).prosignSounds)).toEqual([
      { text: '<AR>', tokens: true },
    ]);
    await field.fill('Z');
    await expect(field).toHaveValue('Z');
    await expect(page.locator('.prosign-comparison')).toHaveCount(0);
    await field.fill('ZZ');
    await page.keyboard.press('Enter');
    await expect(page.locator('.prosign-comparison')).toBeVisible();
    await expect(page.locator('.prosign-comparison strong').first()).toHaveText('ZZ');
    await expect(page.locator('.prosign-comparison strong').last()).toHaveText('<AR>');
    await page.getByLabel('Try the signal again').fill('+');
    await page.getByRole('button', { name: /^Check repair/ }).click();
    await expect(page.locator('.prosign-feedback-labels')).toContainText('Repair exact');
    await expect(page.locator('.prosign-comparison strong').first()).toHaveText('ZZ');
    await expect.poll(async () => (await entries(page)).length).toBe(2);
    const saved = await entries(page);
    expect(saved[0].activity.attempts).toEqual(['ZZ']);
    expect(saved[0].outcome.eligible).toBe(true);
    expect(saved[1].activity.attempts).toEqual(['ZZ', '+']);
    expect(saved[1].outcome.first_exact).toBe(false);
    expect(saved[1].outcome.final_exact).toBe(true);
    await page.getByRole('button', { name: /^Finish round/ }).click();
    await expect(page.locator('.prosign-summary-stats')).toContainText('0%');
    await expect(page.locator('.prosign-summary-stats')).toContainText('1 / 1');
    expect(JSON.parse(fixture.engine.snapshot(Date.now())).introduced).toBe('KM');
  } finally {
    fixture.close();
  }
});

test('meaning practice scores a purpose independently and replay is assisted', async ({ page }) => {
  const fixture = await accountFixture(page);
  try {
    await setup(page, 'Know what it means');
    const choices = page.getByRole('group', { name: 'Choose the meaning' });
    await expect(
      choices.getByRole('button', { name: 'End of message', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: /^Play signal/ }).click();
    await expect(page.getByRole('button', { name: /^Replay signal/ })).toBeEnabled();
    await page.getByRole('button', { name: /^Replay signal/ }).click();
    await expect(
      choices.getByRole('button', { name: 'End of message', exact: true }),
    ).toBeEnabled();
    await choices.getByRole('button', { name: 'End of message', exact: true }).click();
    await expect(page.locator('.prosign-comparison strong').last()).toHaveText('End of message');
    await expect(page.locator('.prosign-feedback-labels')).toContainText('Replay · assisted');
    await expect.poll(async () => (await entries(page)).length).toBe(1);
    const saved = await entries(page);
    expect(saved[0].activity.answer).toBe('message-end');
    expect(saved[0].outcome.eligible).toBe(false);
  } finally {
    fixture.close();
  }
});

test('context practice asks for an operating decision before playing its example', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await captureAudio(page);
  try {
    await setup(page, 'Use it in a contact');
    await expect(page.getByRole('heading', { name: 'What would you send?' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Play signal/ })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).prosignSounds)).toEqual([]);
    await page.getByLabel('Signal you would send').fill('AR');
    await page.keyboard.press('Enter');
    await expect(page.locator('.prosign-comparison strong').last()).toHaveText('<AR>');
    await page.getByRole('button', { name: /^Hear it in a contact/ }).click();
    await expect(page.getByRole('button', { name: 'Next signal', exact: true })).toBeEnabled();
    const sounds = await page.evaluate(() => (window as any).prosignSounds);
    expect(sounds[0].tokens).toBe(true);
    expect(sounds[0].text).toContain('<AR>');
  } finally {
    fixture.close();
  }
});

test('unknown stays an independent miss and repeated interruption events never resume a paused attempt', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  try {
    await setup(page);
    await page.getByRole('button', { name: /^Play signal/ }).click();
    await expect(page.getByRole('button', { name: 'I don’t know', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'I don’t know', exact: true }).click();
    await expect(page.locator('.prosign-comparison strong').first()).toHaveText('No answer');
    await expect.poll(async () => (await entries(page)).length).toBe(1);
    const saved = await entries(page);
    expect(saved[0].activity.attempts).toEqual(['']);
    expect(saved[0].outcome.eligible).toBe(true);
    expect(saved[0].outcome.first_exact).toBe(false);
    await page.getByRole('button', { name: 'Next signal', exact: true }).click();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('dojo-audio-suspended'));
      window.dispatchEvent(new Event('dojo-audio-fault'));
    });
    await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
    await expect(page.locator('.prosign-state')).toHaveText('Paused');
  } finally {
    fixture.close();
  }
});

test('an accepted response remains durable when Escape closes its pending evaluation', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'prosign_evaluate') {
        setTimeout(() => send.call(this, message, options), 700);
        return;
      }
      send.call(this, message, options);
    };
  });
  try {
    await setup(page, 'Use it in a contact');
    await page.getByLabel('Signal you would send').fill('+');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Every signal has a purpose.' })).toBeVisible();
    await expect.poll(async () => (await entries(page)).length).toBe(1);
    const saved = await entries(page);
    expect(saved[0].activity.attempts).toEqual(['+']);
    expect(saved[0].outcome.first_exact).toBe(true);
    await page.waitForTimeout(800);
    await expect(page.locator('.prosign-focus-card')).toHaveCount(0);
    await expect(page.locator('.prosign-summary-stats')).toContainText('100%');
    await expect(page.locator('.prosign-summary-stats')).toContainText('1 / 1');
    await expect(page.getByRole('heading', { name: 'Every signal has a purpose.' })).toBeVisible();
  } finally {
    fixture.close();
  }
});

test('pausing a pending accepted response preserves its revision and permits a later repair', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'prosign_evaluate') {
        setTimeout(() => send.call(this, message, options), 700);
        return;
      }
      send.call(this, message, options);
    };
  });
  try {
    await setup(page, 'Use it in a contact');
    await page.getByLabel('Signal you would send').fill('+');
    await page.keyboard.press('Enter');
    await page.keyboard.press('F5');
    await expect(page.getByRole('button', { name: 'Resume practice', exact: true })).toBeVisible();
    await expect.poll(async () => (await entries(page)).length).toBe(1);
    await page.waitForTimeout(800);
    await expect(page.locator('.prosign-state')).toHaveText('Paused');
    await page.getByRole('button', { name: 'Resume practice', exact: true }).click();
    await expect(page.locator('.prosign-feedback-labels')).toContainText('First answer exact');
    await expect(page.locator('.prosign-comparison strong').first()).toHaveText('+');
    await expect(page.locator('.prosign-feedback-labels')).not.toContainText('Interrupted');
    await page.getByLabel('Try the signal again').fill('SK');
    await page.getByRole('button', { name: /^Check repair/ }).click();
    await expect(page.locator('.prosign-feedback-labels')).toContainText('Repair saved');
    await expect.poll(async () => (await entries(page)).length).toBe(2);
    const saved = await entries(page);
    expect(saved.map((row: any) => row.activity.revision)).toEqual([0, 1]);
    expect(saved[1].activity.attempts).toEqual(['+', 'SK']);
    expect(saved[1].outcome.first_exact).toBe(true);
    expect(saved[1].outcome.final_exact).toBe(false);
  } finally {
    fixture.close();
  }
});

test('prosign setup, active and feedback layouts fit narrow and wide viewports in both themes', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'chromium', 'Layout fixtures are shared across projects.');
  const fixture = await accountFixture(page);
  async function capture(screen: string) {
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: `/tmp/dojo-prosign-${screen}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
  try {
    await page.goto('/prosigns');
    await expect(page.locator('.prosign-reference-card')).toHaveCount(8);
    await capture('setup');
    await setup(page);
    await capture('active');
    await page.getByRole('button', { name: /^Play signal/ }).click();
    await expect(page.getByLabel('Signal you heard', { exact: true })).toBeEnabled();
    await page.getByLabel('Signal you heard', { exact: true }).fill('ZZ');
    await page.keyboard.press('Enter');
    await expect(page.locator('.prosign-comparison')).toBeVisible();
    await capture('feedback');
  } finally {
    fixture.close();
  }
});

test('default Farnsworth pace accepts an answer after the final tone without a trailing word-gap wait', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  try {
    await page.goto('/prosigns');
    await expect(
      page.getByRole('button', { name: 'Start prosign round', exact: true }),
    ).toBeEnabled();
    await page.getByLabel('Character WPM', { exact: true }).fill('20');
    await page.getByLabel('Effective WPM', { exact: true }).fill('5');
    const selection = page.getByRole('group', { name: 'Signals for this round' });
    for (const token of ['BT', 'SK', 'AS'])
      await selection.getByRole('button', { name: new RegExp(`^<${token}>`) }).click();
    await page.getByRole('button', { name: 'Start prosign round', exact: true }).click();
    const started = Date.now();
    await page.getByRole('button', { name: /^Play signal/ }).click();
    await expect(page.getByLabel('Signal you heard', { exact: true })).toBeEnabled({
      timeout: 2000,
    });
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(page.locator('.prosign-comparison')).toHaveCount(0);
    await expect(page.locator('.prosign-focus-card')).not.toContainText('End of message');
    await expect(page.locator('.prosign-focus-card')).not.toContainText('·−·−·');
  } finally {
    fixture.close();
  }
});
