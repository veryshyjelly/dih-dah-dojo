import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Cloud,
  Ear,
  Eye,
  Headphones,
  HelpCircle,
  Keyboard,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Target,
  Volume2,
} from 'lucide-react';
import { audio } from './audio';
import type { EngineClient } from './engine-client';
import { LanguageStore, type Entry } from './language-store';
import type { Snapshot } from './types';
import { SYMBOLS } from './types';
import type {
  MessageActivity,
  MessageCatalog,
  MessageFamily,
  MessageGeneration,
  MessageItem,
  MessageOutcome,
  MessageStage,
  MessageTask,
} from './message-types';
import './message-practice.css';

type Phase = 'ready' | 'respond' | 'feedback' | 'paused';
type Trial = {
  id: string;
  item: MessageItem;
  phase: Phase;
  answer: string;
  attempts: string[];
  revision: number;
  played: boolean;
  started: boolean;
  plays: number;
  replay: boolean;
  revealed: boolean;
  interrupted: boolean;
  review: boolean;
  familiar: boolean;
  selfReport: 'understood' | 'partly' | 'missed' | null;
  created: number;
  result: MessageOutcome | null;
};
type Result = { id: string; first: MessageOutcome; latest: MessageOutcome };
type Props = {
  engine: EngineClient;
  owner: string;
  snapshot: Snapshot;
  input: string;
  onProgress: () => void;
  onSignin: () => void;
  reviewItems?: string[];
};
const tasks: { id: MessageTask; title: string; description: string; icon: typeof Ear }[] = [
  {
    id: 'detail',
    title: 'Keep the meaning',
    description: 'Listen, then recover one detail.',
    icon: MessageCircle,
  },
  {
    id: 'copy',
    title: 'Copy the thought',
    description: 'Type the whole phrase or message.',
    icon: Keyboard,
  },
  {
    id: 'listen',
    title: 'Listen in your head',
    description: 'Reflect on what you followed. Unscored.',
    icon: Ear,
  },
];
const explain = (error: unknown) => (error instanceof Error ? error.message : String(error));
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');
const recordedContent = (entry: Entry) => {
  const outcome = entry.outcome as Partial<MessageOutcome>;
  return entry.activity.kind === 'message' && typeof outcome.content_id === 'string'
    ? outcome.content_id
    : null;
};

export function MessagePractice(props: Props) {
  // The owner key isolates pending UI state when authentication changes.
  return <SavedMessagePractice key={props.owner} {...props} />;
}

