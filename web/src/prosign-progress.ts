import type { Entry } from './language-store';
import type { ProsignActivity, ProsignOutcome } from './prosign-types';
import type { Graph } from './types';

export type ProsignEntry = { activity: ProsignActivity; outcome: ProsignOutcome };
export type ProsignTrial = {
  id: string;
  first: ProsignEntry;
  latest: ProsignEntry;
  revisions: number;
  independent: boolean;
};
const tail = <T>(values: T[], range: number) => (range ? values.slice(-range) : values);
const validEntry = (entry: Entry): entry is ProsignEntry => {
  const a = entry.activity,
    o = entry.outcome as Partial<ProsignOutcome>;
  return (
    a.kind === 'prosign' &&
    typeof a.trial_id === 'string' &&
    Number.isInteger(a.revision) &&
    a.revision! >= 0 &&
    a.revision! <= 31 &&
    typeof o.expected === 'string' &&
    !!o.item &&
    typeof o.corpus === 'string' &&
    Array.isArray(o.selection)
  );
};
const selection = (entry: ProsignEntry) => [...new Set(entry.outcome.selection)].sort();
export function prosignContext(entry: ProsignEntry, includePace = true) {
  const a = entry.activity,
    o = entry.outcome;
  return JSON.stringify([
    a.input,
    ...(includePace ? [a.c, a.e] : []),
    o.corpus,
    o.corpus_version,
    o.mode,
    selection(entry),
  ]);
}
export const PROSIGN_MODE_LABELS = {
  recognition: 'Sound recognition',
  meaning: 'Meaning recall',
  context: 'Operating context',
} as const;
export function prosignContextLabel(entry: ProsignEntry) {
  const a = entry.activity,
    o = entry.outcome;
  return `${PROSIGN_MODE_LABELS[o.mode] || o.mode} · ${a.input} · ${a.c}/${a.e} WPM · ${selection(entry).join(', ')} · ${o.corpus} v${o.corpus_version}`;
}

