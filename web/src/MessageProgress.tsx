import { useMemo, useState } from 'react';
import { Activity, ArrowRight, MessageSquare, RotateCcw, X } from 'lucide-react';
import type { Entry } from './language-store';
import {
  messageContextLabel,
  messageLabels,
  messageProgress,
  messageTaskLabels,
  type MessageTrial,
} from './message-progress';
import {
  FocusedProgressDetail,
  ProgressChart,
  ProgressPagination,
  ProgressRange,
  ProgressStats,
} from './LanguageProgressParts';

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
export function MessageProgressView({
  entries,
  onPractice,
}: {
  entries: Entry[];
  onPractice: (items?: string[]) => void;
}) {
  const [context, setContext] = useState(''),
    [range, setRange] = useState(30),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState('');
  const data = useMemo(() => messageProgress(entries, context, range), [entries, context, range]);
  const selected = data.matching.find((t) => t.id === detail),
    listening = data.task === 'listen';
  const currentPage = Math.min(page, Math.max(0, Math.ceil(data.history.length / 10) - 1));
  if (!data.all.length)
    return (
      <div className="lp-state">
        <MessageSquare size={32} />
        <h2>A few words. A little meaning.</h2>
        <p>
          Listen to a phrase, recover a message detail or reflect on what you followed. Each task
          will keep its own evidence here.
        </p>
        <button className="button" onClick={() => onPractice()}>
          Try phrases & messages <ArrowRight size={17} />
        </button>
      </div>
    );
  return (
    <>
      <div className="lp-filters">
        <label>
          Message progress conditions
          <select
            aria-label="Message progress conditions"
            value={data.current}
            onChange={(e) => {
              setContext(e.target.value);
              setDetail('');
              setPage(0);
            }}
          >
            {data.contexts.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <ProgressRange
          value={range}
          onChange={(value) => {
            setRange(value);
            setPage(0);
          }}
          label={listening ? 'Completed listening range' : 'Independent answer range'}
        />
      </div>
      <ProgressStats
        values={
          listening
            ? [
                [data.counts.presentations, 'Completed listening presentations'],
                [data.counts.distinct, 'Distinct phrases or messages'],
                [
                  `${data.counts.understood} / ${data.counts.reflections}`,
                  'Self-reported understood',
                ],
              ]
            : [
                [data.counts.presentations, 'Independent first answers'],
                [
                  pct(data.counts.firstExact, data.counts.presentations),
                  data.task === 'detail'
                    ? 'First message-detail answers correct'
                    : 'First copies exact',
                ],
                [
                  pct(data.counts.finalExact, data.counts.presentations),
                  'Final answers after repair',
                ],
                [data.counts.distinct, 'Distinct phrases or messages'],
              ]
        }
      />
      <p className="lp-evidence">
        {listening
          ? 'Listening exposure and your own reflection are kept separately from scored answers. These records do not establish understanding or proficiency.'
          : 'Each presentation counts once. Repairs retain the first answer. Message-detail recall also involves memory and language; it is a separate task from copying.'}{' '}
        “New” means no earlier encounter was found in the available history, not a verified
        first-ever encounter.
      </p>
      {!data.filtered.length && (
        <div className="lp-notice">
          <Activity size={22} />
          <p>
            These conditions contain extra practice but no{' '}
            {listening ? 'completed listening presentations' : 'independent answers'} yet. Replays,
            disclosures, review and interruptions stay visible in history.
          </p>
        </div>
      )}
      <div className={`lp-graph-grid ${data.graphs.length === 2 ? 'lp-two-graphs' : ''}`}>
        {data.graphs.map((graph) => (
          <ProgressChart key={graph.title} graph={graph} />
        ))}
      </div>
      <section className="lp-record-section" aria-labelledby="message-history-heading">
        <div className="lp-section-heading">
          <div>
            <h2 id="message-history-heading">Your messages, one by one</h2>
            <p>
              {data.counts.assisted} assisted · {data.counts.review} review ·{' '}
              {data.counts.interrupted} interrupted presentations in these conditions, across all
              saved history.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={!data.reviewItems.length}
            onClick={() => onPractice(data.reviewItems.slice(0, 30))}
          >
            <RotateCcw size={16} />
            Review missed material
          </button>
        </div>
        {selected && (
          <FocusedProgressDetail identity={selected.id} label="Message result details">
            <div className="lp-section-heading">
              <h3>{messageTaskLabels[selected.first.outcome.task]}</h3>
              <button
                className="icon-button"
                aria-label="Close message details"
                onClick={() => setDetail('')}
              >
                <X size={18} />
              </button>
            </div>
            <MessageDetail
              trial={selected}
              onReview={() => onPractice([selected.first.activity.item])}
            />
          </FocusedProgressDetail>
        )}
        <div className="lp-message-history">
          {data.history.slice(currentPage * 10, currentPage * 10 + 10).map((t) => (
            <button
              className="lp-message-row"
              key={t.id}
              aria-pressed={detail === t.id}
              onClick={() => setDetail(t.id)}
            >
              <span>
                <strong>
                  {t.first.outcome.item.stage === 'phrase' ? 'Phrase' : 'Message'} ·{' '}
                  {t.first.outcome.item.topic}
                </strong>
                <time>{new Date(t.first.activity.created).toLocaleString()}</time>
              </span>
              <span>
                <strong>
                  {t.first.outcome.task === 'listen'
                    ? 'Listening exposure'
                    : t.independent
                      ? t.first.outcome.first_exact
                        ? 'First answer correct'
                        : 'First answer missed'
                      : 'Extra practice'}
                </strong>
                <small>{messageLabels(t)}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
        <ProgressPagination
          page={currentPage}
          count={data.history.length}
          onChange={setPage}
          label="Message records"
        />
      </section>
    </>
  );
}
function MessageDetail({ trial: t, onReview }: { trial: MessageTrial; onReview: () => void }) {
  const a = t.latest.activity,
    o = t.latest.outcome,
    listening = o.task === 'listen';
  return (
    <div className="lp-message-detail">
      <p>{messageContextLabel(t.first)}</p>
      <p>{messageLabels(t)}</p>
      <blockquote>{o.item.text}</blockquote>
      {!listening && (
        <>
          <p>
            <strong>{o.task === 'detail' ? o.item.question : 'Connected copying'}</strong>
          </p>
          <dl>
            <div>
              <dt>First submitted answer</dt>
              <dd>{t.first.activity.attempts[0] || 'No answer'}</dd>
            </div>
            <div>
              <dt>Final answer</dt>
              <dd>{a.answer || 'No answer'}</dd>
            </div>
            <div>
              <dt>Expected</dt>
              <dd>{o.expected}</dd>
            </div>
            <div>
              <dt>First-answer evidence</dt>
              <dd>
                {t.independent
                  ? 'Independent under these conditions'
                  : 'Excluded from independent accuracy'}
              </dd>
            </div>
          </dl>
          {o.task === 'copy' && (
            <p>
              First copy{' '}
              {t.first.outcome.attempt_accuracy === null
                ? 'not scored'
                : `${Math.round(t.first.outcome.attempt_accuracy * 100)}%`}{' '}
              · final copy{' '}
              {o.final_accuracy === null ? 'not scored' : `${Math.round(o.final_accuracy * 100)}%`}
            </p>
          )}
          <p>
            Submissions: {a.attempts.map((answer) => answer || '(unknown)').join(' → ') || 'None'}
          </p>
          <p>Accepted answers: {o.accepted.join(' · ')}</p>
        </>
      )}
      {listening && (
        <p>
          Self-report:{' '}
          {a.self_report === 'understood'
            ? 'I followed it'
            : a.self_report === 'partly'
              ? 'I followed some of it'
              : a.self_report === 'missed'
                ? 'Not yet'
                : 'Not recorded'}
          . No accuracy score is assigned to listening reflection.
        </p>
      )}
      <button className="button secondary" onClick={onReview}>
        <RotateCcw size={15} />
        {listening ? 'Listen again' : 'Review this material'}
      </button>
    </div>
  );
}
