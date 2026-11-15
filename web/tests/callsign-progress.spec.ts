import { test, expect } from '@playwright/test';
import type { CallsignActivity, CallsignItem } from '../src/callsign-types';

test('callsign personal progress requires sign-in and does not read guest activity', async ({
  page,
}) => {
  let activityReads = 0;
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { user: null, providers: { google: true, github: true } } }),
  );
  await page.route(/\/api\/language(?:\?.*)?$/, (r) => {
    activityReads++;
    return r.fulfill({ status: 401, json: { error: 'Sign in' } });
  });
  await page.goto('/progress?mode=callsigns');
  await expect(
    page.getByRole('button', { name: 'Sign in for callsign progress', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.callsign-progress-stats')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign in for callsign progress', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page).toHaveURL(/\/progress\?mode=callsigns$/);
  expect(activityReads).toBe(0);
});

test('callsign progress groups repairs, filters conditions, inspects real graph points and reviews stable items', async ({
  page,
}) => {
  const { accountFixture } = await import('./account-fixture');
  const fixture = await accountFixture(page);
  try {
    const calls = JSON.parse(
      fixture.engine.callsign_generate(
        JSON.stringify({ seed: 91, count: 2, family: 'short', mode: 'call', condition: 'clean' }),
      ),
    ) as CallsignItem[];
    const noisy = JSON.parse(
      fixture.engine.callsign_generate(
        JSON.stringify({ seed: 92, count: 1, family: 'short', mode: 'call', condition: 'noise' }),
      ),
    ) as CallsignItem[];
    const packets: string[] = [];
    const add = (trial: string, item: CallsignItem, fields: Partial<CallsignActivity> = {}) => {
      const a: CallsignActivity = {
        version: 1,
        id: `${trial}-0`,
        trial_id: trial,
        revision: 0,
        item: item.id,
        sentence: 0,
        kind: 'callsign',
        input: 'keyboard',
        c: 20,
        e: 10,
        answer: item.text,
        attempts: [item.text],
        replay: false,
        revealed: false,
        review: false,
        interrupted: false,
        finished: true,
        self_report: null,
        created: 1000,
        latency_ms: 500,
        speed_mode: 'fixed',
        exchange_answer: null,
        exchange_attempts: [],
        ...fields,
      };
      packets.push(
        Buffer.from(fixture.engine.language_encode(JSON.stringify(a))).toString('base64'),
      );
    };
    for (let i = 0; i < 8; i++)
      add(`browser-good-${i}`, calls[i % 2], { created: 1000 + i, latency_ms: (i + 1) * 100 });
    add('browser-repair', calls[0], { created: 2000, answer: 'ZZ', attempts: ['ZZ'] });
    add('browser-repair', calls[0], {
      id: 'browser-repair-1',
      revision: 1,
      created: 2000,
      answer: calls[0].text,
      attempts: ['ZZ', calls[0].text],
      replay: true,
      revealed: true,
    });
    add('browser-noise', noisy[0], { created: 3000 });
    await page.route(/\/api\/language(?:\?.*)?$/, (r) =>
      r.fulfill({
        json: {
          epoch: 'callsign-progress-epoch',
          records: packets,
          sequences: packets.map((_, i) => i + 1),
          cursor: packets.length,
          more: false,
        },
      }),
    );
    await page.goto('/progress?mode=callsigns');
    const stats = page.locator('.callsign-progress-stats strong');
    await expect(stats.first()).toHaveText('1');
    const conditions = page.getByLabel('Callsign progress conditions', { exact: true });
    await expect(conditions).toHaveValue(/noise/);
    const clean = await conditions
      .locator('option')
      .evaluateAll(
        (options) =>
          (
            options.find((o) => o.textContent?.includes(' · clean · ')) as
              HTMLOptionElement | undefined
          )?.value,
      );
    expect(clean).toBeTruthy();
    await conditions.selectOption(clean!);
    await expect(stats.first()).toHaveText('9');
    await expect(stats.nth(1)).toHaveText('89%');
    await expect(stats.nth(2)).toHaveText('100%');
    await expect(page.locator('.callsign-progress-evidence')).toContainText(
      '8 correct independent samples',
    );
    await expect(page.locator('.callsign-history-row')).toHaveCount(9);
    await page.getByRole('button', { name: 'Inspect points', exact: true }).nth(2).click();
    await expect(page.getByLabel('Response latency point', { exact: true })).toBeVisible();
    await page.getByLabel('Response latency point', { exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.callsign-point-detail')).toContainText(
      '8 correct independent samples',
    );
    await page.locator('.callsign-history-row').first().click();
    const detail = page.getByLabel('Callsign result details', { exact: true });
    await expect(detail).toContainText('ZZ');
    await expect(detail).toContainText('2 saved submissions');
    await expect(page.locator('.callsign-history-heading')).toContainText('1 assisted');
    await page.getByLabel('Callsign progress range', { exact: true }).selectOption('100');
    await expect(stats.first()).toHaveText('9');
    for (const width of [320, 1440])
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.locator('.callsign-progress').screenshot({
          path: `/tmp/dojo-callsign-progress-${test.info().project.name}-${theme}-${width}.png`,
        });
      }
    await detail.getByRole('button', { name: 'Review this call', exact: true }).click();
    await expect(page).toHaveURL(/\/callsigns\?review=/);
    expect(JSON.parse(new URL(page.url()).searchParams.get('review')!)).toEqual([calls[0].id]);
    expect(JSON.parse(fixture.engine.snapshot(Date.now())).introduced).toBe('KM');
  } finally {
    fixture.close();
  }
});
