import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
test('browser backup import previews, merges and deduplicates without detached Settings layout', async ({
  page,
}) => {
  await page.goto('/words');
  await page.getByRole('button', { name: 'View progress', exact: true }).waitFor();
  const bytes = await page.evaluate(async () => {
    const ep = '/src/engine-client.ts',
      sp = '/src/language-store.ts';
    const { EngineClient } = await import(ep),
      { LanguageStore, clearLanguage } = await import(sp);
    const engine = new EngineClient(),
      store = new LanguageStore('guest', engine);
    try {
      await store.open();
      await store.save({
        version: 1,
        id: 'import-word-1',
        kind: 'word',
        item: 'words-AN',
        sentence: 0,
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
        created: 1,
      });
      const result = Array.from(await store.export()) as number[];
      await clearLanguage('guest');
      return result;
    } finally {
      engine.close();
    }
  });
  await page.goto('/settings');
  const input = page.getByLabel('Import backup file');
  await input.setInputFiles({
    name: 'dojo-language.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByRole('region', { name: 'Backup preview' })).toContainText('1 new records');
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Backup preview' })).toHaveCount(0);
  await input.setInputFiles({
    name: 'dojo-language.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
  await page.getByRole('button', { name: 'Import activity', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 activity records imported');
  await input.setInputFiles({
    name: 'dojo-language.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByRole('region', { name: 'Backup preview' })).toContainText(
    '0 new records · 1 duplicates',
  );
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await input.setInputFiles({
    name: 'broken.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('CWLANG01broken'),
  });
  await expect(page.getByRole('status')).toContainText('Invalid or unsupported');
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await page.locator('.settings-page .backup-workspace').count()).toBe(1);
      expect(await page.locator('.language-data-settings.page').count()).toBe(0);
      await page.screenshot({
        path: `test-results/backups-${test.info().project.name}-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto('/progress?mode=words');
  await expect(page.locator('.progress-stat-row strong').first()).toHaveText('1');
});
test('account restore requires preview and RESTORE and remains before destructive actions', async ({
  page,
}) => {
  const { accountFixture } = await import('./account-fixture');
  const fixture = await accountFixture(page);
  let confirmed = 0;
  const state = Buffer.from(fixture.engine.checkpoint()),
    head = Buffer.alloc(6);
  head.writeUInt32LE(state.length, 2);
  const body = Buffer.concat([head, state]),
    bytes = Buffer.concat([
      Buffer.from('CWDOJOW2'),
      createHash('sha256').update(body).digest(),
      body,
    ]);
  await page.route(/\/api\/account\/import(?:\/preview)?(?:\?.*)?$/, async (r) => {
    if (new URL(r.request().url()).pathname.endsWith('/preview'))
      return r.fulfill({
        json: {
          epoch: 'epoch',
          baseline: 'baseline',
          digest: 'digest',
          profiles: 1,
          blocks: 0,
          language: 0,
          legacy: false,
        },
      });
    confirmed++;
    expect(new URL(r.request().url()).searchParams.get('confirmation')).toBe('RESTORE');
    expect(r.request().postDataBuffer()).toEqual(bytes);
    return r.fulfill({ json: { restored: true, epoch: 'new' } });
  });
  try {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sound and settings', exact: true }).waitFor();
    const backup = await page.locator('.backup-workspace').boundingBox(),
      danger = await page.locator('.data-danger').boundingBox();
    expect(backup!.y + backup!.height).toBeLessThan(danger!.y + 1);
    expect(danger!.y - (backup!.y + backup!.height)).toBeLessThan(160);
    const input = page.getByLabel('Import backup file');
    await input.setInputFiles({
      name: 'full.cwweb',
      mimeType: 'application/octet-stream',
      buffer: bytes,
    });
    await expect(
      page.getByRole('button', { name: 'Restore saved progress', exact: true }),
    ).toBeDisabled();
    await page.getByLabel('Confirm restoring account backup').fill('RESTOR');
    await expect(
      page.getByRole('button', { name: 'Restore saved progress', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
    expect(confirmed).toBe(0);
    await input.setInputFiles({
      name: 'full.cwweb',
      mimeType: 'application/octet-stream',
      buffer: bytes,
    });
    await page.getByLabel('Confirm restoring account backup').fill('RESTORE');
    await page.getByRole('button', { name: 'Restore saved progress', exact: true }).click();
    await expect(
      page.getByText('Your saved progress has been restored.', { exact: true }),
    ).toBeVisible();
    expect(confirmed).toBe(1);
  } finally {
    fixture.close();
  }
});

test('clearing progress prevents a delayed browser save from returning', async ({ page }) => {
  await page.goto('/words');
  await page.getByRole('button', { name: 'View progress', exact: true }).waitFor();
  const result = await page.evaluate(async () => {
    const ep = '/src/engine-client.ts',
      sp = '/src/language-store.ts';
    const { EngineClient } = await import(ep),
      { LanguageStore, clearLanguage } = await import(sp);
    const engine = new EngineClient(),
      store = new LanguageStore('guest', engine);
    await store.open();
    const original = engine.call.bind(engine);
    let release = () => {},
      entered = () => {};
    const waiting = new Promise<void>((r) => (entered = r)),
      gate = new Promise<void>((r) => (release = r));
    engine.call = async (...args: unknown[]) => {
      if (args[0] === 'language_encode') {
        entered();
        await gate;
      }
      return original(...args);
    };
    try {
      const pending = store
        .save({
          version: 1,
          id: 'delayed-save',
          kind: 'word',
          item: 'words-AN',
          sentence: 0,
          input: 'keyboard',
          c: 20,
          e: 10,
          answer: 'AN',
          attempts: [],
          replay: false,
          revealed: false,
          review: false,
          interrupted: false,
          finished: true,
          self_report: null,
          created: 1,
        })
        .then(
          () => false,
          () => true,
        );
      await waiting;
      await clearLanguage('guest');
      release();
      const rejected = await pending;
      const restored = new LanguageStore('guest', engine);
      await restored.open();
      return { rejected, entries: restored.entries.length };
    } finally {
      engine.close();
    }
  });
  expect(result).toEqual({ rejected: true, entries: 0 });
});

test('sync never overwrites a conflicting pending imported record', async ({ page }) => {
  await page.goto('/words');
  await page.getByRole('button', { name: 'View progress', exact: true }).waitFor();
  const result = await page.evaluate(async () => {
    const ep = '/src/engine-client.ts',
      sp = '/src/language-store.ts';
    const { EngineClient } = await import(ep),
      { LanguageStore } = await import(sp);
    const engine = new EngineClient(),
      original = window.fetch;
    let mode = 0,
      remote = '',
      posts = 0;
    window.fetch = async (input, init) => {
      if (String(input).includes('/api/language')) {
        if (mode === 1) throw new Error('offline fixture');
        if (init?.method === 'POST') {
          posts++;
          return new Response(JSON.stringify({ seq: 1 }));
        }
        return new Response(
          JSON.stringify({
            epoch: 'test-epoch',
            records: mode === 2 ? [remote] : [],
            sequences: mode === 2 ? [1] : [],
            cursor: mode === 2 ? 1 : 0,
            more: false,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
      return original(input, init);
    };
    try {
      const store = new LanguageStore('pending-owner', engine);
      await store.open();
      const a = {
        version: 1,
        id: 'same-imported-id',
        kind: 'word',
        item: 'words-AN',
        sentence: 0,
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
        created: 1,
      };
      mode = 1;
      await store.save(a);
      const bytes = await engine.call(
        'language_encode',
        JSON.stringify({ ...a, answer: 'NO', attempts: ['N', 'NO'] }),
      );
      remote = btoa(String.fromCharCode(...bytes));
      mode = 2;
      const reopened = new LanguageStore('pending-owner', engine);
      await reopened.open();
      return { answer: reopened.entries[0].activity.answer, status: reopened.status, posts };
    } finally {
      window.fetch = original;
      engine.close();
    }
  });
  expect(result.answer).toBe('AN');
  expect(result.status).toContain('Sync conflict');
  expect(result.posts).toBe(0);
});

test('signed-in browser backup import uses an atomic account batch', async ({ page }) => {
  const { accountFixture } = await import('./account-fixture');
  const fixture = await accountFixture(page);
  const packet = Buffer.from(
      fixture.engine.language_encode(
        JSON.stringify({
          version: 1,
          id: 'account-language-merge',
          kind: 'word',
          item: 'words-AN',
          sentence: 0,
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
          created: 1,
        }),
      ),
    ),
    head = Buffer.alloc(4);
  head.writeUInt32LE(packet.length);
  const bytes = Buffer.concat([Buffer.from('CWLANG01'), head, packet]);
  let imported = false,
    posts = 0;
  await page.route(/\/api\/language(?:\/import)?(?:\?.*)?$/, async (r) => {
    if (r.request().method() === 'POST') {
      posts++;
      expect(new URL(r.request().url()).pathname).toBe('/api/language/import');
      expect(r.request().postDataBuffer()).toEqual(bytes);
      imported = true;
      return r.fulfill({ json: { imported: 1, duplicates: 0 } });
    }
    return r.fulfill({
      json: {
        epoch: 'language-test-epoch',
        records: imported ? [packet.toString('base64')] : [],
        sequences: imported ? [1] : [],
        cursor: imported ? 1 : 0,
        more: false,
      },
    });
  });
  try {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sound and settings', exact: true }).waitFor();
    await page
      .getByLabel('Import backup file')
      .setInputFiles({ name: 'browser.bin', mimeType: 'application/octet-stream', buffer: bytes });
    await expect(page.getByRole('region', { name: 'Backup preview' })).toContainText(
      'your signed-in account',
    );
    await page.getByRole('button', { name: 'Import activity', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('1 activity records imported');
    expect(posts).toBe(1);
    expect(JSON.parse(fixture.engine.snapshot(Date.now())).introduced).toBe('KM');
    await page.goto('/progress?mode=words');
    await expect(page.locator('.progress-stat-row strong').first()).toHaveText('1');
  } finally {
    fixture.close();
  }
});
