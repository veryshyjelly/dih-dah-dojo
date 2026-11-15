import type { Activity, Entry } from './language-store';
import type { CallsignActivity, CallsignOutcome } from './callsign-types';
import type { Graph } from './types';

export type CallsignEntry = { activity: CallsignActivity; outcome: CallsignOutcome };
export type CallsignTrial = {
  id: string;
  first: CallsignEntry;
  latest: CallsignEntry;
  revisions: number;
  independent: boolean;
};
const tail = <T>(values: T[], range: number) => (range ? values.slice(-range) : values);
const exact = (a: Activity) =>
  a.finished && !a.replay && !a.revealed && !a.review && !a.interrupted;
const validEntry = (entry: Entry): entry is CallsignEntry => {
  const a = entry.activity;
  const o = entry.outcome as Partial<CallsignOutcome>;
  return (
    a.kind === 'callsign' &&
    typeof a.trial_id === 'string' &&
    Number.isInteger(a.revision) &&
    a.revision! >= 0 &&
    a.revision! <= 31 &&
    typeof o.expected === 'string' &&
    !!o.item &&
    typeof o.corpus === 'string'
  );
};

export function callsignContext(entry: CallsignEntry, includePace = true) {
  const a = entry.activity,
    o = entry.outcome;
  return JSON.stringify([
    a.input,
    ...(includePace ? [a.c, a.e] : []),
    o.corpus,
    o.corpus_version,
    o.family,
    o.mode,
    o.condition,
    a.speed_mode || 'fixed',
  ]);
}
export function callsignContextLabel(entry: CallsignEntry) {
  const a = entry.activity,
    o = entry.outcome;
  return `${a.input} · ${a.c}/${a.e} WPM · ${o.family} · ${o.mode} · ${o.condition} · ${a.speed_mode || 'fixed'} · ${o.corpus} v${o.corpus_version}`;
}

/** Immutable submission revisions describe one presented call, not new attempts. */
export function callsignTrials(entries: Entry[]): CallsignTrial[] {
  const groups = new Map<string, CallsignEntry[]>();
  for (const entry of new Map(entries.filter(validEntry).map((e) => [e.activity.id, e])).values()) {
    const id = entry.activity.trial_id!;
    groups.set(id, [...(groups.get(id) || []), entry]);
  }
  return [...groups]
    .flatMap(([id, snapshots]) => {
      snapshots.sort(
        (a, b) =>
          a.activity.revision! - b.activity.revision! || a.activity.created - b.activity.created,
      );
      const first = snapshots[0],
        latest = snapshots.at(-1)!;
      // A conflicting identity/context must never combine favorable halves of trials.
      if (
        snapshots.some(
          (e) =>
            e.activity.item !== first.activity.item ||
            callsignContext(e) !== callsignContext(first),
        )
      )
        return [];
      return [
        {
          id,
          first,
          latest,
          revisions: snapshots.length,
          independent:
            first.activity.revision === 0 && first.outcome.eligible && exact(first.activity),
        },
      ];
    })
    .sort(
      (a, b) => a.first.activity.created - b.first.activity.created || a.id.localeCompare(b.id),
    );
}

export function callsignLabels(trial: CallsignTrial) {
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
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};
const validLatency = (trial: CallsignTrial) => {
  const latency = trial.first.activity.latency_ms;
  return (
    trial.independent &&
    trial.first.outcome.first_exact === true &&
    typeof latency === 'number' &&
    Number.isFinite(latency) &&
    latency >= 0 &&
    latency <= 3600000
  );
};

