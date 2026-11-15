import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import init, { Engine } from '../public/engine/dojo.js';
import { Store } from './store';
import { EnginePool } from './engine-pool';
import { createApp } from './app';
import { callsignContext, callsignProgress, type CallsignEntry } from '../src/callsign-progress';
import type { CallsignActivity, CallsignItem, CallsignOutcome } from '../src/callsign-types';
import type { Entry } from '../src/language-store';
import { parseBackup } from '../src/backup-format';

await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});

function fixture(
  id = 'presented-0',
  activity: Partial<CallsignActivity> = {},
  outcome: Partial<CallsignOutcome> = {},
): CallsignEntry {
  const item: CallsignItem = {
    id: 'fixture-call',
    text: 'K1AA',
    audio_text: 'K1AA',
    version: 1,
    corpus: 'dojo-callsigns',
    corpus_version: 1,
    family: 'short',
    mode: 'call',
    condition: 'clean',
    own_call: null,
    exchange: null,
    interferer: null,
    parts: [
      { kind: 'prefix', label: 'national identifier', text: 'K', start: 0, end: 1 },
      { kind: 'digit', label: 'district digit', text: '1', start: 1, end: 2 },
      { kind: 'suffix', label: 'suffix', text: 'AA', start: 2, end: 4 },
    ],
  };
  return {
    activity: {
      version: 1,
      id: `${id}-0`,
      trial_id: id,
      revision: 0,
      item: item.id,
      sentence: 0,
      kind: 'callsign',
      input: 'keyboard',
      c: 20,
      e: 10,
      answer: item.text,
      attempts: [item.text],
      replay: false,
      revealed: false,
      review: false,
      interrupted: false,
      finished: true,
      self_report: null,
      created: 100,
      latency_ms: 100,
      speed_mode: 'fixed',
      exchange_answer: null,
      exchange_attempts: [],
      ...activity,
    },
    outcome: {
      eligible: true,
      correct: true,
      attempt_accuracy: 1,
      final_accuracy: 1,
      first_exact: true,
      final_exact: true,
      expected: item.text,
      item,
      corpus: item.corpus,
      corpus_version: 1,
      family: item.family,
      mode: item.mode,
      condition: item.condition,
      first_answer: item.text,
      parts: [
        { name: 'national identifier', expected: 'K', first_errors: 0, final_errors: 0 },
        { name: 'district digit', expected: '1', first_errors: 0, final_errors: 0 },
        { name: 'suffix', expected: 'AA', first_errors: 0, final_errors: 0 },
      ],
      exchange_correct: null,
      exchange_final_correct: null,
      ...outcome,
    },
  };
}

test('callsign revisions count one presentation and preserve independent first-pass evidence after assisted repair', () => {
  const first = fixture(
      'repair',
      { answer: 'K1AB', attempts: ['K1AB'] },
      {
        correct: false,
        first_exact: false,
        final_exact: false,
        first_answer: 'K1AB',
        attempt_accuracy: 0.75,
        final_accuracy: 0.75,
        parts: [{ name: 'suffix', expected: 'AA', first_errors: 1, final_errors: 1 }],
      },
    ),
    repaired = fixture(
      'repair',
      {
        id: 'repair-1',
        revision: 1,
        answer: 'K1AA',
        attempts: ['K1AB', 'K1AA'],
        replay: true,
        revealed: true,
      },
      {
        eligible: false,
        correct: false,
        first_exact: false,
        first_answer: 'K1AB',
        attempt_accuracy: 0.75,
        parts: [{ name: 'suffix', expected: 'AA', first_errors: 1, final_errors: 0 }],
      },
    ),
    review = fixture('review', { review: true }, { eligible: false }),
    missingInitial = fixture('missing', { id: 'missing-1', revision: 1 });
  const data = callsignProgress([repaired, first, first, review, missingInitial]);
  assert.equal(data.all.length, 3);
  assert.equal(data.filtered.length, 1);
  assert.equal(data.counts.firstExact, 0);
  assert.equal(data.counts.finalExact, 1);
  assert.equal(data.counts.assisted, 1);
  assert.equal(data.counts.review, 1);
  assert.deepEqual(data.parts, [{ name: 'suffix', samples: 1, firstErrors: 1, finalErrors: 0 }]);
  assert.equal(data.graphs[1].points[0].primary, 0);
  assert.equal(data.graphs[1].points[0].secondary, 100);
  assert.deepEqual(data.reviewItems, ['fixture-call']);
  assert.equal(data.all.find((t) => t.id === 'missing')!.independent, false);
  const conflict = fixture('repair', { id: 'repair-2', revision: 2, input: 'touch' });
  assert.equal(callsignProgress([first, repaired, conflict]).all.length, 0);
});

