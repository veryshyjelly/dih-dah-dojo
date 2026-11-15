import { test, expect } from '@playwright/test';
test('language progress counts independent answers and unique story coverage', async ({ page }) => {
  await page.goto('/words');
  await page.evaluate(async () => {
    const ep = '/src/engine-client.ts',
      sp = '/src/language-store.ts';
    const { EngineClient } = await import(ep),
      { LanguageStore } = await import(sp);
    const engine = new EngineClient(),
      store = new LanguageStore('guest', engine);
    await store.open();
    const base = {
      version: 1,
      id: 'p1',
      item: 'words-AN',
      sentence: 0,
      kind: 'word',
      input: 'keyboard',
      c: 20,
      e: 10,
      answer: 'AN',
      attempts: ['A', 'AN'],
      replay: false,
      revealed: false,
      review: false,
      interrupted: false,
      finished: true,
      self_report: null,
      created: Date.now(),
    };
    await store.save(base);
    await store.save({ ...base, id: 'p2', answer: 'NO', attempts: ['N', 'NO'] });
    await store.save({ ...base, id: 'p3', replay: true });
    for (let i = 0; i < 2; i++)
      await store.save({
        ...base,
        id: `s${i}`,
        item: 'story-1',
        kind: 'story',
        answer: null,
        attempts: [],
        replay: !!i,
      });
    engine.close();
  });
  await page.goto('/progress?mode=words');
  await expect(page.getByRole('heading', { name: 'Your word rhythm.' })).toBeVisible();
  await expect(page.locator('.progress-stat-row')).toContainText('50%');
  await expect(page.locator('.progress-stat-row strong').first()).toHaveText('2');
  await page.getByRole('button', { name: 'Inspect', exact: true }).nth(1).click();
  await expect(page.getByText('1/2 exact answers', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Story activity archive', exact: true }).click();
  await expect(page.locator('.progress-stat-row strong').nth(1)).toHaveText('1');
  await page.getByRole('button', { name: 'Continue listening', exact: true }).first().click();
  await expect(page).toHaveURL(/\/stories\?story=story-1$/);
  await expect(page.getByText(/Sentence 1 \/ /)).toBeVisible();
  await expect(page.locator('.language-readout')).toHaveText('Ready when you are.');
  await page.goto('/stories?story=missing');
  await expect(page.getByRole('status')).toContainText('unavailable');
});
test('guest progress, settings and empty charts fit both themes', async ({ page }) => {
  for (const width of [320, 780, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const mode of ['words', 'stories']) {
        await page.goto(`/progress?mode=${mode}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: `test-results/language-progress-${test.info().project.name}-${mode}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.goto('/settings');
  await page.getByLabel('Confirm clearing guest activity').fill('DEL');
  await expect(
    page.getByRole('button', { name: 'Clear guest activity', exact: true }),
  ).toBeDisabled();
});
test('pure progress queries retain coverage baselines and skip null accuracy', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const path = '/src/language-progress.ts';
    const { coverage, storyGraph, daily, unique } = await import(path);
    const base = {
      activity: {
        id: 'a',
        kind: 'story',
        item: 's',
        sentence: 0,
        finished: true,
        interrupted: false,
        created: 1,
      },
      outcome: { eligible: false, attempt_accuracy: null, final_accuracy: null },
    };
    const stories = [{ id: 's', sentences: ['A', 'B'] }];
    const list = [
      base,
      base,
      { ...base, activity: { ...base.activity, id: 'b', sentence: 1, created: 2 } },
    ];
    return {
      unique: unique(list).length,
      coverage: coverage(list, stories).size,
      baseline: storyGraph(list, stories, '', 1).context,
      empty: daily(list, 'Accuracy').points.length,
    };
  });
  expect(result).toEqual({
    unique: 2,
    coverage: 2,
    baseline: 'Listening exposure · 1 before this window',
    empty: 0,
  });
});

test('setup links and Settings clearing refresh saved progress', async ({ page }) => {
  await page.goto('/words');
  await page.getByRole('button', { name: 'View progress', exact: true }).click();
  await expect(page).toHaveURL(/\/progress\?mode=words$/);
  await page
    .getByRole('group', { name: 'Word progress view' })
    .getByRole('button', { name: 'Phrases & messages', exact: true })
    .click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your word rhythm.' })).toBeVisible();
  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: "Export this browser's activity", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('dojo-language.bin');
  await page.getByLabel('Confirm clearing guest activity').fill('DELETE');
  await page.getByRole('button', { name: 'Clear guest activity', exact: true }).click();
  await expect(page.getByText('Guest activity cleared.', { exact: true })).toBeVisible();
});

test('unknown binary activity stays exportable without contributing progress', async ({ page }) => {
  await page.goto('/words');
  await expect(page.getByRole('button', { name: 'View progress', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open('dojo-language', 1);
      r.onsuccess = () => {
        const db = r.result;
        const t = db.transaction('activity', 'readwrite');
        t.objectStore('activity').put({
          id: 'guest:future',
          owner: 'guest',
          epoch: '',
          packet: new Uint8Array([255, 255, 255]),
          synced: true,
        });
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => reject(t.error);
      };
      r.onerror = () => reject(r.error);
    });
  });
  await page.goto('/progress?mode=words');
  await expect(page.getByRole('heading', { name: 'Your first word starts here.' })).toBeVisible();
  await expect(page.locator('.progress-stat-row')).toHaveCount(0);
  const exported = await page.evaluate(async () => {
    const path = '/src/language-store.ts';
    const { LanguageStore } = await import(path);
    const enginePath = '/src/engine-client.ts';
    const { EngineClient } = await import(enginePath);
    const engine = new EngineClient();
    try {
      const store = new LanguageStore('guest', engine);
      await store.open();
      return { entries: store.entries.length, bytes: Array.from(await store.export()) };
    } finally {
      engine.close();
    }
  });
  expect(exported.entries).toBe(0);
  expect(exported.bytes.slice(-3)).toEqual([255, 255, 255]);
});
