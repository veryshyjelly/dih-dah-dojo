import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  messageContext,
  messageProgress,
  messageTrials,
  type MessageEntry,
} from '../src/message-progress';
import type { MessageActivity, MessageOutcome, MessageItem } from '../src/message-types';

function fixture(
  id: string,
  activity: Partial<MessageActivity> = {},
  outcome: Partial<MessageOutcome> = {},
): MessageEntry {
  const item: MessageItem = {
    id: 'fixture-message',
    content_id: 'p1-1',
    version: 1 as const,
    corpus: 'dojo-messages' as const,
    corpus_version: 1,
    stage: 'phrase' as const,
    task: 'detail' as const,
    family: 'time' as const,
    topic: 'time' as const,
    repertoire: 'AEFIMNTV',
    text: 'MEET AT FIVE',
    audio_text: 'MEET AT FIVE',
    question: 'What time?',
    expected: 'FIVE',
    accepted: ['FIVE', '5'],
    choices: [{ id: 'FIVE', label: 'FIVE' }],
    required: 'AEFIMTV',
    word_count: 3,
    seconds: 4,
  };
  return {
    activity: {
      version: 1,
      kind: 'message',
      id: `${id}-0`,
      trial_id: id,
      revision: 0,
      item: item.id,
      sentence: 0,
      input: 'keyboard',
      c: 20,
      e: 10,
      answer: 'FIVE',
      attempts: ['FIVE'],
      replay: false,
      revealed: false,
      review: false,
      interrupted: false,
      finished: true,
      self_report: null,
      created: 100,
      familiar: false,
      ...activity,
    },
    outcome: {
      eligible: true,
      exposure: true,
      correct: true,
      attempt_accuracy: 1,
      final_accuracy: 1,
      first_exact: true,
      final_exact: true,
      expected: 'FIVE',
      first_answer: 'FIVE',
      item,
      corpus: 'dojo-messages',
      corpus_version: 1,
      stage: 'phrase',
      task: 'detail',
      family: 'time',
      repertoire: item.repertoire,
      content_id: item.content_id,
      accepted: item.accepted,
      ...outcome,
    },
  };
}
test('message revisions retain first-answer evidence and raw repair without double counting', () => {
  const first = fixture(
    'trial',
    { answer: 'NINE', attempts: ['NINE'] },
    {
      correct: false,
      first_exact: false,
      final_exact: false,
      attempt_accuracy: 0,
      final_accuracy: 0,
      first_answer: 'NINE',
    },
  );
  const repair = fixture(
    'trial',
    { id: 'trial-1', revision: 1, answer: 'FIVE', attempts: ['NINE', 'FIVE'], revealed: true },
    { eligible: false, first_exact: false, first_answer: 'NINE' },
  );
  const data = messageProgress([first, first, repair]);
  assert.equal(data.all.length, 1);
  assert.equal(data.counts.presentations, 1);
  assert.equal(data.counts.firstExact, 0);
  assert.equal(data.counts.finalExact, 1);
  assert.equal(data.counts.assisted, 1);
  assert.equal(data.all[0].revisions, 2);
  assert.equal(messageTrials([repair])[0].independent, false);
  const changed = fixture('trial', { id: 'trial-1', revision: 1, attempts: ['FIVE', 'FIVE'] });
  assert.equal(messageTrials([first, changed]).length, 0);
});
test('message comparisons separate stage, task, selection, corpus, input, speed and familiarity', () => {
  const first = fixture('base'),
    list = [
      first,
      fixture('pace', { e: 5, created: 200 }),
      fixture('touch', { input: 'touch', created: 300 }),
      fixture('familiar', { familiar: true, created: 400 }),
      fixture('repertoire', { created: 500 }, { repertoire: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }),
      fixture('stage', { created: 600 }, { stage: 'message' }),
      fixture('family', { created: 700 }, { family: 'mixed' }),
      // Synthetic future metadata verifies comparison isolation; the real decoder remains v1-only.
      fixture('version', { created: 800 }, { corpus_version: 2 as 1 }),
      fixture('task', { created: 900 }, { task: 'copy' }),
    ];
  assert.equal(new Set(list.map((e) => messageContext(e))).size, list.length);
  const data = messageProgress(list, messageContext(first), 30);
  assert.equal(data.counts.presentations, 1);
  assert.equal(data.graphs[0].points.length, 2);
  const latest = messageProgress(list);
  assert.equal(latest.task, 'copy');
});
test('listening reflections remain exposure and never receive accuracy scores', () => {
  const listen = fixture(
    'listen',
    { answer: null, attempts: [], self_report: 'partly' },
    {
      eligible: false,
      task: 'listen',
      correct: null,
      first_exact: null,
      final_exact: null,
      attempt_accuracy: null,
      final_accuracy: null,
      expected: null,
    },
  );
  const understood = fixture(
    'understood',
    { answer: null, attempts: [], self_report: 'understood', created: 200 },
    {
      eligible: false,
      task: 'listen',
      correct: null,
      first_exact: null,
      final_exact: null,
      attempt_accuracy: null,
      final_accuracy: null,
      expected: null,
    },
  );
  const data = messageProgress([listen, understood]);
  assert.equal(data.counts.presentations, 2);
  assert.equal(data.counts.reflections, 2);
  assert.equal(data.counts.understood, 1);
  assert.equal(data.all.filter((t) => t.independent).length, 0);
  assert.equal(data.graphs.length, 2);
  assert.equal(
    data.graphs.some((g) => g.title.includes('accuracy')),
    false,
  );
  const interrupted = fixture(
    'interrupted',
    { answer: null, attempts: [], interrupted: true },
    { eligible: false, exposure: false, task: 'listen', first_exact: null, final_exact: null },
  );
  assert.equal(messageProgress([interrupted]).counts.presentations, 0);
});
test('latest eligible context and selected range govern actual message observations', () => {
  const records = Array.from({ length: 40 }, (_, i) =>
    fixture(
      `sample-${i}`,
      { created: i + 1 },
      i % 2 ? {} : { correct: false, first_exact: false, final_exact: false },
    ),
  );
  const review = fixture('later-review', { created: 500, e: 5, review: true }, { eligible: false });
  const data = messageProgress([...records, review]);
  assert.equal(data.counts.presentations, 30);
  assert.equal(data.counts.firstExact, 15);
  assert.equal(data.task, 'detail');
  assert.equal(JSON.parse(data.current)[8], 10);
  assert.equal(messageProgress(records, '', 100).counts.presentations, 40);
  assert.equal(
    messageProgress([], '', 0).graphs.every((g) => g.points.length === 0),
    true,
  );
});
