import { test, expect, type Page } from '@playwright/test';
import { accountFixture } from './account-fixture';
import type { MessageGeneration, MessageTask } from '../src/message-types';
import { SYMBOLS } from '../src/types';

async function fixedSeed(page: Page, delayed = false) {
  await page.addInitScript((delay) => {
    (window as any).messageAudio = [];
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'message_generate') {
        const config = JSON.parse(message.args[0]);
        message.args[0] = JSON.stringify({ ...config, seed: 81 });
      }
      if (delay && message?.method === 'message_evaluate') {
        setTimeout(() => send.call(this, message, options), 700);
        return;
      }
      send.call(this, message, options);
    };
    const post = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (message, options: any) {
      if (message?.type === 'prepare') (window as any).messageAudio.push(message);
      post.call(this, message, options);
    };
  }, delayed);
}
async function configure(page: Page, task: MessageTask = 'detail', start = true) {
  await page.goto('/words?mode=messages');
  await page.getByRole('button', { name: 'Include all sounds', exact: true }).click();
  await page
    .getByRole('button', {
      name:
        task === 'detail'
          ? /^Keep the meaning/
          : task === 'copy'
            ? /^Copy the thought/
            : /^Listen in your head/,
    })
    .click();
  await page.getByLabel('Character WPM', { exact: true }).fill('60');
  await page.getByLabel('Effective WPM', { exact: true }).fill('60');
  await page.getByRole('combobox', { name: 'Topic', exact: true }).selectOption('time');
  const begin = page.getByRole('button', { name: 'Start connected round', exact: true });
  await expect(begin).toBeEnabled();
  if (start) await begin.click();
}
async function entries(page: Page, owner = 'browser-fixture') {
  return page.evaluate(async (who) => {
    const ep = '/src/engine-client.ts',
      sp = '/src/language-store.ts';
    const { EngineClient } = await import(ep),
      { LanguageStore } = await import(sp);
    const engine = new EngineClient();
    try {
      const store = new LanguageStore(who, engine);
      await store.open();
      return store.entries.filter((entry: any) => entry.activity.kind === 'message');
    } finally {
      engine.close();
    }
  }, owner);
}
function expected(fixture: Awaited<ReturnType<typeof accountFixture>>, task: MessageTask) {
  return (
    JSON.parse(
      fixture.engine.message_generate(
        JSON.stringify({
          seed: 81,
          count: 5,
          stage: 'phrase',
          task,
          family: 'time',
          repertoire: SYMBOLS,
          c: 60,
          e: 60,
        }),
      ),
    ) as MessageGeneration
  ).items[0];
}

test('connected practice keeps an insufficient repertoire explicit and allows guest-local listening', async ({
  page,
}) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { user: null, providers: { google: true, github: true } } }),
  );
  await fixedSeed(page);
  await page.goto('/words?mode=messages');
  await expect(
    page.getByRole('complementary', { name: 'Save connected practice with an account' }),
  ).toBeVisible();
  await expect(page.getByText('No material fits these sounds yet.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Start connected round', exact: true }),
  ).toBeDisabled();
  await configure(page, 'listen');
  await expect(page.locator('.message-state')).toHaveText('Ready when you are');
  await page.getByRole('button', { name: /^Play example/ }).click();
  await page.getByRole('button', { name: 'Part of it', exact: true }).click();
  await expect(page.locator('.message-listening-report')).toContainText('following part');
  await expect.poll(async () => (await entries(page, 'guest')).length).toBe(1);
  const saved = (await entries(page, 'guest'))[0];
  expect(saved.activity.self_report).toBe('partly');
  expect(saved.outcome.eligible).toBe(false);
  expect(saved.outcome.final_accuracy).toBeNull();
});

