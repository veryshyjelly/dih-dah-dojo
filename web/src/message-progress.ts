import type { Entry } from './language-store';
import type { MessageActivity, MessageOutcome, MessageTask } from './message-types';
import type { Graph } from './types';

export type MessageEntry = { activity: MessageActivity; outcome: MessageOutcome };
export type MessageTrial = {
  id: string;
  first: MessageEntry;
  latest: MessageEntry;
  revisions: number;
  independent: boolean;
  exposure: boolean;
};
export const messageTaskLabels: Record<MessageTask, string> = {
  copy: 'Connected copying',
  detail: 'Message-detail recall',
  listen: 'Listening reflection',
};
export const familiarityLabel = (familiar: boolean) =>
  familiar ? 'Familiar material' : 'New in available history';
const valid = (e: Entry): e is MessageEntry => {
  const a = e.activity,
    o = e.outcome as Partial<MessageOutcome>;
  return (
    a.kind === 'message' &&
    typeof a.trial_id === 'string' &&
    Number.isInteger(a.revision) &&
    a.revision! >= 0 &&
    a.revision! <= 31 &&
    typeof a.familiar === 'boolean' &&
    !!o.item &&
    typeof o.content_id === 'string' &&
    ['copy', 'detail', 'listen'].includes(o.task || '')
  );
};
export function messageContext(e: MessageEntry, pace = true) {
  const a = e.activity,
    o = e.outcome;
  return JSON.stringify([
    o.corpus,
    o.corpus_version,
    o.stage,
    o.task,
    o.family,
    o.repertoire,
    a.input,
    ...(pace ? [a.c, a.e] : []),
    a.familiar,
  ]);
}
export function messageContextLabel(e: MessageEntry) {
  const a = e.activity,
    o = e.outcome;
  return `${o.stage === 'phrase' ? 'Phrases' : 'Messages'} · ${messageTaskLabels[o.task]} · ${a.input} · ${a.c}/${a.e} WPM · ${o.family} · ${familiarityLabel(a.familiar)} · ${o.repertoire} · ${o.corpus} v${o.corpus_version}`;
}
export function messageTrials(entries: Entry[]): MessageTrial[] {
  const groups = new Map<string, MessageEntry[]>();
  for (const e of new Map(entries.filter(valid).map((e) => [e.activity.id, e])).values())
    groups.set(e.activity.trial_id, [...(groups.get(e.activity.trial_id) || []), e]);
  return [...groups]
    .flatMap(([id, snapshots]) => {
      snapshots.sort(
        (a, b) =>
          a.activity.revision - b.activity.revision || a.activity.created - b.activity.created,
      );
      const first = snapshots[0],
        latest = snapshots.at(-1)!;
      if (
        snapshots.some(
          (e) =>
            e.activity.item !== first.activity.item ||
            messageContext(e) !== messageContext(first) ||
            (first.activity.attempts.length > 0 &&
              e.activity.attempts[0] !== first.activity.attempts[0]),
        )
      )
        return [];
      const a = first.activity;
      return [
        {
          id,
          first,
          latest,
          revisions: snapshots.length,
          independent:
            a.revision === 0 &&
            first.outcome.eligible &&
            a.finished &&
            !a.interrupted &&
            !a.replay &&
            !a.revealed &&
            !a.review &&
            first.outcome.task !== 'listen',
          exposure: snapshots.some(
            (e) => e.outcome.exposure && e.activity.finished && !e.activity.interrupted,
          ),
        },
      ];
    })
    .sort(
      (a, b) => a.first.activity.created - b.first.activity.created || a.id.localeCompare(b.id),
    );
}
export function messageLabels(t: MessageTrial) {
  const a = t.latest.activity;
  return [
    t.first.outcome.task === 'listen'
      ? 'Listening exposure'
      : t.independent
        ? 'Independent first answer'
        : 'Extra practice',
    familiarityLabel(t.first.activity.familiar),
    a.replay ? 'Replay' : '',
    a.revealed ? 'Disclosed' : '',
    a.review ? 'Review' : '',
    a.interrupted ? 'Interrupted' : '',
    !a.finished ? 'Incomplete' : '',
    t.first.activity.revision !== 0 ? 'Initial submission unavailable' : '',
    t.revisions > 1 ? `${t.revisions} saved submissions` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
const tail = <T>(list: T[], count: number) => (count ? list.slice(-count) : list);
const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
function daily(trials: MessageTrial[], characters = false): Graph {
  const days = new Map<string, MessageTrial[]>();
  for (const t of trials) {
    const day = new Date(t.first.activity.created).toLocaleDateString();
    days.set(day, [...(days.get(day) || []), t]);
  }
  return {
    title: characters
      ? 'Copied character accuracy'
      : trials[0]?.first.outcome.task === 'detail'
        ? 'Message-detail accuracy'
        : 'Whole-copy accuracy',
    primary_label: characters ? 'Mean first copy %' : 'First answer %',
    secondary_label: characters ? 'Mean repaired copy %' : 'Final answer %',
    context: 'Matching recorded conditions · independent first answers · repairs remain separate',
    trend: null,
    points: [...days].flatMap(([day, list]) => {
      const first = characters
        ? list.flatMap((t) =>
            t.first.outcome.attempt_accuracy === null
              ? []
              : [t.first.outcome.attempt_accuracy * 100],
          )
        : list.map((t) => Number(t.first.outcome.first_exact) * 100);
      const final = characters
        ? list.flatMap((t) =>
            t.latest.outcome.final_accuracy === null ? [] : [t.latest.outcome.final_accuracy * 100],
          )
        : list.map((t) => Number(t.latest.outcome.final_exact) * 100);
      return first.length
        ? [
            {
              primary: average(first),
              secondary: final.length ? average(final) : null,
              milestone: false,
              detail: [
                day,
                `${list.length} independent presentations · first n=${first.length}, final n=${final.length}`,
              ],
            },
          ]
        : [];
    }),
  };
}
export function messageProgress(entries: Entry[], selected = '', range = 30) {
  const all = messageTrials(entries),
    eligible = all.filter(
      (t) => t.independent || (t.first.outcome.task === 'listen' && t.exposure),
    );
  const contexts = [
    ...new Map(
      [...eligible]
        .reverse()
        .concat([...all].reverse())
        .map((t) => [messageContext(t.first), messageContextLabel(t.first)]),
    ).entries(),
  ].map(([key, label]) => ({ key, label }));
  const current = contexts.some((c) => c.key === selected) ? selected : contexts[0]?.key || '';
  const matching = all.filter((t) => messageContext(t.first) === current),
    task = matching[0]?.first.outcome.task;
  const filtered = tail(
    matching.filter((t) => (task === 'listen' ? t.exposure : t.independent)),
    range,
  );
  const exemplar = matching[0]?.first;
  const pace = exemplar
    ? tail(
        eligible.filter((t) => messageContext(t.first, false) === messageContext(exemplar, false)),
        range,
      )
    : [];
  const graphs: Graph[] = [
    {
      title: 'Requested listening pace',
      primary_label: 'Character WPM',
      secondary_label: 'Effective WPM',
      context:
        'Same task, material conditions and familiarity · requested settings, not measured delivery',
      trend: null,
      points: pace.map((t) => ({
        primary: t.first.activity.c,
        secondary: t.first.activity.e,
        milestone: false,
        detail: [
          new Date(t.first.activity.created).toLocaleString(),
          messageContextLabel(t.first),
          'One presentation',
        ],
      })),
    },
  ];
  if (task === 'listen') {
    const days = new Map<string, MessageTrial[]>();
    for (const t of filtered) {
      const date = new Date(t.first.activity.created).toLocaleDateString();
      days.set(date, [...(days.get(date) || []), t]);
    }
    graphs.push({
      title: 'Listening exposure',
      primary_label: 'Completed presentations',
      secondary_label: null,
      context: 'Finished listening only · not an understanding or proficiency score',
      trend: null,
      points: [...days].map(([date, list]) => ({
        primary: list.length,
        secondary: null,
        milestone: false,
        detail: [
          date,
          `${list.length} completed presentations · ${new Set(list.map((t) => t.first.outcome.content_id)).size} distinct messages`,
        ],
      })),
    });
  } else {
    graphs.push(daily(filtered));
    if (task === 'copy') graphs.push(daily(filtered, true));
  }
  return {
    all,
    contexts,
    current,
    matching,
    filtered,
    task,
    graphs,
    history: tail(matching, range).slice().reverse(),
    reviewItems: [
      ...new Set(
        matching
          .slice()
          .reverse()
          .filter(
            (t) =>
              t.first.outcome.task !== 'listen' &&
              t.first.outcome.first_exact === false &&
              !t.first.activity.interrupted,
          )
          .map((t) => t.first.activity.item),
      ),
    ],
    counts: {
      presentations: filtered.length,
      firstExact: filtered.filter((t) => t.first.outcome.first_exact === true).length,
      finalExact: filtered.filter((t) => t.latest.outcome.final_exact === true).length,
      distinct: new Set(filtered.map((t) => t.first.outcome.content_id)).size,
      assisted: matching.filter((t) => t.latest.activity.replay || t.latest.activity.revealed)
        .length,
      interrupted: matching.filter((t) => t.latest.activity.interrupted).length,
      review: matching.filter((t) => t.latest.activity.review).length,
      reflections: filtered.filter((t) => t.latest.activity.self_report !== null).length,
      understood: filtered.filter((t) => t.latest.activity.self_report === 'understood').length,
    },
  };
}