/** Revisions preserve one presentation and the original independent answer. */
export function prosignTrials(entries: Entry[]): ProsignTrial[] {
  const groups = new Map<string, ProsignEntry[]>();
  for (const entry of new Map(entries.filter(validEntry).map((e) => [e.activity.id, e])).values()) {
    const id = entry.activity.trial_id;
    groups.set(id, [...(groups.get(id) || []), entry]);
  }
  return [...groups]
    .flatMap(([id, snapshots]) => {
      snapshots.sort(
        (a, b) =>
          a.activity.revision - b.activity.revision || a.activity.created - b.activity.created,
      );
      const first = snapshots[0],
        latest = snapshots.at(-1)!;
      // A changed identity/context or rewritten first submission cannot form one trial.
      if (
        snapshots.some(
          (e) =>
            e.activity.item !== first.activity.item ||
            prosignContext(e) !== prosignContext(first) ||
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
            !a.replay &&
            !a.revealed &&
            !a.review &&
            !a.interrupted,
        },
      ];
    })
    .sort(
      (a, b) => a.first.activity.created - b.first.activity.created || a.id.localeCompare(b.id),
    );
}
export function prosignLabels(trial: ProsignTrial) {
  const a = trial.latest.activity;
  return [
    trial.independent ? 'Independent first attempt' : 'Extra practice',
    a.replay ? 'Replay' : '',
    a.revealed ? 'Disclosed' : '',
    a.review ? 'Review' : '',
    a.interrupted ? 'Interrupted' : '',
    !a.finished ? 'Incomplete' : '',
    trial.first.activity.revision !== 0 ? 'Initial submission unavailable' : '',
    trial.revisions > 1 ? `${trial.revisions} saved submissions` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const quantile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};

export function prosignProgress(entries: Entry[], selected = '', range = 30) {
  const all = prosignTrials(entries),
    independent = all.filter((t) => t.independent);
  // Latest practiced eligible context wins, never an untested next speed.
  const contexts = [
    ...new Map(
      [...independent]
        .reverse()
        .concat([...all].reverse())
        .map((t) => [prosignContext(t.first), prosignContextLabel(t.first)]),
    ),
  ].map(([key, label]) => ({ key, label }));
  const current = contexts.some((c) => c.key === selected) ? selected : contexts[0]?.key || '';
  const matching = all.filter((t) => prosignContext(t.first) === current);
  const filtered = tail(
    matching.filter((t) => t.independent),
    range,
  );
  const history = tail(matching, range).slice().reverse(),
    exemplar = matching[0]?.first;
  const pace = exemplar
    ? tail(
        independent.filter(
          (t) => prosignContext(t.first, false) === prosignContext(exemplar, false),
        ),
        range,
      )
    : [];
  const days = new Map<string, ProsignTrial[]>();
  for (const t of filtered) {
    const day = new Date(t.first.activity.created).toLocaleDateString();
    days.set(day, [...(days.get(day) || []), t]);
  }
  const samples: number[] = [],
    latencyPoints: Graph['points'] = [];
  for (const t of filtered) {
    const value = t.first.activity.latency_ms;
    if (
      t.first.outcome.first_exact !== true ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 3600000
    )
      continue;
    samples.push(value);
    if (samples.length >= 8)
      latencyPoints.push({
        primary: median(samples) / 1000,
        secondary: quantile(samples, 0.9) / 1000,
        milestone: false,
        detail: [
          new Date(t.first.activity.created).toLocaleString(),
          prosignContextLabel(t.first),
          `${samples.length} correct independent samples · typing/selection-inclusive · cumulative within selected range`,
        ],
      });
  }
  const graphs: Graph[] = [
    {
      title: 'Requested listening pace',
      primary_label: 'Character WPM',
      secondary_label: 'Effective WPM',
      context: 'Same exercise, signals and input across requested paces · not measured delivery',
      trend: null,
      points: pace.map((t) => ({
        primary: t.first.activity.c,
        secondary: t.first.activity.e,
        milestone: false,
        detail: [
          new Date(t.first.activity.created).toLocaleString(),
          prosignContextLabel(t.first),
          'One independent presentation',
        ],
      })),
    },
    {
      title: 'Answer accuracy',
      primary_label: 'First-pass %',
      secondary_label: 'Final %',
      context:
        'Matching conditions · independent first submissions · repaired answers shown separately',
      trend: null,
      points: [...days].map(([day, trials]) => ({
        primary: mean(trials.map((t) => (t.first.outcome.first_exact === true ? 100 : 0))),
        secondary: mean(trials.map((t) => (t.latest.outcome.final_exact === true ? 100 : 0))),
        milestone: false,
        detail: [
          day,
          `${trials.length} independent presentations · ${trials.filter((t) => t.first.outcome.first_exact).length} first-pass correct · ${trials.filter((t) => t.latest.outcome.final_exact).length} final correct`,
          exemplar ? prosignContextLabel(exemplar) : 'No context',
        ],
      })),
    },
    {
      title: 'Response latency',
      primary_label: 'Median seconds',
      secondary_label: 'p90 seconds',
      context:
        'Typing/selection-inclusive · correct independent answers · at least eight samples per point',
      trend: null,
      points: latencyPoints,
    },
  ];
  const signals = new Map<
    string,
    { signal: string; samples: number; firstCorrect: number; finalCorrect: number }
  >();
  for (const t of filtered) {
    const signal = t.first.outcome.signal,
      row = signals.get(signal) || { signal, samples: 0, firstCorrect: 0, finalCorrect: 0 };
    row.samples++;
    row.firstCorrect += Number(t.first.outcome.first_exact === true);
    row.finalCorrect += Number(t.latest.outcome.final_exact === true);
    signals.set(signal, row);
  }
  const reviewItems = [
    ...new Set(
      matching
        .slice()
        .reverse()
        .filter((t) => t.first.outcome.first_exact === false && !t.first.activity.interrupted)
        .map((t) => t.first.activity.item),
    ),
  ];
  return {
    all,
    contexts,
    current,
    filtered,
    history,
    graphs,
    reviewItems,
    signals: [...signals.values()].sort((a, b) => a.signal.localeCompare(b.signal)),
    counts: {
      independent: filtered.length,
      firstExact: filtered.filter((t) => t.first.outcome.first_exact === true).length,
      finalExact: filtered.filter((t) => t.latest.outcome.final_exact === true).length,
      assisted: matching.filter((t) => t.latest.activity.replay || t.latest.activity.revealed)
        .length,
      review: matching.filter((t) => t.latest.activity.review).length,
      interrupted: matching.filter((t) => t.latest.activity.interrupted).length,
      distinct: signals.size,
      latencySamples: samples.length,
    },
    latency: samples.length >= 8 ? { median: median(samples), p90: quantile(samples, 0.9) } : null,
  };
}
