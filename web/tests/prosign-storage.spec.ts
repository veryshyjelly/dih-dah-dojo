import { test, expect, type Page } from '@playwright/test';
import { accountFixture } from './account-fixture';

async function setup(page: Page) {
  await page.goto('/prosigns');
  await expect(
    page.getByRole('button', { name: 'Start prosign round', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Character WPM', { exact: true }).fill('60');
  await page.getByLabel('Effective WPM', { exact: true }).fill('60');
  const signals = page.getByRole('group', { name: 'Signals for this round' });
  for (const token of ['BT', 'SK', 'AS'])
    await signals.getByRole('button', { name: new RegExp(`^<${token}>`) }).click();
  await page.getByRole('button', { name: 'Start prosign round', exact: true }).click();
  await page.getByRole('button', { name: /^Play signal/ }).click();
  await expect(page.getByLabel('Signal you heard', { exact: true })).toBeEnabled();
}

function localRows(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ owner: string; synced: boolean; id: string }[]>((resolve, reject) => {
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
            resolve(
              rows.result.map((row: any) => ({ owner: row.owner, synced: row.synced, id: row.id })),
            );
          };
        };
      }),
  );
}

test('resetting through Settings rejects a prosign accepted before its evaluation and encoding finish', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  let posts = 0;
  await page.route(/\/api\/language(?:\?|$)/, async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      return route.fulfill({ json: { seq: posts } });
    }
    return route.fulfill({
      json: { epoch: 'browser-epoch', records: [], sequences: [], cursor: 0, more: false },
    });
  });
  await page.addInitScript(() => {
    const probe = {
      held: [] as (() => void)[],
      released: false,
      decoded: 0,
      encodes: 0,
      evaluations: 0,
    };
    (window as any).prosignStorageProbe = probe;
    const send = Worker.prototype.postMessage;
    const observed = new WeakSet<Worker>();
    const methods = new WeakMap<Worker, Map<number, string>>();
    Worker.prototype.postMessage = function (message, options: any) {
      if (!observed.has(this)) {
        observed.add(this);
        methods.set(this, new Map());
        this.addEventListener('message', (event) => {
          if (probe.released && methods.get(this)?.get(event.data.id) === 'language_decode')
            probe.decoded++;
          methods.get(this)?.delete(event.data.id);
        });
      }
      methods.get(this)!.set(message.id, message.method);
      if (message?.method === 'language_encode' && !probe.released) {
        probe.encodes++;
        probe.held.push(() => send.call(this, message, options));
        return;
      }
      if (message?.method === 'prosign_evaluate' && !probe.released) {
        probe.evaluations++;
        probe.held.push(() => send.call(this, message, options));
        return;
      }
      send.call(this, message, options);
    };
  });
  try {
    await setup(page);
    await page.getByLabel('Signal you heard', { exact: true }).fill('AR');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => (window as any).prosignStorageProbe.encodes))
      .toBe(1);
    await expect
      .poll(() => page.evaluate(() => (window as any).prosignStorageProbe.evaluations))
      .toBe(1);
    await expect(page.locator('.prosign-comparison')).toHaveCount(0);
    expect(await localRows(page)).toEqual([]);
    await page.getByRole('button', { name: 'Sound and settings', exact: true }).click();
    await page.getByRole('button', { name: 'Reset progress', exact: true }).click();
    await page.getByLabel('TYPE DELETE TO CONFIRM').fill('DELETE');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Reset progress', exact: true })
      .click();
    await expect(page.getByText('Your progress has been reset.', { exact: true })).toBeVisible();
    expect(fixture.resetRequests()).toBe(1);
    await page.evaluate(() => {
      const probe = (window as any).prosignStorageProbe;
      probe.released = true;
      probe.held.splice(0).forEach((release: () => void) => release());
    });
    await expect
      .poll(() => page.evaluate(() => (window as any).prosignStorageProbe.decoded))
      .toBeGreaterThan(0);
    expect(await localRows(page)).toEqual([]);
    expect(posts).toBe(0);
    await page.getByRole('button', { name: 'Prosigns', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Start prosign round', exact: true }),
    ).toBeEnabled();
    expect(await localRows(page)).toEqual([]);
  } finally {
    fixture.close();
  }
});

test('an accepted prosign remains with its account after navigation, signout and upload failure', async ({
  page,
}) => {
  const fixture = await accountFixture(page);
  let release = () => {},
    posts = 0,
    settled = 0;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const submitted: { owner: string; epoch: string }[] = [];
  await page.route(/\/api\/language(?:\?|$)/, async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: { epoch: 'browser-epoch', records: [], sequences: [], cursor: 0, more: false },
      });
    submitted.push(route.request().postDataJSON());
    posts++;
    await held;
    await route.fulfill({ status: 401, json: { error: 'Session ended' } });
    settled++;
  });
  await page.route('**/api/auth/sign-out', (route) => route.fulfill({ json: { success: true } }));
  try {
    await setup(page);
    await page.getByLabel('Signal you heard', { exact: true }).fill('+');
    await page.keyboard.press('Enter');
    await expect(page.locator('.prosign-comparison')).toBeVisible();
    await expect.poll(() => posts).toBeGreaterThan(0);
    await expect.poll(async () => (await localRows(page)).length).toBe(1);
    const before = await localRows(page);
    expect(before[0]).toMatchObject({ owner: 'browser-fixture', synced: false });
    await page.getByRole('button', { name: 'Sound and settings', exact: true }).click();
    await page.getByRole('button', { name: /^Sign out/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Small sounds. Endless possibilities.' }),
    ).toBeVisible();
    release();
    await expect.poll(() => settled).toBeGreaterThanOrEqual(posts);
    expect(await localRows(page)).toEqual(before);
    expect(
      submitted.every((body) => body.owner === 'browser-fixture' && body.epoch === 'browser-epoch'),
    ).toBe(true);
    await page.getByRole('button', { name: 'Prosigns', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Sign in to practice', exact: true }),
    ).toBeVisible();
    expect(await localRows(page)).toEqual(before);
    expect((await localRows(page)).some((row) => row.owner === 'guest')).toBe(false);
  } finally {
    release();
    fixture.close();
  }
});
