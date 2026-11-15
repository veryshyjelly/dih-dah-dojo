/** Synthetic software load only: this does not measure physical keys or sound at the ear. */
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Store } from '../server/store';
import { EnginePool } from '../server/engine-pool';
import { createApp } from '../server/app';
import init, { Engine, AudioKernel } from '../public/engine/dojo.js';
await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});
const duration = Number(process.env.DOJO_MEASURE_SECONDS || 60);
if (!Number.isInteger(duration) || duration < 10 || duration > 1800)
  throw new Error('Use 10–1800 seconds');
const base = process.env.DOJO_MEASURE_ORIGIN || 'http://127.0.0.1:5173';
const tokenAudio = process.env.DOJO_MEASURE_TOKENS === '1';
const directory = mkdtempSync(join(tmpdir(), 'dojo-web-load-'));
const store = new Store(join(directory, 'workload.sqlite'));
const pool = new EnginePool(
  fileURLToPath(new URL('../server-dist/engine-worker.mjs', import.meta.url)),
);
const browser = await chromium.launch();
const page = await browser.newPage();
const audio = new AudioKernel();
const client = new Engine();
const render: number[] = [],
  commits: number[] = [],
  errors: string[] = [];
let writes = 0,
  busy = false,
  failed = false;
let timer: ReturnType<typeof setInterval> | undefined;
try {
  const { app } = await createApp(store, pool, {
    appOrigin: base,
    apiOrigin: 'http://127.0.0.1:8787',
    secret: 'isolated-software-load-test-secret',
    resolveSession: async (headers) => ({
      id: headers.get('x-load-user') || 'browser',
      name: 'Synthetic load',
      email: 'load@example.test',
    }),
  });
  const insert = store.db.prepare(
    'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
  );
  for (const owner of ['browser', 'background'])
    insert.run(owner, 'Synthetic load', owner + '@example.test', 1, Date.now(), Date.now());
  const call = (owner: string, path: string, body?: unknown) =>
    app.request(path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        'x-load-user': owner,
        'CF-Connecting-IP': owner,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  for (const owner of ['browser', 'background']) {
    const p = await (await call(owner, '/api/profile/keyboard')).json();
    await call(owner, '/api/profile/keyboard', {
      action: 'bootstrap',
      known: 'KM',
      epoch: p.epoch,
      baseRevision: 0,
    });
  }
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const response = await call(
      'browser',
      new URL(req.url()).pathname,
      req.method() === 'POST' ? req.postDataJSON() : undefined,
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/practice');
  await page.getByRole('button', { name: 'Stay with the stream' }).click();
  await page.getByLabel('Your received copy').waitFor();
  await page.evaluate(() => {
    const metrics = { receipt: [] as number[], display: [] as number[] };
    (window as unknown as { loadMetrics: typeof metrics }).loadMetrics = metrics;
    window.addEventListener(
      'keydown',
      (event) => {
        const start = performance.now();
        metrics.receipt.push(start - event.timeStamp);
        requestAnimationFrame(() => metrics.display.push(performance.now() - start));
      },
      { capture: true },
    );
  });
  if (tokenAudio)
    audio.prepare_tokens(1, '<AR><BT><HH><SK>'.repeat(8), 20, 5, 48000, 600, 0, false);
  else audio.prepare(1, 'PARIS '.repeat(12), 20, 5, 48000, 600, 0, false);
  let frame = 0;
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      for (let i = 0; i < 190; i++) {
        const start = performance.now();
        audio.render(frame, 128);
        audio.drain();
        render.push(performance.now() - start);
        frame += 128;
      }
      const profile = store.profile('background', 'keyboard')!;
      client.load(profile.state);
      const id = 'load-' + writes + '-' + Date.now();
      client.prepare(
        JSON.stringify({
          id,
          mode: 'recognition',
          source: 'guided',
          now: Date.now(),
          at: 0,
          seed: writes + 1,
        }),
      );
      client.next_trial(Date.now());
      client.marker(1, 0, 0, 1000, 0);
      client.marker(2, 0, 4800, 1100, 0);
      client.answer('K', 1200);
      client.close_trial(Date.now(), 1700);
      client.finish(true, 2000);
      const start = performance.now();
      const response = await call('background', '/api/blocks', {
        id,
        profile: 'keyboard',
        epoch: store.epoch('background'),
        baseRevision: profile.revision,
        packet: Buffer.from(client.packet()).toString('base64'),
      });
      if (response.status !== 200) throw new Error('Load commit returned ' + response.status);
      await response.json();
      commits.push(performance.now() - start);
      writes++;
    } catch (error) {
      errors.push(String(error));
      failed = true;
    } finally {
      busy = false;
    }
  }
  timer = setInterval(() => void pump(), 500);
  await pump();
  const deadline = performance.now() + duration * 1000;
  let inputs = 0;
  while (performance.now() < deadline && !failed) {
    await page
      .getByLabel('Your received copy')
      .press(
        inputs % 29 === 28 ? 'Backspace' : inputs % 6 === 5 ? 'Space' : inputs % 2 ? 'M' : 'K',
      );
    inputs++;
    await page.waitForTimeout(100);
  }
  clearInterval(timer);
  while (busy) await new Promise((resolve) => setTimeout(resolve, 5));
  await page.getByRole('button', { name: 'Finish practice', exact: true }).click();
  await page.getByText('Synced', { exact: true }).waitFor();
  const metrics = await page.evaluate(
    () =>
      (window as unknown as { loadMetrics: { receipt: number[]; display: number[] } }).loadMetrics,
  );
  const p99 = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.99) - 1)] ?? null;
  const restored = new Store(join(directory, 'restore.sqlite'));
  restored.close();
  await store.backup(join(directory, 'restore.sqlite'));
  const verify = new Store(join(directory, 'restore.sqlite'));
  const integrity = verify.db.pragma('integrity_check', { simple: true });
  const saved = (verify.db.prepare('SELECT count(*) AS n FROM dojo_blocks').get() as { n: number })
    .n;
  verify.close();
  const report = {
    durationSeconds: duration,
    instrumentedAudio: tokenAudio ? 'joined-prosigns' : 'ordinary-text',
    inputs,
    renderSamples: render.length,
    backgroundCommits: writes,
    restoredBlocks: saved,
    integrity,
    inputReceiptP99Ms: p99(metrics.receipt),
    inputToNextFrameP99Ms: p99(metrics.display),
    wasmRenderP99Ms: p99(render),
    wasmRenderMaxMs: Math.max(...render),
    serverEvaluateCommitP99Ms: p99(commits),
    errors,
    physicalTiming: 'unverified',
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.DOJO_MEASURE_REPORT)
    writeFileSync(process.env.DOJO_MEASURE_REPORT, JSON.stringify(report, null, 2) + '\n');
  if (
    errors.length ||
    inputs < duration * 8 ||
    saved !== writes + 1 ||
    integrity !== 'ok' ||
    p99(metrics.receipt)! > 5 ||
    p99(metrics.display)! > 50 ||
    p99(render)! > (128 / 48) * 0.25 ||
    Math.max(...render) > 128 / 48
  )
    throw new Error('Software workload verification failed');
} finally {
  if (timer) clearInterval(timer);
  await browser.close();
  await pool.close();
  store.close();
  audio.free();
  client.free();
  rmSync(directory, { recursive: true, force: true });
}
