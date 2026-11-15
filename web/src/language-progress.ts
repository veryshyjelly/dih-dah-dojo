import type { Entry } from './language-store';
import type { Graph } from './types';
export type WordInfo = { id: string; text: string; meaning: string; set: string };
export type StoryInfo = { id: string; title: string; sentences: string[]; seconds?: number };
export type Catalog = { words: WordInfo[]; stories: StoryInfo[] };
export const unique = (entries: Entry[]) =>
  [...new Map(entries.map((e) => [e.activity.id, e])).values()].sort(
    (a, b) => a.activity.created - b.activity.created || a.activity.id.localeCompare(b.activity.id),
  );
export const tail = <T>(list: T[], n: number) => (n ? list.slice(-n) : list);
export const band = (w: WordInfo) =>
  w.text.length <= 3 ? '2–3' : w.text.length <= 5 ? '4–5' : '6+';
export function context(e: Entry, catalog: Catalog) {
  const a = e.activity,
    w = catalog.words.find((w) => w.id === a.item);
  return `${a.input} · ${a.c}/${a.e} WPM · ${a.kind === 'word' ? (w ? `${w.set} · ${band(w)} letters` : 'Unavailable content') : catalog.stories.find((s) => s.id === a.item)?.title || 'Unavailable story'}`;
}
export const labels = (e: Entry) =>
  [
    e.activity.interrupted
      ? 'Interrupted'
      : e.activity.answer === null
        ? 'Listening'
        : 'Answer recorded',
    e.activity.replay ? 'Replay' : '',
    e.activity.revealed ? 'Disclosed' : '',
    e.activity.review ? 'Repeated material' : '',
    e.activity.self_report !== null ? 'Self-report' : '',
  ]
    .filter(Boolean)
    .join(' · ');
