import { test, expect, type Page } from '@playwright/test';
import { accountFixture } from './account-fixture';

async function captureAudio(page: Page) {
  await page.addInitScript(() => {
    (window as any).callsignAudio = [];
    (window as any).callsignAudioSpecs = [];
    const send = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (message, options: any) {
      if (message?.type === 'prepare' && typeof message.text === 'string') {
        (window as any).callsignAudio.push(message.text);
        (window as any).callsignAudioSpecs.push(message);
      }
      return send.call(this, message, options);
    };
  });
}
async function quickSetup(page: Page) {
  await page.goto('/callsigns');
  await expect(
    page.getByRole('button', { name: 'Start callsign round', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Character WPM', { exact: true }).fill('60');
  await page.getByLabel('Effective WPM', { exact: true }).fill('60');
  await page.getByLabel('Calls in this round').selectOption('5');
}

function localActivityCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('dojo-language', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const rows = database.transaction('activity').objectStore('activity').getAll();
          rows.onerror = () => {
            database.close();
            reject(rows.error);
          };
          rows.onsuccess = () => {
            database.close();
            resolve(rows.result.filter((row: any) => row.owner === 'browser-fixture').length);
          };
        };
      }),
  );
}

test('callsign references are public while starting a round requires an account', async ({
  page,
}) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { user: null, providers: { google: true, github: true } } }),
  );
  await page.goto('/callsigns');
  await expect(page.getByRole('region', { name: 'Sign in for callsign practice' })).toBeVisible();
  await expect(page.locator('.callsign-reference-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Sign in to start', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.callsign-focus-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `test-results/callsign-setup-${test.info().project.name}-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
});

test('whole-call rounds hide material, replay a stable call and preserve the first copy during repair', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await captureAudio(page);
  try {
    await quickSetup(page);
    await expect(page.locator('.callsign-readiness-note')).toContainText(
      'do not unlock guided characters',
    );
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await expect(page.locator('.callsign-comparison')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Callsign structure' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Play call', exact: false }).click();
    await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
      timeout: 15000,
    });
    const target = await page.evaluate(() => (window as any).callsignAudio[0] as string);
    await expect(page.locator('.callsign-focus-card')).not.toContainText(target);
    await page.getByLabel('Callsign you heard', { exact: true }).fill('ZZZ');
    await page.keyboard.press('Enter');
    await expect(page.locator('.callsign-comparison')).toContainText('Your first copy');
    await expect(page.locator('.callsign-comparison strong').first()).toHaveText('ZZZ');
    await expect(page.locator('.callsign-comparison strong').last()).toHaveText(target);
    await page.getByLabel('Callsign you heard', { exact: true }).fill(target);
    await page.getByRole('button', { name: /^Check repair/ }).click();
    await expect(page.locator('.callsign-feedback-labels')).toContainText('Final copy exact');
    await expect(page.locator('.callsign-comparison strong').first()).toHaveText('ZZZ');
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: `test-results/callsign-feedback-${test.info().project.name}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
    await page.getByRole('button', { name: 'Hear the whole call', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next call', exact: true })).toBeEnabled({
      timeout: 15000,
    });
    expect(await page.evaluate(() => (window as any).callsignAudio.slice(0, 2))).toEqual([
      target,
      target,
    ]);
    await page.getByRole('button', { name: 'Next call', exact: true }).click();
    await expect(page.getByLabel('Callsign you heard', { exact: true })).toHaveValue('');
    await expect(page.locator('.callsign-comparison')).toHaveCount(0);
    await page.getByRole('button', { name: /^Finish round/ }).click();
    await expect(page.getByRole('heading', { name: 'Every call is a connection.' })).toBeVisible();
    await expect(page.locator('.callsign-summary-stats')).toContainText('0%');
    await expect(page.locator('.callsign-summary-stats')).toContainText('1 / 1');
    expect(JSON.parse(fixture.engine.snapshot(Date.now())).introduced).toBe('KM');
    const records = await page.evaluate(async () => {
      const enginePath = '/src/engine-client.ts',
        storePath = '/src/language-store.ts';
      const { EngineClient } = await import(enginePath);
      const { LanguageStore } = await import(storePath);
      const engine = new EngineClient();
      try {
        const store = new LanguageStore('browser-fixture', engine);
        await store.open();
        return store.entries.filter((entry: any) => entry.activity.kind === 'callsign');
      } finally {
        engine.close();
      }
    });
    expect(records.length).toBeGreaterThanOrEqual(2);
    const revisions = records.sort((a: any, b: any) => a.activity.revision - b.activity.revision);
    expect(revisions[0].activity.attempts).toEqual(['ZZZ']);
    expect(revisions[0].outcome.first_exact).toBe(false);
    expect(revisions[1].activity.attempts).toEqual(['ZZZ', target]);
    expect(revisions[1].outcome.final_exact).toBe(true);
    expect(new Set(revisions.map((entry: any) => entry.activity.trial_id)).size).toBe(1);
  } finally {
    fixture.close();
  }
});