test('detail questions stay out of the DOM until audio ends and repair preserves the first answer', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await fixedSeed(page);
  try {
    const item = expected(fixture, 'detail');
    await configure(page);
    await expect(page.locator('.message-detail-question')).toHaveCount(0);
    await expect(page.locator('.message-detail-choices')).toHaveCount(0);
    await expect(page.locator('.message-focus-card')).not.toContainText(item.question);
    await expect(page.locator('.message-focus-card')).not.toContainText(item.text);
    await page.getByRole('button', { name: /^Play example/ }).click();
    await expect(page.locator('.message-detail-question')).toHaveCount(0);
    await expect(page.getByLabel('Your message detail', { exact: true })).toBeEnabled();
    await expect(page.locator('.message-detail-question')).toHaveText(item.question);
    expect((await page.evaluate(() => (window as any).messageAudio))[0]).toMatchObject({
      text: item.audio_text,
      tokens: true,
    });
    await page.getByLabel('Your message detail', { exact: true }).fill('ZZ');
    await page.keyboard.press('Enter');
    await expect(page.locator('.message-answer-comparison strong').first()).toHaveText('ZZ');
    await expect(page.locator('.message-disclosed-text')).toContainText(item.text);
    await page.getByLabel('Try your answer again', { exact: true }).fill(item.expected!);
    await page.getByRole('button', { name: /^Check repair/ }).click();
    await expect(page.locator('.message-feedback-badges')).toContainText('Repair exact');
    await expect.poll(async () => (await entries(page)).length).toBe(2);
    const saved = await entries(page);
    expect(saved[0].activity.attempts).toEqual(['ZZ']);
    expect(saved[0].outcome.eligible).toBe(true);
    expect(saved[1].activity.attempts).toEqual(['ZZ', item.expected]);
    expect(saved[1].outcome.first_exact).toBe(false);
    expect(saved[1].outcome.final_exact).toBe(true);
    await expect(page.locator('.message-answer-comparison strong').first()).toHaveText('ZZ');
  } finally {
    fixture.close();
  }
});

test('copying rejects unsupported input without consuming a first submission and replay is assisted', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await fixedSeed(page);
  try {
    const item = expected(fixture, 'copy');
    await configure(page, 'copy');
    await page.getByRole('button', { name: /^Play example/ }).click();
    await expect(page.getByLabel('Your received copy', { exact: true })).toBeEnabled();
    await page.getByLabel('Your received copy', { exact: true }).fill('BAD:INPUT');
    await page.keyboard.press('Enter');
    await expect(page.locator('.message-notice')).toContainText('supported Morse punctuation');
    expect((await entries(page)).length).toBe(0);
    await page.getByRole('button', { name: /^Replay example/ }).click();
    await expect(page.getByLabel('Your received copy', { exact: true })).toBeEnabled();
    await page.getByLabel('Your received copy', { exact: true }).fill(item.text);
    await page.keyboard.press('Enter');
    await expect(page.locator('.message-feedback-badges')).toContainText('First answer exact');
    await expect(page.locator('.message-assistance-labels')).toContainText('Replay · assisted');
    await expect.poll(async () => (await entries(page)).length).toBe(1);
    const saved = (await entries(page))[0];
    expect(saved.activity.attempts).toEqual([item.text]);
    expect(saved.outcome.eligible).toBe(false);
    expect(saved.outcome.attempt_accuracy).toBe(1);
  } finally {
    fixture.close();
  }
});

test('completed unanswered audio remains exposure and makes the same content familiar under another task', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await fixedSeed(page);
  try {
    await configure(page);
    await expect(page.locator('.message-presentation-meta')).toContainText(
      'New in available history',
    );
    await page.getByRole('button', { name: /^Play example/ }).click();
    await expect(page.getByLabel('Your message detail', { exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await entries(page)).length).toBe(1);
    const exposure = (await entries(page))[0];
    expect(exposure.activity.answer).toBeNull();
    expect(exposure.outcome.eligible).toBe(false);
    expect(exposure.outcome.exposure).toBe(true);
    await configure(page, 'copy');
    await expect(page.locator('.message-presentation-meta')).toContainText(
      'Already in available history',
    );
    await page.getByRole('button', { name: /^Play example/ }).click();
    await expect(page.getByLabel('Your received copy', { exact: true })).toBeEnabled();
    await page
      .getByLabel('Your received copy', { exact: true })
      .fill(expected(fixture, 'copy').text);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await entries(page)).length).toBe(2);
    expect((await entries(page))[1].activity.familiar).toBe(true);
    expect((await entries(page))[1].outcome.eligible).toBe(true);
  } finally {
    fixture.close();
  }
});

