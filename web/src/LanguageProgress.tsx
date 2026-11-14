import { ProgressSignin } from './ProgressSignin';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Headphones, ArrowUpRight, Download, Activity } from 'lucide-react';
import type { EngineClient } from './engine-client';
import { LanguageStore, clearLanguage, type Entry } from './language-store';
import {
  coverage,
  context,
  daily,
  labels,
  storyGraph,
  tail,
  unique,
  wordProgress,
  type Catalog,
  type StoryInfo,
} from './language-progress';
import { MiniGraph } from './MiniGraph';
import type { Graph } from './types';
const empty: Catalog = { words: [], stories: [] };
function useActivity(engine: EngineClient, owner: string) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [status, setStatus] = useState('Loading saved activity…'),
    [catalog, setCatalog] = useState<Catalog>(empty);
  useEffect(() => {
    let live = true,
      revision = 0;
    const load = () => {
      const token = ++revision;
      const store = new LanguageStore(owner, engine);
      void store.open().then(() => {
        if (live && token === revision) {
          setEntries([...new Map(store.entries.map((e) => [e.activity.id, e])).values()]);
          setStatus(store.status);
        }
      });
    };
    load();
    void engine
      .json<Catalog>('language_catalog', 20, 10)
      .then((c) => {
        if (live) setCatalog(c);
      })
      .catch(() => {
        if (live) setStatus('Content unavailable · reload to retry');
      });
    window.addEventListener('dojo-language-change', load);
    window.addEventListener('online', load);
    return () => {
      live = false;
      window.removeEventListener('dojo-language-change', load);
      window.removeEventListener('online', load);
    };
  }, [engine, owner]);
  return { entries, status, catalog };
}
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
function Stats({ values }: { values: [string | number, string][] }) {
  return (
    <div className="progress-stat-row">
      {values.map(([value, label]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
export function ProgressSummary({
  entries,
  kind,
  stories,
  onProgress,
}: {
  entries: Entry[];
  kind: 'word' | 'story';
  stories: StoryInfo[];
  onProgress: () => void;
}) {
  const eligible = unique(entries).filter((e) => e.activity.kind === kind && e.outcome.eligible),
    heard = coverage(entries, stories);
  return (
    <aside className="language-progress-summary">
      <span className="tool-icon">
        {kind === 'word' ? <BookOpen size={20} /> : <Headphones size={20} />}
      </span>
      <div>
        <h3>Your {kind === 'word' ? 'word' : 'story'} progress</h3>
        <p>
          {kind === 'word'
            ? `${eligible.length} independent answers · ${pct(eligible.filter((e) => e.outcome.correct).length, eligible.length)} exact · ${new Set(eligible.map((e) => e.activity.item)).size} distinct words`
            : `${stories.filter((s) => s.sentences.every((_, i) => heard.has(`${s.id}:${i}`))).length} stories completed · ${heard.size} sentences heard`}
        </p>
      </div>
      <button className="text-button" onClick={onProgress}>
        View progress <ArrowUpRight size={14} />
      </button>
    </aside>
  );
}
function Chart({ graph }: { graph: Graph }) {
  const [open, setOpen] = useState(false),
    [point, setPoint] = useState(0);
  const current = Math.min(point, Math.max(0, graph.points.length - 1));
  return (
    <article className="graph-card">
      <h3>{graph.title}</h3>
      <p>{graph.context}</p>
      <MiniGraph
        maximum={graph.title.toLowerCase().includes('accuracy') ? 100 : undefined}
        graph={graph}
        selected={open ? current : undefined}
        onPoint={(i) => {
          setOpen(true);
          setPoint(i);
        }}
      />
      <button className="text-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Inspect <ArrowUpRight size={14} />
      </button>
      {open && (
        <div
          className="language-point-detail"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              setPoint(
                Math.max(
                  0,
                  Math.min(graph.points.length - 1, current + (e.key === 'ArrowRight' ? 1 : -1)),
                ),
              );
            }
          }}
        >
          {graph.points.length ? (
            <>
              <label>
                Recorded point{' '}
                <input
                  aria-label={`${graph.title} point`}
                  type="range"
                  min="0"
                  max={Math.max(0, graph.points.length - 1)}
                  value={current}
                  onChange={(e) => setPoint(Number(e.target.value))}
                />
              </label>
              <p>
                {graph.primary_label}: {graph.points[current].primary.toFixed(1)}
                {graph.points[current].secondary !== null
                  ? ` · ${graph.secondary_label}: ${graph.points[current].secondary!.toFixed(1)}`
                  : ''}
              </p>
              {graph.points[current].detail.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </>
          ) : (
            <p>No eligible activity yet.</p>
          )}
        </div>
      )}
    </article>
  );
}
function Range({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[30, 100, 0].map((n) => (
          <option key={n} value={n}>
            {n || 'All'}
          </option>
        ))}
      </select>
    </label>
  );
}
export function LanguageProgress({
  engine,
  owner,
  kind,
  onContinue,
  onSignin,
}: {
  engine: EngineClient;
  owner: string;
  kind: 'word' | 'story';
  onContinue: (id: string) => void;
  onSignin: () => void;
}) {
  const { entries, status, catalog } = useActivity(engine, owner),
    [selected, setSelected] = useState(''),
    [range, setRange] = useState(30),
    [story, setStory] = useState(''),
    [transRange, setTransRange] = useState(30),
    [search, setSearch] = useState(''),
    [detail, setDetail] = useState('');
  const words = useMemo(
    () => wordProgress(entries, catalog, selected, range),
    [entries, catalog, selected, range],
  );
  const heard = useMemo(() => coverage(entries, catalog.stories), [entries, catalog]);
  const storyEntries = unique(entries).filter((e) => e.activity.kind === 'story'),
    eligible = storyEntries.filter((e) => e.outcome.eligible),
    contexts = [...new Set([...eligible].reverse().map((e) => context(e, catalog)))],
    current = contexts.includes(selected) ? selected : contexts[0] || '';
  const coverageGraph = useMemo(
    () => storyGraph(entries, catalog.stories, story, range),
    [entries, catalog, story, range],
  );
  const trans = useMemo(
    () =>
      daily(
        tail(
          eligible.filter((e) => context(e, catalog) === current),
          transRange,
        ),
        'Transcription accuracy',
      ),
    [entries, catalog, current, transRange],
  );
  const label = (e: Entry) =>
    e.activity.kind === 'word'
      ? catalog.words.find((w) => w.id === e.activity.item)?.text || 'Unavailable word'
      : catalog.stories.find((s) => s.id === e.activity.item)?.title || 'Unavailable story';
  const shown = entries.filter(
    (e) => e.activity.kind === kind && (!detail || e.activity.item === detail),
  );
  return (
    <section className="page progress-page language-progress">
      <div className="page-heading">
        <span className="tool-icon">{kind === 'word' ? <BookOpen /> : <Headphones />}</span>
        <h1>{kind === 'word' ? 'Your word rhythm.' : 'Your story so far.'}</h1>
        <p>{status}</p>
        <p>
          {owner === 'guest' ? 'Saved on this browser.' : 'Your account activity.'} These activities
          have their own progress.
        </p>
      </div>
      {owner === 'guest' && <ProgressSignin onSignin={onSignin} />}
      {kind === 'word' ? (
        <>
          <div className="language-filters">
            <label>
              Recorded conditions
              <select value={words.current} onChange={(e) => setSelected(e.target.value)}>
                {!words.contexts.length && <option value="">No independent answers yet</option>}
                {words.contexts.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Range value={range} onChange={setRange} label="Eligible answers" />
          </div>
          <Stats
            values={[
              [words.filtered.length, 'independent answers'],
              [pct(words.correct, words.filtered.length), 'exact-word accuracy'],
              [words.distinct, 'distinct attempted words'],
            ]}
          />
          <div className="graph-grid">
            {words.graphs.map((g) => (
              <Chart key={g.title} graph={g} />
            ))}
          </div>
          <h2>Your words</h2>
          <p>All recorded activity · chart filters apply above.</p>
          <label>
            Find a word
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <div className="word-progress-list">
            {catalog.words
              .filter(
                (w) =>
                  words.all.some((e) => e.activity.item === w.id) &&
                  w.text.toLowerCase().includes(search.toLowerCase()),
              )
              .map((w) => {
                const list = words.all.filter((e) => e.activity.item === w.id),
                  independent = list.filter((e) => e.outcome.eligible);
                return (
                  <button key={w.id} onClick={() => setDetail(w.id)}>
                    <strong>{w.text}</strong>
                    <span>
                      {independent.length} independent ·{' '}
                      {independent.filter((e) => e.outcome.correct).length} correct ·{' '}
                      {pct(independent.filter((e) => e.outcome.correct).length, independent.length)}{' '}
                      · {list.filter((e) => e.activity.replay || e.activity.revealed).length}{' '}
                      assisted
                    </span>
                    <small>{new Date(list.at(-1)!.activity.created).toLocaleDateString()}</small>
                  </button>
                );
              })}
          </div>
        </>
      ) : (
        <>
          <Stats
            values={[
              [
                catalog.stories.filter((s) => storyEntries.some((e) => e.activity.item === s.id))
                  .length,
                'stories started',
              ],
              [
                catalog.stories.filter((s) =>
                  s.sentences.every((_, i) => heard.has(`${s.id}:${i}`)),
                ).length,
                'stories completed',
              ],
              [heard.size, 'unique sentences heard'],
            ]}
          />
          <div className="story-progress-list">
            {catalog.stories.map((s) => {
              const list = entries.filter(
                  (e) => e.activity.kind === 'story' && e.activity.item === s.id,
                ),
                last = list.at(-1),
                n = s.sentences.filter((_, i) => heard.has(`${s.id}:${i}`)).length;
              return (
                <article className="settings-card" key={s.id}>
                  <h3>{s.title}</h3>
                  <progress
                    aria-label={`${s.title} completion`}
                    value={n}
                    max={s.sentences.length}
                  />
                  <p>
                    {n}/{s.sentences.length} sentences heard
                  </p>
                  <p>
                    {last
                      ? `Saved sentence ${last.activity.sentence + 1} · ${new Date(last.activity.created).toLocaleDateString()}`
                      : 'Ready for your first listen'}
                  </p>
                  <button className="text-button" onClick={() => onContinue(s.id)}>
                    Continue listening <ArrowUpRight size={14} />
                  </button>
                </article>
              );
            })}
          </div>
          <div className="language-filters">
            <label>
              Listening coverage
              <select value={story} onChange={(e) => setStory(e.target.value)}>
                <option value="">All stories</option>
                {catalog.stories.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <Range value={range} onChange={setRange} label="Completed listening events" />
          </div>
          <Chart graph={coverageGraph} />
          <h2>Transcription</h2>
          <div className="language-filters">
            <label>
              Transcription conditions
              <select value={current} onChange={(e) => setSelected(e.target.value)}>
                {!contexts.length && <option value="">No independent transcriptions yet</option>}
                {contexts.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Range value={transRange} onChange={setTransRange} label="Eligible transcriptions" />
          </div>
          <Chart graph={trans} />
        </>
      )}
      <h2>Recorded activity</h2>
      {detail && (
        <button className="text-button" onClick={() => setDetail('')}>
          Show all words
        </button>
      )}
      {!shown.length && (
        <div className="quiet-empty">
          <Activity />
          <p>Your first {kind === 'word' ? 'answer' : 'listen'} will appear here.</p>
        </div>
      )}
      <div className="language-records">
        {[...shown].reverse().map((e) => (
          <details key={e.activity.id}>
            <summary>
              {label(e)} · {new Date(e.activity.created).toLocaleDateString()} · {labels(e)}
            </summary>
            <p>
              {context(e, catalog)} · {new Date(e.activity.created).toLocaleString()}
            </p>
            {e.activity.answer !== null && (
              <p>
                Your answer: {e.activity.answer || '(no answer)'} ·{' '}
                {e.outcome.correct ? 'Exact answer' : 'Answer differs'}
              </p>
            )}
            {e.activity.kind === 'story' && (
              <p>
                Sentence {e.activity.sentence + 1}
                {e.activity.answer !== null || e.activity.revealed
                  ? `: ${catalog.stories.find((s) => s.id === e.activity.item)?.sentences[e.activity.sentence] || 'Unavailable content'}`
                  : ''}
              </p>
            )}
            <p>
              {e.outcome.attempt_accuracy !== null
                ? `Attempt ${Math.round(e.outcome.attempt_accuracy * 100)}% · Final ${Math.round((e.outcome.final_accuracy || 0) * 100)}%`
                : 'Listening exposure · no accuracy score'}
            </p>
          </details>
        ))}
      </div>
      <p className="fine-print">
        Recorded conditions describe this activity. Language practice does not establish guided
        milestones.
      </p>
    </section>
  );
}
export function LanguageData({ engine, owner }: { engine: EngineClient; owner: string }) {
  const { status } = useActivity(engine, owner),
    [confirmation, setConfirmation] = useState(''),
    [message, setMessage] = useState('');
  return (
    <section className="language-data-settings" aria-label="Browser activity storage">
      <p>{message || status}</p>
      {owner === 'guest' && (
        <>
          <label>
            Type DELETE to clear guest activity
            <input
              aria-label="Confirm clearing guest activity"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <button
            disabled={confirmation !== 'DELETE'}
            onClick={() =>
              void clearLanguage(owner)
                .then(() => {
                  setConfirmation('');
                  setMessage('Guest activity cleared.');
                })
                .catch((e) => setMessage(String(e)))
            }
          >
            Clear guest activity
          </button>
        </>
      )}
    </section>
  );
}
