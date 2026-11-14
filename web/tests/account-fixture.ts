import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import init, { Engine } from '../public/engine/dojo.js';
await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});
/** Test-only HTTP fixture; scoring and checkpoint acceptance still run in Rust. */
export async function accountFixture(page: Page) {
  const engine = new Engine();
  engine.bootstrap('KM', Date.now());
  engine.preferences(0, 600);
  let revision = 0;
  const records: string[] = [];
  let resetRequests = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    const state = () => Buffer.from(engine.checkpoint()).toString('base64');
    if (path === '/api/session')
      return route.fulfill({
        json: {
          user: {
            id: 'browser-fixture',
            name: 'Learner',
            email: 'test@example.test',
          },
          providers: { google: true, github: true },
        },
      });
    if (path.startsWith('/api/profile/')) {
      if (body) {
        if (body.action === 'begin') engine.begin_session();
        else if (body.action === 'end') engine.end_session();
        else if (body.action === 'preferences') engine.preferences(body.volume, body.frequency);
        revision++;
      }
      return route.fulfill({
        json: {
          state: state(),
          revision,
          epoch: 'browser-epoch',
          records,
          cursor: null,
        },
      });
    }
    if (path === '/api/blocks') {
      const summary = JSON.parse(engine.accept(Buffer.from(body.packet, 'base64'), true));
      records.push(Buffer.from(engine.record()).toString('base64'));
      revision++;
      return route.fulfill({
        json: { state: state(), revision, summary, conflict: false },
      });
    }
    if (path === '/api/account/history') return route.fulfill({ json: { records: [] } });
    if (path === '/api/account/reset') {
      resetRequests++;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      status: 404,
      json: { error: 'Unexpected fixture route' },
    });
  });
  return {
    engine,
    resetRequests: () => resetRequests,
    close: () => engine.free(),
  };
}