function SavedMessagePractice({
  engine,
  owner,
  snapshot,
  input,
  onProgress,
  onSignin,
  reviewItems = [],
}: Props) {
  const [catalog, setCatalog] = useState<MessageCatalog | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [reload, setReload] = useState(0);
  const [stage, setStage] = useState<MessageStage>('phrase');
  const [task, setTask] = useState<MessageTask>('detail');
  const [family, setFamily] = useState<MessageFamily>('mixed');
  const [allSounds, setAllSounds] = useState(false);
  const [c, setC] = useState(Math.max(5, Math.min(60, snapshot.copyingC || 20)));
  const [e, setE] = useState(
    Math.max(1, Math.min(snapshot.copyingC || 20, snapshot.copyingE || 5)),
  );
  const [count, setCount] = useState(5);
  const [preview, setPreview] = useState<MessageGeneration | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [storeReady, setStoreReady] = useState(false);
  const [status, setStatus] = useState('Opening saved activity…');
  const [historyWarning, setHistoryWarning] = useState('');
  const [historyRetrying, setHistoryRetrying] = useState(false);
  const [notice, setNotice] = useState('');
  const [round, setRound] = useState<MessageItem[]>([]);
  const [index, setIndex] = useState(0);
  const [trial, renderTrial] = useState<Trial | null>(null);
  const [done, setDone] = useState(false);
  const [playing, renderPlaying] = useState(false);
  const [busy, renderBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const store = useRef(new LanguageStore(owner, engine));
  const alive = useRef(true),
    generation = useRef(0),
    roundGeneration = useRef(0);
  const trialRef = useRef<Trial | null>(null),
    busyRef = useRef(false),
    playingRef = useRef(false);
  const pendingEvaluation = useRef<string | null>(null),
    pendingSaves = useRef(0);
  const saveFailed = useRef(false),
    resultsRef = useRef<Result[]>([]),
    seen = useRef(new Set<string>());
  const review = useRef(false),
    pace = useRef({ c, e }),
    previewGeneration = useRef(0);
  const answerRef = useRef<HTMLInputElement>(null);
  const handlers = useRef({ pause: () => {}, play: () => {}, finish: () => {}, enter: () => {} });
  const repertoire = allSounds
    ? SYMBOLS
    : [
        ...new Set(
          snapshot.introduced
            .toUpperCase()
            .split('')
            .filter((ch) => SYMBOLS.includes(ch)),
        ),
      ].join('');
  const active = !!trial && !done;

  function setBusy(value: boolean) {
    busyRef.current = value;
    if (alive.current) renderBusy(value);
  }
  function setPlaying(value: boolean) {
    playingRef.current = value;
    if (alive.current) renderPlaying(value);
  }
  function updateTrial(value: Trial | null) {
    trialRef.current = value;
    if (alive.current) renderTrial(value);
  }
  function current(token: number, id?: string) {
    return alive.current && generation.current === token && (!id || trialRef.current?.id === id);
  }
  function config(seed = 1, n = count) {
    return { seed, count: n, stage, task, family, repertoire, c, e: Math.min(c, e) };
  }
  function activity(t: Trial): MessageActivity {
    return {
      version: 1,
      kind: 'message',
      id: `${t.id}-${t.revision}`,
      trial_id: t.id,
      revision: t.revision,
      item: t.item.id,
      sentence: 0,
      input,
      c: pace.current.c,
      e: pace.current.e,
      answer: t.attempts.length ? t.attempts.at(-1)! : null,
      attempts: [...t.attempts],
      replay: t.replay,
      revealed: t.revealed,
      review: t.review,
      familiar: t.familiar,
      interrupted: t.interrupted,
      finished: t.played,
      self_report: t.selfReport,
      created: t.created,
    };
  }
  function mergeSeenFromEntries() {
    for (const entry of store.current.entries) {
      const id = recordedContent(entry);
      if (id) seen.current.add(id);
    }
  }
  function updateHistoryStatus() {
    mergeSeenFromEntries();
    setHistoryWarning(
      owner !== 'guest' && !store.current.remoteReadComplete
        ? store.current.remoteReadError ||
            'Account history is incomplete. Familiarity uses available browser activity.'
        : '',
    );
    if (!pendingSaves.current) setStatus(store.current.status);
  }
  async function retryHistory() {
    setHistoryRetrying(true);
    try {
      await store.current.sync();
      if (alive.current) updateHistoryStatus();
    } catch (error) {
      if (alive.current) setHistoryWarning(explain(error));
    } finally {
      if (alive.current) setHistoryRetrying(false);
    }
  }
  function makeTrial(item: MessageItem): Trial {
    mergeSeenFromEntries();
    return {
      id: crypto.randomUUID(),
      item,
      phase: 'ready',
      answer: '',
      attempts: [],
      revision: 0,
      played: false,
      started: false,
      plays: 0,
      replay: false,
      revealed: false,
      interrupted: false,
      review: review.current,
      familiar: seen.current.has(item.content_id),
      selfReport: null,
      created: Date.now(),
      result: null,
    };
  }
  function persist(value: MessageActivity) {
    pendingSaves.current++;
    if (alive.current) setStatus('Saving this activity…');
    void store.current
      .save(value)
      .catch((error) => {
        saveFailed.current = true;
        if (alive.current) setNotice(explain(error));
      })
      .finally(() => {
        pendingSaves.current--;
        if (alive.current && !pendingSaves.current)
          setStatus(saveFailed.current ? 'Some activity could not be saved' : store.current.status);
      });
  }
  async function evaluate(t: Trial) {
    const value = activity(t),
      acceptedRound = roundGeneration.current;
    pendingEvaluation.current = t.id;
    // Capture LanguageStore's reset generation at acceptance, before awaiting evaluation.
    persist(value);
    try {
      const outcome = await engine.json<MessageOutcome>('message_evaluate', JSON.stringify(value));
      if (!alive.current || roundGeneration.current !== acceptedRound) return;
      if (trialRef.current?.id === t.id)
        updateTrial({
          ...t,
          result: outcome,
          revision: t.revision + 1,
          phase: trialRef.current.phase === 'paused' ? 'paused' : 'feedback',
        });
      const previous = resultsRef.current.find((result) => result.id === t.id);
      resultsRef.current = previous
        ? resultsRef.current.map((result) =>
            result.id === t.id ? { ...result, latest: outcome } : result,
          )
        : [...resultsRef.current, { id: t.id, first: outcome, latest: outcome }];
      setResults(resultsRef.current);
    } finally {
      if (pendingEvaluation.current === t.id) pendingEvaluation.current = null;
      if (alive.current && trialRef.current?.id === t.id) setBusy(false);
    }
  }
  function saveAbandoned(t: Trial | null) {
    if (!t || t.result || t.attempts.length || pendingEvaluation.current === t.id || !t.started)
      return;
    seen.current.add(t.item.content_id);
    persist(activity({ ...t, interrupted: t.interrupted || !t.played }));
  }
  async function begin(asReview = false) {
    if (busyRef.current || !storeReady) return;
    const token = ++generation.current;
    roundGeneration.current++;
    setBusy(true);
    setPlaying(false);
    setNotice('');
    try {
      await audio.stop();
      const items =
        asReview && reviewItems.length
          ? await Promise.all(
              reviewItems.slice(0, 30).map(async (id) => {
                const value: MessageActivity = {
                  version: 1,
                  kind: 'message',
                  id: 'preview-0',
                  trial_id: 'preview',
                  revision: 0,
                  item: id,
                  sentence: 0,
                  input,
                  c,
                  e: Math.min(c, e),
                  answer: null,
                  attempts: [],
                  replay: false,
                  revealed: false,
                  review: true,
                  familiar: true,
                  interrupted: false,
                  finished: false,
                  self_report: null,
                  created: Date.now(),
                };
                return (
                  await engine.json<MessageOutcome>('message_evaluate', JSON.stringify(value))
                ).item;
              }),
            )
          : (
              await engine.json<MessageGeneration>(
                'message_generate',
                JSON.stringify(config(crypto.getRandomValues(new Uint32Array(1))[0])),
              )
            ).items;
      if (!current(token)) return;
      if (!items.length) {
        setNotice(
          'No material fits these sounds and settings. Try a different topic or explicitly include all sounds.',
        );
        return;
      }
      pace.current = { c, e: Math.min(c, e) };
      review.current = asReview;
      resultsRef.current = [];
      setResults([]);
      setRound(items);
      setIndex(0);
      setDone(false);
      updateTrial(makeTrial(items[0]));
    } catch (error) {
      if (current(token)) setNotice(explain(error));
    } finally {
      if (current(token)) setBusy(false);
    }
  }
  async function play() {
    const t = trialRef.current;
    if (!t || busyRef.current || playingRef.current || t.phase === 'paused' || t.revision >= 32)
      return;
    if (!t.result && (t.attempts.length || t.selfReport !== null || t.revealed)) return;
    const token = ++generation.current,
      repeated = t.plays > 0;
    updateTrial({ ...t, plays: t.plays + 1, replay: t.replay || repeated });
    setPlaying(true);
    setNotice('');
    audio.volume = snapshot.volume;
    audio.frequency = snapshot.frequency;
    try {
      const sound = await audio.play(
        {
          text: t.item.audio_text,
          tokens: true,
          c: pace.current.c,
          e: pace.current.e,
          rescue: false,
        },
        () => current(token, t.id),
      );
      if (!current(token, t.id) || !sound.id) return;
      updateTrial({ ...trialRef.current!, started: true });
      seen.current.add(t.item.content_id);
      const interrupted = await sound.finished;
      if (!current(token, t.id)) return;
      setPlaying(false);
      if (interrupted) {
        pause('Playback was interrupted. Resume this example when you are ready.');
        return;
      }
      const next: Trial = {
        ...trialRef.current!,
        played: true,
        phase: trialRef.current!.result ? 'feedback' : 'respond',
      };
      updateTrial(next);
      if (next.result && repeated && next.revision < 32) {
        setBusy(true);
        await evaluate(next);
      }
      answerRef.current?.focus({ preventScroll: true });
    } catch (error) {
      if (current(token, t.id)) {
        setPlaying(false);
        pause();
        setNotice(explain(error));
      }
    }
  }
  async function submit(
    options: {
      answer?: string;
      unknown?: boolean;
      reveal?: boolean;
      report?: 'understood' | 'partly' | 'missed';
    } = {},
  ) {
    const t = trialRef.current;
    if (
      !t ||
      busyRef.current ||
      playingRef.current ||
      t.phase === 'paused' ||
      !t.played ||
      t.revision >= 32
    )
      return;
    const answer = options.unknown ? '' : (options.answer ?? t.answer).trim();
    if (t.item.task !== 'listen' && !options.unknown && !options.reveal && !answer) return;
    if (t.item.task === 'listen' && options.report === undefined && !options.reveal) return;
    if (
      t.item.task !== 'listen' &&
      !options.reveal &&
      [...answer].some((ch) => !/\s/.test(ch) && !SYMBOLS.includes(ch.toUpperCase()))
    ) {
      setNotice('Use letters, numbers, spaces or supported Morse punctuation: . , ? / = +');
      return;
    }
    const token = generation.current;
    const next: Trial = {
      ...t,
      answer,
      attempts:
        t.item.task === 'listen' || options.reveal
          ? [...t.attempts]
          : [...(t.attempts.length ? t.attempts : t.result ? [''] : []), answer],
      revealed: t.revealed || !!options.reveal || !!t.result,
      selfReport: t.item.task === 'listen' ? (options.report ?? t.selfReport) : null,
    };
    updateTrial(next);
    setBusy(true);
    setNotice('');
    try {
      await evaluate(next);
    } catch (error) {
      if (current(token, t.id)) setNotice(explain(error));
    } finally {
      if (current(token, t.id) && pendingEvaluation.current !== t.id) setBusy(false);
    }
  }
  async function retryFeedback() {
    const t = trialRef.current;
    if (!t || t.result || busyRef.current || playingRef.current || t.phase === 'paused') return;
    setBusy(true);
    setNotice('');
    try {
      await evaluate(t);
    } catch (error) {
      if (alive.current && trialRef.current?.id === t.id) setNotice(explain(error));
    } finally {
      if (alive.current && trialRef.current?.id === t.id) setBusy(false);
    }
  }
  function pause(reason = 'Take a breath. Resume when you are ready.') {
    generation.current++;
    setPlaying(false);
    setBusy(pendingEvaluation.current === trialRef.current?.id);
    void audio.stop();
    const t = trialRef.current;
    if (!t || t.phase === 'paused') return;
    updateTrial({
      ...t,
      phase: 'paused',
      interrupted:
        t.interrupted || (t.started && !t.result && !t.attempts.length && t.selfReport === null),
    });
    setNotice(reason);
  }
  function resume() {
    const t = trialRef.current;
    if (!t) return;
    updateTrial({ ...t, phase: t.result ? 'feedback' : t.played ? 'respond' : 'ready' });
    setNotice(
      t.interrupted
        ? 'This interrupted presentation stays separate from independent answers.'
        : 'Ready when you are.',
    );
  }
  function advance() {
    if (!trialRef.current?.result || busyRef.current || playingRef.current) return;
    generation.current++;
    void audio.stop();
    setNotice('');
    if (index + 1 >= round.length) {
      updateTrial(null);
      setDone(true);
      return;
    }
    setIndex(index + 1);
    updateTrial(makeTrial(round[index + 1]));
  }
  function finish() {
    saveAbandoned(trialRef.current);
    generation.current++;
    setPlaying(false);
    setBusy(false);
    void audio.stop();
    updateTrial(null);
    setDone(true);
    setNotice(
      'Accepted responses are saved. Listening without a response is exposure, not an accuracy score.',
    );
  }
  handlers.current = {
    pause: () => (trialRef.current?.phase === 'paused' ? resume() : pause()),
    play: () => void play(),
    finish,
    enter: () => {
      const t = trialRef.current;
      if (!t || t.item.task === 'listen') return;
      if (!t.result && (t.attempts.length || t.revealed)) {
        void retryFeedback();
        return;
      }
      if (t.result && t.answer.trim() === (t.attempts.at(-1) ?? '')) advance();
      else void submit();
    },
  };

  useEffect(() => {
    alive.current = true;
    let live = true;
    setCatalogError('');
    void engine
      .json<MessageCatalog>('message_catalog')
      .then((value) => {
        if (live) setCatalog(value);
      })
      .catch((error) => {
        if (live) setCatalogError(explain(error));
      });
    void store.current
      .open()
      .then(() => {
        if (!live) return;
        updateHistoryStatus();
        setStoreReady(true);
      })
      .catch((error) => {
        if (live) {
          setStatus(explain(error));
          if (owner !== 'guest')
            setHistoryWarning(
              'Account history could not load. Familiarity uses available browser activity.',
            );
          setStoreReady(true);
        }
      });
    const online = () =>
      void store.current
        .sync()
        .then(() => {
          if (live) updateHistoryStatus();
        })
        .catch((error) => {
          if (live) setHistoryWarning(explain(error));
        });
    const cancel = () => {
      generation.current++;
      setPlaying(false);
      setBusy(false);
      void audio.stop();
    };
    const interrupt = () => {
      if (trialRef.current?.phase !== 'paused' && trialRef.current) pause();
      else if (!trialRef.current) cancel();
    };
    const hide = () => {
      if (document.hidden) interrupt();
    };
    const key = (event: KeyboardEvent) => {
      if (
        !trialRef.current ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        document.querySelector('dialog[open]')
      )
        return;
      if (!['F5', 'F6', 'Escape', 'Enter'].includes(event.key)) return;
      if (event.key === 'Enter' && (event.target as HTMLElement)?.closest('button,summary,select'))
        return;
      event.preventDefault();
      if (event.repeat) return;
      if (event.key === 'F5') handlers.current.pause();
      if (event.key === 'F6') handlers.current.play();
      if (event.key === 'Escape') handlers.current.finish();
      if (event.key === 'Enter') handlers.current.enter();
    };
    window.addEventListener('online', online);
    window.addEventListener('keydown', key);
    window.addEventListener('dojo-navigation', cancel);
    window.addEventListener('dojo-help-opening', interrupt);
    window.addEventListener('dojo-audio-suspended', interrupt);
    window.addEventListener('dojo-audio-fault', interrupt);
    document.addEventListener('visibilitychange', hide);
    return () => {
      saveAbandoned(trialRef.current);
      live = false;
      alive.current = false;
      cancel();
      window.removeEventListener('online', online);
      window.removeEventListener('keydown', key);
      window.removeEventListener('dojo-navigation', cancel);
      window.removeEventListener('dojo-help-opening', interrupt);
      window.removeEventListener('dojo-audio-suspended', interrupt);
      window.removeEventListener('dojo-audio-fault', interrupt);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [engine, owner, reload]);

  useEffect(() => {
    if (!catalog) return;
    const token = ++previewGeneration.current;
    setPreviewLoading(true);
    setPreviewError('');
    const timer = setTimeout(() => {
      void engine
        .json<MessageGeneration>('message_generate', JSON.stringify(config(1, 1)))
        .then((value) => {
          if (alive.current && token === previewGeneration.current) {
            setPreview(value);
            setPreviewLoading(false);
          }
        })
        .catch((error) => {
          if (alive.current && token === previewGeneration.current) {
            setPreview(null);
            setPreviewLoading(false);
            setPreviewError(explain(error));
          }
        });
    }, 100);
    return () => {
      clearTimeout(timer);
      previewGeneration.current++;
    };
  }, [engine, catalog, stage, task, family, repertoire, c, e]);

  const selectedTask = tasks.find((value) => value.id === task)!;
  const disabled = busy || playing || trial?.phase === 'paused';
  const captured =
    !!trial &&
    !trial.result &&
    (trial.attempts.length > 0 || trial.selfReport !== null || trial.revealed);
  const independent = results.filter((value) => value.first.eligible);
  const exact = independent.filter((value) => value.first.first_exact).length;
  const listened = results.filter((value) => value.latest.exposure).length;
  const TaskIcon = tasks.find((value) => value.id === trial?.item.task)?.icon ?? Headphones;

  return (
    <section className="message-practice" aria-label="Phrases and messages practice">
      {!active && !done && (
        <>
          <header className="message-page-heading">
            <span className="eyebrow">
              <MessageCircle size={17} /> WORDS, CONNECTED
            </span>
            <h1>
              A small thought.
              <br />
              <em>A little more meaning.</em>
            </h1>
            <p>
              Let familiar sounds become a phrase. Keep listening, then discover what stayed with
              you.
            </p>
          </header>
          {owner === 'guest' && (
            <aside className="message-signin" aria-label="Save connected practice with an account">
              <Cloud size={24} />
              <div>
                <h2>Keep these moments with you.</h2>
                <p>
                  Sign in to sync across devices. Guest activity stays in this browser and isn’t
                  automatically added to an account.
                </p>
              </div>
              <button className="button secondary" onClick={onSignin}>
                Sign in to sync progress <ArrowUpRight size={17} />
              </button>
            </aside>
          )}
          {!!historyWarning && (
            <aside className="message-history-warning" role="status">
              <Cloud size={21} />
              <div>
                <strong>Some account history is unavailable.</strong>
                <p>
                  {historyWarning} You can practise with the activity available in this browser;
                  new-material labels are limited to that history.
                </p>
              </div>
              <button
                className="button secondary"
                disabled={historyRetrying}
                onClick={() => void retryHistory()}
              >
                <RotateCcw size={16} />
                {historyRetrying ? 'Retrying…' : 'Retry account history'}
              </button>
            </aside>
          )}
          {catalogError ? (
            <div className="message-error" role="alert">
              <h2>The practice material could not load.</h2>
              <p>{catalogError}</p>
              <button className="button secondary" onClick={() => setReload((value) => value + 1)}>
                <RotateCcw size={17} />
                Try again
              </button>
            </div>
          ) : !catalog ? (
            <p role="status">Preparing the material…</p>
          ) : (
            <div className="message-setup-layout">
              <div className="message-setup-main">
                <div
                  className="message-stage-control"
                  role="group"
                  aria-label="Connected listening stage"
                >
                  <button
                    className={stage === 'phrase' ? 'selected' : ''}
                    aria-pressed={stage === 'phrase'}
                    onClick={() => setStage('phrase')}
                  >
                    <BookOpen size={22} />
                    <span>
                      <strong>Short phrases</strong>
                      <small>A few words, held together.</small>
                    </span>
                    {stage === 'phrase' && <Check size={17} />}
                  </button>
                  <button
                    className={stage === 'message' ? 'selected' : ''}
                    aria-pressed={stage === 'message'}
                    onClick={() => setStage('message')}
                  >
                    <MessageCircle size={22} />
                    <span>
                      <strong>Short messages</strong>
                      <small>A thought with more to follow.</small>
                    </span>
                    {stage === 'message' && <Check size={17} />}
                  </button>
                </div>
                <div className="message-section-heading">
                  <span>
                    <Headphones size={18} />
                    What would you like to practise?
                  </span>
                </div>
                <div
                  className="message-task-grid"
                  role="group"
                  aria-label="Connected listening task"
                >
                  {tasks.map((value) => {
                    const Icon = value.icon;
                    return (
                      <button
                        key={value.id}
                        className={task === value.id ? 'selected' : ''}
                        aria-pressed={task === value.id}
                        onClick={() => setTask(value.id)}
                      >
                        <span>
                          <Icon size={23} />
                          {task === value.id && <Check size={16} />}
                        </span>
                        <strong>{value.title}</strong>
                        <small>{value.description}</small>
                      </button>
                    );
                  })}
                </div>
                <section className="message-settings" aria-label="Connected practice settings">
                  <div className="message-section-heading">
                    <span>
                      <SlidersHorizontal size={18} />
                      Make a little room to listen.
                    </span>
                  </div>
                  <div className="message-field-grid">
                    <label>
                      Character WPM
                      <input
                        type="number"
                        min="5"
                        max="60"
                        value={c}
                        onChange={(event) => {
                          const n = Math.max(5, Math.min(60, Number(event.target.value) || 5));
                          setC(n);
                          setE(Math.min(e, n));
                        }}
                      />
                    </label>
                    <label>
                      Effective WPM
                      <input
                        type="number"
                        min="1"
                        max={c}
                        value={e}
                        onChange={(event) =>
                          setE(Math.max(1, Math.min(c, Number(event.target.value) || 1)))
                        }
                      />
                    </label>
                    <label>
                      Examples in this round
                      <select
                        value={count}
                        onChange={(event) => setCount(Number(event.target.value))}
                      >
                        {[5, 10, 20].map((n) => (
                          <option key={n} value={n}>
                            {n} examples
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Topic
                      <select
                        value={family}
                        onChange={(event) => setFamily(event.target.value as MessageFamily)}
                      >
                        {catalog.families.map((value) => (
                          <option key={value.id} value={value.id}>
                            {value.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="message-repertoire">
                    <div>
                      <h3>
                        <Target size={17} />
                        Sounds for this round
                      </h3>
                      <p>
                        {allSounds
                          ? 'All supported sounds are included by your choice.'
                          : 'Use only the sounds introduced in your guided practice.'}
                      </p>
                    </div>
                    <div
                      className="message-repertoire-actions"
                      role="group"
                      aria-label="Connected practice sounds"
                    >
                      <button
                        className={!allSounds ? 'selected' : ''}
                        aria-pressed={!allSounds}
                        onClick={() => setAllSounds(false)}
                      >
                        Introduced sounds
                      </button>
                      <button
                        className={allSounds ? 'selected' : ''}
                        aria-pressed={allSounds}
                        onClick={() => setAllSounds(true)}
                      >
                        Include all sounds
                      </button>
                    </div>
                    <p className="message-sounds">{repertoire || 'No sounds introduced yet'}</p>
                  </div>
                  <div className="message-availability" role="status">
                    {previewLoading ? (
                      <p>Checking material for these settings…</p>
                    ) : previewError ? (
                      <p>{previewError}</p>
                    ) : !preview?.items.length ? (
                      <>
                        <strong>No material fits these sounds yet.</strong>
                        <p>
                          {preview?.reason ||
                            'Continue sound practice, choose another topic, or explicitly include all sounds for this activity.'}
                        </p>
                      </>
                    ) : (
                      <p>
                        <Check size={16} />
                        Material is ready. Your round uses up to{' '}
                        {Math.min(count, preview.available)} distinct examples.
                      </p>
                    )}
                  </div>
                  <div className="message-start-row">
                    <div>
                      <strong>{selectedTask.title}</strong>
                      <small>No timer. The next example waits for you.</small>
                    </div>
                    <button
                      className="button"
                      disabled={busy || !storeReady || previewLoading || !preview?.items.length}
                      onClick={() => void begin()}
                    >
                      Start connected round <ArrowRight size={18} />
                    </button>
                  </div>
                  {!!reviewItems.length && (
                    <button
                      className="message-text-button"
                      disabled={busy || !storeReady}
                      onClick={() => void begin(true)}
                    >
                      <RotateCcw size={16} />
                      Review selected material ({reviewItems.length})
                    </button>
                  )}
                </section>
              </div>
              <aside className="message-learning-note">
                <span className="message-icon">
                  <Ear size={27} />
                </span>
                <span className="eyebrow">ONE THOUGHT AT A TIME</span>
                <h2>
                  Hear the words.
                  <br />
                  Hold the meaning.
                </h2>
                <p>
                  For detail recall, the question appears after the audio. You are practising what
                  stays with you, including memory.
                </p>
                <div className="message-note-rule" />
                <p>
                  Copying, recalling a detail and reflecting on listening have separate progress. A
                  self-report is never an accuracy score.
                </p>
                <button className="message-text-button" onClick={onProgress}>
                  Your connected progress <ArrowUpRight size={16} />
                </button>
              </aside>
            </div>
          )}
        </>
      )}

      {active && trial && (
        <div className="message-session">
          <div className="message-session-bar">
            <span>
              <TaskIcon size={17} />
              {trial.item.stage === 'phrase' ? 'A SHORT PHRASE' : 'A SHORT MESSAGE'}
            </span>
            <span>
              {index + 1} / {round.length}
            </span>
            <button className="message-text-button" onClick={finish}>
              <Square size={15} />
              Finish round <kbd>Esc</kbd>
            </button>
          </div>
          <section className="message-focus-card">
            <div className="message-focus-top">
              <span className={`message-state ${playing ? 'playing' : ''}`} role="status">
                {trial.phase === 'paused'
                  ? 'Paused'
                  : playing
                    ? 'Listening'
                    : trial.result
                      ? 'Activity saved'
                      : trial.played
                        ? 'Your turn'
                        : 'Ready when you are'}
              </span>
              <button
                className="message-text-button"
                disabled={busy && trial.phase !== 'paused'}
                onClick={() => (trial.phase === 'paused' ? resume() : pause())}
              >
                {trial.phase === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                {trial.phase === 'paused' ? 'Resume' : 'Pause'}
                <kbd>F5</kbd>
              </button>
            </div>
            <div className="message-presentation-meta">
              <span>
                {trial.familiar ? 'Already in available history' : 'New in available history'}
              </span>
              <span>
                {trial.item.word_count} words · about {Math.max(1, Math.ceil(trial.item.seconds))}{' '}
                sec of signal
              </span>
            </div>
            {trial.phase === 'paused' ? (
              <div className="message-pause">
                <span className="message-icon">
                  <Pause size={27} />
                </span>
                <h2>A little room to breathe.</h2>
                <p>Your example is kept in place.</p>
                <button className="button" onClick={resume}>
                  <Play size={17} />
                  Resume practice
                </button>
              </div>
            ) : (
              <>
                {!trial.result && (
                  <div className="message-listening-heading">
                    {!trial.played && (
                      <span className="message-icon">
                        <TaskIcon size={27} />
                      </span>
                    )}
                    <h2
                      className={
                        trial.played && trial.item.task === 'detail'
                          ? 'message-detail-question'
                          : undefined
                      }
                    >
                      {!trial.played
                        ? 'Let the thought come through.'
                        : trial.item.task === 'detail'
                          ? trial.item.question
                          : trial.item.task === 'copy'
                            ? 'Keep the whole thought.'
                            : 'How much did you follow?'}
                    </h2>
                    <p>
                      {!trial.played
                        ? 'Listen as a whole. There is no need to get ahead of the sound.'
                        : trial.item.task === 'listen'
                          ? 'This is your reflection, without an accuracy score.'
                          : trial.item.task === 'detail'
                            ? 'Answer the detail from what you heard.'
                            : 'Type what you heard, then check your copy.'}
                    </p>
                  </div>
                )}
                {trial.result && (
                  <div className="message-feedback" aria-label="Connected practice feedback">
                    <span className="eyebrow">
                      {trial.item.task === 'listen'
                        ? 'A MOMENT TO REFLECT'
                        : trial.result.first_exact
                          ? 'A THOUGHT, RECEIVED.'
                          : 'A THOUGHT TO COME BACK TO.'}
                    </span>
                    {trial.item.task !== 'listen' && (
                      <div className="message-answer-comparison">
                        <div>
                          <span>Your first {trial.item.task === 'copy' ? 'copy' : 'answer'}</span>
                          <strong>{trial.attempts[0] || 'No answer'}</strong>
                        </div>
                        <ArrowRight size={22} />
                        <div>
                          <span>
                            {trial.item.task === 'copy' ? 'The transmission' : 'The detail'}
                          </span>
                          <strong>{trial.result.expected}</strong>
                        </div>
                      </div>
                    )}
                    {trial.item.task === 'detail' && (
                      <p className="message-feedback-question">{trial.item.question}</p>
                    )}
                    <div className="message-disclosed-text">
                      <BookOpen size={19} />
                      <p>{trial.item.text}</p>
                    </div>
                    {trial.item.task === 'listen' ? (
                      <p className="message-listening-report">
                        {trial.selfReport === null
                          ? 'Listened · no self-report'
                          : trial.selfReport === 'understood'
                            ? 'You reported following it.'
                            : trial.selfReport === 'partly'
                              ? 'You reported following part of it.'
                              : 'You reported missing it this time.'}{' '}
                        No accuracy score is assigned.
                      </p>
                    ) : (
                      <div className="message-feedback-badges">
                        <span>
                          {trial.result.first_exact === null
                            ? 'No first answer'
                            : trial.result.first_exact
                              ? 'First answer exact'
                              : 'First answer missed'}
                        </span>
                        {trial.attempts.length > 1 && (
                          <span>{trial.result.final_exact ? 'Repair exact' : 'Repair saved'}</span>
                        )}
                        {trial.item.task === 'copy' && trial.result.attempt_accuracy !== null && (
                          <span>
                            First copy {Math.round(trial.result.attempt_accuracy * 100)}% · Final{' '}
                            {Math.round((trial.result.final_accuracy ?? 0) * 100)}%
                          </span>
                        )}
                      </div>
                    )}
                    <div className="message-assistance-labels">
                      {[
                        trial.replay && 'Replay · assisted',
                        trial.revealed && 'Answer disclosed',
                        trial.review && 'Review',
                        trial.familiar && 'Familiar in this history',
                        trial.interrupted && 'Interrupted',
                      ]
                        .filter(Boolean)
                        .map((label) => (
                          <span key={String(label)}>{label}</span>
                        ))}
                    </div>
                  </div>
                )}
                <button
                  className="button secondary message-play"
                  disabled={disabled || captured || trial.revision >= 32}
                  onClick={() => void play()}
                >
                  {playing ? (
                    <Volume2 size={17} />
                  ) : trial.plays ? (
                    <RotateCcw size={17} />
                  ) : (
                    <Play size={17} />
                  )}
                  {playing ? 'Listening…' : trial.plays ? 'Replay example' : 'Play example'}
                  <kbd>F6</kbd>
                </button>
                {captured && (
                  <div className="message-captured" role="status">
                    <span>
                      {trial.item.task === 'listen'
                        ? 'Reflection captured'
                        : 'Your answer, captured'}
                    </span>
                    <strong>
                      {trial.item.task === 'listen'
                        ? trial.selfReport || 'Listened'
                        : trial.attempts.at(-1) ||
                          (trial.revealed ? 'Answer requested' : 'No answer')}
                    </strong>
                    {busy ? (
                      <small>Preparing your feedback…</small>
                    ) : (
                      <button className="button secondary" onClick={() => void retryFeedback()}>
                        <RotateCcw size={16} />
                        Retry feedback
                      </button>
                    )}
                  </div>
                )}
                {trial.played && !captured && (
                  <div className="message-answer-area">
                    {trial.item.task === 'listen' ? (
                      !trial.result && (
                        <div
                          className="message-self-report"
                          role="group"
                          aria-label="Listening reflection"
                        >
                          <button
                            className="button"
                            disabled={disabled}
                            onClick={() => void submit({ report: 'understood' })}
                          >
                            <Check size={17} />I followed it
                          </button>
                          <button
                            className="button secondary"
                            disabled={disabled}
                            onClick={() => void submit({ report: 'partly' })}
                          >
                            Part of it
                          </button>
                          <button
                            className="button secondary"
                            disabled={disabled}
                            onClick={() => void submit({ report: 'missed' })}
                          >
                            <RotateCcw size={17} />I missed it
                          </button>
                        </div>
                      )
                    ) : (
                      <>
                        <label htmlFor="message-answer">
                          {trial.result
                            ? 'Try your answer again'
                            : trial.item.task === 'copy'
                              ? 'Your received copy'
                              : 'Your message detail'}
                        </label>
                        <div className="message-answer-row">
                          <input
                            id="message-answer"
                            ref={answerRef}
                            value={trial.answer}
                            maxLength={512}
                            spellCheck={false}
                            autoComplete="off"
                            autoCapitalize="characters"
                            disabled={disabled || trial.revision >= 32}
                            placeholder={
                              trial.item.task === 'copy'
                                ? 'Type the whole thought…'
                                : 'Type the detail you remember…'
                            }
                            onChange={(event) =>
                              updateTrial({
                                ...trialRef.current!,
                                answer: event.target.value.toUpperCase(),
                              })
                            }
                          />
                          <button
                            className="button"
                            disabled={disabled || !trial.answer.trim() || trial.revision >= 32}
                            onClick={() => void submit()}
                          >
                            {trial.result ? 'Check repair' : 'Check answer'}
                            <Check size={16} />
                          </button>
                        </div>
                        {trial.item.task === 'detail' && !!trial.item.choices.length && (
                          <div
                            className="message-detail-choices"
                            role="group"
                            aria-label="Message detail choices"
                          >
                            {trial.item.choices.map((choice) => (
                              <button
                                key={choice.id}
                                disabled={disabled || trial.revision >= 32}
                                onClick={() => void submit({ answer: choice.id })}
                              >
                                {choice.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {!trial.result && (
                          <div className="message-answer-actions">
                            <button
                              className="message-text-button"
                              disabled={disabled}
                              onClick={() => void submit({ unknown: true })}
                            >
                              <HelpCircle size={16} />I don’t know
                            </button>
                            <button
                              className="message-text-button"
                              disabled={disabled}
                              onClick={() => void submit({ reveal: true })}
                            >
                              <Eye size={16} />
                              Reveal answer
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {trial.result && (
                  <div className="message-next-row">
                    <small>
                      {trial.item.task === 'listen'
                        ? 'Reflection stays separate from objective results.'
                        : 'First answers and repaired copies stay separate.'}
                    </small>
                    <button className="button" disabled={disabled} onClick={advance}>
                      {index + 1 === round.length ? 'See round summary' : 'Next example'}
                      <ArrowRight size={18} />
                    </button>
                  </div>
                )}
              </>
            )}
            <div className="message-console-strip">
              <span>
                {pace.current.c} / {pace.current.e} WPM
              </span>
              <span>Timing estimated</span>
              <span>{input === 'touch' ? 'Touch' : 'Keyboard'} · No timer</span>
            </div>
          </section>
          <p className="message-key-hints">
            F5 pause · F6 replay · Enter check / next · Esc finish
          </p>
        </div>
      )}

      {done && (
        <section className="message-summary" aria-label="Connected round summary">
          <span className="message-icon">
            <MessageCircle size={29} />
          </span>
          <span className="eyebrow">A LITTLE MORE CONNECTED</span>
          <h1>One thought at a time.</h1>
          <p>Keep the first answers. Give the difficult parts another listen.</p>
          <div className="message-summary-stats">
            <div>
              <strong>{independent.length}</strong>
              <span>independent objective answers</span>
            </div>
            <div>
              <strong>{pct(exact, independent.length)}</strong>
              <span>first answers exact</span>
            </div>
            <div>
              <strong>{listened}</strong>
              <span>completed listening activities</span>
            </div>
          </div>
          <p className="message-summary-note">
            Listening reports, familiar material, replays and interruptions keep their own labels in
            progress. They do not raise your guided training targets.
          </p>
          <div className="message-summary-actions">
            <button
              className="button"
              disabled={!!pendingEvaluation.current}
              onClick={() => {
                roundGeneration.current++;
                setDone(false);
                setRound([]);
                setNotice('');
              }}
            >
              <RotateCcw size={17} />
              Choose another round
            </button>
            <button className="button secondary" onClick={onProgress}>
              View connected progress <ArrowUpRight size={17} />
            </button>
          </div>
        </section>
      )}
      {!!notice && (
        <p className="message-notice" role="status">
          {notice}
        </p>
      )}
      <footer className="message-footer">
        <span>
          <i />
          {status}
        </span>
        <p>
          Connected listening has its own evidence. Familiarity describes available saved history,
          not everything you have ever heard.
        </p>
      </footer>
    </section>
  );
}
