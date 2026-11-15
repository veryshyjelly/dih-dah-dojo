import { test, expect, type Page } from '@playwright/test';
import { accountFixture } from './account-fixture';
import type { MessageActivity, MessageGeneration } from '../src/message-types';

async function wordFixture(page: Page, count = 35, assistedOnly = false) {
  const fixture = await accountFixture(page),
    catalog = JSON.parse(fixture.engine.language_catalog(20, 10));
  const words = catalog.words.filter((w: any) => w.text.length <= 3).slice(0, 22),
    packets: string[] = [];
  for (let i = 0; i < count; i++) {
    const word = words[i % words.length],
      answer = i % 4 ? word.text : 'ZZ';
    packets.push(
      Buffer.from(
        fixture.engine.language_encode(
          JSON.stringify({
            version: 1,
            id: `word-${i}`,
            kind: 'word',
            item: word.id,
            sentence: 0,
            input: 'keyboard',
            c: 20,
            e: 10,
            answer,
            attempts: [answer],
            replay: assistedOnly || i % 10 === 0,
            revealed: false,
            review: false,
            interrupted: false,
            finished: true,
            self_report: null,
            created: Date.now() - (60 - i) * 86400000,
          }),
        ),
      ).toString('base64'),
    );
  }
  await page.route(/\/api\/language(?:\?.*)?$/, (r) =>
    r.fulfill({
      json: {
        epoch: 'progress-fixture',
        records: packets,
        sequences: packets.map((_, i) => i + 1),
        cursor: packets.length,
        more: false,
      },
    }),
  );
  return { ...fixture, words };
}
test('word progress is readable, bounded, scoped and gives selected words a visible focused detail', async ({
  page,
}) => {
  const fixture = await wordFixture(page);
  try {
    await page.goto('/progress?mode=words');
    await expect(page.locator('.lp-stats strong').first()).toHaveText('30');
    await expect(page.locator('.lp-word-row')).toHaveCount(10);
    await expect(page.locator('.lp-history details')).toHaveCount(10);
    await page.getByLabel('Eligible answers').selectOption('100');
    await expect(page.locator('.lp-stats strong').first()).toHaveText('31');
    await page
      .getByRole('navigation', { name: 'Words pagination' })
      .getByRole('button', { name: 'Next words' })
      .click();
    await expect(page.getByRole('navigation', { name: 'Words pagination' })).toContainText(
      '11–20 of 22',
    );
    for (const width of [320, 1440])
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const labelSize = await page
          .locator('.lp-stats span')
          .first()
          .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
        expect(labelSize).toBeGreaterThanOrEqual(11);
        const selected = await page.locator('.progress-tabs [aria-pressed=true]').evaluate((e) => ({
          color: getComputedStyle(e).color,
          background: getComputedStyle(e).backgroundColor,
        }));
        expect(selected.color).not.toBe(selected.background);
        const chartHeight = await page
          .locator('.lp-chart .chart-wrap svg')
          .first()
          .evaluate((e) => e.getBoundingClientRect().height);
        expect(chartHeight).toBeLessThanOrEqual(180);
        await page.screenshot({
          path: `/tmp/dojo-connected-word-progress-${test.info().project.name}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    await page.getByLabel('Find a word').fill(fixture.words[1].text);
    await expect(page.locator('.lp-word-row')).toHaveCount(1);
    await page.locator('.lp-word-row').first().click();
    const detail = page.getByRole('region', { name: 'Selected word details' });
    await expect(detail).toBeFocused();
    await expect(detail).toBeInViewport();
    await expect(page.locator('.lp-word-row')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail).toContainText(fixture.words[1].text);
    await expect(page.locator('.lp-history details')).toHaveCount(2);
  } finally {
    fixture.close();
  }
});
test('empty and assisted-only progress explain evidence and offer useful practice without empty chart walls', async ({
  page,
}) => {
  const fixture = await wordFixture(page, 0);
  try {
    await page.goto('/progress?mode=words');
    await expect(page.getByRole('heading', { name: 'Your first word starts here.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listen to a word', exact: true })).toBeVisible();
    await expect(page.locator('.lp-chart')).toHaveCount(0);
    await page
      .getByRole('group', { name: 'Word progress view' })
      .getByRole('button', { name: 'Phrases & messages', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'A few words. A little meaning.' }),
    ).toBeVisible();
    await expect(page.locator('.lp-stats')).toHaveCount(0);
  } finally {
    fixture.close();
  }
  const assisted = await wordFixture(page, 1, true);
  try {
    await page.goto('/progress?mode=words');
    await expect(
      page.getByRole('heading', { name: 'Practice saved. Independent evidence comes next.' }),
    ).toBeVisible();
    await expect(page.locator('.lp-word-row')).toHaveCount(1);
    await expect(page.locator('.lp-chart')).toHaveCount(0);
    for (const width of [320, 1440])
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForTimeout(200);
        await page.screenshot({
          path: `/tmp/dojo-connected-word-sparse-${test.info().project.name}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
  } finally {
    assisted.close();
  }
});
test('a failed content load stays an error after synchronization and retry restores actual saved results', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    (window as any).allowCatalog = false;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'language_catalog' && !(window as any).allowCatalog) {
        setTimeout(
          () =>
            this.dispatchEvent(
              new MessageEvent('message', {
                data: { id: message.id, error: 'Content fixture unavailable' },
              }),
            ),
          0,
        );
        return;
      }
      post.call(this, message, options);
    };
  });
  const fixture = await wordFixture(page, 2);
  try {
    await page.goto('/progress?mode=words');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Content could not be loaded');
    await expect(page.locator('.lp-sync')).toContainText('Synced');
    await expect(page.locator('.lp-stats')).toHaveCount(0);
    await page.evaluate(() => {
      (window as any).allowCatalog = true;
    });
    await page.getByRole('button', { name: 'Retry loading progress', exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.locator('.lp-stats strong').first()).toHaveText('1');
  } finally {
    fixture.close();
  }
});

