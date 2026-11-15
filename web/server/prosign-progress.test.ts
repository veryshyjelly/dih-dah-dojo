import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prosignContext,
  prosignProgress,
  prosignLabels,
  type ProsignEntry,
} from '../src/prosign-progress';
import type { ProsignActivity, ProsignOutcome, ProsignItem } from '../src/prosign-types';

function fixture(
  id = 'presented',
  activity: Partial<ProsignActivity> = {},
  outcome: Partial<ProsignOutcome> = {},
): ProsignEntry {
  const item: ProsignItem = {
    id: 'fixture-prosign',
    version: 1,
    corpus: 'dojo-prosigns',
    corpus_version: 1,
    mode: 'recognition',
    selection: ['AR', 'AS', 'BT', 'SK'],
    signal: 'AR',
    token: '<AR>',
    audio_text: '<AR>',
    prompt: 'Name the signal you heard.',
    expected: '<AR>',
    choices: [],
  };
  return {
    activity: {
      version: 1,
      id: `${id}-0`,
      trial_id: id,
      revision: 0,
      item: item.id,
      sentence: 0,
      kind: 'prosign',
      input: 'keyboard',
      c: 20,
      e: 10,
      answer: '<AR>',
      attempts: ['<AR>'],
      replay: false,
      revealed: false,
      review: false,
      interrupted: false,
      finished: true,
      self_report: null,
      created: 100,
      latency_ms: 100,
      ...activity,
    },
    outcome: {
      eligible: true,
      correct: true,
      attempt_accuracy: 1,
      final_accuracy: 1,
      first_exact: true,
      final_exact: true,
      expected: '<AR>',
      first_answer: '<AR>',
      item,
      corpus: item.corpus,
      corpus_version: 1,
      mode: item.mode,
      selection: item.selection,
      signal: item.signal,
      accepted: ['<AR>', 'AR', '+'],
      ...outcome,
    },
  };
}

test('prosign presentations retain first answer after assisted repair and never count revisions twice', () => {
  const first = fixture(
    'repair',
    { answer: 'SK', attempts: ['SK'] },
    {
      correct: false,
      first_exact: false,
      final_exact: false,
      first_answer: 'SK',
      attempt_accuracy: 0,
      final_accuracy: 0,
    },
  );
  const repaired = fixture(
    'repair',
    {
      id: 'repair-1',
      revision: 1,
      answer: '+',
      attempts: ['SK', '+'],
      replay: true,
      revealed: true,
    },
    {
      eligible: false,
      correct: false,
      first_exact: false,
      first_answer: 'SK',
      attempt_accuracy: 0,
    },
  );
  const review = fixture('review', { review: true }, { eligible: false });
  const unavailable = fixture('missing', { id: 'missing-1', revision: 1 });
  const context = prosignContext(first),
    data = prosignProgress([repaired, first, first, review, unavailable], context);
  assert.equal(data.all.length, 3);
  assert.equal(data.counts.independent, 1);
  assert.equal(data.counts.firstExact, 0);
  assert.equal(data.counts.finalExact, 1);
  assert.equal(data.counts.assisted, 1);
  assert.equal(data.counts.review, 1);
  assert.deepEqual(data.signals, [{ signal: 'AR', samples: 1, firstCorrect: 0, finalCorrect: 1 }]);
  assert.equal(data.graphs[1].points[0].primary, 0);
  assert.equal(data.graphs[1].points[0].secondary, 100);
  assert.deepEqual(data.reviewItems, ['fixture-prosign']);
  assert.match(prosignLabels(data.all.find((t) => t.id === 'repair')!), /Replay.*Disclosed/);
  assert.match(
    prosignLabels(data.all.find((t) => t.id === 'missing')!),
    /Initial submission unavailable/,
  );
  const identityConflict = fixture('repair', {
    id: 'repair-2',
    revision: 2,
    input: 'touch',
    attempts: ['SK', '+'],
  });
  assert.equal(prosignProgress([first, repaired, identityConflict], context).all.length, 0);
  const rewrittenFirst = fixture('repair', { id: 'repair-2', revision: 2, attempts: ['<AR>'] });
  assert.equal(prosignProgress([first, rewrittenFirst], context).all.length, 0);
});

