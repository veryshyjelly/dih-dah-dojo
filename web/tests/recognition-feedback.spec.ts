import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { user: null, providers: { google: true, github: true } } }),
  );
  await page.addInitScript(() => {
    const probe = {
      onset: false,
      finished: false,
      delay: 0,
      answerSent: false,
      closes: 0,
      premature: false,
    };
    (window as any).feedbackProbe = probe;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options: any) {
      if (message?.method === 'marker') {
        if (message.args[0] === 1) probe.onset = true;
        if (message.args[0] === 7) probe.finished = true;
      }
      if (message?.method === 'close_trial') {
        probe.closes++;
        if (!probe.answerSent) probe.premature = true;
      }
      if (message?.method === 'answer') {
        if (probe.delay) {
          setTimeout(() => {
            probe.answerSent = true;
            send.call(this, message, options);
          }, probe.delay);
          return;
        }
        probe.answerSent = true;
      }
      send.call(this, message, options);
    };
  });
});

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Find your rhythm', exact: true }).click();
}

test('accepted responses show expected feedback without a half-second pre-feedback pause', async ({
  page,
}) => {
  await startDemo(page);
  await expect(page.locator('.response-caption')).toContainText('Type the character');
  await page.waitForFunction(() => (window as any).feedbackProbe.finished);
  const elapsed = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const start = performance.now();
        const deadline = setTimeout(() => reject(new Error('Feedback did not appear')), 4000);
        const observer = new MutationObserver(() => {
          if (document.querySelector('.recognition-result')) {
            observer.disconnect();
            clearTimeout(deadline);
            resolve(performance.now() - start);
          }
        });
        observer.observe(document.querySelector('.recognition-feedback')!, {
          childList: true,
          subtree: true,
        });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
      }),
  );
  // A generous software budget still detects the old fixed 500 ms timer.
  expect(elapsed).toBeLessThan(400);
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await expect(page.getByText('Expected character', { exact: true })).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await expect(page.getByText('Expected character', { exact: true })).toBeVisible();
  test
    .info()
    .annotations.push({ type: 'feedback latency', description: `${elapsed.toFixed(1)} ms` });
});

test('an early response waits for playback and engine acceptance before disclosure', async ({
  page,
}) => {
  await startDemo(page);
  await page.waitForFunction(() => (window as any).feedbackProbe.onset);
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    (window as any).feedbackProbe.delay = 1500;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
  });
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await expect(page.getByText('Expected character', { exact: true })).toHaveCount(0);
  await page.waitForFunction(() => (window as any).feedbackProbe.finished);
  expect(await page.evaluate(() => (window as any).feedbackProbe.closes)).toBe(0);
  await expect(page.getByText('Expected character', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).feedbackProbe.premature)).toBe(false);
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
});

test('a delayed answer from before pause cannot replace the paused trial', async ({ page }) => {
  await startDemo(page);
  await expect(page.locator('.response-caption')).toContainText('Type the character');
  await page.waitForFunction(() => (window as any).feedbackProbe.finished);
  await page.evaluate(() => {
    (window as any).feedbackProbe.delay = 1000;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
  });
  await expect(page.locator('.response-caption')).toHaveText('Response: 3');
  await page.keyboard.press('F5');
  await expect(page.getByRole('heading', { name: 'No rush.' })).toBeVisible();
  await page.waitForTimeout(1300);
  await expect(page.getByRole('heading', { name: 'No rush.' })).toBeVisible();
  await page.evaluate(() => {
    (window as any).feedbackProbe.delay = 0;
  });
  await page.getByRole('button', { name: 'I’m ready', exact: true }).click();
  await expect(page.locator('.response-caption')).toContainText('Type the character');
  await page.keyboard.press('4');
  await expect(page.locator('.response-caption')).toHaveText('Response: 4');
  await expect(page.getByText('Expected character', { exact: true })).toBeVisible();
});
