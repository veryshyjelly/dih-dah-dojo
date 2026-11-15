import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import init, { Engine } from '../public/engine/dojo.js';
import { Store } from './store';
import { EnginePool } from './engine-pool';
import { createApp } from './app';
import { prosignProgress } from '../src/prosign-progress';
import type { ProsignActivity, ProsignItem } from '../src/prosign-types';
import type { Entry } from '../src/language-store';
import { parseBackup } from '../src/backup-format';

await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});

test('WASM preserves prosign aliases and separate semantic exercises without mutating training state', () => {
  const engine = new Engine();
  try {
    engine.bootstrap('KM', 100);
    const before = Buffer.from(engine.checkpoint());
    for (const [signal, alias] of [
      ['AR', '+'],
      ['BT', '='],
    ]) {
      for (const mode of ['recognition', 'meaning', 'context'] as const) {
        const item = JSON.parse(
          engine.prosign_generate(
            JSON.stringify({
              seed: 5,
              count: 1,
              mode,
              signals: [signal],
            }),
          ),
        )[0] as ProsignItem;
        const answer = mode === 'meaning' ? item.expected : alias;
        const activity: ProsignActivity = {
          version: 1,
          id: `alias-${signal}-${mode}-0`,
          trial_id: `alias-${signal}-${mode}`,
          revision: 0,
          kind: 'prosign',
          item: item.id,
          sentence: 0,
          input: 'keyboard',
          c: 20,
          e: 10,
          answer,
          attempts: [answer],
          replay: false,
          revealed: false,
          review: false,
          interrupted: false,
          finished: true,
          self_report: null,
          created: 100,
          latency_ms: 500,
        };
        const packet = engine.language_encode(JSON.stringify(activity));
        const entry = JSON.parse(engine.language_decode(packet));
        assert.equal(entry.outcome.eligible, true);
        assert.equal(entry.outcome.first_exact, true);
        assert.equal(entry.outcome.final_exact, true);
        assert.equal(entry.outcome.mode, mode);
        assert.equal(entry.outcome.signal, signal);
        if (mode !== 'meaning') assert.equal(entry.outcome.first_answer, `<${signal}>`);
      }
    }
    assert.deepEqual(Buffer.from(engine.checkpoint()), before);
  } finally {
    engine.free();
  }
});

