import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coverage,
  daily,
  storyGraph,
  wordProgress,
  wordRows,
  type Catalog,
} from './language-progress';
import type { Entry } from './language-store';
const catalog: Catalog = {
  words: [{ id: 'words-AN', text: 'AN', meaning: '', set: 'words' }],
  stories: [{ id: 's', title: 'Story', sentences: ['A', 'B'] }],
};
function entry(
  id: string,
  values: Partial<Entry['activity']> = {},
  outcome: Partial<Entry['outcome']> = {},
): Entry {
  return {
    activity: {
      version: 1,
      id,
      item: 'words-AN',
      kind: 'word',
      sentence: 0,
      input: 'keyboard',
      c: 20,
      e: 10,
      answer: 'AN',
      attempts: [],
      replay: false,
      revealed: false,
      review: false,
      interrupted: false,
      finished: true,
      self_report: null,
      created: 100,
      ...values,
    },
    outcome: { eligible: true, correct: true, attempt_accuracy: 1, final_accuracy: 1, ...outcome },
  };
}
test('word denominators use eligible context only and deduplicate IDs', () => {
  const a = entry('a'),
    b = entry('b', {}, { correct: false, attempt_accuracy: 0.5, final_accuracy: 0.5 }),
    assisted = entry('c', { replay: true }, { eligible: false });
  const data = wordProgress([a, a, b, assisted], catalog, '', 30);
  assert.equal(data.filtered.length, 2);
  assert.equal(data.correct, 1);
  assert.equal(data.distinct, 1);
  assert.equal(data.graphs[1].points[0].primary, 50);
  assert.equal(data.graphs[2].points[0].primary, 75);
});
test('newest observed eligible context defaults and range precedes daily grouping', () => {
  const data = wordProgress(
    [
      entry('a'),
      entry('b', { c: 30, created: 200 }),
      entry('c', { c: 30, created: 300 }, { correct: false }),
    ],
    catalog,
    '',
    1,
  );
  assert.match(data.current, /30\/10/);
  assert.equal(data.filtered.length, 1);
  assert.equal(data.graphs[1].points[0].primary, 0);
  assert.equal(data.graphs[0].points.length, 1);
});
test('null scores and zero evidence do not become zero accuracy', () => {
  const e = entry('a', {}, { attempt_accuracy: null, final_accuracy: null });
  assert.equal(daily([e], 'Accuracy').points.length, 0);
  assert.equal(wordProgress([], catalog, '', 30).filtered.length, 0);
});
test('story coverage ignores interruptions and invalid sentences and does not double count replays', () => {
  const e = entry('a', { kind: 'story', item: 's', answer: null });
  const records = [
    e,
    e,
    entry('b', { kind: 'story', item: 's', sentence: 0, replay: true }),
    entry('c', { kind: 'story', item: 's', sentence: 1, interrupted: true }),
    entry('d', { kind: 'story', item: 's', sentence: 9 }),
  ];
  assert.equal(coverage(records, catalog.stories).size, 1);
  assert.equal(storyGraph(records, catalog.stories, '', 0).points.at(-1)!.primary, 1);
});
test('short story graph window retains full-history baseline', () => {
  const records = [
    entry('a', { kind: 'story', item: 's', sentence: 0 }),
    entry('b', { kind: 'story', item: 's', sentence: 1, created: 200 }),
  ];
  const graph = storyGraph(records, catalog.stories, '', 1);
  assert.equal(graph.points[0].primary, 2);
  assert.match(graph.context, /1 before/);
});

test('word rows preserve final-copy semantics, assistance and distinct recorded conditions', () => {
  const words: Catalog = {
    ...catalog,
    words: [...catalog.words, { id: 'words-NO', text: 'NO', meaning: '', set: 'words' }],
  };
  const records = [
    entry('first', {}, { attempt_accuracy: 0.5, final_accuracy: 1 }),
    entry('assisted', { replay: true, created: 300 }, { eligible: false }),
    entry('other', { item: 'words-NO', created: 200 }, { correct: false }),
  ];
  const rows = wordRows(records, words);
  assert.equal(rows[0].text, 'AN');
  assert.equal(rows[0].independent, 1);
  assert.equal(rows[0].exact, 1);
  assert.equal(rows[0].assisted, 1);
  assert.deepEqual(
    wordRows(records, words, ' no ').map((row) => row.text),
    ['NO'],
  );
  assert.deepEqual(
    wordRows(records, words, '', 'accuracy').map((row) => row.text),
    ['NO', 'AN'],
  );
});