test('callsign comparisons separate every tested context and require eight correct independent latency samples', () => {
  const base = Array.from({ length: 8 }, (_, i) =>
    fixture(`sample-${i}`, { created: i + 100, latency_ms: (i + 1) * 100 }),
  );
  const changes: CallsignEntry[] = [
    fixture('touch', { input: 'touch' }),
    fixture('character-speed', { c: 21 }),
    fixture('effective-speed', { e: 11 }),
    fixture('corpus', {}, { corpus: 'future-corpus' as 'dojo-callsigns' }),
    fixture('version', {}, { corpus_version: 2 as 1 }),
    fixture('family', {}, { family: 'international' }),
    fixture('mode', {}, { mode: 'qso' }),
    fixture('condition', {}, { condition: 'noise' }),
    fixture('adaptive', { speed_mode: 'adaptive' }),
    fixture('assisted', { replay: true }, { eligible: false }),
    fixture('review', { review: true }, { eligible: false }),
    fixture('interrupted', { interrupted: true }, { eligible: false }),
    fixture('negative', { latency_ms: -1 }),
    fixture('nonfinite', { latency_ms: Number.NaN }),
    fixture(
      'wrong',
      { latency_ms: 900 },
      { correct: false, first_exact: false, final_exact: false },
    ),
  ];
  const data = callsignProgress([...base, ...changes], callsignContext(base[0]));
  assert.equal(data.filtered.length, 11);
  assert.equal(data.contexts.length, 10);
  assert.equal(data.counts.latencySamples, 8);
  assert.deepEqual(data.latency, { median: 450, p90: 800 });
  assert.equal(data.graphs[2].points.length, 1);
  assert.equal(data.graphs[2].points[0].primary, 0.45);
  assert.match(data.graphs[2].context, /Typing-inclusive/);
  assert.equal(
    data.graphs.every((g) => g.trend === null),
    true,
  );
  const sparse = callsignProgress(base.slice(0, 7));
  assert.equal(sparse.latency, null);
  assert.equal(sparse.graphs[2].points.length, 0);
  const history = Array.from({ length: 60 }, (_, i) => fixture(`range-${i}`, { created: i + 1 }));
  assert.equal(callsignProgress(history, '', 30).filtered.length, 30);
  assert.equal(callsignProgress(history, '', 100).filtered.length, 60);
  assert.equal(callsignProgress(history, '', 0).filtered.length, 60);
  assert.equal(callsignProgress([]).contexts.length, 0);
});

test('real callsign packets sync, deduplicate, restore and merge without changing guided state or other owners', async () => {
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
      engine.callsign_generate(
        JSON.stringify({ seed: 17, count: 2, family: 'short', mode: 'call', condition: 'clean' }),
      ),
    ) as CallsignItem[];
    const make = (revision: number) => {
      const a: CallsignActivity = {
        version: 1,
        id: `api-trial-${revision}`,
        trial_id: 'api-trial',
        revision,
        item: items[0].id,
        sentence: 0,
        kind: 'callsign',
        input: 'keyboard',
        c: 20,
        e: 10,
        answer: revision ? items[0].text : 'ZZ',
        attempts: revision ? ['ZZ', items[0].text] : ['ZZ'],
        replay: !!revision,
        revealed: !!revision,
        review: false,
        interrupted: false,
        finished: true,
        self_report: null,
        created: 100,
        latency_ms: 700,
        speed_mode: 'fixed',
        exchange_answer: null,
        exchange_attempts: [],
      };
      return Buffer.from(engine.language_encode(JSON.stringify(a)));
    };
    const first = make(0),
      repair = make(1);
    assert.equal(first.subarray(0, 8).toString(), 'CWCALL01');
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
    const progress = callsignProgress(
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
