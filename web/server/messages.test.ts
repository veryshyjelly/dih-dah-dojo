import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import init, { Engine } from '../public/engine/dojo.js';
import { Store } from './store';
import { EnginePool } from './engine-pool';
import { createApp } from './app';
import { parseBackup } from '../src/backup-format';
import type { MessageActivity, MessageGeneration, MessageItem } from '../src/message-types';

await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});

function generate(engine: Engine, task = 'copy'): MessageGeneration {
  return JSON.parse(
    engine.message_generate(
      JSON.stringify({
        seed: 42,
        count: 30,
        stage: 'message',
        task,
        family: 'mixed',
        repertoire: 'GUVSAZWDPRMEBCNXJQKT',
        c: 20,
        e: 5,
      }),
    ),
  );
}
function activity(
  item: MessageItem,
  id: string,
  fields: Partial<MessageActivity> = {},
): MessageActivity {
  return {
    version: 1,
    kind: 'message',
    id: `${id}-0`,
    trial_id: id,
    revision: 0,
    item: item.id,
    sentence: 0,
    input: 'keyboard',
    c: 20,
    e: 5,
    answer: item.expected,
    attempts: item.expected === null ? [] : [item.expected],
    replay: false,
    revealed: false,
    review: false,
    interrupted: false,
    finished: true,
    self_report: null,
    created: 100,
    familiar: false,
    ...fields,
  };
}

test('connected material is deterministic on WASM and separates copy, detail recall and self-report', () => {
  const engine = new Engine();
  try {
    engine.bootstrap('KM', 100);
    const before = Buffer.from(engine.checkpoint()),
      generated = generate(engine);
    assert.equal(generated.available, 3);
    assert.deepEqual(
      generated.items.map((item) => item.content_id),
      ['m1-133', 'm1-196', 'm1-193'],
    );
    for (const task of ['copy', 'detail', 'listen']) {
      const items = generate(engine, task).items;
      assert.deepEqual(
        items.map((item) => item.content_id),
        generated.items.map((item) => item.content_id),
      );
      const value = activity(items[0], `separate-${task}`, {
        self_report: task === 'listen' ? 'partly' : null,
      });
      const bytes = engine.language_encode(JSON.stringify(value));
      assert.equal(Buffer.from(bytes).subarray(0, 8).toString(), 'CWMSG001');
      const entry = JSON.parse(engine.language_decode(bytes));
      assert.equal(entry.outcome.item.task, task);
      if (task === 'listen') {
        assert.equal(entry.outcome.eligible, false);
        assert.equal(entry.outcome.correct, null);
        assert.equal(entry.outcome.attempt_accuracy, null);
        assert.equal(entry.outcome.exposure, true);
      } else {
        assert.equal(entry.outcome.first_exact, true);
        assert.equal(entry.outcome.final_exact, true);
      }
    }
    assert.deepEqual(Buffer.from(engine.checkpoint()), before);
    assert.equal(
      JSON.parse(
        engine.message_generate(
          JSON.stringify({
            seed: 1,
            count: 5,
            stage: 'phrase',
            task: 'copy',
            family: 'mixed',
            repertoire: 'KM',
            c: 20,
            e: 5,
          }),
        ),
      ).items.length,
      0,
    );
  } finally {
    engine.free();
  }
});

