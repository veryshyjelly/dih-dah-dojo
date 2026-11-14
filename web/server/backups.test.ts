import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import init, { Engine } from '../public/engine/dojo.js';
import { Store } from './store';
import { EnginePool, type Job } from './engine-pool';
import { createApp } from './app';
import { parseBackup } from '../src/backup-format';
await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});
test('account backups round-trip both profiles and accepted records atomically with owner/epoch guards', async () => {
  const store = new Store(':memory:'),
    pool = new EnginePool(
      fileURLToPath(new URL('../server-dist/engine-worker.mjs', import.meta.url)),
    ),
    origin = 'http://127.0.0.1:5173';
  let hold = false,
    entered = () => {},
    release = () => {};
  const controlled = {
    run: async (job: Job) => {
      const result = await pool.run(job);
      if (hold) {
        hold = false;
        entered();
        await new Promise<void>((r) => {
          release = r;
        });
      }
      return result;
    },
  };
  const { app } = await createApp(store, controlled, {
    appOrigin: origin,
    apiOrigin: 'http://127.0.0.1:8787',
    resolveSession: async (h) =>
      h.get('x-user')
        ? { id: h.get('x-user')!, name: 'Test', email: 'fixture@example.test' }
        : null,
  });
  const insert = store.db.prepare(
    'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
  );
  for (const id of ['one', 'two']) insert.run(id, id, id + '@example.test', 1, 0, 0);
  const engine = new Engine(),
    touch = new Engine();
  engine.bootstrap('KM', Date.now());
  touch.bootstrap('MN', Date.now());
  try {
    engine.prepare(
      JSON.stringify({
        id: 'backup-block-1',
        mode: 'recognition',
        source: 'guided',
        now: Date.now(),
        at: 900,
        seed: 123,
      }),
    );
    engine.next_trial(Date.now());
    engine.marker(1, 0, 48000, 1000, 0);
    engine.marker(2, 0, 52800, 1100, 0);
    engine.answer('Z', 1100);
    engine.close_trial(Date.now(), 1600);
    const summary = JSON.parse(engine.finish(true, 2000));
    const state = engine.checkpoint(),
      touchState = touch.checkpoint(),
      packet = engine.packet(),
      record = engine.record();
    store.initialize('one', 'keyboard', state);
    store.initialize('one', 'touch', touchState);
    store.initialize('two', 'keyboard', touchState);
    store.db
      .prepare(
        'INSERT INTO dojo_blocks(id,owner,input,source,applied,record,packet,created,kind,attempt,final_accuracy,targets,decision,pace,completed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'backup-block-1',
        'one',
        'keyboard',
        'guided',
        1,
        Buffer.from(record),
        Buffer.from(packet),
        10,
        summary.kind,
        summary.attempt,
        summary.finalAccuracy,
        summary.targets,
        summary.decision,
        summary.pace,
        1,
      );
    const language = engine.language_encode(
      JSON.stringify({
        version: 1,
        id: 'lang-import',
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
        created: 1,
      }),
    );
    store.db
      .prepare('INSERT INTO dojo_language VALUES(?,?,?,?)')
      .run('one', 'lang-import', Buffer.from(language), 1);
    const bytes = store.export('one');
    assert.equal(bytes.subarray(0, 8).toString(), 'CWDOJOW2');
    assert.equal((await parseBackup(bytes)).frames.length, 4);
    const call = (path: string, body: Uint8Array, user = 'one', otherOrigin = origin) =>
      app.request(path, {
        method: 'POST',
        headers: {
          Origin: otherOrigin,
          'x-user': user,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(body),
      });
    assert.equal((await call('/api/account/import/preview', bytes, '')).status, 401);
    assert.equal(
      (await call('/api/account/import/preview', bytes, 'one', 'https://foreign.test')).status,
      403,
    );
    const before = store.export('one'),
      previewResponse = await call('/api/account/import/preview', bytes);
    assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json();
    assert.equal(preview.blocks, 1);
    assert.deepEqual(store.export('one'), before);
    const query = new URLSearchParams({ ...preview, confirmation: 'RESTORE' });
    const epoch = store.epoch('one');
    assert.equal((await call('/api/account/import?' + query, bytes)).status, 200);
    assert.notEqual(store.epoch('one'), epoch);
    assert.deepEqual(store.export('one'), bytes);
    assert.deepEqual(store.profile('one', 'keyboard')!.state, Buffer.from(state));
    assert.deepEqual(store.profile('one', 'touch')!.state, Buffer.from(touchState));
    assert.deepEqual(store.profile('two', 'keyboard')!.state, Buffer.from(touchState));
    assert.equal(store.history('one', 'keyboard', Number.MAX_SAFE_INTEGER).length, 1);
    assert.equal((await call('/api/account/import?' + query, bytes)).status, 409);
    const rollbackBefore = store.export('one'),
      rollbackEpoch = store.epoch('one');
    const rollbackPreview = await (await call('/api/account/import/preview', bytes)).json();
    store.db.exec(
      "CREATE TRIGGER reject_restore BEFORE INSERT ON dojo_language BEGIN SELECT RAISE(ABORT,'test restore failure'); END",
    );
    assert.equal(
      (
        await call(
          '/api/account/import?' +
            new URLSearchParams({ ...rollbackPreview, confirmation: 'RESTORE' }),
          bytes,
        )
      ).status,
      400,
    );
    assert.deepEqual(store.export('one'), rollbackBefore);
    assert.equal(store.epoch('one'), rollbackEpoch);
    store.db.exec('DROP TRIGGER reject_restore');
    const fresh = await (await call('/api/account/import/preview', bytes)).json();
    const enteredPromise = new Promise<void>((r) => {
      entered = r;
    });
    hold = true;
    const inFlight = call(
      '/api/account/import?' + new URLSearchParams({ ...fresh, confirmation: 'RESTORE' }),
      bytes,
    );
    await enteredPromise;
    store.reset('one');
    release();
    assert.equal((await inFlight).status, 409);
    assert.equal(store.profile('one', 'keyboard'), undefined);
    const damaged = Buffer.from(bytes);
    damaged[damaged.length - 1] ^= 1;
    assert.equal((await call('/api/account/import/preview', damaged)).status, 400);
    assert.equal((await call('/api/account/import/preview', bytes.subarray(0, 15))).status, 400);
    const frames: Buffer[] = [];
    for (const [type, data] of [
      [0, state],
      [1, packet],
      [2, language],
    ] as const) {
      const h = Buffer.alloc(6);
      h[0] = type;
      h.writeUInt32LE(data.length, 2);
      frames.push(h, Buffer.from(data));
    }
    const body = Buffer.concat(frames),
      legacy = Buffer.concat([
        Buffer.from('CWDOJOW1'),
        createHash('sha256').update(body).digest(),
        body,
      ]);
    const old = await (await call('/api/account/import/preview', legacy)).json();
    assert.equal(old.legacy, true);
    assert.equal(
      (
        await call(
          '/api/account/import?' + new URLSearchParams({ ...old, confirmation: 'RESTORE' }),
          legacy,
        )
      ).status,
      200,
    );
    assert.deepEqual(store.profile('one', 'keyboard')!.state, Buffer.from(state));
    assert.equal(store.history('one', 'keyboard', Number.MAX_SAFE_INTEGER).length, 0);
    assert.match(
      (
        store.db.prepare('SELECT decision FROM dojo_blocks WHERE owner=?').get('one') as {
          decision: string;
        }
      ).decision,
      /legacy/,
    );
    const intact = store.export('one'),
      parsed = await parseBackup(bytes);
    parsed.frames.find((f) => f.type === 0)!.bytes[0] = 255;
    const badFrames: Buffer[] = [];
    for (const f of parsed.frames) {
      const h = Buffer.alloc(6);
      h[0] = f.type;
      h[1] = f.input === 'touch' ? 1 : 0;
      h.writeUInt32LE(f.bytes.length, 2);
      badFrames.push(h, Buffer.from(f.bytes));
    }
    const badBody = Buffer.concat(badFrames),
      badState = Buffer.concat([
        Buffer.from('CWDOJOW2'),
        createHash('sha256').update(badBody).digest(),
        badBody,
      ]);
    assert.equal((await call('/api/account/import/preview', badState)).status, 400);
    assert.deepEqual(store.export('one'), intact);
  } finally {
    engine.free();
    touch.free();
    await pool.close();
    store.close();
  }
});

test('browser backups merge in one authenticated atomic batch, with duplicates and conflicts checked', async () => {
  const store = new Store(':memory:'),
    pool = new EnginePool(
      fileURLToPath(new URL('../server-dist/engine-worker.mjs', import.meta.url)),
    ),
    engine = new Engine(),
    origin = 'http://127.0.0.1:5173';
  const { app } = await createApp(store, pool, {
    appOrigin: origin,
    apiOrigin: 'http://127.0.0.1:8787',
    resolveSession: async (h) =>
      h.get('x-user') ? { id: h.get('x-user')!, name: 'Test', email: 'test@example.test' } : null,
  });
  for (const id of ['one', 'two'])
    store.db
      .prepare(
        'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)',
      )
      .run(id, id, id + '@example.test', 1, 0, 0);
  const packet = (id: string, answer = 'AN') =>
    Buffer.from(
      engine.language_encode(
        JSON.stringify({
          version: 1,
          id,
          item: 'words-AN',
          sentence: 0,
          kind: 'word',
          input: 'keyboard',
          c: 20,
          e: 10,
          answer,
          attempts: answer === 'AN' ? ['A', 'AN'] : ['N', 'NO'],
          replay: false,
          revealed: false,
          review: false,
          interrupted: false,
          finished: true,
          self_report: null,
          created: 1,
        }),
      ),
    );
  const file = (packets: Buffer[]) =>
    Buffer.concat([
      Buffer.from('CWLANG01'),
      ...packets.flatMap((p) => {
        const h = Buffer.alloc(4);
        h.writeUInt32LE(p.length);
        return [h, p];
      }),
    ]);
  const cursor = () =>
    Number(
      (
        store.db
          .prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM dojo_language WHERE owner=?')
          .get('one') as { n: number }
      ).n,
    );
  const post = (bytes: Buffer, who = 'one', n = cursor()) =>
    app.request(
      '/api/language/import?' +
        new URLSearchParams({ epoch: store.epoch('one'), cursor: String(n) }),
      {
        method: 'POST',
        headers: { Origin: origin, 'x-user': who, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(bytes),
      },
    );
  try {
    const bytes = file([packet('merge-a'), packet('merge-a'), packet('merge-b')]);
    assert.equal((await post(bytes, '')).status, 401);
    const result = await post(bytes);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { imported: 2, duplicates: 1 });
    assert.deepEqual(await (await post(bytes)).json(), { imported: 0, duplicates: 3 });
    assert.equal((await post(file([packet('merge-c'), packet('merge-a', 'NO')]))).status, 400);
    assert.equal(
      store.db.prepare('SELECT 1 FROM dojo_language WHERE id=?').get('merge-c'),
      undefined,
    );
    assert.equal((await post(bytes, 'one', 0)).status, 409);
    const large = await post(file(Array.from({ length: 300 }, (_, i) => packet('batch-' + i))));
    assert.equal(large.status, 200);
    assert.equal((await large.json()).imported, 300);
    assert.equal(
      (
        store.db.prepare('SELECT COUNT(*) AS n FROM dojo_language WHERE owner=?').get('two') as {
          n: number;
        }
      ).n,
      0,
    );
  } finally {
    engine.free();
    await pool.close();
    store.close();
  }
});
