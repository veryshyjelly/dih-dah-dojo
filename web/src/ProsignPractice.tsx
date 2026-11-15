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
  MessageCircle,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Target,
  Volume2,
} from 'lucide-react';
import type { EngineClient } from './engine-client';
import type { Snapshot } from './types';
import { audio } from './audio';
import { LanguageStore } from './language-store';
import type {
  ProsignActivity,
  ProsignCatalog,
  ProsignItem,
  ProsignMode,
  ProsignOutcome,
  ProsignSignal,
} from './prosign-types';
import './prosign-practice.css';

type Phase = 'ready' | 'respond' | 'feedback' | 'paused';
type Trial = {
  id: string;
  item: ProsignItem;
  phase: Phase;
  answer: string;
  attempts: string[];
  revision: number;
  played: boolean;
  plays: number;
  replay: boolean;
  revealed: boolean;
  interrupted: boolean;
  review: boolean;
  endedAt: number | null;
  latency: number | null;
  created: number;
  result: ProsignOutcome | null;
};
type Result = { id: string; first: ProsignOutcome; latest: ProsignOutcome };
const exercises: { id: ProsignMode; title: string; note: string; icon: typeof Ear }[] = [
  {
    id: 'recognition',
    title: 'Hear the signal',
    note: 'One joined sound. Name the prosign.',
    icon: Ear,
  },
  {
    id: 'meaning',
    title: 'Know what it means',
    note: 'Listen, then choose its purpose.',
    icon: MessageCircle,
  },
  {
    id: 'context',
    title: 'Use it in a contact',
    note: 'Read the moment. Choose the signal.',
    icon: Radio,
  },
];
const starter = ['BT', 'AR', 'SK', 'AS'];
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const percent = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');

