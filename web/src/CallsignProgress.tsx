import { useEffect, useMemo, useState } from 'react';
import { Radio, ArrowRight, ArrowUpRight, RotateCcw, Cloud, Target, Clock } from 'lucide-react';
import type { EngineClient } from './engine-client';
import { LanguageStore, type Entry } from './language-store';
import {
  callsignProgress,
  callsignContextLabel,
  callsignLabels,
  type CallsignTrial,
} from './callsign-progress';
import { MiniGraph } from './MiniGraph';
import type { Graph } from './types';
import './callsign-progress.css';

type Props = {
  engine: EngineClient;
  owner: string;
  onSignin: () => void;
  onPractice: (reviewItems?: string[]) => void;
};
const percent = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

export function CallsignProgress(props: Props) {
  if (props.owner === 'guest')
    return (
      <section className="page callsign-progress callsign-progress-gate">
        <span className="tool-icon">
          <Cloud size={26} />
        </span>
        <span className="eyebrow">YOUR CALLSIGN JOURNEY</span>
        <h1>
          Keep every call
          <br />
          <em>with your account.</em>
        </h1>
        <p>
          Sign in to see your callsign results, review missed calls and carry your progress across
          devices.
        </p>
        <button className="button" onClick={props.onSignin}>
          Sign in for callsign progress <ArrowRight size={17} />
        </button>
      </section>
    );
  return <SavedCallsignProgress {...props} />;
}

