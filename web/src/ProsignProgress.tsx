import { useEffect, useMemo, useState } from 'react';
import { Waves, ArrowRight, ArrowUpRight, RotateCcw, Cloud, Target, Clock } from 'lucide-react';
import type { EngineClient } from './engine-client';
import { LanguageStore, type Entry } from './language-store';
import {
  prosignProgress,
  prosignContextLabel,
  prosignLabels,
  type ProsignTrial,
} from './prosign-progress';
import { MiniGraph } from './MiniGraph';
import type { Graph } from './types';
import './prosign-progress.css';

type Props = {
  engine: EngineClient;
  owner: string;
  onSignin: () => void;
  onPractice: (reviewItems?: string[]) => void;
};
const percent = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

export function ProsignProgress(props: Props) {
  if (props.owner === 'guest')
    return (
      <section className="page prosign-progress prosign-progress-gate">
        <span className="tool-icon">
          <Cloud size={26} />
        </span>
        <span className="eyebrow">YOUR PROSIGN JOURNEY</span>
        <h1>
          Keep every signal
          <br />
          <em>with your account.</em>
        </h1>
        <p>
          Sign in to see your prosign results, review missed signals and carry your progress across
          devices.
        </p>
        <button className="button" onClick={props.onSignin}>
          Sign in for prosign progress <ArrowRight size={17} />
        </button>
      </section>
    );
  return <SavedProsignProgress key={props.owner} {...props} />;
}