test('serial exchange keeps the original call and number separate from repaired fields', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  try {
    await quickSetup(page);
    await page.getByRole('button', { name: /Call \+ serial number/ }).click();
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await page.getByRole('button', { name: 'Play call', exact: false }).click();
    await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByLabel('Callsign you heard', { exact: true }).fill('ZZZ');
    await page.locator('.callsign-answer-form label').nth(1).locator('input').fill('000');
    await page.getByRole('button', { name: /^Check call/ }).click();
    const expected = await page.locator('.callsign-comparison strong').last().innerText();
    const serial = await page.locator('.callsign-exchange-feedback strong').innerText();
    await page.getByLabel('Callsign you heard', { exact: true }).fill(expected);
    await page.locator('.callsign-answer-form label').nth(1).locator('input').fill(serial);
    await page.getByRole('button', { name: /^Check repair/ }).click();
    await expect(page.locator('.callsign-exchange-feedback')).toContainText(
      'Repaired after the first attempt',
    );
    await expect(page.locator('.callsign-comparison strong').first()).toHaveText('ZZZ');
  } finally {
    fixture.close();
  }
});

test('pause retains the same call and never submits merely by finishing playback', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await captureAudio(page);
  try {
    await quickSetup(page);
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await page.getByRole('button', { name: 'Play call', exact: false }).click();
    await page.keyboard.press('F5');
    await expect(page.getByRole('heading', { name: 'No rush.' })).toBeVisible();
    await page.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await page.getByRole('button', { name: 'Replay call', exact: false }).click();
    await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
      timeout: 15000,
    });
    const clips = await page.evaluate(() => (window as any).callsignAudio as string[]);
    expect(new Set(clips).size).toBe(1);
    await expect(page.locator('.callsign-comparison')).toHaveCount(0);
    await page.getByRole('button', { name: /^Finish round/ }).click();
    await expect(page.locator('.callsign-summary-stats')).toContainText('0 / 0');
  } finally {
    fixture.close();
  }
});

test('recovery, CQ identification and CQ zone rounds use their distinct prompts and fields', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await captureAudio(page);
  try {
    for (const mode of ['recovery', 'qso', 'zone']) {
      await quickSetup(page);
      await page
        .getByRole('button', {
          name:
            mode === 'recovery'
              ? /Catch the missing part/
              : mode === 'qso'
                ? /Find the calling station/
                : /Call \+ CQ zone/,
        })
        .click();
      await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
      await page.getByRole('button', { name: /^Play call/ }).click();
      await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
        timeout: 15000,
      });
      const audioText = await page.evaluate(() => (window as any).callsignAudio.at(-1) as string);
      const target =
        mode === 'qso' ? / DE ([A-Z0-9/]+)/.exec(audioText)![1] : audioText.split(' ')[0];
      await expect(page.locator('.callsign-focus-card')).not.toContainText(target);
      if (mode === 'qso') {
        await expect(page.locator('.callsign-prompt')).toContainText(
          'Copy the station calling CQ.',
        );
        const ownCall = await page.locator('.callsign-prompt strong').innerText();
        expect(ownCall).not.toBe(target);
        expect(audioText).toContain(`DE ${target} ${target}`);
      }
      await page
        .getByLabel('Callsign you heard', { exact: true })
        .fill(mode === 'recovery' ? target.slice(0, -1) : target);
      if (mode === 'zone') {
        await expect(page.locator('.callsign-prompt')).toContainText('CQ zone');
        await page
          .locator('.callsign-answer-form label')
          .nth(1)
          .locator('input')
          .fill(audioText.split(' ').at(-1)!);
      }
      await page.getByRole('button', { name: /^Check call/ }).click();
      await expect(page.locator('.callsign-comparison strong').last()).toHaveText(target);
      if (mode === 'recovery') {
        await page.getByRole('button', { name: 'Hear the whole call', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Next call', exact: true })).toBeEnabled({
          timeout: 15000,
        });
        await page.getByLabel('Callsign you heard', { exact: true }).fill(target);
        await page.getByRole('button', { name: /^Check repair/ }).click();
        await expect(page.locator('.callsign-comparison strong').first()).toHaveText(
          target.slice(0, -1),
        );
        await expect(page.locator('.callsign-feedback-labels')).toContainText('Final copy exact');
      }
      if (mode === 'zone')
        await expect(page.locator('.callsign-exchange-feedback')).toContainText(
          'Copied on the first attempt',
        );
      await page.getByRole('button', { name: /^Finish round/ }).click();
      await expect(
        page.getByRole('heading', { name: 'Every call is a connection.' }),
      ).toBeVisible();
    }
  } finally {
    fixture.close();
  }
});