test('unavailable remote history cannot look like a first-ever empty account and cached records remain labeled', async ({
  page,
}) => {
  const fixture = await wordFixture(page, 0);
  let fail = true;
  await page.route(/\/api\/language(?:\?.*)?$/, (r) =>
    fail
      ? r.fulfill({ status: 503, json: { error: 'Offline fixture' } })
      : r.fulfill({
          json: { epoch: 'progress-fixture', records: [], sequences: [], cursor: 0, more: false },
        }),
  );
  try {
    await page.goto('/progress?mode=words');
    await expect(page.getByRole('alert')).toContainText(
      'Account history could not be fully loaded',
    );
    await expect(page.getByRole('heading', { name: 'Your first word starts here.' })).toHaveCount(
      0,
    );
    await expect(page.locator('.lp-stats')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Retry loading progress', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your first word starts here.' })).toBeVisible();
  } finally {
    fixture.close();
  }
  const cached = await wordFixture(page, 2);
  try {
    await page.goto('/progress?mode=words');
    await expect(page.locator('.lp-stats strong').first()).toHaveText('1');
    await page.route(/\/api\/language(?:\?.*)?$/, (r) =>
      r.fulfill({ status: 503, json: { error: 'Offline fixture' } }),
    );
    await page.reload();
    await expect(page.locator('.lp-notice[role=status]')).toContainText('totals may be incomplete');
    await expect(page.locator('.lp-stats strong').first()).toHaveText('1');
    await expect(
      page.getByRole('button', { name: 'Retry account synchronization', exact: true }),
    ).toBeVisible();
  } finally {
    cached.close();
  }
});
test('message progress isolates task and familiarity while retaining original errors and repairs', async ({
  page,
}) => {
  const fixture = await accountFixture(page),
    packets: string[] = [];
  const items = (task: string) =>
    (
      JSON.parse(
        fixture.engine.message_generate(
          JSON.stringify({
            seed: 29,
            count: 20,
            stage: 'phrase',
            task,
            family: 'mixed',
            repertoire: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            c: 20,
            e: 10,
          }),
        ),
      ) as MessageGeneration
    ).items;
  const details = items('detail'),
    copies = items('copy'),
    listens = items('listen');
  const add = (
    id: string,
    item: (typeof details)[number],
    fields: Partial<MessageActivity> = {},
  ) => {
    const a: MessageActivity = {
      version: 1,
      kind: 'message',
      id: `${id}-0`,
      trial_id: id,
      revision: 0,
      item: item.id,
      sentence: 0,
      input: 'keyboard',
      c: 20,
      e: 10,
      answer: item.expected,
      attempts: item.expected === null ? [] : [item.expected],
      replay: false,
      revealed: false,
      review: false,
      interrupted: false,
      finished: true,
      self_report: null,
      created: 1000,
      familiar: false,
      ...fields,
    };
    packets.push(Buffer.from(fixture.engine.language_encode(JSON.stringify(a))).toString('base64'));
  };
  for (let i = 0; i < 8; i++) add(`detail-${i}`, details[i], { created: 1000 + i });
  add('repair', details[8], { created: 2000, answer: 'WRONG', attempts: ['WRONG'] });
  add('repair', details[8], {
    id: 'repair-1',
    revision: 1,
    created: 2000,
    answer: details[8].expected,
    attempts: ['WRONG', details[8].expected!],
    revealed: true,
  });
  add('copy', copies[0], { created: 3000, familiar: true });
  add('listen', listens[0], { created: 4000, familiar: true, self_report: 'partly' });
  await page.route(/\/api\/language(?:\?.*)?$/, (r) =>
    r.fulfill({
      json: {
        epoch: 'message-progress-fixture',
        records: packets,
        sequences: packets.map((_, i) => i + 1),
        cursor: packets.length,
        more: false,
      },
    }),
  );
  try {
    await page.goto('/progress?mode=words&view=messages');
    await expect(page.locator('.lp-stats')).toContainText('Self-reported understood');
    await expect(page.locator('.lp-stats strong').first()).toHaveText('1');
    await expect(page.locator('.lp-stats')).toContainText('0 / 1');
    const conditions = page.getByLabel('Message progress conditions', { exact: true });
    const context = await conditions
      .locator('option')
      .evaluateAll(
        (options) =>
          (
            options.find(
              (o) =>
                o.textContent?.includes('Message-detail recall') &&
                o.textContent.includes('New in available history'),
            ) as HTMLOptionElement
          ).value,
      );
    await conditions.selectOption(context);
    await expect(page.locator('.lp-stats strong').first()).toHaveText('9');
    await expect(page.locator('.lp-stats strong').nth(1)).toHaveText('89%');
    await expect(page.locator('.lp-stats strong').nth(2)).toHaveText('100%');
    await expect(page.locator('.lp-message-row')).toHaveCount(9);
    await page.locator('.lp-message-row').first().click();
    const detail = page.getByRole('region', { name: 'Message result details' });
    await expect(detail).toBeFocused();
    await expect(detail).toContainText('WRONG');
    await expect(detail).toContainText('2 saved submissions');
    await expect(page.locator('.language-progress')).not.toContainText('Response latency');
    for (const width of [320, 1440])
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: `/tmp/dojo-connected-message-progress-${test.info().project.name}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    await page.getByRole('button', { name: 'Review missed material', exact: true }).click();
    await expect(page).toHaveURL(/\/words\?mode=messages&review=/);
  } finally {
    fixture.close();
  }
});