function SavedProsignProgress({ engine, owner, onPractice }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [status, setStatus] = useState('Loading account activity…');
  const [context, setContext] = useState(''),
    [range, setRange] = useState(30),
    [detail, setDetail] = useState('');
  useEffect(() => {
    let live = true,
      revision = 0;
    const load = () => {
      const token = ++revision,
        store = new LanguageStore(owner, engine);
      void store
        .open()
        .then(() => {
          if (live && token === revision) {
            setEntries([...store.entries]);
            setStatus(store.status);
          }
        })
        .catch(() => {
          if (live && token === revision) setStatus('Could not load activity. Reconnect to retry.');
        });
    };
    load();
    window.addEventListener('dojo-language-change', load);
    window.addEventListener('online', load);
    return () => {
      live = false;
      window.removeEventListener('dojo-language-change', load);
      window.removeEventListener('online', load);
    };
  }, [engine, owner]);
  const data = useMemo(() => prosignProgress(entries, context, range), [entries, context, range]);
  const selected = data.all.find((t) => t.id === detail);
  return (
    <section className="page prosign-progress" aria-label="Prosign progress">
      <div className="prosign-progress-heading">
        <div>
          <span className="eyebrow">YOUR PROSIGN JOURNEY</span>
          <h1>
            Every signal.
            <br />
            <em>A clearer picture.</em>
          </h1>
          <p>
            Sound recognition, meaning recall and operating context each have their own evidence.
          </p>
        </div>
        <span className="tool-icon">
          <Waves size={30} />
        </span>
      </div>
      <div className="prosign-progress-actions">
        <span className="prosign-sync">
          <Cloud size={16} />
          {status}
        </span>
        <button
          className="button secondary"
          disabled={!data.reviewItems.length}
          onClick={() => onPractice(data.reviewItems.slice(0, 30))}
        >
          <RotateCcw size={16} />
          Review missed signals
        </button>
        <button className="button" onClick={() => onPractice()}>
          Practice prosigns <ArrowRight size={17} />
        </button>
      </div>
      {!data.all.length ? (
        <div className="prosign-progress-empty">
          <Waves size={30} />
          <h2>Your first signal starts here.</h2>
          <p>
            Complete a prosign round to see first-answer accuracy, requested pace and a history you
            can inspect. There are no results to estimate yet.
          </p>
          <button className="text-button" onClick={() => onPractice()}>
            Listen to a signal <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="prosign-progress-filters">
            <label>
              Comparable conditions
              <select
                aria-label="Prosign progress conditions"
                value={data.current}
                onChange={(e) => {
                  setContext(e.target.value);
                  setDetail('');
                }}
              >
                {data.contexts.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Independent answer range
              <select
                aria-label="Prosign progress range"
                value={range}
                onChange={(e) => setRange(Number(e.target.value))}
              >
                <option value={30}>Latest 30</option>
                <option value={100}>Latest 100</option>
                <option value={0}>All history</option>
              </select>
            </label>
          </div>
          <div className="progress-stat-row prosign-progress-stats">
            {[
              [data.counts.independent, 'Independent answers'],
              [percent(data.counts.firstExact, data.counts.independent), 'First-pass correct'],
              [
                percent(data.counts.finalExact, data.counts.independent),
                'Final correct after repair',
              ],
              [data.counts.distinct, 'Distinct signals'],
            ].map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="prosign-progress-note">
            Each presented signal counts once, even when you submit a repair. A repaired answer
            never becomes a first-pass success.
          </p>
          {!data.filtered.length && (
            <p className="prosign-progress-notice">
              No independent submissions match these conditions yet. Assisted, review and
              interrupted activity is still listed below.
            </p>
          )}
          <div className="prosign-progress-graphs">
            {data.graphs.map((graph) => (
              <ProsignGraph key={graph.title + data.current} graph={graph} />
            ))}
          </div>
          <div className="prosign-progress-evidence">
            <Clock size={18} />
            <p>
              {data.latency
                ? `Typing/selection-inclusive response latency: median ${(data.latency.median / 1000).toFixed(2)} s · p90 ${(data.latency.p90 / 1000).toFixed(2)} s · ${data.counts.latencySamples} correct independent samples.`
                : `Latency needs at least eight correct independent nonnegative samples under these conditions (${data.counts.latencySamples}/8).`}
            </p>
          </div>
          <section className="prosign-progress-parts">
            <h2>
              <Target size={21} />
              One signal at a time
            </h2>
            <p>
              Correct first and final answers for this exercise and signal set. Waveform aliases
              such as AR/+ and BT/= count together; these totals are evidence, not mastery labels.
            </p>
            {data.signals.length ? (
              <div className="prosign-progress-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Prosign</th>
                      <th>Samples</th>
                      <th>First correct</th>
                      <th>Final correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.signals.map((p) => (
                      <tr key={p.signal}>
                        <th>{`<${p.signal}>`}</th>
                        <td>{p.samples}</td>
                        <td>{p.firstCorrect}</td>
                        <td>{p.finalCorrect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No independent signal results yet.</p>
            )}
          </section>
          <section className="prosign-progress-history">
            <div className="prosign-history-heading">
              <h2>Your signals, one by one</h2>
              <p>
                {data.counts.assisted} assisted · {data.counts.review} review ·{' '}
                {data.counts.interrupted} interrupted presentations in this context, across all
                history.
              </p>
            </div>
            <p>
              Showing {range ? `up to ${range} recent` : 'all'} presentations, including extra
              practice.
            </p>
            {data.history.map((t) => (
              <button
                key={t.id}
                className="prosign-history-row"
                onClick={() => setDetail(detail === t.id ? '' : t.id)}
                aria-expanded={detail === t.id}
              >
                <span>
                  <strong>{t.first.outcome.expected}</strong>
                  <small>{new Date(t.first.activity.created).toLocaleString()}</small>
                </span>
                <span>
                  {t.first.outcome.first_exact === true
                    ? 'First-pass correct'
                    : t.first.outcome.first_exact === false
                      ? 'First-pass miss'
                      : 'No independent answer'}
                  <small>{prosignLabels(t)}</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
            {selected && (
              <TrialDetail
                trial={selected}
                onReview={() => onPractice([selected.first.activity.item])}
              />
            )}
          </section>
        </>
      )}
      <p className="prosign-progress-footnote">
        Prosign practice has its own evidence. It does not change guided training targets or
        verified milestones. Latency includes typing or selection, and context exercises also
        include reading. Audio and input timing are estimated.
      </p>
    </section>
  );
}

function ProsignGraph({ graph }: { graph: Graph }) {
  const [open, setOpen] = useState(false),
    [point, setPoint] = useState(0);
  const selected = Math.min(point, Math.max(0, graph.points.length - 1));
  return (
    <article className="prosign-progress-graph">
      <h3>{graph.title}</h3>
      <p>{graph.context}</p>
      <MiniGraph
        graph={graph}
        maximum={graph.title === 'Answer accuracy' ? 100 : undefined}
        selected={open ? selected : undefined}
        onPoint={(i) => {
          setPoint(i);
          setOpen(true);
        }}
      />
      <button className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Inspect points <ArrowUpRight size={14} />
      </button>
      {open && (
        <div
          className="prosign-point-detail"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              setPoint(
                Math.max(
                  0,
                  Math.min(graph.points.length - 1, selected + (e.key === 'ArrowRight' ? 1 : -1)),
                ),
              );
            }
          }}
        >
          {graph.points.length ? (
            <>
              <label>
                Recorded point
                <input
                  aria-label={`${graph.title} point`}
                  type="range"
                  min={0}
                  max={graph.points.length - 1}
                  value={selected}
                  onChange={(e) => setPoint(Number(e.target.value))}
                />
              </label>
              <p>
                {graph.primary_label}: {graph.points[selected].primary.toFixed(1)}
                {graph.points[selected].secondary === null
                  ? ''
                  : ` · ${graph.secondary_label}: ${graph.points[selected].secondary!.toFixed(1)}`}
              </p>
              {graph.points[selected].detail.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </>
          ) : (
            <p>
              No eligible points. Actual samples appear here when the evidence requirement is met.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function TrialDetail({ trial: t, onReview }: { trial: ProsignTrial; onReview: () => void }) {
  const a = t.latest.activity,
    o = t.latest.outcome;
  const answerLabel = (answer: string | null) =>
    answer ? o.item.choices.find((choice) => choice.id === answer)?.label || answer : 'No answer';
  return (
    <div className="prosign-trial-detail" aria-label="Prosign result details">
      <h3>{answerLabel(o.expected)}</h3>
      <p>{prosignContextLabel(t.first)}</p>
      <p>{prosignLabels(t)}</p>
      <dl>
        <div>
          <dt>First submitted answer</dt>
          <dd>{answerLabel(t.first.activity.attempts[0] ?? null)}</dd>
        </div>
        <div>
          <dt>Final answer</dt>
          <dd>{answerLabel(a.answer)}</dd>
        </div>
        <div>
          <dt>First attempt eligible</dt>
          <dd>{t.independent ? 'Independent' : 'Excluded from independent accuracy'}</dd>
        </div>
        <div>
          <dt>Typing/selection-inclusive latency</dt>
          <dd>
            {typeof t.first.activity.latency_ms === 'number'
              ? `${(t.first.activity.latency_ms / 1000).toFixed(2)} s`
              : 'Not recorded'}
          </dd>
        </div>
      </dl>
      <p>{o.item.prompt}</p>
      <p>Accepted answers: {o.accepted.map(answerLabel).join(' · ')}</p>
      <p>Submissions: {a.attempts.map(answerLabel).join(' → ') || 'None'}</p>
      <button className="button secondary" onClick={onReview}>
        <RotateCcw size={16} />
        Review this signal
      </button>
    </div>
  );
}