export function ProsignPractice({
  engine,
  owner,
  snapshot,
  input,
  onProgress,
  onSignin,
  reviewItems = [],
}: {
  engine: EngineClient;
  owner: string;
  snapshot: Snapshot;
  input: string;
  onProgress: () => void;
  onSignin: () => void;
  reviewItems?: string[];
}) {
  const [catalog, setCatalog] = useState<ProsignCatalog | null>(null);
  const [mode, setMode] = useState<ProsignMode>('recognition');
  const [selection, setSelection] = useState(starter);
  const [c, setC] = useState(Math.max(12, snapshot.copyingC || 20));
  const [e, setE] = useState(Math.min(snapshot.copyingC || 20, snapshot.copyingE || 5));
  const [count, setCount] = useState(10);
  const [round, setRound] = useState<ProsignItem[]>([]);
  const [index, setIndex] = useState(0);
  const [trial, renderTrial] = useState<Trial | null>(null);
  const [done, setDone] = useState(false);
  const [playing, renderPlaying] = useState(false);
  const [busy, renderBusy] = useState(false);
  const [referencePlaying, setReferencePlaying] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(
    owner === 'guest' ? 'Sign in to save your progress' : 'Opening your progress…',
  );
  const [results, setResults] = useState<Result[]>([]);
  const alive = useRef(true);
  const generation = useRef(0);
  const roundGeneration = useRef(0);
  const busyRef = useRef(false);
  const playingRef = useRef(false);
  const trialRef = useRef<Trial | null>(null);
  const store = useRef(new LanguageStore(owner, engine));
  const pace = useRef({ c, e });
  const isReview = useRef(false);
  const pendingSaves = useRef(0);
  const pendingEvaluation = useRef<string | null>(null);
  const saveFailed = useRef(false);
  const resultsRef = useRef<Result[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const handlers = useRef({ pause: () => {}, play: () => {}, finish: () => {}, enter: () => {} });
  const active = trial !== null && !done;

  function updateTrial(value: Trial | null) {
    trialRef.current = value;
    if (alive.current) renderTrial(value);
  }
  function setBusy(value: boolean) {
    busyRef.current = value;
    if (alive.current) renderBusy(value);
  }
  function setPlaying(value: boolean) {
    playingRef.current = value;
    if (alive.current) renderPlaying(value);
  }
  function current(token: number, id?: string) {
    return alive.current && token === generation.current && (!id || trialRef.current?.id === id);
  }
  function activity(t: Trial): ProsignActivity {
    return {
      version: 1,
      kind: 'prosign',
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
      interrupted: t.interrupted,
      finished: t.played,
      self_report: null,
      created: t.created,
      latency_ms: t.latency,
    };
  }
  function newTrial(item: ProsignItem): Trial {
    const context = item.mode === 'context';
    return {
      id: crypto.randomUUID(),
      item,
      phase: context ? 'respond' : 'ready',
      answer: '',
      attempts: [],
      revision: 0,
      played: context,
      plays: 0,
      replay: false,
      revealed: false,
      interrupted: false,
      review: isReview.current,
      endedAt: context ? performance.now() : null,
      latency: null,
      created: Date.now(),
      result: null,
    };
  }
  function persist(value: ProsignActivity) {
    pendingSaves.current++;
    if (alive.current) setStatus('Saving your answer…');
    void store.current
      .save(value)
      .catch((error) => {
        saveFailed.current = true;
        if (alive.current) setMessage(errorText(error));
      })
      .finally(() => {
        pendingSaves.current--;
        if (alive.current && pendingSaves.current === 0)
          setStatus(saveFailed.current ? 'Some answers could not be saved' : store.current.status);
      });
  }
  async function evaluate(t: Trial) {
    const value = activity(t);
    const acceptedRound = roundGeneration.current;
    pendingEvaluation.current = t.id;
    // Start the validated durable write at acceptance, before any worker round trip.
    // LanguageStore captures the reset generation here, even if this page then closes.
    persist(value);
    try {
      const result = await engine.json<ProsignOutcome>('prosign_evaluate', JSON.stringify(value));
      // A pause can change the audio generation while this accepted response is
      // being evaluated. Reconcile the same trial, preserving its paused state.
      if (!alive.current || acceptedRound !== roundGeneration.current) return;
      if (trialRef.current?.id === t.id) {
        const next: Trial = {
          ...t,
          result,
          phase: trialRef.current.phase === 'paused' ? 'paused' : 'feedback',
          revision: t.revision + 1,
        };
        updateTrial(next);
      }
      const previous = resultsRef.current.find((r) => r.id === t.id);
      resultsRef.current = previous
        ? resultsRef.current.map((r) => (r.id === t.id ? { ...r, latest: result } : r))
        : [...resultsRef.current, { id: t.id, first: result, latest: result }];
      setResults(resultsRef.current);
    } finally {
      if (pendingEvaluation.current === t.id) pendingEvaluation.current = null;
      if (alive.current && trialRef.current?.id === t.id) setBusy(false);
    }
  }
  async function begin(review = false) {
    if (owner === 'guest') {
      onSignin();
      return;
    }
    if (busyRef.current) return;
    const token = ++generation.current;
    roundGeneration.current++;
    setBusy(true);
    setPlaying(false);
    setReferencePlaying('');
    setMessage('');
    try {
      await audio.stop();
      const items =
        review && reviewItems.length
          ? await Promise.all(
              reviewItems.slice(0, 30).map(async (id) => {
                const value: ProsignActivity = {
                  version: 1,
                  kind: 'prosign',
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
                  interrupted: false,
                  finished: false,
                  self_report: null,
                  created: Date.now(),
                  latency_ms: null,
                };
                return (
                  await engine.json<ProsignOutcome>('prosign_evaluate', JSON.stringify(value))
                ).item;
              }),
            )
          : await engine.json<ProsignItem[]>(
              'prosign_generate',
              JSON.stringify({
                seed: crypto.getRandomValues(new Uint32Array(1))[0],
                count,
                mode,
                signals: selection,
              }),
            );
      if (!current(token)) return;
      if (!items.length) throw new Error('Choose at least one prosign for this round.');
      pace.current = { c, e: Math.min(c, e) };
      isReview.current = review;
      resultsRef.current = [];
      setResults([]);
      setRound(items);
      setIndex(0);
      setDone(false);
      updateTrial(newTrial(items[0]));
    } catch (error) {
      if (current(token)) setMessage(errorText(error));
    } finally {
      if (current(token)) setBusy(false);
    }
  }
  async function play() {
    const t = trialRef.current;
    if (
      !t ||
      busyRef.current ||
      playingRef.current ||
      t.phase === 'paused' ||
      (t.item.mode === 'context' && !t.result) ||
      t.revision >= 32
    )
      return;
    const token = ++generation.current;
    const repeated = t.plays > 0;
    updateTrial({ ...t, plays: t.plays + 1, replay: t.replay || repeated });
    setPlaying(true);
    setMessage('');
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
      const interrupted = await sound.finished;
      if (!current(token, t.id)) return;
      setPlaying(false);
      if (interrupted) {
        pause('The signal was interrupted. Your answer stays separate.');
        return;
      }
      const next = {
        ...trialRef.current!,
        played: true,
        endedAt: performance.now(),
        phase: trialRef.current!.result ? ('feedback' as const) : ('respond' as const),
      };
      updateTrial(next);
      if (next.result && repeated && next.revision < 32) {
        setBusy(true);
        try {
          await evaluate(next);
        } finally {
          if (current(token, t.id)) setBusy(false);
        }
      }
      inputRef.current?.focus({ preventScroll: true });
    } catch (error) {
      if (current(token, t.id)) {
        setPlaying(false);
        pause();
        setMessage(errorText(error));
      }
    }
  }
  async function submit(options: { answer?: string; unknown?: boolean; reveal?: boolean } = {}) {
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
    const token = generation.current;
    const answer = options.unknown ? '' : (options.answer ?? t.answer).trim();
    if (!options.unknown && !options.reveal && !answer) return;
    const next: Trial = {
      ...t,
      answer,
      attempts: options.reveal
        ? [...t.attempts]
        : [...(t.attempts.length ? t.attempts : t.result ? [''] : []), answer],
      revealed: t.revealed || !!options.reveal || !!t.result,
      latency:
        t.latency ??
        (t.endedAt === null
          ? null
          : Math.max(0, Math.min(3_600_000, performance.now() - t.endedAt))),
    };
    // Capture the submitted value before the worker evaluates it.
    updateTrial(next);
    setBusy(true);
    setMessage('');
    try {
      await evaluate(next);
    } catch (error) {
      if (current(token, t.id)) setMessage(errorText(error));
    } finally {
      if (current(token, t.id)) setBusy(false);
    }
  }
  function pause(reason = 'Take a breath. Resume when you are ready.') {
    generation.current++;
    setPlaying(false);
    setBusy(pendingEvaluation.current === trialRef.current?.id);
    setReferencePlaying('');
    void audio.stop();
    const t = trialRef.current;
    if (!t || t.phase === 'paused') return;
    updateTrial({
      ...t,
      phase: 'paused',
      interrupted: t.interrupted || (!t.result && !t.attempts.length),
    });
    setMessage(reason);
  }
  function resume() {
    const t = trialRef.current;
    if (!t) return;
    const context = t.item.mode === 'context';
    updateTrial({
      ...t,
      phase: t.result ? 'feedback' : context ? 'respond' : 'ready',
      played: !!t.result || context,
    });
    setMessage(
      t.interrupted
        ? 'This interrupted answer is kept separate from independent results.'
        : 'Ready when you are.',
    );
  }
  function advance() {
    if (!trialRef.current?.result || playingRef.current || busyRef.current) return;
    generation.current++;
    void audio.stop();
    if (index + 1 >= round.length) {
      updateTrial(null);
      setDone(true);
      return;
    }
    setIndex(index + 1);
    updateTrial(newTrial(round[index + 1]));
    setMessage('');
  }
  function finish() {
    generation.current++;
    setPlaying(false);
    setBusy(false);
    setReferencePlaying('');
    void audio.stop();
    updateTrial(null);
    setDone(true);
    setMessage('Submitted answers are saved. Unanswered signals are not scored.');
  }
  async function reference(signal: ProsignSignal, spaced = false) {
    if (busyRef.current) return;
    const key = `${signal.id}-${spaced ? 'spaced' : 'joined'}`;
    const stopOnly = referencePlaying === key && playingRef.current;
    const token = ++generation.current;
    setPlaying(false);
    setReferencePlaying('');
    await audio.stop();
    if (!current(token) || stopOnly) return;
    setPlaying(true);
    setReferencePlaying(key);
    setMessage('');
    audio.volume = snapshot.volume;
    audio.frequency = snapshot.frequency;
    try {
      const sound = await audio.play(
        {
          text: spaced ? signal.id : signal.token,
          tokens: !spaced,
          c,
          e: Math.min(c, e),
          rescue: false,
        },
        () => current(token),
      );
      await sound.finished;
    } catch (error) {
      if (current(token)) setMessage(errorText(error));
    } finally {
      if (current(token)) {
        setPlaying(false);
        setReferencePlaying('');
      }
    }
  }
  handlers.current = {
    pause: () => (trialRef.current?.phase === 'paused' ? resume() : pause()),
    play: () => void play(),
    finish,
    enter: () => {
      const t = trialRef.current;
      if (!t) return;
      if (t.result && t.answer.trim() === (t.attempts.at(-1) ?? '')) advance();
      else void submit();
    },
  };
  useEffect(() => {
    alive.current = true;
    let live = true;
    void engine
      .json<ProsignCatalog>('prosign_catalog')
      .then((value) => {
        if (live) setCatalog(value);
      })
      .catch((error) => {
        if (live) setMessage(errorText(error));
      });
    if (owner !== 'guest')
      void store.current
        .open()
        .then(() => {
          if (live && pendingSaves.current === 0) setStatus(store.current.status);
        })
        .catch((error) => {
          if (live) setStatus(errorText(error));
        });
    const online = () => {
      if (owner !== 'guest')
        void store.current
          .sync()
          .then(() => {
            if (live && pendingSaves.current === 0) setStatus(store.current.status);
          })
          .catch((error) => {
            if (live) setMessage(errorText(error));
          });
    };
    const cancel = () => {
      generation.current++;
      setPlaying(false);
      setBusy(false);
      if (alive.current) setReferencePlaying('');
      void audio.stop();
    };
    const interrupt = () => {
      if (trialRef.current && trialRef.current.phase !== 'paused') pause();
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
      if (['F5', 'F6', 'Escape', 'Enter'].includes(event.key)) {
        if (
          event.key === 'Enter' &&
          (event.target as HTMLElement)?.closest('button,summary,select')
        )
          return;
        event.preventDefault();
        if (event.repeat) return;
        if (event.key === 'F5') handlers.current.pause();
        if (event.key === 'F6') handlers.current.play();
        if (event.key === 'Escape') handlers.current.finish();
        if (event.key === 'Enter') handlers.current.enter();
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('online', online);
    window.addEventListener('dojo-navigation', cancel);
    window.addEventListener('dojo-help-opening', interrupt);
    window.addEventListener('dojo-audio-suspended', interrupt);
    window.addEventListener('dojo-audio-fault', interrupt);
    document.addEventListener('visibilitychange', hide);
    return () => {
      live = false;
      alive.current = false;
      cancel();
      window.removeEventListener('keydown', key);
      window.removeEventListener('online', online);
      window.removeEventListener('dojo-navigation', cancel);
      window.removeEventListener('dojo-help-opening', interrupt);
      window.removeEventListener('dojo-audio-suspended', interrupt);
      window.removeEventListener('dojo-audio-fault', interrupt);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [engine, owner]);

  const signals = catalog?.signals ?? [];
  const selectedExercise = exercises.find((value) => value.id === mode)!;
  const ModeIcon = selectedExercise.icon;
  const disabled = busy || playing || trial?.phase === 'paused';
  const independent = results.filter((value) => value.first.eligible);
  const firstExact = independent.filter((value) => value.first.first_exact).length;
  const finalExact = results.filter((value) => value.latest.final_exact).length;
  const disclosed = trial?.result
    ? signals.find((signal) => signal.id === trial.item.signal)
    : null;
  const labelAnswer = (answer: string | null | undefined, item: ProsignItem) =>
    !answer
      ? 'No answer'
      : item.mode === 'meaning'
        ? (item.choices.find((choice) => choice.id === answer)?.label ?? answer)
        : answer;

  return (
    <section className="prosign-practice" aria-label="Prosign training">
      {!active && !done && (
        <>
          <header className="prosign-page-heading">
            <span className="eyebrow">
              <Radio size={17} /> MORE THAN LETTERS
            </span>
            <h1>
              A little signal.
              <br />
              <em>A whole intention.</em>
            </h1>
            <p>
              Separate a thought. Invite a reply. Say goodbye.
              <br />
              Learn the sounds that give a contact its shape.
            </p>
          </header>
          {owner === 'guest' && (
            <div className="prosign-signin" role="region" aria-label="Sign in for prosign practice">
              <span className="prosign-icon">
                <Cloud size={25} />
              </span>
              <div>
                <h2>Let your listening travel.</h2>
                <p>
                  Sign in for practice rounds and progress across devices. The signal library below
                  is open to everyone.
                </p>
              </div>
              <button className="button" onClick={onSignin}>
                Sign in to practice <ArrowUpRight size={17} />
              </button>
            </div>
          )}
          <div className="prosign-setup-layout">
            <div className="prosign-setup-main">
              <div className="prosign-section-heading">
                <span>
                  <Headphones size={18} /> Find your next step.
                </span>
                <small>Three ways to make it familiar.</small>
              </div>
              <div className="prosign-mode-grid" role="group" aria-label="Prosign exercise">
                {exercises.map((value) => {
                  const Icon = value.icon;
                  return (
                    <button
                      key={value.id}
                      className={`prosign-mode-card ${mode === value.id ? 'selected' : ''}`}
                      aria-pressed={mode === value.id}
                      onClick={() => setMode(value.id)}
                    >
                      <span>
                        <Icon size={23} />
                        {mode === value.id && <Check size={16} />}
                      </span>
                      <strong>{value.title}</strong>
                      <small>{value.note}</small>
                    </button>
                  );
                })}
              </div>
              <section className="prosign-config-card" aria-label="Prosign round settings">
                <div className="prosign-section-heading">
                  <span>
                    <SlidersHorizontal size={18} /> Your listening pace
                  </span>
                  <small>Sound speed / space to think</small>
                </div>
                <div className="prosign-pace-fields">
                  <label>
                    Character WPM
                    <input
                      type="number"
                      min="5"
                      max="60"
                      value={c}
                      onChange={(event) => {
                        const value = Math.max(5, Math.min(60, Number(event.target.value) || 5));
                        setC(value);
                        setE(Math.min(value, e));
                      }}
                    />
                  </label>
                  <label>
                    Effective WPM
                    <input
                      type="number"
                      min="3"
                      max={c}
                      value={e}
                      onChange={(event) =>
                        setE(Math.max(3, Math.min(c, Number(event.target.value) || 3)))
                      }
                    />
                  </label>
                  <label>
                    Signals in this round
                    <select
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    >
                      {[5, 10, 20, 30].map((value) => (
                        <option key={value} value={value}>
                          {value} signals
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="prosign-section-heading">
                  <span>
                    <Target size={18} /> Signals to get to know
                  </span>
                  <button className="prosign-text-button" onClick={() => setSelection(starter)}>
                    Start with four
                  </button>
                </div>
                <div
                  className="prosign-signal-selection"
                  role="group"
                  aria-label="Signals for this round"
                >
                  {signals.map((signal) => (
                    <button
                      key={signal.id}
                      aria-pressed={selection.includes(signal.id)}
                      className={selection.includes(signal.id) ? 'selected' : ''}
                      onClick={() =>
                        setSelection(
                          selection.includes(signal.id)
                            ? selection.filter((id) => id !== signal.id)
                            : [...selection, signal.id],
                        )
                      }
                    >
                      <strong>{signal.token}</strong>
                      <small>{signal.meaning}</small>
                      {signal.convention === 'amateur-variant' && <span>Joined convention</span>}
                    </button>
                  ))}
                </div>
                <div className="prosign-launch">
                  <div>
                    <strong>
                      <ModeIcon size={18} />
                      {selectedExercise.title}
                    </strong>
                    <small>No countdown. Your next signal waits for you.</small>
                  </div>
                  <button
                    className="button"
                    disabled={busy || !catalog || !selection.length}
                    onClick={() => void begin()}
                  >
                    {owner === 'guest' ? 'Sign in to start' : 'Start prosign round'}
                    <ArrowRight size={18} />
                  </button>
                </div>
                {reviewItems.length > 0 && owner !== 'guest' && (
                  <button
                    className="prosign-text-button"
                    disabled={busy}
                    onClick={() => void begin(true)}
                  >
                    <RotateCcw size={14} /> Review selected signals ({reviewItems.length})
                  </button>
                )}
              </section>
            </div>
            <aside className="prosign-listening-note">
              <span className="prosign-icon">
                <WovenSignal />
              </span>
              <span className="eyebrow">ONE UNBROKEN SOUND</span>
              <h2>
                Joined together.
                <br />
                Heard as one.
              </h2>
              <p>
                A prosign joins its letters without the usual letter gap. <code>{'<AR>'}</code> is
                one signal; <code>A</code> then <code>R</code> are two letters.
              </p>
              <div className="prosign-joined-example" aria-hidden="true">
                <span>·−</span>
                <i /> <span>·−·</span>
              </div>
              <small>Angle brackets are a written cue. You will not hear the brackets.</small>
              <hr />
              <p className="prosign-note-detail">
                <code>{'<AR>'}</code> shares its sound with <code>+</code>, and{' '}
                <code>{'<BT>'}</code> with <code>=</code>. Sound alone cannot tell those names
                apart.
              </p>
              {owner !== 'guest' && (
                <button className="prosign-text-button" onClick={onProgress}>
                  Your prosign progress <ArrowUpRight size={16} />
                </button>
              )}
            </aside>
          </div>
          <section className="prosign-library" aria-label="Prosign sound library">
            <div className="prosign-library-heading">
              <div>
                <span className="eyebrow">
                  <BookOpen size={16} /> THE SIGNAL LIBRARY
                </span>
                <h2>Hear how intention sounds.</h2>
                <p>Try the joined signal, then the same letters with their ordinary gap.</p>
              </div>
              <span className="prosign-preview-status" role="status">
                <Volume2 size={15} />
                {referencePlaying ? 'Preview playing' : 'Ready to listen'}
              </span>
            </div>
            <div className="prosign-library-grid">
              {signals.map((signal) => (
                <article className="prosign-reference-card" key={signal.id}>
                  <div className="prosign-reference-top">
                    <span className="prosign-reference-token">{signal.token}</span>
                    <span>
                      {signal.convention === 'amateur-variant'
                        ? 'AMATEUR CONVENTION'
                        : 'JOINED SIGNAL'}
                    </span>
                  </div>
                  <h3>{signal.meaning}</h3>
                  <p>{signal.description}</p>
                  <span
                    className="prosign-reference-pattern"
                    aria-label={`Morse pattern ${signal.pattern}`}
                  >
                    {signal.pattern.replaceAll('.', '·').replaceAll('-', '−')}
                  </span>
                  <div className="prosign-reference-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void reference(signal)}
                    >
                      {referencePlaying === `${signal.id}-joined` ? (
                        <Square size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                      {referencePlaying === `${signal.id}-joined`
                        ? 'Stop preview'
                        : `Hear ${signal.token}`}
                    </button>
                    <button
                      className="prosign-text-button"
                      disabled={busy}
                      aria-label={`Compare spaced ${signal.id.split('').join(' ')}`}
                      onClick={() => void reference(signal, true)}
                    >
                      {referencePlaying === `${signal.id}-spaced`
                        ? 'Stop comparison'
                        : `Compare ${signal.id.split('').join(' ')}`}
                    </button>
                  </div>
                  <div className="prosign-reference-footer">
                    {signal.aliases.length > 0 ? (
                      <small>Same sound: {signal.aliases.join(', ')}</small>
                    ) : (
                      <small>Sent as one signal</small>
                    )}
                    <a href={signal.source} target="_blank" rel="noreferrer">
                      Reference <ArrowUpRight size={12} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
            <div className="prosign-operating-note">
              <HelpCircle size={18} />
              <p>
                <strong>A little operating context.</strong> CQ, DE, TU and Q-codes are separate
                operating abbreviations. KN and BK can be heard both spaced and joined; the library
                labels the joined KN convention explicitly. Formal message handling and everyday
                contacts can use signals differently.
              </p>
            </div>
          </section>
        </>
      )}

      {active && trial && (
        <div className="prosign-round">
          <div className="prosign-round-bar">
            <span className="eyebrow">
              <Headphones size={16} />
              {exercises.find((value) => value.id === trial.item.mode)?.title}
            </span>
            <span>
              {index + 1} / {round.length}
            </span>
            <button className="prosign-text-button" onClick={finish}>
              <Square size={14} />
              Finish round <kbd>Esc</kbd>
            </button>
          </div>
          <div className="prosign-focus-card">
            <div className="prosign-focus-top">
              <span className={`prosign-state ${playing ? 'playing' : ''}`} role="status">
                {trial.phase === 'paused'
                  ? 'Paused'
                  : playing
                    ? 'Listening'
                    : trial.result
                      ? 'Answer saved'
                      : trial.item.mode === 'context'
                        ? 'Your next move'
                        : trial.played
                          ? 'Ready for your answer'
                          : 'Ready when you are'}
              </span>
              <button
                className="prosign-text-button"
                disabled={busy}
                onClick={() => (trial.phase === 'paused' ? resume() : pause())}
              >
                {trial.phase === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                {trial.phase === 'paused' ? 'Resume' : 'Pause'}
                <kbd>F5</kbd>
              </button>
            </div>
            {!trial.result && (
              <>
                <span className="prosign-icon">
                  <ModeIconFor mode={trial.item.mode} />
                </span>
                <h2>
                  {trial.phase === 'paused'
                    ? 'A little room to breathe.'
                    : trial.item.mode === 'context'
                      ? 'What would you send?'
                      : trial.played
                        ? trial.item.mode === 'meaning'
                          ? 'What did it mean?'
                          : 'One sound. Which signal?'
                        : 'Listen to it as a whole.'}
                </h2>
                <p className="prosign-round-prompt">
                  {trial.item.mode === 'context'
                    ? trial.item.prompt
                    : trial.played
                      ? 'Your first answer is the one we learn from.'
                      : 'No need to count. Let the shape settle in.'}
                </p>
              </>
            )}
            {trial.phase === 'paused' ? (
              <button className="button" onClick={resume}>
                <Play size={17} />
                Resume practice
              </button>
            ) : (
              <>
                {trial.result && (
                  <div className="prosign-feedback" aria-live="polite">
                    <span className="eyebrow">
                      {trial.result.first_exact
                        ? 'THAT SOUNDED FAMILIAR.'
                        : 'A SIGNAL TO COME BACK TO.'}
                    </span>
                    <div className="prosign-comparison">
                      <div>
                        <span>Your first answer</span>
                        <strong>{labelAnswer(trial.attempts[0], trial.item)}</strong>
                      </div>
                      <ArrowRight size={23} />
                      <div>
                        <span>{trial.item.mode === 'meaning' ? 'Its meaning' : 'The signal'}</span>
                        <strong>{labelAnswer(trial.result.expected, trial.item)}</strong>
                      </div>
                    </div>
                    {disclosed && (
                      <div className="prosign-feedback-detail">
                        <span className="prosign-reference-token">{disclosed.token}</span>
                        <div>
                          <strong>{disclosed.meaning}</strong>
                          <p>{disclosed.description}</p>
                        </div>
                      </div>
                    )}
                    <div className="prosign-feedback-labels">
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
                      {trial.replay && <span>Replay · assisted</span>}
                      {trial.revealed && <span>Answer disclosed</span>}
                      {trial.review && <span>Review</span>}
                      {trial.interrupted && <span>Interrupted</span>}
                    </div>
                  </div>
                )}
                {(trial.item.mode !== 'context' || trial.result) && (
                  <button
                    className="button secondary prosign-play"
                    disabled={disabled || trial.revision >= 32}
                    onClick={() => void play()}
                  >
                    {playing ? (
                      <Volume2 size={17} />
                    ) : trial.plays ? (
                      <RotateCcw size={17} />
                    ) : (
                      <Play size={17} />
                    )}
                    {playing
                      ? 'Listening…'
                      : trial.item.mode === 'context'
                        ? 'Hear it in a contact'
                        : trial.plays
                          ? 'Replay signal'
                          : 'Play signal'}
                    <kbd>F6</kbd>
                  </button>
                )}
                <div className="prosign-answer-area">
                  {trial.item.mode === 'meaning' ? (
                    <div
                      className="prosign-meaning-choices"
                      role="group"
                      aria-label="Choose the meaning"
                    >
                      {trial.item.choices.map((choice) => (
                        <button
                          key={choice.id}
                          disabled={disabled || !trial.played || trial.revision >= 32}
                          onClick={() => void submit({ answer: choice.id })}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <label htmlFor="prosign-answer">
                        {trial.result
                          ? 'Try the signal again'
                          : trial.item.mode === 'context'
                            ? 'Signal you would send'
                            : 'Signal you heard'}
                      </label>
                      <div className="prosign-answer-row">
                        <input
                          id="prosign-answer"
                          ref={inputRef}
                          value={trial.answer}
                          disabled={disabled || !trial.played || trial.revision >= 32}
                          autoComplete="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          maxLength={32}
                          placeholder="Type the whole signal…"
                          onChange={(event) =>
                            updateTrial({
                              ...trialRef.current!,
                              answer: event.target.value
                                .toUpperCase()
                                .replace(/[^A-Z0-9<>/=+?-]/g, ''),
                            })
                          }
                        />
                        <button
                          className="button"
                          disabled={
                            disabled ||
                            !trial.played ||
                            !trial.answer.trim() ||
                            trial.revision >= 32
                          }
                          onClick={() => void submit()}
                        >
                          {trial.result ? 'Check repair' : 'Check answer'}
                          <Check size={16} />
                        </button>
                      </div>
                      <div
                        className="prosign-token-choices"
                        role="group"
                        aria-label="Choose a prosign"
                      >
                        {trial.item.selection.map((id) => (
                          <button
                            key={id}
                            disabled={disabled || !trial.played || trial.revision >= 32}
                            onClick={() => void submit({ answer: `<${id}>` })}
                          >{`<${id}>`}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {!trial.result && (
                    <div className="prosign-answer-actions">
                      <button
                        className="prosign-text-button"
                        disabled={disabled || !trial.played}
                        onClick={() => void submit({ unknown: true })}
                      >
                        <HelpCircle size={15} />I don’t know
                      </button>
                      <button
                        className="prosign-text-button"
                        disabled={disabled || !trial.played}
                        onClick={() => void submit({ reveal: true })}
                      >
                        <Eye size={15} />
                        Reveal answer
                      </button>
                    </div>
                  )}
                </div>
                {trial.result && (
                  <div className="prosign-next-row">
                    <small>First answers and repairs stay separate.</small>
                    <button className="button" disabled={disabled} onClick={advance}>
                      {index + 1 === round.length ? 'See round summary' : 'Next signal'}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                )}
              </>
            )}
            <div className="prosign-round-footer">
              <span>
                {pace.current.c} / {pace.current.e} WPM
              </span>
              <span>Timing estimated</span>
              <span>{input === 'touch' ? 'Touch' : 'Keyboard'} · No timer</span>
            </div>
          </div>
          <p className="prosign-keyboard-note">
            F5 pause · F6 replay · Enter check / next · Esc finish
          </p>
        </div>
      )}

      {done && (
        <section className="prosign-summary" aria-label="Prosign round summary">
          <span className="prosign-icon">
            <Headphones size={31} />
          </span>
          <span className="eyebrow">A LITTLE MORE FAMILIAR</span>
          <h1>Every signal has a purpose.</h1>
          <p>A first answer to learn from. Another chance when you need it.</p>
          <div className="prosign-summary-stats">
            <div>
              <strong>{percent(firstExact, independent.length)}</strong>
              <span>Independent first answers</span>
              <small>
                {firstExact} exact / {independent.length} independent
              </small>
            </div>
            <div>
              <strong>
                {finalExact} / {results.length}
              </strong>
              <span>Final answers exact</span>
              <small>Includes repairs and assisted answers</small>
            </div>
            <div>
              <strong>
                {pace.current.c} / {pace.current.e}
              </strong>
              <span>Character / effective WPM</span>
              <small>Guided targets unchanged</small>
            </div>
          </div>
          <div className="prosign-summary-evidence">
            <span>
              {results.length - independent.length} assisted, review or interrupted presentations
            </span>
            <span role="status">{status}</span>
          </div>
          <div className="button-row">
            <button
              className="button"
              onClick={() => {
                roundGeneration.current++;
                setDone(false);
                setMessage('');
              }}
            >
              <RotateCcw size={17} />
              Choose another round
            </button>
            <button className="button secondary" onClick={onProgress}>
              View prosign progress <ArrowUpRight size={17} />
            </button>
          </div>
        </section>
      )}
      {message && (
        <p className="prosign-message" role="status">
          {message}
        </p>
      )}
      <div className="prosign-page-footer">
        <span>
          <span className="tiny-dot" />
          {status}
        </span>
        <small>
          Prosign practice has its own progress. It does not change automatic targets or verified
          milestones.
        </small>
      </div>
    </section>
  );
}

function ModeIconFor({ mode }: { mode: ProsignMode }) {
  const Icon = exercises.find((value) => value.id === mode)!.icon;
  return <Icon size={28} />;
}
function WovenSignal() {
  return <Radio size={29} />;
}