test('real prosign packets sync, deduplicate, restore and merge without changing guided state or other owners', async () => {
  const store = new Store(':memory:'),
    pool = new EnginePool(
      fileURLToPath(new URL('../server-dist/engine-worker.mjs', import.meta.url)),
    ),
    engine = new Engine(),
    origin = 'http://127.0.0.1:5173';
  try {
    const { app } = await createApp(store, pool, {
      appOrigin: origin,
      apiOrigin: 'http://127.0.0.1:8787',
      resolveSession: async (h) =>
        h.get('x-user')
          ? { id: h.get('x-user')!, name: 'Test', email: 'fixture@example.test' }
          : null,
    });
    for (const id of ['one', 'two'])
      store.db
        .prepare(
          'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
        )
        .run(id, id, id + '@example.test', 1, 0, 0);
    engine.bootstrap('KM', Date.now());
    const checkpoint = Buffer.from(engine.checkpoint());
    store.initialize('one', 'keyboard', checkpoint);
    store.initialize('two', 'keyboard', checkpoint);
    const other = store.export('two');
    const items = JSON.parse(
      engine.prosign_generate(
        JSON.stringify({ seed: 17, count: 2, mode: 'recognition', signals: ['AR', 'BT'] }),
      ),
    ) as ProsignItem[];
    const make = (revision: number) => {
      const a: ProsignActivity = {
        version: 1,
        id: `api-trial-${revision}`,
        trial_id: 'api-trial',
        revision,
        item: items[0].id,
        sentence: 0,
        kind: 'prosign',
        input: 'keyboard',
        c: 20,
        e: 10,
        answer: revision ? items[0].expected : 'ZZ',
        attempts: revision ? ['ZZ', items[0].expected] : ['ZZ'],
        replay: !!revision,
        revealed: !!revision,
        review: false,
        interrupted: false,
        finished: true,
        self_report: null,
        created: 100,
        latency_ms: 700,
      };
      return Buffer.from(engine.language_encode(JSON.stringify(a)));
    };
    const first = make(0),
      repair = make(1);
    assert.equal(first.subarray(0, 8).toString(), 'CWPROS01');
    assert.deepEqual(Buffer.from(engine.checkpoint()), checkpoint);
    const call = (path: string, body?: unknown, who = 'one') =>
      app.request(path, {
        method: body ? 'POST' : 'GET',
        headers: { Origin: origin, 'x-user': who, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    const epoch = store.epoch('one'),
      send = (packet: Buffer) =>
        call('/api/language', { owner: 'one', epoch, packet: packet.toString('base64') });
    assert.equal((await call('/api/language', undefined, '')).status, 401);
    assert.equal((await call('/api/language?owner=one', undefined, 'two')).status, 409);
    assert.equal((await call('/api/language?owner=one')).status, 200);
    assert.equal(
      (
        await call(
          '/api/language',
          {
            owner: 'one',
            epoch: store.epoch('two'),
            packet: first.toString('base64'),
          },
          'two',
        )
      ).status,
      409,
    );
    assert.deepEqual(store.export('two'), other);
    assert.equal((await send(first)).status, 200);
    assert.equal((await send(repair)).status, 200);
    assert.equal((await send(first)).status, 200);
    const legacy = Buffer.from(
      engine.language_encode(
        JSON.stringify({
          version: 1,
          id: 'legacy-word',
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
          created: 50,
        }),
      ),
    );
    assert.equal(JSON.parse(engine.language_decode(legacy)).activity.kind, 'word');
    assert.equal((await send(legacy)).status, 200);
    const records = (await (await call('/api/language')).json()).records as string[];
    assert.equal(records.length, 3);
    assert.equal((await (await call('/api/language', undefined, 'two')).json()).records.length, 0);
    const progress = prosignProgress(
      records.map((r) => JSON.parse(engine.language_decode(Buffer.from(r, 'base64'))) as Entry),
    );
    assert.equal(progress.counts.independent, 1);
    assert.equal(progress.counts.firstExact, 0);
    assert.equal(progress.counts.finalExact, 1);
    assert.deepEqual(store.profile('one', 'keyboard')!.state, checkpoint);
    assert.equal(store.history('one', 'keyboard', Number.MAX_SAFE_INTEGER).length, 0);
    const backup = store.export('one'),
      parsed = await parseBackup(backup);
    assert.equal(parsed.frames.filter((f) => f.type === 2).length, 3);
    const binary = (path: string, bytes: Uint8Array, who = 'one') =>
      app.request(path, {
        method: 'POST',
        headers: { Origin: origin, 'x-user': who, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(bytes),
      });
    const preview = await (await binary('/api/account/import/preview', backup)).json();
    assert.equal(
      (
        await binary(
          '/api/account/import?' + new URLSearchParams({ ...preview, confirmation: 'RESTORE' }),
          backup,
        )
      ).status,
      200,
    );
    assert.deepEqual(store.export('one'), backup);
    assert.deepEqual(store.export('two'), other);
    assert.deepEqual(store.profile('one', 'keyboard')!.state, checkpoint);
    assert.equal((await send(first)).status, 410);
    const head = Buffer.alloc(4);
    head.writeUInt32LE(first.length);
    const browserFile = Buffer.concat([Buffer.from('CWLANG01'), head, first]);
    const mergePath =
      '/api/language/import?' +
      new URLSearchParams({ owner: 'two', epoch: store.epoch('two'), cursor: '0' });
    const wrongOwnerImport =
      '/api/language/import?' +
      new URLSearchParams({
        owner: 'one',
        epoch: store.epoch('two'),
        cursor: '0',
      });
    assert.equal((await binary(wrongOwnerImport, browserFile, 'two')).status, 409);
    assert.deepEqual(store.export('two'), other);
    assert.deepEqual(store.export('one'), backup);
    assert.equal((await binary(mergePath, browserFile, 'two')).status, 200);
    assert.equal((await (await call('/api/language', undefined, 'two')).json()).records.length, 1);
    assert.deepEqual(store.profile('two', 'keyboard')!.state, checkpoint);
    const broken = Buffer.from(first);
    broken[7] = '9'.charCodeAt(0);
    assert.equal(
      (
        await call('/api/language', {
          epoch: store.epoch('one'),
          packet: broken.toString('base64'),
        })
      ).status,
      400,
    );
    store.reset('one');
    assert.equal((await (await call('/api/language')).json()).records.length, 0);
    assert.equal((await (await call('/api/language', undefined, 'two')).json()).records.length, 1);
  } finally {
    engine.free();
    await pool.close();
    store.close();
  }
});
