import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import init, { Engine } from '../public/engine/dojo.js';
await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store';
import { EnginePool, type Job } from './engine-pool';
import { createApp } from './app';
const origin = 'http://127.0.0.1:5173';
test('API isolates owners, rejects foreign origins, preserves binary exports and reset generations', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dojo-api-test-'));
  const store = new Store(join(directory, 'test.sqlite'));
  const pool = new EnginePool(
    fileURLToPath(new URL('../server-dist/engine-worker.mjs', import.meta.url)),
  );
  let holdEvaluation: Promise<void> | null = null;
  let entered = () => {};
  function delayEvaluation() {
    let release = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    holdEvaluation = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { started, release };
  }
  const controlledPool = {
    run: async (job: Job) => {
      const result = await pool.run(job);
      const hold = holdEvaluation;
      holdEvaluation = null;
      if (hold) {
        entered();
        await hold;
      }
      return result;
    },
  };
  try {
    const { app } = await createApp(store, controlledPool, {
      appOrigin: origin,
      apiOrigin: 'http://127.0.0.1:8787',
      secret: 'a-test-secret-long-enough-for-the-auth-engine',
      resolveSession: async (headers) =>
        headers.get('x-test-user')
          ? {
              id: headers.get('x-test-user')!,
              name: 'Test',
              email: 'test@example.test',
            }
          : null,
    });
    const insert = store.db.prepare(
      'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
    );
    insert.run('one', 'One', 'one@example.test', 1, Date.now(), Date.now());
    insert.run('two', 'Two', 'two@example.test', 1, Date.now(), Date.now());
    const call = (
      path: string,
      who = 'one',
      body?: Record<string, unknown>,
      otherOrigin = origin,
    ) =>
      app.request(path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Origin: otherOrigin,
          'x-test-user': who,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    assert.equal((await app.request('/api/profile/keyboard')).status, 401);
    const first = await (await call('/api/profile/keyboard')).json();
    assert.equal(first.revision, 0);
    assert.ok(first.epoch);
    assert.ok(first.state);
    assert.equal(
      (
        await call(
          '/api/profile/keyboard',
          'one',
          {
            action: 'bootstrap',
            known: 'KM',
            baseRevision: 0,
            epoch: first.epoch,
          },
          'https://untrusted.test',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call('/api/profile/keyboard', 'one', {
          action: 'bootstrap',
          known: 'KM',
          baseRevision: 0,
          epoch: first.epoch,
        })
      ).status,
      200,
    );
    const second = await (await call('/api/profile/keyboard', 'two')).json();
    assert.equal(second.revision, 0);
    assert.notEqual(first.epoch, second.epoch);
    assert.equal(
      (
        await call('/api/profile/keyboard', 'one', {
          action: 'begin',
          baseRevision: 0,
          epoch: first.epoch,
        })
      ).status,
      409,
    );
    const prepared = await (await call('/api/profile/keyboard')).json();
    assert.equal(
      (
        await call('/api/profile/keyboard', 'one', {
          action: 'preferences',
          volume: 256,
          frequency: 600,
          baseRevision: prepared.revision,
          epoch: first.epoch,
        })
      ).status,
      400,
    );
    const engine = new Engine();
    engine.load(Buffer.from(prepared.state, 'base64'));
    engine.prepare(
      JSON.stringify({
        id: 'upload-test',
        source: 'guided',
        mode: 'recognition',
        now: Date.now(),
        at: 0,
        seed: 32,
      }),
    );
    engine.next_trial(Date.now());
    engine.marker(1, 0, 0, 1000, 0);
    engine.marker(2, 0, 4800, 1100, 0);
    engine.answer('K', 1200);
    engine.close_trial(Date.now(), 1700);
    engine.finish(true, 2000);
    const block = {
      id: 'upload-test',
      profile: 'keyboard',
      epoch: first.epoch,
      baseRevision: prepared.revision,
      packet: Buffer.from(engine.packet()).toString('base64'),
    };
    const uploaded = await (await call('/api/blocks', 'one', block)).json();
    assert.equal(uploaded.revision, prepared.revision + 1);
    assert.equal(uploaded.conflict, false);
    const duplicate = await (await call('/api/blocks', 'one', block)).json();
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.revision, uploaded.revision);
    const stale = await (
      await call('/api/blocks', 'one', { ...block, id: 'second-device-block' })
    ).json();
    assert.equal(stale.conflict, true);
    assert.equal(stale.revision, uploaded.revision);
    assert.equal((await (await call('/api/profile/keyboard', 'two')).json()).records.length, 0);
    assert.equal((await (await call('/api/profile/touch')).json()).revision, 0);
    assert.equal((await (await call('/api/profile/keyboard')).json()).records.length, 1);
    engine.free();
    const exported = Buffer.from(await (await call('/api/account/export')).arrayBuffer());
    assert.equal(exported.subarray(0, 8).toString(), 'CWDOJOW2');
    assert.deepEqual(
      exported.subarray(8, 40),
      createHash('sha256').update(exported.subarray(40)).digest(),
    );
    assert.equal((await call('/api/account/reset', 'one', { confirmation: 'DEL' })).status, 400);
    const delayed = delayEvaluation();
    const racingUpload = call('/api/blocks', 'one', { ...block, id: 'reset-during-evaluation' });
    await delayed.started;
    assert.equal((await call('/api/account/reset', 'one', { confirmation: 'DELETE' })).status, 200);
    delayed.release();
    assert.equal((await racingUpload).status, 410);
    assert.equal(
      (
        store.db.prepare('SELECT count(*) AS n FROM dojo_blocks WHERE owner=?').get('one') as {
          n: number;
        }
      ).n,
      0,
    );
    const fresh = await (await call('/api/profile/keyboard')).json();
    assert.notEqual(fresh.epoch, first.epoch);
    assert.equal(
      (
        await call('/api/blocks', 'one', {
          id: 'stale-block',
          profile: 'keyboard',
          packet: 'AQID',
          baseRevision: 0,
          epoch: first.epoch,
        })
      ).status,
      410,
    );
    // A same-revision replacement profile must survive an older in-flight preferences write.
    const prefsDelay = delayEvaluation();
    const racingPreferences = call('/api/profile/keyboard', 'one', {
      action: 'preferences',
      volume: 10,
      frequency: 600,
      epoch: fresh.epoch,
      baseRevision: 0,
    });
    await prefsDelay.started;
    await call('/api/account/reset', 'one', { confirmation: 'DELETE' });
    const replacement = await (await call('/api/profile/keyboard')).json();
    prefsDelay.release();
    assert.equal((await racingPreferences).status, 410);
    assert.deepEqual(
      store.profile('one', 'keyboard')!.state,
      Buffer.from(replacement.state, 'base64'),
    );
    await store.backup(join(directory, 'backup.sqlite'));
    const backup = new Store(join(directory, 'backup.sqlite'));
    assert.equal(backup.epoch('two'), second.epoch);
    backup.close();
  } finally {
    await pool.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('language activities validate on server, isolate owners, deduplicate and obey reset epochs', async () => {
  const store = new Store(':memory:');
  const pool = new EnginePool(
    fileURLToPath(new URL('../server-dist/engine-worker.mjs', import.meta.url)),
  );
  try {
    const { app } = await createApp(store, pool, {
      appOrigin: origin,
      apiOrigin: 'http://127.0.0.1:8787',
      secret: 'test-language-secret-with-enough-characters',
      resolveSession: async (headers) =>
        headers.get('x-test-user')
          ? { id: headers.get('x-test-user')!, name: 'Test', email: 'test@example.test' }
          : null,
    });
    for (const id of ['one', 'two'])
      store.db
        .prepare(
          'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
        )
        .run(id, id, `${id}@example.test`, 1, Date.now(), Date.now());
    const call = (owner: string, body?: unknown) =>
      app.request('/api/language', {
        method: body ? 'POST' : 'GET',
        headers: { Origin: origin, 'x-test-user': owner, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    const first = await (await call('one')).json();
    const engine = new Engine();
    try {
      const activity = {
        version: 1,
        id: 'word-test',
        item: 'words-AN',
        sentence: 0,
        kind: 'word',
        input: 'keyboard',
        c: 20,
        e: 10,
        answer: ' an ',
        attempts: ['A', 'AN'],
        replay: false,
        revealed: false,
        review: false,
        interrupted: false,
        finished: true,
        self_report: null,
        created: Date.now(),
      };
      const packet = Buffer.from(engine.language_encode(JSON.stringify(activity))).toString(
        'base64',
      );
      assert.equal((await call('one', { epoch: first.epoch, packet })).status, 200);
      assert.equal((await call('one', { epoch: first.epoch, packet })).status, 200);
      assert.equal((await (await call('one')).json()).records.length, 1);
      assert.equal((await (await call('two')).json()).records.length, 0);
      assert.equal((await call('one', { epoch: first.epoch, packet: 'bad' })).status, 400);
      assert.equal(
        store.db.prepare('SELECT count(*) AS n FROM dojo_profiles').get() &&
          (store.db.prepare('SELECT count(*) AS n FROM dojo_profiles').get() as { n: number }).n,
        0,
      );
      assert.equal(store.export('one').subarray(40)[0], 2);
      store.reset('one');
      assert.equal((await call('one', { epoch: first.epoch, packet })).status, 410);
      assert.equal((await (await call('one')).json()).records.length, 0);
    } finally {
      engine.free();
    }
  } finally {
    await pool.close();
    store.close();
  }
});