test('optional adaptive pace promotes a clean exact call but never an assisted call', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await captureAudio(page);
  try {
    await quickSetup(page);
    await page.getByLabel('Effective WPM', { exact: true }).fill('55');
    await page.getByRole('button', { name: 'Let this round adapt', exact: true }).click();
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    for (let position = 0; position < 2; position++) {
      await page.getByRole('button', { name: /^Play call/ }).click();
      await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
        timeout: 15000,
      });
      if (position === 1) {
        await page.getByRole('button', { name: /^Replay call/ }).click();
        await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
          timeout: 15000,
        });
      }
      const target = await page.evaluate(() => (window as any).callsignAudio.at(-1) as string);
      await page.getByLabel('Callsign you heard', { exact: true }).fill(target);
      await page.getByRole('button', { name: /^Check call/ }).click();
      await expect(page.locator('.callsign-comparison')).toBeVisible();
      await page.getByRole('button', { name: 'Next call', exact: true }).click();
      await expect(page.locator('.callsign-workspace-strip')).toContainText('60 / 56 WPM');
    }
    expect(JSON.parse(fixture.engine.snapshot(Date.now())).copyingE).not.toBe(56);
  } finally {
    fixture.close();
  }
});

test('overlapping mode selects its condition and an audio fault pauses rather than saving independent evidence', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await captureAudio(page);
  try {
    await quickSetup(page);
    await page.getByRole('button', { name: /One voice in the crowd/ }).click();
    await expect(page.locator('.callsign-condition-details summary')).toContainText(
      'Overlapping caller',
    );
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await page.getByRole('button', { name: /^Play call/ }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).callsignAudioSpecs.some((value: any) => value.condition === 'pileup'),
        ),
      )
      .toBe(true);
    const spec = await page.evaluate(() =>
      (window as any).callsignAudioSpecs.find((value: any) => value.condition === 'pileup'),
    );
    expect(spec.condition).toBe('pileup');
    expect(spec.interferer).toBeTruthy();
    await page.evaluate(() => window.dispatchEvent(new Event('dojo-audio-fault')));
    await expect(page.getByRole('heading', { name: 'No rush.' })).toBeVisible();
    await expect(page.locator('.callsign-comparison')).toHaveCount(0);
    await page.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await page.getByRole('button', { name: /^Replay call/ }).click();
    await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByLabel('Callsign you heard', { exact: true }).fill(spec.text);
    await page.getByRole('button', { name: /^Check call/ }).click();
    await expect(page.locator('.callsign-feedback-labels')).toContainText(
      'Interrupted · separate evidence',
    );
    await page.getByRole('button', { name: /^Finish round/ }).click();
    await expect(page.locator('.callsign-summary-stats')).toContainText(
      'assisted or interrupted calls',
    );
    await expect(page.locator('.callsign-summary-stats > div').first()).toContainText('—');
  } finally {
    fixture.close();
  }
});

