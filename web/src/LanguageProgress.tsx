import { ProgressSignin } from './ProgressSignin';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Headphones,
  ArrowRight,
  ArrowUpRight,
  Activity,
  Cloud,
  RefreshCw,
  Archive,
  MessageSquare,
  X,
} from 'lucide-react';
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
  wordRows,
  type Catalog,
  type StoryInfo,
} from './language-progress';
import {
  ProgressChart,
  ProgressPagination,
  ProgressRange,
  ProgressStats,
  FocusedProgressDetail,
} from './LanguageProgressParts';
import { MessageProgressView } from './MessageProgress';
import './language-progress.css';

const empty: Catalog = { words: [], stories: [] };
function useActivity(engine: EngineClient, owner: string) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [status, setStatus] = useState('Loading saved activity…');
  const [catalog, setCatalog] = useState<Catalog>(empty),
    [dataLoading, setDataLoading] = useState(true),
    [catalogLoading, setCatalogLoading] = useState(true);
  const [dataError, setDataError] = useState(''),
    [catalogError, setCatalogError] = useState(''),
    [remoteError, setRemoteError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true,
      revision = 0;
    setDataLoading(true);
    setCatalogLoading(true);
    setDataError('');
    setCatalogError('');
    setRemoteError('');
    const load = () => {
      const token = ++revision,
        store = new LanguageStore(owner, engine);
      void store
        .open()
        .then(() => {
          if (!live || token !== revision) return;
          setEntries(unique(store.entries));
          setStatus(store.status);
          const incomplete = owner !== 'guest' && !store.remoteReadComplete;
          const remoteMessage = incomplete
            ? store.remoteReadError ||
              'Account history could not be fully loaded. Saved browser activity is still available.'
            : '';
          setRemoteError(remoteMessage);
          setDataError(
            store.status.includes('storage unavailable')
              ? 'This browser could not open saved activity. Your account data has not been replaced.'
              : incomplete && !store.entries.length
                ? remoteMessage
                : '',
          );
          setDataLoading(false);
        })
        .catch(() => {
          if (live && token === revision) {
            setDataLoading(false);
            setDataError('Saved activity could not be loaded. Reconnect and retry.');
          }
        });
    };
    load();
    void engine
      .json<Catalog>('language_catalog', 20, 10)
      .then((value) => {
        if (!live) return;
        setCatalog(value);
        setCatalogLoading(false);
      })
      .catch(() => {
        if (live) {
          setCatalogLoading(false);
          setCatalogError(
            'Content could not be loaded. Saved activity is still intact; its results cannot be displayed safely yet.',
          );
        }
      });
    window.addEventListener('dojo-language-change', load);
    window.addEventListener('online', load);
    return () => {
      live = false;
      window.removeEventListener('dojo-language-change', load);
      window.removeEventListener('online', load);
    };
  }, [engine, owner, retry]);
  return {
    entries,
    status,
    catalog,
    dataLoading,
    catalogLoading,
    dataError,
    catalogError,
    remoteError,
    retry: () => setRetry((n) => n + 1),
  };
}
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
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
        <h3>{kind === 'word' ? 'Your word progress' : 'Archived listening activity'}</h3>
        <p>
          {kind === 'word'
            ? `${eligible.length} independent answers · ${pct(eligible.filter((e) => e.outcome.correct).length, eligible.length)} exact final copies · ${new Set(eligible.map((e) => e.activity.item)).size} distinct words`
            : `${heard.size} unique sentences heard · listening exposure, not an understanding score`}
        </p>
      </div>
      <button className="text-button" onClick={onProgress}>
        View progress <ArrowUpRight size={14} />
      </button>
    </aside>
  );
}
type Props = {
  engine: EngineClient;
  owner: string;
  kind: 'word' | 'story';
  onContinue: (id: string) => void;
  onSignin: () => void;
  view?: 'words' | 'messages';
  onView?: (view: 'words' | 'messages') => void;
  onPractice?: () => void;
  onMessages?: (items?: string[]) => void;
  onArchive?: () => void;
};
export function LanguageProgress(props: Props) {
  return <SavedLanguageProgress key={`${props.owner}-${props.kind}`} {...props} />;
}
function SavedLanguageProgress(props: Props) {
  const { engine, owner, kind, onSignin } = props;
  const data = useActivity(engine, owner),
    [localView, setLocalView] = useState<'words' | 'messages'>('words');
  const view = props.view || localView,
    messages = kind === 'word' && view === 'messages';
  const error = data.dataError || (!messages ? data.catalogError : '');
  const loading = data.dataLoading || (!messages && data.catalogLoading);
  const hasArchive = data.entries.some((e) => e.activity.kind === 'story');
  return (
    <section
      className="page language-progress lp-page"
      aria-label={
        kind === 'story'
          ? 'Archived story progress'
          : messages
            ? 'Phrases and messages progress'
            : 'Word progress'
      }
    >
      <header className="lp-heading">
        <div>
          <span className="eyebrow">
            {kind === 'story'
              ? 'YOUR LISTENING ARCHIVE'
              : messages
                ? 'WORDS INTO MEANING'
                : 'YOUR WORD JOURNEY'}
          </span>
          <h1>
            {kind === 'story' ? (
              'Your story so far.'
            ) : messages ? (
              <>
                Follow a little <em>more.</em>
              </>
            ) : (
              <>
                Your word <em>rhythm.</em>
              </>
            )}
          </h1>
          <p>
            {kind === 'story'
              ? 'Your earlier listening and transcription records, kept with their original meaning.'
              : messages
                ? 'Connected copying, message-detail recall and listening reflection each have their own evidence.'
                : 'See your final copies, the corrections along the way, and the words worth returning to.'}
          </p>
        </div>
        <span className="tool-icon">
          {kind === 'story' ? (
            <Archive size={28} />
          ) : messages ? (
            <MessageSquare size={28} />
          ) : (
            <BookOpen size={28} />
          )}
        </span>
      </header>
      <div className="lp-actions">
        <span className="lp-sync">
          <Cloud size={16} />
          {loading ? 'Loading saved activity…' : data.status}
        </span>
        {kind === 'story' ? (
          <button className="button" onClick={() => props.onMessages?.()}>
            Try phrases & messages <ArrowRight size={17} />
          </button>
        ) : (
          <button
            className="button"
            onClick={() => (messages ? props.onMessages?.() : props.onPractice?.())}
          >
            {messages ? 'Practice phrases & messages' : 'Practice words'}
            <ArrowRight size={17} />
          </button>
        )}
        {kind === 'word' && hasArchive && (
          <button className="text-button" onClick={props.onArchive}>
            <Archive size={15} />
            Story activity archive
          </button>
        )}
      </div>
      {owner === 'guest' && <ProgressSignin onSignin={onSignin} />}
      {!loading && !error && data.remoteError && (
        <div className="lp-notice" role="status">
          <Cloud size={22} />
          <div>
            <p>
              {data.remoteError} Showing available browser records only; totals may be incomplete.
            </p>
            <button className="text-button" onClick={data.retry}>
              <RefreshCw size={15} />
              Retry account synchronization
            </button>
          </div>
        </div>
      )}
      {kind === 'word' && (
        <div className="lp-view-tabs segmented" role="group" aria-label="Word progress view">
          {(['words', 'messages'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={view === value}
              onClick={() => {
                setLocalView(value);
                props.onView?.(value);
              }}
            >
              {value === 'words' ? 'Words' : 'Phrases & messages'}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="lp-state" role="status">
          <Activity size={28} />
          <h2>Opening your saved activity.</h2>
          <p>Your results will appear once the records and their content are ready.</p>
        </div>
      ) : error ? (
        <div className="lp-state lp-error" role="alert">
          <Cloud size={28} />
          <h2>Your progress is still yours.</h2>
          <p>{error}</p>
          <button className="button secondary" onClick={data.retry}>
            <RefreshCw size={16} />
            Retry loading progress
          </button>
        </div>
      ) : kind === 'story' ? (
        <StoryArchive entries={data.entries} catalog={data.catalog} onContinue={props.onContinue} />
      ) : messages ? (
        <MessageProgressView entries={data.entries} onPractice={props.onMessages || (() => {})} />
      ) : (
        <WordProgress
          entries={data.entries}
          catalog={data.catalog}
          onPractice={props.onPractice || (() => {})}
        />
      )}
      <p className="lp-footnote">
        {kind === 'story'
          ? 'Archived story completion records describe exposure or transcription. They have not been converted into message-understanding scores.'
          : 'These activities have their own progress. They do not change guided training targets or verified milestones.'}
      </p>
    </section>
  );
}
function WordProgress({
  entries,
  catalog,
  onPractice,
}: {
  entries: Entry[];
  catalog: Catalog;
  onPractice: () => void;
}) {
  const [selected, setSelected] = useState(''),
    [range, setRange] = useState(30),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('recent');
  const [scope, setScope] = useState('conditions'),
    [detail, setDetail] = useState(''),
    [wordPage, setWordPage] = useState(0),
    [historyPage, setHistoryPage] = useState(0);
  const words = useMemo(
    () => wordProgress(entries, catalog, selected, range),
    [entries, catalog, selected, range],
  );
  const scoped = words.all.filter(
    (e) => scope === 'all' || !words.current || context(e, catalog) === words.current,
  );
  const rows = wordRows(scoped, catalog, search, sort),
    selectedRow = wordRows(scoped, catalog).find((r) => r.id === detail);
  const history = scoped
    .filter((e) => !detail || e.activity.item === detail)
    .slice()
    .reverse();
  const rowPage = Math.min(wordPage, Math.max(0, Math.ceil(rows.length / 10) - 1)),
    recordPage = Math.min(historyPage, Math.max(0, Math.ceil(history.length / 10) - 1));
  const changeConditions = (value: string) => {
    setSelected(value);
    setDetail('');
    setWordPage(0);
    setHistoryPage(0);
  };
  if (!words.all.length)
    return (
      <div className="lp-state">
        <BookOpen size={32} />
        <h2>Your first word starts here.</h2>
        <p>
          Complete a word round to see final-copy accuracy, corrections and the words you have
          practiced. There is nothing to estimate yet.
        </p>
        <button className="button" onClick={onPractice}>
          Listen to a word <ArrowRight size={17} />
        </button>
      </div>
    );
  return (
    <>
      {words.contexts.length ? (
        <>
          <div className="lp-filters">
            <label>
              Recorded conditions
              <select value={words.current} onChange={(e) => changeConditions(e.target.value)}>
                {words.contexts.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <ProgressRange value={range} onChange={setRange} label="Eligible answers" />
          </div>
          <ProgressStats
            values={[
              [words.filtered.length, 'Independent answers'],
              [pct(words.correct, words.filtered.length), 'Exact final copies'],
              [words.distinct, 'Distinct attempted words'],
            ]}
          />
          <p className="lp-evidence">
            Exact-word accuracy describes the final submitted copy. Character scores retain the
            original attempt stream and final copy separately. Historical selected repertoires were
            not recorded.
          </p>
          <div className="lp-graph-grid">
            {words.graphs.map((graph) => (
              <ProgressChart key={graph.title} graph={graph} />
            ))}
          </div>
        </>
      ) : (
        <div className="lp-notice">
          <Activity size={22} />
          <div>
            <h2>Practice saved. Independent evidence comes next.</h2>
            <p>
              Your saved records are listening, replayed, disclosed, repeated or interrupted
              activity. They stay below, but do not become independent accuracy.
            </p>
            <button className="text-button" onClick={onPractice}>
              Try an independent word round <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      <section className="lp-record-section" aria-labelledby="word-results-heading">
        <div className="lp-section-heading">
          <div>
            <h2 id="word-results-heading">Your words</h2>
            <p>
              {scope === 'all'
                ? 'All recorded conditions, across saved history.'
                : words.current
                  ? 'The selected recorded conditions, across saved history.'
                  : 'All saved activity; no independent conditions are available yet.'}{' '}
              Charts above use their own answer range.
            </p>
          </div>
        </div>
        <div className="lp-table-filters">
          <label>
            Find a word
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setWordPage(0);
              }}
              placeholder="Search saved words"
            />
          </label>
          <label>
            Result scope
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setDetail('');
                setWordPage(0);
                setHistoryPage(0);
              }}
            >
              <option value="conditions">Selected conditions</option>
              <option value="all">All recorded conditions</option>
            </select>
          </label>
          <label>
            Sort words
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setWordPage(0);
              }}
            >
              <option value="recent">Most recently practiced</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="accuracy">Lowest final-copy accuracy</option>
            </select>
          </label>
        </div>
        {selectedRow && (
          <FocusedProgressDetail identity={selectedRow.id} label="Selected word details">
            <div className="lp-section-heading">
              <h3>{selectedRow.text}</h3>
              <button
                className="icon-button"
                aria-label="Close word details"
                onClick={() => setDetail('')}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              {selectedRow.independent} independent answers · {selectedRow.exact} exact final copies
              · {selectedRow.assisted} assisted · {selectedRow.interrupted} interrupted.
            </p>
            <p>
              Recorded activity below is filtered to this word. These totals use the result scope
              selected above.
            </p>
          </FocusedProgressDetail>
        )}
        <div className="lp-word-table" role="group" aria-label="Saved word results">
          <div className="lp-word-table-heading" aria-hidden="true">
            <span>Word</span>
            <span>Independent</span>
            <span>Final exact</span>
            <span>Assisted</span>
            <span>Last practiced</span>
          </div>
          {rows.slice(rowPage * 10, rowPage * 10 + 10).map((row) => (
            <button
              key={row.id}
              className="lp-word-row"
              aria-pressed={detail === row.id}
              onClick={() => {
                setDetail(row.id);
                setHistoryPage(0);
              }}
            >
              <strong>{row.text}</strong>
              <span>
                <small>Independent</small>
                {row.independent}
              </span>
              <span>
                <small>Final exact</small>
                {pct(row.exact, row.independent)}
              </span>
              <span>
                <small>Assisted</small>
                {row.assisted}
              </span>
              <time>
                <small>Last practiced</small>
                {new Date(row.last).toLocaleDateString()}
              </time>
            </button>
          ))}
        </div>
        {!rows.length && (
          <p className="lp-list-empty">No saved words match this search and scope.</p>
        )}
        <ProgressPagination
          page={rowPage}
          count={rows.length}
          onChange={setWordPage}
          label="Words"
        />
      </section>
      <section className="lp-record-section" aria-labelledby="word-history-heading">
        <div className="lp-section-heading">
          <div>
            <h2 id="word-history-heading">Recorded activity</h2>
            <p>
              {detail ? 'The selected word' : 'Saved words'} ·{' '}
              {scope === 'all' ? 'all recorded conditions' : 'selected conditions'} · includes extra
              practice.
            </p>
          </div>
          {detail && (
            <button className="text-button" onClick={() => setDetail('')}>
              Show all words <ArrowRight size={15} />
            </button>
          )}
        </div>
        <div className="language-records lp-history">
          {history.slice(recordPage * 10, recordPage * 10 + 10).map((e) => (
            <ActivityRecord key={e.activity.id} entry={e} catalog={catalog} />
          ))}
        </div>
        <ProgressPagination
          page={recordPage}
          count={history.length}
          onChange={setHistoryPage}
          label="Activity records"
        />
      </section>
    </>
  );
}
function ActivityRecord({ entry: e, catalog }: { entry: Entry; catalog: Catalog }) {
  const a = e.activity,
    word = catalog.words.find((w) => w.id === a.item),
    story = catalog.stories.find((s) => s.id === a.item);
  const outcome = a.interrupted
    ? 'Interrupted'
    : a.answer === null
      ? 'Listening exposure'
      : e.outcome.correct
        ? 'Exact final copy'
        : 'Final copy differs';
  return (
    <details>
      <summary>
        <strong>
          {a.kind === 'word'
            ? word?.text || 'Unavailable word'
            : story?.title || 'Unavailable story'}
        </strong>
        <span>{outcome}</span>
        <time>{new Date(a.created).toLocaleDateString()}</time>
        <ArrowRight className="lp-history-arrow" size={15} aria-hidden="true" />
      </summary>
      <div className="lp-history-detail">
        <p>
          {context(e, catalog)} · {new Date(a.created).toLocaleString()}
        </p>
        <p>
          {labels(e)} ·{' '}
          {e.outcome.eligible ? 'Independent answer' : 'Excluded from independent accuracy'}
        </p>
        {a.answer !== null && (
          <p>
            Your final answer: <strong>{a.answer || '(no answer)'}</strong>
          </p>
        )}
        {a.kind === 'word' && a.answer !== null && (
          <p>Expected word: {word?.text || 'Unavailable content'}</p>
        )}
        {a.kind === 'story' && (
          <p>
            Sentence {a.sentence + 1}
            {a.answer !== null || a.revealed
              ? `: ${story?.sentences[a.sentence] || 'Unavailable content'}`
              : ''}
          </p>
        )}
        <p>
          {e.outcome.attempt_accuracy !== null
            ? `Attempt ${Math.round(e.outcome.attempt_accuracy * 100)}% · Final ${e.outcome.final_accuracy === null ? 'not recorded' : `${Math.round(e.outcome.final_accuracy * 100)}%`}`
            : 'Listening exposure · no accuracy score'}
        </p>
      </div>
    </details>
  );
}
function StoryArchive({
  entries,
  catalog,
  onContinue,
}: {
  entries: Entry[];
  catalog: Catalog;
  onContinue: (id: string) => void;
}) {
  const all = unique(entries).filter((e) => e.activity.kind === 'story'),
    heard = coverage(all, catalog.stories);
  const [story, setStory] = useState(''),
    [range, setRange] = useState(30),
    [transRange, setTransRange] = useState(30),
    [selected, setSelected] = useState(''),
    [page, setPage] = useState(0);
  const saved = catalog.stories.filter((s) => all.some((e) => e.activity.item === s.id));
  const eligible = all.filter((e) => e.outcome.eligible),
    contexts = [
      ...new Set(
        eligible
          .slice()
          .reverse()
          .map((e) => context(e, catalog)),
      ),
    ],
    current = contexts.includes(selected) ? selected : contexts[0] || '';
  const history = all
    .filter((e) => !story || e.activity.item === story)
    .slice()
    .reverse();
  const coverageGraph = storyGraph(all, catalog.stories, story, range),
    transcription = daily(
      tail(
        eligible.filter((e) => context(e, catalog) === current),
        transRange,
      ),
      'Transcription accuracy',
    );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(history.length / 10) - 1));
  if (!all.length)
    return (
      <div className="lp-state">
        <Archive size={30} />
        <h2>No archived story activity.</h2>
        <p>
          Earlier story records appear here when available. Phrases & messages now offers short
          connected listening with a clear task.
        </p>
      </div>
    );
  return (
    <>
      <div className="lp-notice">
        <Archive size={22} />
        <p>
          This archive preserves the original listening and transcription records. Finished playback
          describes exposure; it does not establish comprehension. Old story links and bookmarks
          still work.
        </p>
      </div>
      <ProgressStats
        values={[
          [saved.length, 'Stories with saved activity'],
          [heard.size, 'Unique sentences heard'],
          [eligible.length, 'Independent transcriptions'],
        ]}
      />
      <div className="lp-archive-controls lp-filters">
        <label>
          Listening coverage
          <select
            value={story}
            onChange={(e) => {
              setStory(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All saved stories</option>
            {saved.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <ProgressRange value={range} onChange={setRange} label="Completed listening events" />
      </div>
      <div className="lp-graph-grid lp-two-graphs">
        <ProgressChart graph={coverageGraph} />
        {eligible.length > 0 ? (
          <ProgressChart graph={transcription} />
        ) : (
          <div className="lp-state lp-small-state">
            <Headphones size={28} />
            <h3>Listening exposure only.</h3>
            <p>
              No independent transcriptions were saved. Understanding was not measured by these
              records.
            </p>
          </div>
        )}
      </div>
      {contexts.length > 0 && (
        <div className="lp-filters">
          <label>
            Transcription conditions
            <select value={current} onChange={(e) => setSelected(e.target.value)}>
              {contexts.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <ProgressRange
            value={transRange}
            onChange={setTransRange}
            label="Eligible transcriptions"
          />
        </div>
      )}
      <section className="lp-record-section">
        <h2>Saved listening bookmarks</h2>
        <div className="lp-archive-list">
          {saved.map((s) => {
            const list = all.filter((e) => e.activity.item === s.id),
              last = list.at(-1)!,
              count = s.sentences.filter((_, i) => heard.has(`${s.id}:${i}`)).length;
            return (
              <article key={s.id}>
                <div>
                  <h3>{s.title}</h3>
                  <p>
                    {count}/{s.sentences.length} unique sentences heard · saved sentence{' '}
                    {last.activity.sentence + 1}
                  </p>
                </div>
                <button className="button secondary" onClick={() => onContinue(s.id)}>
                  Continue listening <ArrowUpRight size={15} />
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <section className="lp-record-section">
        <h2>Recorded activity</h2>
        <div className="language-records lp-history">
          {history.slice(currentPage * 10, currentPage * 10 + 10).map((e) => (
            <ActivityRecord key={e.activity.id} entry={e} catalog={catalog} />
          ))}
        </div>
        <ProgressPagination
          page={currentPage}
          count={history.length}
          onChange={setPage}
          label="Activity records"
        />
      </section>
    </>
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