function SavedCallsignProgress({ engine, owner, onPractice }: Props) {
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
  const data = useMemo(() => callsignProgress(entries, context, range), [entries, context, range]);
  const selected = data.all.find((t) => t.id === detail);
  const exchange = data.filtered.filter((t) => t.first.outcome.exchange_correct !== null);
  return (
    <section className="page callsign-progress" aria-label="Callsign progress">
      <div className="callsign-progress-heading">
        <div>
          <span className="eyebrow">YOUR CALLSIGN JOURNEY</span>
          <h1>
            Every call.
            <br />
            <em>A clearer picture.</em>
          </h1>
          <p>First attempts, careful repairs and the conditions you actually practiced.</p>
        </div>
        <span className="tool-icon">
          <Radio size={30} />
        </span>
      </div>
      <div className="callsign-progress-actions">
        <span className="callsign-sync">
          <Cloud size={16} />
          {status}
        </span>
        <button
          className="button secondary"
          disabled={!data.reviewItems.length}
          onClick={() => onPractice(data.reviewItems.slice(0, 30))}
        >
          <RotateCcw size={16} />
          Review missed calls
        </button>
        <button className="button" onClick={() => onPractice()}>
          Practice callsigns <ArrowRight size={17} />
        </button>
      </div>
      {!data.all.length ? (
        <div className="callsign-progress-empty">
          <Radio size={30} />
          <h2>Your first call starts here.</h2>
          <p>
            Complete a callsign round to see exact-call accuracy, requested pace and a history you
            can inspect. There are no results to estimate yet.
          </p>
          <button className="text-button" onClick={() => onPractice()}>
            Listen to a call <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="callsign-progress-filters">
            <label>
              Comparable conditions
              <select
                aria-label="Callsign progress conditions"
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
              Independent call range
              <select
                aria-label="Callsign progress range"
                value={range}
                onChange={(e) => setRange(Number(e.target.value))}
              >
                <option value={30}>Latest 30</option>
                <option value={100}>Latest 100</option>
                <option value={0}>All history</option>
              </select>
            </label>
          </div>
          <div className="progress-stat-row callsign-progress-stats">
            {[
              [data.counts.independent, 'Independent calls'],
              [percent(data.counts.firstExact, data.counts.independent), 'First-pass exact'],
              [
                percent(data.counts.finalExact, data.counts.independent),
                'Final exact after repair',
              ],
              [data.counts.distinct, 'Distinct presented items'],
            ].map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="callsign-progress-note">
            Each presented call counts once, even when you submit a repair. A repaired call never
            becomes a first-pass success.
          </p>
          {!data.filtered.length && (
            <p className="callsign-progress-notice">
              No independent submissions match these conditions yet. Assisted, review and
              interrupted activity is still listed below.
            </p>
          )}
          <div className="callsign-progress-graphs">
            {data.graphs.map((graph) => (
              <CallsignGraph key={graph.title + data.current} graph={graph} />
            ))}
          </div>
          <div className="callsign-progress-evidence">
            <Clock size={18} />
            <p>
              {data.latency
                ? `Typing-inclusive response latency: median ${(data.latency.median / 1000).toFixed(2)} s · p90 ${(data.latency.p90 / 1000).toFixed(2)} s · ${data.counts.latencySamples} correct independent samples.`
                : `Latency needs at least eight correct independent nonnegative samples under these conditions (${data.counts.latencySamples}/8).`}
            </p>
          </div>
          {exchange.length > 0 && (
            <p className="callsign-progress-note">
              Exchange fields, scored separately:{' '}
              {exchange.filter((t) => t.first.outcome.exchange_correct).length}/{exchange.length}{' '}
              first-pass exact ·{' '}
              {exchange.filter((t) => t.latest.outcome.exchange_final_correct).length}/
              {exchange.length} final exact.
            </p>
          )}
          <section className="callsign-progress-parts">
            <h2>
              <Target size={21} />
              Where the call got away
            </h2>
            <p>
              Alignment-based character errors in structural parts across the selected independent
              calls. These diagnose submitted text, not a unique listening cause or mastery.
            </p>
            {data.parts.length ? (
              <div className="callsign-progress-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Call part</th>
                      <th>Samples</th>
                      <th>First errors</th>
                      <th>Final errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.parts.map((p) => (
                      <tr key={p.name}>
                        <th>{p.name}</th>
                        <td>{p.samples}</td>
                        <td>{p.firstErrors}</td>
                        <td>{p.finalErrors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No independent part diagnostics yet.</p>
            )}
          </section>
          <section className="callsign-progress-history">
            <div className="callsign-history-heading">
              <h2>Your calls, one by one</h2>
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
                className="callsign-history-row"
                onClick={() => setDetail(detail === t.id ? '' : t.id)}
                aria-expanded={detail === t.id}
              >
                <span>
                  <strong>{t.first.outcome.expected}</strong>
                  <small>{new Date(t.first.activity.created).toLocaleString()}</small>
                </span>
                <span>
                  {t.first.outcome.first_exact === true
                    ? 'First-pass exact'
                    : t.first.outcome.first_exact === false
                      ? 'First-pass miss'
                      : 'No independent answer'}
                  <small>{callsignLabels(t)}</small>
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
      <p className="callsign-progress-footnote">
        Callsign practice has its own evidence. It does not change guided training targets or
        verified milestones. Latency includes typing; audio and input timing are estimated.
      </p>
    </section>
  );
}

function CallsignGraph({ graph }: { graph: Graph }) {
  const [open, setOpen] = useState(false),
    [point, setPoint] = useState(0);
  const selected = Math.min(point, Math.max(0, graph.points.length - 1));
  return (
    <article className="callsign-progress-graph">
      <h3>{graph.title}</h3>
      <p>{graph.context}</p>
      <MiniGraph
        graph={graph}
        maximum={graph.title === 'Exact-call accuracy' ? 100 : undefined}
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
          className="callsign-point-detail"
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

function TrialDetail({ trial: t, onReview }: { trial: CallsignTrial; onReview: () => void }) {
  const a = t.latest.activity,
    o = t.latest.outcome;
  return (
    <div className="callsign-trial-detail" aria-label="Callsign result details">
      <h3>{o.expected}</h3>
      <p>{callsignContextLabel(t.first)}</p>
      <p>{callsignLabels(t)}</p>
      <dl>
        <div>
          <dt>First submitted answer</dt>
          <dd>{t.first.outcome.first_answer ?? 'No answer'}</dd>
        </div>
        <div>
          <dt>Final answer</dt>
          <dd>{a.answer || 'No answer'}</dd>
        </div>
        <div>
          <dt>First attempt eligible</dt>
          <dd>{t.independent ? 'Independent' : 'Excluded from independent accuracy'}</dd>
        </div>
        <div>
          <dt>Typing-inclusive latency</dt>
          <dd>
            {typeof t.first.activity.latency_ms === 'number'
              ? `${(t.first.activity.latency_ms / 1000).toFixed(2)} s`
              : 'Not recorded'}
          </dd>
        </div>
      </dl>
      {o.parts.map((p, i) => (
        <p key={i}>
          {p.name}: {p.expected} · first errors {p.first_errors} · final errors {p.final_errors}
        </p>
      ))}
      {o.item.exchange && (
        <p>
          {o.item.exchange.label}: expected {o.item.exchange.text} · first{' '}
          {t.first.activity.exchange_answer || 'No answer'} · final{' '}
          {a.exchange_answer || 'No answer'}
        </p>
      )}
      <p>Submissions: {a.attempts.map((v) => v || '(empty)').join(' → ') || 'None'}</p>
      <button className="button secondary" onClick={onReview}>
        <RotateCcw size={16} />
        Review this call
      </button>
    </div>
  );
}
