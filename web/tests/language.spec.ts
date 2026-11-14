import { test, expect } from '@playwright/test';
test('word rounds use real audio, hide answers, and keep feedback stable', async ({ page }) => {
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Word training', exact: true }).click();
  await page.getByLabel('Word characters').fill('KM');
  await page.getByRole('button', { name: 'Start word round' }).click();
  await expect(page.getByRole('status')).toContainText('No words');

  await page.reload();
  await page.getByRole('button', { name: 'Word training', exact: true }).click();
  await page.getByLabel('Character WPM').fill('60');
  await page.getByLabel('Effective WPM').fill('60');
  await page.getByRole('button', { name: 'Start word round' }).click();
  await expect(page.locator('.language-readout')).toHaveText('Ready when you are.');
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await expect(page.locator('.language-readout')).toHaveText('What did you hear?');
  await page.getByLabel('Your answer').fill('ZZ');
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('.language-readout strong')).toBeVisible();
  const text = await page.locator('.language-readout strong').innerText();
  await page.waitForTimeout(1800);
  await expect(page.locator('.language-readout strong')).toHaveText(text);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.language-readout')).toHaveText('Ready when you are.');
});
test('stories reveal only the current sentence and restore a stopped bookmark', async ({
  page,
}) => {
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Story listening', exact: true }).click();
  await page.getByLabel('Character WPM').fill('60');
  await page.getByLabel('Effective WPM').fill('60');
  await expect(page.locator('.story-card')).toHaveCount(6);
  await page.locator('.story-card').first().click();
  await expect(
    page.getByText('THE SMALL BOAT RESTED BESIDE THE RIVER.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await expect(page.locator('.language-readout')).toHaveText('What did you hear?');
  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expect(page.locator('.language-readout strong')).toHaveText(
    'THE SMALL BOAT RESTED BESIDE THE RIVER.',
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('A COOL WIND MOVED THROUGH THE TREES.', { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await expect(page.locator('.language-readout')).toHaveText('What did you hear?');
  await page.getByRole('button', { name: 'Reveal', exact: true }).click();
  await expect(page.getByText(/Saved on this browser/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Story listening', exact: true }).click();
  await page.locator('.story-card').first().click();
  await expect(page.getByText(/Sentence 2 \/ /)).toBeVisible();
  await expect(page.locator('.language-readout')).toHaveText('Ready when you are.');
  await page.screenshot({ path: `test-results/stories-${test.info().project.name}.png` });
});

test('language tools fit both themes and compact viewports, and guest reset can be cancelled', async ({
  page,
}) => {
  await page.goto('/tools');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => window.dojoTheme.setTheme(t as 'light' | 'dark'), theme);
      for (const name of ['Word training', 'Story listening']) {
        await page.getByRole('button', { name, exact: true }).click();
        await expect(page.locator('.language-practice')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    }
  }
  await page.getByRole('button', { name: 'Word training', exact: true }).click();
  await page.getByText('Your word and story data', { exact: true }).click();
  await page.getByLabel('Confirm clearing guest activity').fill('DEL');
  await expect(
    page.getByRole('button', { name: 'Clear guest activity', exact: true }),
  ).toBeDisabled();
});
test('continuous stories advance without revealing answers, and help pauses playback', async ({
  page,
}) => {
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Story listening', exact: true }).click();
  await page.getByLabel('Character WPM').fill('60');
  await page.getByLabel('Effective WPM').fill('60');
  await page.locator('.story-card').first().click();
  await page.getByLabel('Continuous listening').check();
  await page.getByRole('button', { name: 'Play F6', exact: true }).click();
  await expect(page.getByText(/Sentence 2 \/ /)).toBeVisible();
  await expect(page.locator('.language-readout strong')).toHaveCount(0);
  const help = page.getByRole('button', { name: 'Help', exact: true });
  if (await help.isVisible()) await help.click();
  else await page.getByRole('button', { name: 'How the dojo works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.language-readout')).toHaveText('Paused');
});

test('language storage keeps colliding activity IDs isolated between accounts', async ({
  page,
}) => {
  await page.route('**/api/language*', (r) =>
    r.fulfill({ status: 503, json: { error: 'Offline' } }),
  );
  await page.goto('/tools');
  const result = await page.evaluate(async () => {
    const enginePath = '/src/engine-client.ts',
      storePath = '/src/language-store.ts';
    const { EngineClient } = await import(enginePath);
    const { LanguageStore } = await import(storePath);
    const engine = new EngineClient();
    try {
      const a = new LanguageStore('one', engine),
        b = new LanguageStore('two', engine);
      await a.open();
      await b.open();
      const activity = {
        version: 1,
        id: 'same-id',
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
      await a.save(activity);
      await b.save({ ...activity, answer: 'NO', attempts: ['N', 'NO'] });
      const restored = new LanguageStore('one', engine);
      await restored.open();
      return {
        first: restored.entries[0].activity.answer,
        second: b.entries[0].activity.answer,
        count: restored.entries.length,
      };
    } finally {
      engine.close();
    }
  });
  expect(result).toEqual({ first: 'AN', second: 'NO', count: 1 });
});

test('Tools starts at the first option and the story library keeps character details optional', async ({
  page,
}) => {
  await page.goto('/tools');
  await expect(page.getByRole('button', { name: 'Word training', exact: true })).toHaveClass(
    'selected',
  );
  await expect(page.getByRole('button', { name: 'Start word round' })).toBeVisible();
  await page.getByRole('button', { name: 'Story listening', exact: true }).click();
  await expect(page.locator('.story-entry')).toHaveCount(6);
  await expect(page.locator('.story-characters[open]')).toHaveCount(0);
  await page.locator('.story-characters summary').first().click();
  await expect(page.locator('.story-character-chips').first()).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'A little story. A little signal.' }),
  ).toBeVisible();
  await page.locator('.story-characters summary').first().click();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.dojoTheme.setTheme(t as 'light' | 'dark'), theme);
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('.language-practice').scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.locator('.language-practice').screenshot({
        path: `test-results/story-library-${test.info().project.name}-${theme}-${width}.png`,
      });
    }
  }
});
