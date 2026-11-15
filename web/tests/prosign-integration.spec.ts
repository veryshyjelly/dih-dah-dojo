import { test, expect } from '@playwright/test';
import { accountFixture } from './account-fixture';
import type { ProsignActivity, ProsignItem } from '../src/prosign-types';

test('prosign references connect to the sound library while private progress requires sign-in', async ({
  page,
}) => {
  let reads = 0;
  await page.route('**/api/session', (r) =>
    r.fulfill({ json: { user: null, providers: { google: true, github: true } } }),
  );
  await page.route(/\/api\/language(?:\?.*)?$/, (r) => {
    reads++;
    return r.fulfill({ status: 401, json: { error: 'Sign in' } });
  });
  await page.goto('/tools');
  await page.getByRole('button', { name: 'The sound library', exact: true }).click();
  await page.getByRole('button', { name: 'Explore prosigns', exact: true }).click();
  await expect(page).toHaveURL(/\/prosigns$/);
  await expect(
    page.getByRole('region', { name: 'Prosign sound library', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Sign in for prosign practice', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Your progress', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Progress category' })
    .getByRole('button', { name: 'Prosigns', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Sign in for prosign progress', exact: true }),
  ).toBeVisible();
  expect(reads).toBe(0);
  await page.getByRole('button', { name: 'Sign in for prosign progress', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page).toHaveURL(/\/progress\?mode=prosigns$/);
});

test('real prosign history separates exercises, retains repairs and inspects eligible graph points', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  try {
    const items = (mode: string) =>
      JSON.parse(
        fixture.engine.prosign_generate(
          JSON.stringify({ seed: 23, count: 2, mode, signals: ['BT', 'AR'] }),
        ),
      ) as ProsignItem[];
    const recognition = items('recognition'),
      meaning = items('meaning'),
      context = items('context');
    const packets: string[] = [];
    const add = (id: string, item: ProsignItem, fields: Partial<ProsignActivity> = {}) => {
      const activity: ProsignActivity = {
        version: 1,
        kind: 'prosign',
        id: `${id}-0`,
        trial_id: id,
        revision: 0,
        item: item.id,
        sentence: 0,
        input: 'keyboard',
        c: 20,
        e: 10,
        answer: item.expected,
        attempts: [item.expected],
        replay: false,
        revealed: false,
        review: false,
        interrupted: false,
        finished: true,
        self_report: null,
        created: 1000,
        latency_ms: 500,
        ...fields,
      };
      packets.push(
        Buffer.from(fixture.engine.language_encode(JSON.stringify(activity))).toString('base64'),
      );
    };
    for (let i = 0; i < 8; i++)
      add(`sound-${i}`, recognition[i % 2], { created: 1000 + i, latency_ms: (i + 1) * 100 });
    add('repair', recognition[0], { created: 2000, answer: 'ZZ', attempts: ['ZZ'] });
    add('repair', recognition[0], {
      id: 'repair-1',
      revision: 1,
      created: 2000,
      answer: recognition[0].expected,
      attempts: ['ZZ', recognition[0].expected],
      revealed: true,
    });
    add('meaning', meaning[0], { created: 3000 });
    add('context', context[0], { created: 4000 });
    await page.route(/\/api\/language(?:\?.*)?$/, (r) =>
      r.fulfill({
        json: {
          epoch: 'prosign-browser-epoch',
          records: packets,
          sequences: packets.map((_, i) => i + 1),
          cursor: packets.length,
          more: false,
        },
      }),
    );
    await page.goto('/progress?mode=prosigns');
    const conditions = page.getByLabel('Prosign progress conditions', { exact: true });
    await expect(conditions).toHaveValue(/context/);
    const stats = page.locator('.prosign-progress-stats strong');
    await expect(stats.first()).toHaveText('1');
    const sound = await conditions
      .locator('option')
      .evaluateAll(
        (options) =>
          (options.find((o) => o.textContent?.startsWith('Sound recognition')) as HTMLOptionElement)
            ?.value,
      );
    expect(sound).toBeTruthy();
    await conditions.selectOption(sound!);
    await expect(stats.first()).toHaveText('9');
    await expect(stats.nth(1)).toHaveText('89%');
    await expect(stats.nth(2)).toHaveText('100%');
    await expect(page.locator('.prosign-history-row')).toHaveCount(9);
    await expect(page.locator('.prosign-history-heading')).toContainText('1 assisted');
    await expect(page.locator('.prosign-progress')).toContainText('8 correct independent samples');
    await page.getByRole('button', { name: 'Inspect points', exact: true }).nth(2).click();
    const point = page.getByLabel('Response latency point', { exact: true });
    await expect(point).toBeVisible();
    await point.focus();
    await page.keyboard.press('ArrowLeft');
    await page.locator('.prosign-history-row').first().click();
    await expect(page.getByLabel('Prosign result details', { exact: true })).toContainText('ZZ');
    await expect(page.getByLabel('Prosign result details', { exact: true })).toContainText(
      '2 saved submissions',
    );
    for (const width of [320, 1024, 1440])
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: `/tmp/dojo-prosign-progress-${test.info().project.name}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    await page.getByRole('button', { name: 'Review missed signals', exact: true }).click();
    await expect(page).toHaveURL(/\/prosigns\?review=/);
    await expect(
      page.getByRole('button', { name: 'Review selected signals (1)', exact: true }),
    ).toBeVisible();
  } finally {
    fixture.close();
  }
});

test('atomic token preparation plays in the real worklet and stop leaves no delayed sound', async ({
  page,
}) => {
  await page.goto('/tools');
  await page.evaluate(async () => {
    const path = '/src/audio.ts';
    const { AudioService } = await import(path);
    const service = new AudioService();
    const probe = { service, errors: [] as string[], completed: false };
    (window as any).prosignWorkletProbe = probe;
    service.onError = (message: string) => probe.errors.push(message);
    const button = document.createElement('button');
    button.textContent = 'Play atomic token fixture';
    button.onclick = async () => {
      probe.completed = false;
      const sound = await service.play({
        text: '<AR><BT><HH>',
        tokens: true,
        c: 60,
        e: 60,
        rescue: false,
      });
      await sound.finished;
      probe.completed = true;
    };
    document.body.append(button);
  });
  await page.getByRole('button', { name: 'Play atomic token fixture', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).prosignWorkletProbe.completed))
    .toBe(true);
  expect(await page.evaluate(() => (window as any).prosignWorkletProbe.errors)).toEqual([]);
  expect(await page.evaluate(() => (window as any).prosignWorkletProbe.service.active)).toBe(false);
  await page.getByRole('button', { name: 'Play atomic token fixture', exact: true }).click();
  await page.evaluate(() => (window as any).prosignWorkletProbe.service.stop());
  await expect
    .poll(() => page.evaluate(() => (window as any).prosignWorkletProbe.service.active))
    .toBe(false);
});