test('prosign comparisons isolate exercise, selected signals, input, requested speed and corpus', () => {
  const base = fixture();
  const changed = [
    fixture('touch', { input: 'touch' }),
    fixture('c', { c: 21 }),
    fixture('e', { e: 11 }),
    fixture('mode-meaning', {}, { mode: 'meaning' }),
    fixture('mode-context', {}, { mode: 'context' }),
    fixture('selection', {}, { selection: ['AR', 'BT'] }),
    fixture('corpus', {}, { corpus: 'future' as 'dojo-prosigns' }),
    fixture('version', {}, { corpus_version: 2 as 1 }),
  ];
  const data = prosignProgress([base, ...changed], prosignContext(base));
  assert.equal(data.contexts.length, 9);
  assert.equal(data.counts.independent, 1);
  assert.equal(data.graphs[0].points.length, 3);
  const unordered = fixture('same-signals', {}, { selection: ['SK', 'BT', 'AS', 'AR', 'AR'] });
  assert.equal(prosignContext(unordered), prosignContext(base));
  assert.equal(prosignProgress([base, unordered]).counts.independent, 2);
  const next = fixture('next-tested', { created: 200, c: 25 });
  const assisted = fixture(
    'newer-assisted',
    { created: 300, c: 30, replay: true },
    { eligible: false },
  );
  assert.equal(prosignProgress([base, next, assisted]).current, prosignContext(next));
  const legacy = ['word', 'story', 'callsign'].map((kind) => ({
    ...base,
    activity: { ...base.activity, id: `legacy-${kind}`, kind },
  }));
  assert.equal(
    prosignProgress([base, ...legacy] as import('../src/language-store').Entry[]).all.length,
    1,
  );
});

test('prosign latency requires eight correct independent samples and sparse charts never extrapolate', () => {
  const base = Array.from({ length: 8 }, (_, i) =>
    fixture(`sample-${i}`, {
      created: i + 100,
      latency_ms: (i + 1) * 100,
    }),
  );
  const excluded = [
    fixture('negative', { latency_ms: -1 }),
    fixture('nan', { latency_ms: Number.NaN }),
    fixture('huge', { latency_ms: 3600001 }),
    fixture('missing', { latency_ms: null }),
    fixture('replay', { replay: true }, { eligible: false }),
    fixture('revealed', { revealed: true }, { eligible: false }),
    fixture('interrupted', { interrupted: true }, { eligible: false }),
    fixture('review', { review: true }, { eligible: false }),
    fixture('incomplete', { finished: false }, { eligible: false }),
    fixture(
      'wrong',
      { latency_ms: 900 },
      { correct: false, first_exact: false, final_exact: false },
    ),
  ];
  const data = prosignProgress([...base, ...excluded], prosignContext(base[0]));
  assert.deepEqual(data.latency, { median: 450, p90: 800 });
  assert.equal(data.counts.latencySamples, 8);
  assert.equal(data.graphs[2].points.length, 1);
  assert.equal(data.graphs[2].points[0].primary, 0.45);
  assert.match(data.graphs[2].context, /Typing\/selection-inclusive/);
  assert.equal(
    data.graphs.every((g) => g.trend === null),
    true,
  );
  const sparse = prosignProgress(base.slice(0, 7));
  assert.equal(sparse.latency, null);
  assert.equal(sparse.graphs[2].points.length, 0);
  const entries = Array.from({ length: 110 }, (_, i) => fixture(`range-${i}`, { created: i + 1 }));
  assert.equal(prosignProgress(entries).counts.independent, 30);
  assert.equal(prosignProgress(entries, '', 100).counts.independent, 100);
  assert.equal(prosignProgress(entries, '', 0).counts.independent, 110);
  assert.deepEqual(
    prosignProgress([]).graphs.map((g) => g.points.length),
    [0, 0, 0],
  );
});