test('mixed connected and immutable legacy story records survive account sync, restore, merge and reset', async () => {
  const store = new Store(':memory:'),
    pool = new EnginePool(
      fileURLToPath(new URL('../server-dist/engine-worker.mjs', import.meta.url)),
    ),
    engine = new Engine();
  const origin = 'http://127.0.0.1:5173';
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
        .run(id, id, `${id}@example.test`, 1, 0, 0);
    engine.bootstrap('KM', 100);
    const checkpoint = Buffer.from(engine.checkpoint());
    for (const id of ['one', 'two']) store.initialize(id, 'keyboard', checkpoint);
    const other = store.export('two'),
      epoch = store.epoch('one');
    const call = (path: string, body?: unknown, owner = 'one') =>
      app.request(path, {
        method: body ? 'POST' : 'GET',
        headers: { Origin: origin, 'Content-Type': 'application/json', 'x-user': owner },
        body: body ? JSON.stringify(body) : undefined,
      });
    const packet = (value: unknown) => Buffer.from(engine.language_encode(JSON.stringify(value)));
    const item = generate(engine, 'detail').items[0];
    const first = packet(activity(item, 'api-message', { answer: '', attempts: [''] }));
    const repaired = packet(
      activity(item, 'api-message', {
        id: 'api-message-1',
        revision: 1,
        answer: item.expected,
        attempts: ['', item.expected!],
        revealed: true,
      }),
    );
    const catalog = JSON.parse(engine.language_catalog(20, 10));
    const story = catalog.stories[0];
    const legacy = packet({
      version: 1,
      kind: 'story',
      id: 'old-story',
      item: story.id,
      sentence: 0,
      input: 'keyboard',
      c: 20,
      e: 10,
      answer: story.sentences[0],
      attempts: [story.sentences[0]],
      replay: false,
      revealed: false,
      review: false,
      interrupted: false,
      finished: true,
      self_report: null,
      created: 10,
    });
    const legacyBefore = Buffer.from(legacy);
    const send = (bytes: Buffer) =>
      call('/api/language', { owner: 'one', epoch, packet: bytes.toString('base64') });
    assert.equal((await call('/api/language', undefined, '')).status, 401);
    assert.equal((await call('/api/language?owner=one', undefined, 'two')).status, 409);
    for (const bytes of [legacy, first, repaired, first])
      assert.equal((await send(bytes)).status, 200);
    const records = (await (await call('/api/language?owner=one')).json()).records as string[];
    assert.equal(records.length, 3);
    assert.deepEqual(Buffer.from(records[0], 'base64'), legacyBefore);
    const entries = records.map((r) =>
      JSON.parse(engine.language_decode(Buffer.from(r, 'base64'))),
    );
    assert.equal(entries[0].activity.kind, 'story');
    assert.equal(entries[1].outcome.first_exact, false);
    assert.equal(entries[2].outcome.first_exact, false);
    assert.equal(entries[2].outcome.final_exact, true);
    assert.deepEqual(store.profile('one', 'keyboard')!.state, checkpoint);
    assert.equal(store.history('one', 'keyboard', Number.MAX_SAFE_INTEGER).length, 0);
    const backup = store.export('one'),
      parsed = await parseBackup(backup);
    assert.equal(parsed.frames.filter((f) => f.type === 2).length, 3);
    const binary = (path: string, bytes: Uint8Array, owner = 'one') =>
      app.request(path, {
        method: 'POST',
        headers: { Origin: origin, 'x-user': owner, 'Content-Type': 'application/octet-stream' },
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
    assert.equal((await send(first)).status, 410);
    const head = Buffer.alloc(4);
    head.writeUInt32LE(first.length);
    const file = Buffer.concat([Buffer.from('CWLANG01'), head, first]);
    const query = new URLSearchParams({ owner: 'two', epoch: store.epoch('two'), cursor: '0' });
    assert.equal((await binary('/api/language/import?' + query, file, 'two')).status, 200);
    assert.deepEqual(store.profile('two', 'keyboard')!.state, checkpoint);
    const bad = Buffer.from(first);
    bad[7] = 57;
    assert.equal(
      (
        await call('/api/language', {
          owner: 'one',
          epoch: store.epoch('one'),
          packet: bad.toString('base64'),
        })
      ).status,
      400,
    );
    store.reset('one');
    assert.equal((await (await call('/api/language')).json()).records.length, 0);
    assert.equal((await (await call('/api/language', undefined, 'two')).json()).records.length, 1);
    assert.deepEqual(
      Buffer.from(engine.language_encode(JSON.stringify(entries[0].activity))),
      legacyBefore,
    );
  } finally {
    engine.free();
    await pool.close();
    store.close();
  }
});