test('an explicit unknown counts as a first-pass miss while Reveal remains assisted', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  try {
    await quickSetup(page);
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await page.getByRole('button', { name: /^Play call/ }).click();
    await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'I don’t know', exact: true }).click();
    await expect(page.locator('.callsign-feedback-labels')).toContainText(
      'Independent · first copy kept',
    );
    await page.getByRole('button', { name: 'Next call', exact: true }).click();
    await page.getByRole('button', { name: /^Play call/ }).click();
    await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Reveal · assisted', exact: true }).click();
    await expect(page.locator('.callsign-feedback-labels')).toContainText(
      'Assisted · first copy kept',
    );
    await page.getByRole('button', { name: /^Finish round/ }).click();
    await expect(page.locator('.callsign-summary-stats > div').first()).toContainText('0%');
    await expect.poll(() => localActivityCount(page)).toBe(2);
    const entries = await page.evaluate(async () => {
      const enginePath = '/src/engine-client.ts',
        storePath = '/src/language-store.ts';
      const { EngineClient } = await import(enginePath),
        { LanguageStore } = await import(storePath);
      const engine = new EngineClient();
      try {
        const store = new LanguageStore('browser-fixture', engine);
        await store.open();
        return store.entries.filter((entry: any) => entry.activity.kind === 'callsign');
      } finally {
        engine.close();
      }
    });
    expect(entries).toHaveLength(2);
    const unknown = entries.find((entry: any) => !entry.activity.revealed)!;
    expect(unknown.activity.attempts).toEqual(['']);
    expect(unknown.outcome.eligible).toBe(true);
    expect(unknown.outcome.first_exact).toBe(false);
    expect(entries.find((entry: any) => entry.activity.revealed)!.outcome.eligible).toBe(false);
  } finally {
    fixture.close();
  }
});

test('starting during reference playback and preparing while reference controls are pressed cannot wedge the round', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  await page.addInitScript(() => {
    (window as any).delayCallsignPreparation = 0;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'callsign_generate' && (window as any).delayCallsignPreparation) {
        setTimeout(
          () => send.call(this, message, options),
          (window as any).delayCallsignPreparation,
        );
        return;
      }
      send.call(this, message, options);
    };
  });
  try {
    await quickSetup(page);
    await page
      .locator('.callsign-reference-card')
      .first()
      .getByRole('button', { name: 'Hear the whole call', exact: true })
      .click();
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Play call/ })).toBeEnabled();
    await page.getByRole('button', { name: /^Finish round/ }).click();
    await page.getByRole('button', { name: 'Set up another round', exact: false }).click();
    await page.evaluate(() => {
      (window as any).delayCallsignPreparation = 600;
    });
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await expect(
      page.locator('.callsign-reference-card').first().getByRole('button'),
    ).toBeDisabled();
    await page.evaluate(() =>
      document.querySelector<HTMLButtonElement>('.callsign-reference-card button')!.click(),
    );
    await expect(page.getByRole('button', { name: /^Play call/ })).toBeEnabled();
  } finally {
    fixture.close();
  }
});

test('each revision starts its local write immediately even while prior synchronization is pending', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0,
    settled = 0;
  await page.route(/\/api\/language(?:\?|$)/, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          epoch: 'browser-epoch',
          records: [],
          sequences: [],
          cursor: 0,
          more: false,
        },
      });
    const sequence = ++posts;
    await held;
    await route.fulfill({ json: { seq: sequence } });
    settled++;
  });
  try {
    await quickSetup(page);
    await page.getByRole('button', { name: 'Start callsign round', exact: true }).click();
    await page.getByRole('button', { name: /^Play call/ }).click();
    await expect(page.getByRole('button', { name: /^Replay call/ })).toBeEnabled({
      timeout: 15000,
    });
    await page.getByLabel('Callsign you heard', { exact: true }).fill('ZZZ');
    await page.getByRole('button', { name: /^Check call/ }).click();
    const target = await page.locator('.callsign-comparison strong').last().innerText();
    await expect.poll(() => posts).toBeGreaterThan(0);
    await page.getByLabel('Callsign you heard', { exact: true }).fill(target);
    await page.getByRole('button', { name: /^Check repair/ }).click();
    await expect(page.locator('.callsign-feedback-labels')).toContainText('Final copy exact');
    // Both local revisions are durable while the first actual HTTP upload is held.
    await expect.poll(() => localActivityCount(page)).toBe(2);
    await page.getByRole('button', { name: 'Sound and settings', exact: true }).click();
    await page.getByRole('button', { name: 'Reset progress', exact: true }).click();
    await page.getByLabel('TYPE DELETE TO CONFIRM').fill('DELETE');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Reset progress', exact: true })
      .click();
    await expect(page.getByText('Your progress has been reset.', { exact: true })).toBeVisible();
    expect(fixture.resetRequests()).toBe(1);
    await expect.poll(() => localActivityCount(page)).toBe(0);
    const pendingPosts = posts;
    release();
    await expect.poll(() => settled).toBeGreaterThanOrEqual(pendingPosts);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    // Let delayed acknowledgements complete their storage work before checking again.
    await page.waitForTimeout(200);
    expect(await localActivityCount(page)).toBe(0);
  } finally {
    release();
    fixture.close();
  }
});
