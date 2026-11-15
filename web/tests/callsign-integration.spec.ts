import { test, expect } from '@playwright/test';

test('leaving a pending legacy callsign drill cannot start delayed practice', async ({ page }) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'tool_material') {
        setTimeout(() => send.call(this, message, options), 300);
        return;
      }
      send.call(this, message, options);
    };
  });
  await page.goto('/tools');
  await page.getByRole('button', { name: 'Callsign practice', exact: true }).click();
  await page.getByRole('button', { name: 'Try copying', exact: true }).click();
  await page.getByRole('button', { name: 'The studio', exact: true }).click();
  await page.waitForTimeout(650);
  await expect(
    page.getByRole('heading', { name: 'Small sounds. Endless possibilities.' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish practice', exact: true })).toHaveCount(0);
});

test('legacy callsign listening ignores hidden inputs and reuses its prepared copy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'tool_material')
        (window as any).toolMaterialRequests = ((window as any).toolMaterialRequests || 0) + 1;
      if (message?.method === 'prepare') (window as any).lastToolPlan = JSON.parse(message.args[0]);
      send.call(this, message, options);
    };
  });
  await page.goto('/tools');
  await page.getByLabel('WHAT WOULD YOU LIKE TO HEAR?').fill('');
  await page.getByRole('button', { name: 'Random groups', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Callsign practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try copying', exact: true })).toBeEnabled();
  await page
    .getByRole('button', { name: 'Listen to this', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole('button', { name: 'Listen to this', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).toolMaterialRequests)).toBe(1);
  await page.getByRole('button', { name: 'Listen to this', exact: true }).click();
  await expect(page.locator('.material-preview p')).not.toBeEmpty();
  const first = await page.locator('.material-preview p').innerText();
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await page.getByRole('button', { name: 'Listen to this', exact: true }).click();
  await expect(page.locator('.material-preview p')).toHaveText(first);
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await page.getByRole('button', { name: 'Try copying', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).lastToolPlan?.text)).toBe(first);
  expect(await page.evaluate(() => (window as any).toolMaterialRequests)).toBe(1);
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
});

test('signal environments stop every layer and restore a clean audio graph', async ({ page }) => {
  await page.goto('/tools');
  await page.evaluate(async () => {
    const path = '/src/audio.ts';
    const { AudioService } = await import(path);
    const service = new AudioService();
    const state = { service, condition: 'noise', errors: [] as string[], ready: false };
    (window as any).environmentProbe = state;
    service.onError = (message: string) => state.errors.push(message);
    const button = document.createElement('button');
    button.textContent = 'Play environment fixture';
    button.onclick = async () => {
      state.ready = false;
      await service.play({
        text: '00000',
        c: 20,
        e: 20,
        rescue: false,
        condition: state.condition,
        interferer: 'JA1ABC',
      });
      state.ready = true;
    };
    document.body.append(button);
  });
  for (const condition of ['noise', 'fading', 'pileup', 'clean']) {
    await page.evaluate((value) => {
      (window as any).environmentProbe.condition = value;
    }, condition);
    await page.getByRole('button', { name: 'Play environment fixture', exact: true }).click();
    await page.waitForFunction(() => (window as any).environmentProbe.ready);
    const active = await page.evaluate(() => {
      const s = (window as any).environmentProbe.service;
      return {
        active: s.active,
        layers: s.environmentNodes.length,
        sources: s.environmentSources.length,
        fading: s.output.gain.value,
      };
    });
    expect(active.active).toBe(true);
    expect(active.layers).toBe(
      condition === 'clean' ? 0 : condition === 'noise' ? 3 : condition === 'fading' ? 2 : 1,
    );
    const stopped = await page.evaluate(async () => {
      const s = (window as any).environmentProbe.service;
      await s.stop();
      return {
        active: s.active,
        layers: s.environmentNodes.length,
        sources: s.environmentSources.length,
        gain: s.output.gain.value,
      };
    });
    expect(stopped).toEqual({ active: false, layers: 0, sources: 0, gain: 1 });
  }
  expect(await page.evaluate(() => (window as any).environmentProbe.errors)).toEqual([]);
  await page.evaluate(() => {
    (window as any).environmentProbe.condition = 'pileup';
  });
  await page.getByRole('button', { name: 'Play environment fixture', exact: true }).click();
  await page.waitForFunction(() => (window as any).environmentProbe.ready);
  await page.evaluate(() => {
    (window as any).environmentProbe.service.interferer.port.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'error', message: 'Injected overlapping caller fault' },
      }),
    );
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).environmentProbe.service.active))
    .toBe(false);
  expect(await page.evaluate(() => (window as any).environmentProbe.errors)).toContain(
    'Injected overlapping caller fault',
  );
  expect(
    await page.evaluate(() => (window as any).environmentProbe.service.environmentNodes.length),
  ).toBe(0);
  await page.evaluate(() => (window as any).environmentProbe.service.close());
});