export function callsignProgress(entries: Entry[], selected = '', range = 30) {
  const all = callsignTrials(entries),
    independent = all.filter((t) => t.independent);
  const ordered = [...independent].reverse().concat([...all].reverse());
  const contexts = [
    ...new Map(
      ordered.map((t) => [callsignContext(t.first), callsignContextLabel(t.first)]),
    ).entries(),
  ].map(([key, label]) => ({ key, label }));
  const current = contexts.some((c) => c.key === selected) ? selected : contexts[0]?.key || '';
  const matching = all.filter((t) => callsignContext(t.first) === current);
  const filtered = tail(
    matching.filter((t) => t.independent),
    range,
  );
  const history = tail(matching, range).slice().reverse();
  const exemplar = matching[0]?.first;
  const pace = exemplar
    ? tail(
        independent.filter(
          (t) => callsignContext(t.first, false) === callsignContext(exemplar, false),
        ),
        range,
      )
    : [];
  const days = new Map<string, CallsignTrial[]>();
  for (const trial of filtered) {
    const day = new Date(trial.first.activity.created).toLocaleDateString();
    days.set(day, [...(days.get(day) || []), trial]);
  }
  const latencyTrials = filtered.filter(validLatency),
    samples: number[] = [];
  const latencyPoints: Graph['points'] = [];
  for (const trial of latencyTrials) {
    samples.push(trial.first.activity.latency_ms!);
    if (samples.length >= 8)
      latencyPoints.push({
        primary: median(samples) / 1000,
        secondary: percentile(samples, 0.9) / 1000,
        milestone: false,
        detail: [
          new Date(trial.first.activity.created).toLocaleString(),
          callsignContextLabel(trial.first),
          `${samples.length} correct independent samples · typing-inclusive · cumulative within selected range`,
        ],
      });
  }
  const graphs: Graph[] = [
    {
      title: 'Requested listening pace',
      primary_label: 'Character WPM',
      secondary_label: 'Effective WPM',
      context: 'Same input, material and conditions across requested paces · not measured delivery',
      trend: null,
      points: pace.map((t) => ({
        primary: t.first.activity.c,
        secondary: t.first.activity.e,
        milestone: false,
        detail: [
          new Date(t.first.activity.created).toLocaleString(),
          callsignContextLabel(t.first),
          'One independent presented call',
        ],
      })),
    },
    {
      title: 'Exact-call accuracy',
      primary_label: 'First-pass %',
      secondary_label: 'Final %',
      context: 'Matching conditions · independent first submissions · repairs stay separate',
      trend: null,
      points: [...days].map(([day, trials]) => ({
        primary: mean(trials.map((t) => (t.first.outcome.first_exact === true ? 100 : 0))),
        secondary: mean(trials.map((t) => (t.latest.outcome.final_exact === true ? 100 : 0))),
        milestone: false,
        detail: [
          day,
          `${trials.length} independent calls · ${trials.filter((t) => t.first.outcome.first_exact).length} first-pass exact · ${trials.filter((t) => t.latest.outcome.final_exact).length} final exact`,
          exemplar ? callsignContextLabel(exemplar) : 'No context',
        ],
      })),
    },
    {
      title: 'Response latency',
      primary_label: 'Median seconds',
      secondary_label: 'p90 seconds',
      context:
        'Typing-inclusive · correct independent calls only · at least eight samples per point',
      trend: null,
      points: latencyPoints,
    },
  ];
  const parts = new Map<
    string,
    { name: string; samples: number; firstErrors: number; finalErrors: number }
  >();
  for (const t of filtered)
    for (const part of t.first.outcome.parts) {
      const final = t.latest.outcome.parts.find((p) => p.name === part.name);
      const row = parts.get(part.name) || {
        name: part.name,
        samples: 0,
        firstErrors: 0,
        finalErrors: 0,
      };
      row.samples++;
      row.firstErrors += part.first_errors;
      row.finalErrors += final?.final_errors ?? part.final_errors;
      parts.set(part.name, row);
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
    parts: [...parts.values()].sort(
      (a, b) => b.firstErrors - a.firstErrors || a.name.localeCompare(b.name),
    ),
    counts: {
      independent: filtered.length,
      firstExact: filtered.filter((t) => t.first.outcome.first_exact === true).length,
      finalExact: filtered.filter((t) => t.latest.outcome.final_exact === true).length,
      assisted: matching.filter((t) => t.latest.activity.replay || t.latest.activity.revealed)
        .length,
      review: matching.filter((t) => t.latest.activity.review).length,
      interrupted: matching.filter((t) => t.latest.activity.interrupted).length,
      distinct: new Set(filtered.map((t) => t.first.activity.item)).size,
      latencySamples: samples.length,
    },
    latency:
      samples.length >= 8 ? { median: median(samples), p90: percentile(samples, 0.9) } : null,
  };
}