export function coverage(entries: Entry[], stories: StoryInfo[]) {
  const heard = new Set<string>();
  for (const { activity: a } of unique(entries))
    if (
      a.kind === 'story' &&
      a.finished &&
      !a.interrupted &&
      stories.some((s) => s.id === a.item && a.sentence >= 0 && a.sentence < s.sentences.length)
    )
      heard.add(`${a.item}:${a.sentence}`);
  return heard;
}
export function daily(entries: Entry[], title: string, exact = false): Graph {
  const days = new Map<string, Entry[]>();
  for (const e of entries) {
    const day = new Date(e.activity.created).toLocaleDateString();
    days.set(day, [...(days.get(day) || []), e]);
  }
  return {
    title,
    primary_label: exact ? 'Exact word %' : 'Mean attempt %',
    secondary_label: exact ? null : 'Mean final %',
    context: 'Recorded local calendar days · selected answers only',
    trend: null,
    points: [...days]
      .map(([day, list]) => {
        const attempts = list.flatMap((e) =>
          e.outcome.attempt_accuracy === null ? [] : [e.outcome.attempt_accuracy * 100],
        );
        const finals = list.flatMap((e) =>
          e.outcome.final_accuracy === null ? [] : [e.outcome.final_accuracy * 100],
        );
        const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
        return {
          primary: exact
            ? (list.filter((e) => e.outcome.correct).length / list.length) * 100
            : mean(attempts),
          secondary: exact || !finals.length ? null : mean(finals),
          milestone: false,
          detail: [
            day,
            exact
              ? `${list.filter((e) => e.outcome.correct).length}/${list.length} exact answers`
              : `Mean across answers · attempt n=${attempts.length}, final n=${finals.length}`,
          ],
        };
      })
      .filter((p) => Number.isFinite(p.primary)),
  };
}
export function wordProgress(entries: Entry[], catalog: Catalog, selected: string, range: number) {
  const all = unique(entries).filter((e) => e.activity.kind === 'word');
  const eligible = all.filter(
    (e) => e.outcome.eligible && catalog.words.some((w) => w.id === e.activity.item),
  );
  const contexts = [...new Set([...eligible].reverse().map((e) => context(e, catalog)))];
  const current = contexts.includes(selected) ? selected : contexts[0] || '';
  const filtered = tail(
    eligible.filter((e) => context(e, catalog) === current),
    range,
  );
  const exemplar = eligible.find((e) => context(e, catalog) === current);
  const w = exemplar && catalog.words.find((w) => w.id === exemplar.activity.item);
  const pace = tail(
    eligible.filter((e) => {
      const word = catalog.words.find((w) => w.id === e.activity.item);
      return (
        w &&
        word &&
        exemplar &&
        e.activity.input === exemplar.activity.input &&
        word.set === w.set &&
        band(word) === band(w)
      );
    }),
    range,
  );
  const graphs: Graph[] = [
    {
      title: 'Requested pace',
      primary_label: 'Character WPM',
      secondary_label: 'Effective WPM',
      context: 'Requested settings · observed answers',
      trend: null,
      points: pace.map((e) => ({
        primary: e.activity.c,
        secondary: e.activity.e,
        milestone: false,
        detail: [new Date(e.activity.created).toLocaleString(), context(e, catalog)],
      })),
    },
    daily(filtered, 'Exact-word accuracy', true),
    daily(filtered, 'Character accuracy'),
  ];
  return {
    all,
    contexts,
    current,
    filtered,
    graphs,
    correct: filtered.filter((e) => e.outcome.correct).length,
    distinct: new Set(filtered.map((e) => e.activity.item)).size,
  };
}
export function storyGraph(
  entries: Entry[],
  stories: StoryInfo[],
  story: string,
  range: number,
): Graph {
  const events = unique(entries).filter(
    (e) =>
      e.activity.kind === 'story' &&
      e.activity.finished &&
      !e.activity.interrupted &&
      (!story || e.activity.item === story) &&
      stories.some(
        (s) =>
          s.id === e.activity.item &&
          e.activity.sentence >= 0 &&
          e.activity.sentence < s.sentences.length,
      ),
  );
  const selected = tail(events, range),
    ids = new Set(selected.map((e) => e.activity.id)),
    heard = new Set<string>();
  const points = new Map<string, Graph['points'][number]>();
  let baseline = 0;
  for (const e of events) {
    heard.add(`${e.activity.item}:${e.activity.sentence}`);
    if (!ids.has(e.activity.id)) {
      baseline = heard.size;
      continue;
    }
    const date = new Date(e.activity.created).toLocaleDateString();
    points.set(date, {
      primary: heard.size,
      secondary: null,
      milestone: false,
      detail: [
        date,
        `${heard.size} unique sentences heard`,
        `${baseline} heard before this window`,
      ],
    });
  }
  return {
    title: 'Sentences heard',
    primary_label: 'Cumulative unique sentences',
    secondary_label: null,
    context: `Listening exposure · ${baseline} before this window`,
    trend: null,
    points: [...points.values()],
  };
}

export type WordProgressRow = {
  id: string;
  text: string;
  entries: Entry[];
  independent: number;
  exact: number;
  assisted: number;
  interrupted: number;
  last: number;
};
/** A bounded view can page these rows without changing the underlying evidence. */
export function wordRows(entries: Entry[], catalog: Catalog, search = '', sort = 'recent') {
  const words = new Map(catalog.words.map((w) => [w.id, w]));
  const groups = new Map<string, Entry[]>();
  for (const e of unique(entries).filter((e) => e.activity.kind === 'word')) {
    const word = words.get(e.activity.item);
    if (!word || !word.text.toLowerCase().includes(search.trim().toLowerCase())) continue;
    groups.set(word.id, [...(groups.get(word.id) || []), e]);
  }
  const result: WordProgressRow[] = [...groups].map(([id, list]) => {
    const independent = list.filter((e) => e.outcome.eligible);
    return {
      id,
      text: words.get(id)!.text,
      entries: list,
      independent: independent.length,
      exact: independent.filter((e) => e.outcome.correct === true).length,
      assisted: list.filter((e) => e.activity.replay || e.activity.revealed).length,
      interrupted: list.filter((e) => e.activity.interrupted).length,
      last: list.at(-1)!.activity.created,
    };
  });
  return result.sort((a, b) =>
    sort === 'alphabetical'
      ? a.text.localeCompare(b.text)
      : sort === 'accuracy'
        ? (a.independent ? a.exact / a.independent : 2) -
            (b.independent ? b.exact / b.independent : 2) || a.text.localeCompare(b.text)
        : b.last - a.last || a.text.localeCompare(b.text),
  );
}