test('accepted detail survives pause and finish while evaluation is pending', async ({ page }) => {
  const fixture = await accountFixture(page);
  await fixedSeed(page, true);
  try {
    const item = expected(fixture, 'detail');
    await configure(page);
    await page.getByRole('button', { name: /^Play example/ }).click();
    await expect(page.getByLabel('Your message detail', { exact: true })).toBeEnabled();
    await page.getByLabel('Your message detail', { exact: true }).fill(item.expected!);
    await page.keyboard.press('Enter');
    await page.keyboard.press('F5');
    await expect(page.locator('.message-state')).toHaveText('Paused');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Resume practice', exact: true }).click();
    await expect(page.locator('.message-feedback-badges')).toContainText('First answer exact');
    await expect(page.locator('.message-assistance-labels')).not.toContainText('Interrupted');
    await page.getByLabel('Try your answer again', { exact: true }).fill('ZZ');
    await page.getByRole('button', { name: /^Check repair/ }).click();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('region', { name: 'Connected round summary', exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await entries(page)).length).toBe(2);
    await expect(page.locator('.message-summary-stats strong').nth(1)).toHaveText('100%');
    const saved = await entries(page);
    expect(saved.map((entry: any) => entry.activity.revision)).toEqual([0, 1]);
    expect(saved[1].activity.attempts).toEqual([item.expected, 'ZZ']);
  } finally {
    fixture.close();
  }
});

test('newly synchronized content changes future familiarity without rewriting the current presentation', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await fixedSeed(page);
  try {
    const item = expected(fixture, 'copy');
    let remote = false;
    const packet = Buffer.from(
      fixture.engine.language_encode(
        JSON.stringify({
          version: 1,
          kind: 'message',
          id: 'remote-0',
          trial_id: 'remote',
          revision: 0,
          item: item.id,
          sentence: 0,
          input: 'keyboard',
          c: 60,
          e: 60,
          answer: item.text,
          attempts: [item.text],
          replay: false,
          revealed: false,
          review: false,
          interrupted: false,
          finished: true,
          familiar: false,
          self_report: null,
          created: Date.now(),
        }),
      ),
    ).toString('base64');
    await page.route(/\/api\/language(?:\?.*)?$/, (route) =>
      route.fulfill({
        json: {
          epoch: 'sync-familiarity',
          records: remote ? [packet] : [],
          sequences: remote ? [1] : [],
          cursor: remote ? 1 : 0,
          more: false,
        },
      }),
    );
    await configure(page);
    await expect(page.locator('.message-presentation-meta')).toContainText(
      'New in available history',
    );
    remote = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await entries(page)).length).toBe(1);
    await expect(page.locator('.message-presentation-meta')).toContainText(
      'New in available history',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Choose another round/ }).click();
    await page.getByRole('button', { name: /^Copy the thought/ }).click();
    await page.getByRole('button', { name: 'Start connected round', exact: true }).click();
    await expect(page.locator('.message-presentation-meta')).toContainText(
      'Already in available history',
    );
  } finally {
    fixture.close();
  }
});

test('connected setup, audio, question, feedback and reflection fit both themes and viewports', async ({
  page,
}) => {
  test.skip(test.info().project.name !== 'chromium', 'One browser writes the visual fixtures.');
  const fixture = await accountFixture(page);
  await fixedSeed(page);
  const capture = async (state: string) => {
    for (const width of [320, 1440])
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForTimeout(220);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: `/tmp/dojo-message-${state}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
  };
  try {
    await configure(page, 'detail', false);
    await capture('setup');
    await page.getByRole('button', { name: 'Start connected round', exact: true }).click();
    await capture('ready');
    await page.getByRole('button', { name: /^Play example/ }).click();
    await expect(page.getByLabel('Your message detail', { exact: true })).toBeEnabled();
    await capture('question');
    await page.getByRole('button', { name: /I don’t know/ }).click();
    await expect(page.locator('.message-feedback')).toBeVisible();
    await capture('feedback');
    await configure(page, 'listen');
    await page.getByRole('button', { name: /^Play example/ }).click();
    await page.getByRole('button', { name: 'Part of it', exact: true }).click();
    await expect(page.locator('.message-listening-report')).toBeVisible();
    await capture('reflection');
  } finally {
    fixture.close();
  }
});
