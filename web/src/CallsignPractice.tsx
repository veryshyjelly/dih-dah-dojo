import { useEffect, useRef, useState } from 'react';
import {
  Radio,
  Headphones,
  ArrowRight,
  ArrowUpRight,
  Play,
  Pause,
  Square,
  RotateCcw,
  SlidersHorizontal,
  Target,
  Globe2,
  Route,
  Layers,
  Waves,
  Cloud,
  Check,
  Eye,
  HelpCircle,
  Keyboard,
  Hand,
  ChevronRight,
  Volume2,
  BookOpen,
  ChartNoAxesCombined,
} from 'lucide-react';
import type { EngineClient } from './engine-client';
import type { Snapshot } from './types';
import { audio } from './audio';
import { LanguageStore } from './language-store';
import type {
  CallsignActivity,
  CallsignCatalog,
  CallsignCondition,
  CallsignFamily,
  CallsignItem,
  CallsignMode,
  CallsignOutcome,
} from './callsign-types';
import './callsign-practice.css';

type Phase = 'ready' | 'respond' | 'feedback' | 'paused';
type Trial = {
  id: string;
  item: CallsignItem;
  c: number;
  e: number;
  speedMode: 'fixed' | 'adaptive';
  phase: Phase;
  answer: string;
  exchange: string;
  attempts: string[];
  exchangeAttempts: string[];
  nextRevision: number;
  played: boolean;
  plays: number;
  replay: boolean;
  revealed: boolean;
  interrupted: boolean;
  review: boolean;
  endedAt: number | null;
  latency: number | null;
  created: number;
  result: CallsignOutcome | null;
};
type Result = { id: string; item: CallsignItem; first: CallsignOutcome; latest: CallsignOutcome };
const modes: { id: CallsignMode; title: string; note: string; icon: typeof Radio }[] = [
  { id: 'call', title: 'One whole call', note: 'Listen, hold it, then copy.', icon: Radio },
  {
    id: 'recovery',
    title: 'Catch the missing part',
    note: 'Keep your first copy. Ask again.',
    icon: RotateCcw,
  },
  {
    id: 'qso',
    title: 'Find the calling station',
    note: 'Pick a call out of CQ and DE.',
    icon: Headphones,
  },
  {
    id: 'contest-serial',
    title: 'Call + serial number',
    note: 'Two fields. One short exchange.',
    icon: Layers,
  },
  {
    id: 'contest-zone',
    title: 'Call + CQ zone',
    note: 'A different exchange to follow.',
    icon: Globe2,
  },
  {
    id: 'pileup',
    title: 'One voice in the crowd',
    note: 'Follow the target through a second call.',
    icon: Waves,
  },
];
const families: { id: CallsignFamily; label: string; note: string }[] = [
  { id: 'short', label: 'Short calls', note: 'A little room to begin.' },
  {
    id: 'international',
    label: 'Around the world',
    note: 'Different identifiers, familiar sounds.',
  },
  { id: 'long', label: 'Long & special forms', note: 'Hold a little more in mind.' },
  { id: 'portable', label: 'Across the slash', note: 'Portable and operating-abroad shapes.' },
  { id: 'mixed', label: 'A little of everything', note: 'All four families together.' },
];
const conditionLabels: Record<CallsignCondition, string> = {
  clean: 'Clean signal',
  noise: 'With noise',
  fading: 'With fading',
  pileup: 'Overlapping caller',
};
const normalize = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, '')
    .slice(0, 64);
const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const faultText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function CallsignPractice({
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
  const [catalog, setCatalog] = useState<CallsignCatalog | null>(null);
  const [family, setFamily] = useState<CallsignFamily>('short');
  const [mode, setMode] = useState<CallsignMode>('call');
  const [condition, setCondition] = useState<CallsignCondition>('clean');
  const [c, setC] = useState(Math.max(12, snapshot.copyingC || 20));
  const [e, setE] = useState(Math.min(snapshot.copyingC || 20, snapshot.copyingE || 5));
  const [speedMode, setSpeedMode] = useState<'fixed' | 'adaptive'>('fixed');
  const [count, setCount] = useState(10);
  const [round, setRound] = useState<CallsignItem[]>([]);
  const [index, setIndex] = useState(0);
  const [trial, renderTrial] = useState<Trial | null>(null);
  const [done, setDone] = useState(false);
  const [playing, renderPlaying] = useState(false);
  const [busy, renderBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(
    owner === 'guest' ? 'Sign in to keep your rounds' : 'Opening your activity…',
  );
  const [results, setResults] = useState<Result[]>([]);
  const [referencePlaying, setReferencePlaying] = useState<string | null>(null);
  const trialRef = useRef<Trial | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const playingRef = useRef(false);
  const busyRef = useRef(false);
  const handlers = useRef({ pause: () => {}, play: () => {}, finish: () => {}, enter: () => {} });
  const inputRef = useRef<HTMLInputElement>(null);
  const store = useRef(new LanguageStore(owner, engine));
  const pendingSaves = useRef(0);
  const failedSave = useRef(false);
  const resultsRef = useRef<Result[]>([]);
  const roundPace = useRef({ c, e, speedMode });
  const roundReview = useRef(false);
  const activeRound = trial !== null && !done;

  function updateTrial(value: Trial | null) {
    trialRef.current = value;
    if (alive.current) renderTrial(value);
  }
  function setPlaying(value: boolean) {
    playingRef.current = value;
    if (alive.current) renderPlaying(value);
  }
  function setBusy(value: boolean) {
    busyRef.current = value;
    if (alive.current) renderBusy(value);
  }
  function current(token: number, id?: string) {
    return alive.current && token === generation.current && (!id || trialRef.current?.id === id);
  }
  function activity(t: Trial): CallsignActivity {
    return {
      version: 1,
      id: `${t.id}-${t.nextRevision}`,
      trial_id: t.id,
      revision: t.nextRevision,
      kind: 'callsign',
      item: t.item.id,
      sentence: 0,
      input,
      c: t.c,
      e: t.e,
      answer: t.attempts.length ? t.attempts.at(-1)! : null,
      attempts: [...t.attempts],
      exchange_answer: t.exchangeAttempts.length ? t.exchangeAttempts.at(-1)! : null,
      exchange_attempts: [...t.exchangeAttempts],
      replay: t.replay,
      revealed: t.revealed,
      review: t.review,
      interrupted: t.interrupted,
      finished: t.played,
      self_report: null,
      created: t.created,
      latency_ms: t.latency,
      speed_mode: t.speedMode,
    };
  }
  function remember(t: Trial, outcome: CallsignOutcome) {
    const existing = resultsRef.current.find((result) => result.id === t.id);
    const next = existing
      ? resultsRef.current.map((result) =>
          result.id === t.id ? { ...result, latest: outcome } : result,
        )
      : [...resultsRef.current, { id: t.id, item: t.item, first: outcome, latest: outcome }];
    resultsRef.current = next;
    setResults(next);
  }
  function persist(value: CallsignActivity) {
    setStatus('Saving your round…');
    pendingSaves.current++;
    // Capture the reset generation now; network sync must not defer another local write.
    void store.current
      .save(value)
      .catch((error) => {
        failedSave.current = true;
        if (alive.current) {
          setMessage(faultText(error));
        }
      })
      .finally(() => {
        pendingSaves.current--;
        if (alive.current && pendingSaves.current === 0)
          setStatus(failedSave.current ? 'Some results could not be saved' : store.current.status);
      });
  }
  async function evaluate(t: Trial, token: number) {
    const value = activity(t);
    const outcome = await engine.json<CallsignOutcome>('callsign_evaluate', JSON.stringify(value));
    if (!current(token, t.id)) return;
    const next = {
      ...t,
      result: outcome,
      phase: 'feedback' as const,
      nextRevision: t.nextRevision + 1,
    };
    updateTrial(next);
    remember(next, outcome);
    persist(value);
  }
  function newTrial(item: CallsignItem, pace = roundPace.current.e): Trial {
    return {
      id: crypto.randomUUID(),
      item,
      c: roundPace.current.c,
      e: pace,
      speedMode: roundPace.current.speedMode,
      phase: 'ready',
      answer: '',
      exchange: '',
      attempts: [],
      exchangeAttempts: [],
      nextRevision: 0,
      played: false,
      plays: 0,
      replay: false,
      revealed: false,
      interrupted: false,
      review: roundReview.current,
      endedAt: null,
      latency: null,
      created: Date.now(),
      result: null,
    };
  }
  async function begin(review = false) {
    if (owner === 'guest') {
      onSignin();
      return;
    }
    if (busyRef.current) return;
    const token = ++generation.current;
    setBusy(true);
    setMessage('');
    setPlaying(false);
    setReferencePlaying(null);
    try {
      await audio.stop();
      const prepared =
        review && reviewItems.length
          ? await Promise.all(
              reviewItems.slice(0, 30).map(async (id) => {
                const value: CallsignActivity = {
                  version: 1,
                  id: 'review-preview-0',
                  trial_id: 'review-preview',
                  revision: 0,
                  item: id,
                  sentence: 0,
                  kind: 'callsign',
                  input,
                  c,
                  e: Math.min(c, e),
                  answer: null,
                  attempts: [],
                  exchange_answer: null,
                  exchange_attempts: [],
                  replay: false,
                  revealed: false,
                  review: true,
                  interrupted: false,
                  finished: false,
                  self_report: null,
                  created: Date.now(),
                  latency_ms: null,
                  speed_mode: speedMode,
                };
                return (
                  await engine.json<CallsignOutcome>('callsign_evaluate', JSON.stringify(value))
                ).item;
              }),
            )
          : await engine.json<CallsignItem[]>(
              'callsign_generate',
              JSON.stringify({
                seed: crypto.getRandomValues(new Uint32Array(1))[0],
                count,
                family,
                mode,
                condition: mode === 'pileup' ? 'pileup' : condition,
              }),
            );
      if (!current(token)) return;
      if (!prepared.length) throw new Error('No calls were prepared. Try a different round.');
      roundPace.current = { c, e: Math.min(c, e), speedMode };
      roundReview.current = review;
      resultsRef.current = [];
      setResults([]);
      setRound(prepared);
      setIndex(0);
      setDone(false);
      setReferencePlaying(null);
      updateTrial(newTrial(prepared[0]));
    } catch (error) {
      if (current(token)) setMessage(faultText(error));
    } finally {
      if (current(token)) setBusy(false);
    }
  }
  async function play(text?: string) {
    const t = trialRef.current;
    if (
      !t ||
      t.phase === 'paused' ||
      playingRef.current ||
      busyRef.current ||
      (t.result && t.nextRevision >= 32)
    )
      return;
    const token = ++generation.current;
    const repeated = t.plays > 0 || !!text;
    let next = { ...t, plays: t.plays + 1, replay: t.replay || repeated };
    updateTrial(next);
    setPlaying(true);
    setMessage('');
    audio.volume = snapshot.volume;
    audio.frequency = snapshot.frequency;
    try {
      const sound = await audio.play(
        {
          text: text || t.item.audio_text,
          c: t.c,
          e: text ? t.c : t.e,
          rescue: false,
          condition: text ? 'clean' : t.item.condition,
          interferer: text ? undefined : t.item.interferer || undefined,
        },
        () => current(token, t.id),
      );
      const interrupted = await sound.finished;
      if (!current(token, t.id)) return;
      setPlaying(false);
      if (interrupted) {
        pause('The signal was interrupted. This attempt stays separate.');
        return;
      }
      next = {
        ...trialRef.current!,
        played: true,
        endedAt: performance.now(),
        phase: trialRef.current!.result ? 'feedback' : 'respond',
      };
      updateTrial(next);
      if (next.result && repeated && next.nextRevision < 32) {
        setBusy(true);
        try {
          await evaluate(next, token);
        } finally {
          if (current(token, t.id)) setBusy(false);
        }
      }
      inputRef.current?.focus({ preventScroll: true });
    } catch (error) {
      if (current(token, t.id)) {
        setPlaying(false);
        pause('The signal stopped. Replay when ready.');
        setMessage(faultText(error));
      }
    }
  }
  async function submit(reveal = false, unknown = false) {
    const t = trialRef.current;
    if (
      !t ||
      busyRef.current ||
      playingRef.current ||
      t.phase === 'paused' ||
      !t.played ||
      t.nextRevision >= 32
    )
      return;
    const token = generation.current;
    const answer = unknown ? '' : normalize(t.answer);
    const exchange = unknown ? '' : t.exchange.replace(/\D/g, '').slice(0, 6);
    const attempts = reveal
      ? [...t.attempts]
      : [...(t.attempts.length ? t.attempts : t.result ? [''] : []), answer];
    const exchangeAttempts =
      reveal || !t.item.exchange
        ? [...t.exchangeAttempts]
        : [...(t.exchangeAttempts.length ? t.exchangeAttempts : t.result ? [''] : []), exchange];
    const next = {
      ...t,
      attempts,
      exchangeAttempts,
      answer: unknown ? '' : t.answer,
      exchange: unknown ? '' : t.exchange,
      revealed: t.revealed || reveal || !!t.result,
      latency:
        t.latency ??
        (t.endedAt === null
          ? null
          : Math.max(0, Math.min(3_600_000, performance.now() - t.endedAt))),
    };
    setBusy(true);
    setMessage('');
    try {
      await evaluate(next, token);
    } catch (error) {
      if (current(token, t.id)) setMessage(faultText(error));
    } finally {
      if (current(token, t.id)) setBusy(false);
    }
  }
  function pause(reason = 'Take a breath. Play restarts the same call when you return.') {
    generation.current++;
    setPlaying(false);
    setBusy(false);
    setReferencePlaying(null);
    void audio.stop();
    const t = trialRef.current;
    if (!t || done || t.phase === 'paused') return;
    updateTrial({ ...t, phase: 'paused', interrupted: t.interrupted || !t.result });
    setMessage(reason);
  }
  function resume() {
    const t = trialRef.current;
    if (!t) return;
    updateTrial({
      ...t,
      phase: t.result ? 'feedback' : 'ready',
      played: t.result ? t.played : false,
    });
    setMessage(
      t.interrupted
        ? 'This interrupted attempt is kept separate from independent results.'
        : 'Ready when you are.',
    );
  }
  function advance() {
    const t = trialRef.current;
    if (!t?.result || playingRef.current || busyRef.current) return;
    generation.current++;
    void audio.stop();
    if (index + 1 >= round.length) {
      updateTrial(null);
      setDone(true);
      return;
    }
    let pace = t.e;
    if (t.speedMode === 'adaptive') {
      const first = resultsRef.current.find((result) => result.id === t.id)?.first;
      if (first?.eligible && !t.replay && !t.revealed && !t.review && !t.interrupted) {
        const exact =
          first.first_exact && (first.exchange_correct === null || first.exchange_correct);
        pace = Math.max(3, Math.min(t.c, pace + (exact ? 1 : -1)));
      }
    }
    setIndex(index + 1);
    updateTrial(newTrial(round[index + 1], pace));
    setMessage('');
  }
  function finish() {
    generation.current++;
    setPlaying(false);
    setBusy(false);
    setReferencePlaying(null);
    void audio.stop();
    updateTrial(null);
    setDone(true);
    setMessage('Completed submissions are saved. Unsubmitted audio is not scored.');
  }
  async function reference(item: CallsignItem, text = item.audio_text) {
    if (busyRef.current) return;
    if (playingRef.current) {
      generation.current++;
      setPlaying(false);
      setReferencePlaying(null);
      await audio.stop();
      return;
    }
    const token = ++generation.current;
    setPlaying(true);
    setReferencePlaying(item.id);
    setMessage('');
    audio.volume = snapshot.volume;
    audio.frequency = snapshot.frequency;
    try {
      const sound = await audio.play({ text, c, e: Math.min(c, e), rescue: false }, () =>
        current(token),
      );
      await sound.finished;
    } catch (error) {
      if (current(token)) setMessage(faultText(error));
    } finally {
      if (current(token)) {
        setPlaying(false);
        setReferencePlaying(null);
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
      const changed =
        normalize(t.answer) !== t.attempts.at(-1) ||
        (t.item.exchange && t.exchange !== t.exchangeAttempts.at(-1));
      if (t.result && !changed) advance();
      else void submit();
    },
  };
  useEffect(() => {
    alive.current = true;
    let live = true;
    void engine
      .json<CallsignCatalog>('callsign_catalog')
      .then((value) => {
        if (live) setCatalog(value);
      })
      .catch((error) => {
        if (live) setMessage(faultText(error));
      });
    if (owner !== 'guest')
      void store.current
        .open()
        .then(() => {
          if (live && pendingSaves.current === 0) setStatus(store.current.status);
        })
        .catch((error) => {
          if (live) setStatus(faultText(error));
        });
    const online = () => {
      if (owner === 'guest') return;
      void store.current
        .sync()
        .then(() => {
          if (live && pendingSaves.current === 0) setStatus(store.current.status);
        })
        .catch((error) => {
          if (live) setMessage(faultText(error));
        });
    };
    const cancel = () => {
      generation.current++;
      setPlaying(false);
      setBusy(false);
      if (alive.current) setReferencePlaying(null);
      void audio.stop();
    };
    const interrupt = () => {
      const t = trialRef.current;
      if (t && t.phase !== 'paused') handlers.current.pause();
      else cancel();
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
          !event.repeat &&
          (event.target as HTMLElement)?.closest('button, summary, select')
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

  const selectedMode = modes.find((value) => value.id === mode)!;
  const SelectedIcon = selectedMode.icon;
  const firstPass = results.filter((result) => result.first.eligible);
  const firstExact = firstPass.filter((result) => result.first.first_exact).length;
  const finalExact = results.filter((result) => result.latest.final_exact).length;
  const exchangeResults = firstPass.filter((result) => result.first.exchange_correct !== null);
  const firstExchangeExact = exchangeResults.filter(
    (result) => result.first.exchange_correct,
  ).length;
  const disabled = busy || playing || trial?.phase === 'paused';
  const familyLabel = (id: string) => families.find((value) => value.id === id)?.label || id;
  const introducedLetters = new Set(snapshot.introduced.replace(/[^A-Z]/g, '')).size;
  const introducedDigits = new Set(snapshot.introduced.replace(/[^0-9]/g, '')).size;
  const readinessNote =
    introducedLetters < 26 ||
    introducedDigits < 10 ||
    (family === 'portable' && !snapshot.introduced.includes('/'));

  return (
    <section className="callsign-practice" aria-label="Callsign training">
      {!activeRound && !done && (
        <>
          <div className="callsign-page-heading">
            <span className="eyebrow">
              <Radio size={17} /> EVERY STATION HAS A SOUND
            </span>
            <h1>
              Catch the call.
              <br />
              <em>Stay with the signal.</em>
            </h1>
            <p>
              A few letters. A number. A station on the other side.
              <br className="callsign-wide-break" /> Learn to hear the whole identity.
            </p>
          </div>
          {owner === 'guest' && (
            <div
              className="callsign-signin"
              role="region"
              aria-label="Sign in for callsign practice"
            >
              <span className="callsign-icon">
                <Cloud size={25} />
              </span>
              <div>
                <h2>Your next call travels with you.</h2>
                <p>
                  Sign in to start callsign rounds and keep your progress across devices. You can
                  explore the format library below.
                </p>
              </div>
              <button className="button" onClick={onSignin}>
                Sign in to practice <ArrowUpRight size={17} />
              </button>
            </div>
          )}
          <div className="callsign-setup-layout">
            <div className="callsign-setup-main">
              <section className="callsign-mode-section" aria-label="Callsign exercise">
                <div className="callsign-section-heading">
                  <span>
                    <Headphones size={18} /> What would you like to hear?
                  </span>
                  <small>One thing at a time.</small>
                </div>
                <div className="callsign-mode-grid">
                  {modes.map((value) => {
                    const Icon = value.icon;
                    return (
                      <button
                        key={value.id}
                        className={`callsign-mode-card ${mode === value.id ? 'selected' : ''}`}
                        aria-pressed={mode === value.id}
                        onClick={() => {
                          setMode(value.id);
                          if (value.id === 'pileup') setCondition('pileup');
                          else if (condition === 'pileup') setCondition('clean');
                        }}
                      >
                        <span className="callsign-mode-top">
                          <Icon size={23} />
                          {mode === value.id ? <Check size={16} /> : <ArrowUpRight size={16} />}
                        </span>
                        <strong>{value.title}</strong>
                        <small>{value.note}</small>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="callsign-config-card">
                <div className="callsign-section-heading">
                  <span>
                    <SlidersHorizontal size={18} /> Make a little space to listen.
                  </span>
                </div>
                <div className="callsign-config-grid">
                  <label>
                    Callsign family
                    <select
                      value={family}
                      onChange={(event) => setFamily(event.target.value as CallsignFamily)}
                    >
                      {families.map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.label}
                        </option>
                      ))}
                    </select>
                    <small>{families.find((value) => value.id === family)?.note}</small>
                  </label>
                  <label>
                    Calls in this round
                    <select
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    >
                      {[5, 10, 20, 30].map((value) => (
                        <option key={value} value={value}>
                          {value} calls
                        </option>
                      ))}
                    </select>
                    <small>Pause or finish whenever you need.</small>
                  </label>
                </div>
                {owner !== 'guest' && readinessNote && (
                  <p className="callsign-readiness-note">
                    <Target size={17} />
                    <span>
                      Your guided repertoire has introduced {introducedLetters}/26 letters and{' '}
                      {introducedDigits}/10 digits
                      {family === 'portable'
                        ? snapshot.introduced.includes('/')
                          ? ', including the slash'
                          : '; the slash is not introduced yet'
                        : ''}
                      . This manual round may include unfamiliar sounds. Explore the format library
                      first if you like; these rounds do not unlock guided characters.
                    </span>
                  </p>
                )}
                <div className="callsign-pace-row">
                  <div>
                    <h3>
                      <Waves size={17} /> Your listening pace
                    </h3>
                    <p>The sound speed, and the space to think.</p>
                  </div>
                  <div className="callsign-pace-fields">
                    <label>
                      Character WPM
                      <input
                        type="number"
                        min="12"
                        max="60"
                        value={c}
                        onChange={(event) => {
                          const value = Math.max(12, Math.min(60, Number(event.target.value)));
                          setC(value);
                          setE(Math.min(e, value));
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
                          setE(Math.max(3, Math.min(c, Number(event.target.value))))
                        }
                      />
                    </label>
                  </div>
                </div>
                <div
                  className="callsign-speed-choice"
                  role="group"
                  aria-label="Callsign speed mode"
                >
                  <button
                    className={speedMode === 'fixed' ? 'selected' : ''}
                    aria-pressed={speedMode === 'fixed'}
                    onClick={() => setSpeedMode('fixed')}
                  >
                    <Target size={16} /> Keep a steady pace
                  </button>
                  <button
                    className={speedMode === 'adaptive' ? 'selected' : ''}
                    aria-pressed={speedMode === 'adaptive'}
                    onClick={() => setSpeedMode('adaptive')}
                  >
                    <Route size={16} /> Let this round adapt
                  </button>
                </div>
                <p className="callsign-small-note">
                  {speedMode === 'fixed'
                    ? 'The same character and effective speed for every call.'
                    : `Independent answers adjust effective pace one WPM at a time, between 3 and ${c} WPM. Assisted answers never raise it.`}
                </p>
                <details className="callsign-condition-details">
                  <summary>
                    <Layers size={17} /> Signal conditions <span>{conditionLabels[condition]}</span>
                  </summary>
                  <p>
                    Clean is a good place to begin. These optional listening conditions have their
                    own progress context.
                  </p>
                  <div className="callsign-conditions" role="group" aria-label="Signal conditions">
                    {(Object.keys(conditionLabels) as CallsignCondition[]).map((value) => (
                      <button
                        key={value}
                        aria-pressed={condition === value}
                        className={condition === value ? 'selected' : ''}
                        onClick={() => {
                          setCondition(value);
                          if (value === 'pileup') setMode('pileup');
                          else if (mode === 'pileup') setMode('call');
                        }}
                      >
                        {conditionLabels[value]}
                      </button>
                    ))}
                  </div>
                </details>
                <div className="callsign-launch">
                  <div>
                    <strong>
                      <SelectedIcon size={18} /> {selectedMode.title}
                    </strong>
                    <small>
                      {count} calls · {familyLabel(family)} · {conditionLabels[condition]}
                    </small>
                  </div>
                  <button
                    className="button"
                    disabled={!catalog || busy}
                    onClick={() => void begin()}
                  >
                    <Play size={18} />{' '}
                    {owner === 'guest' ? 'Sign in to start' : 'Start callsign round'}
                  </button>
                </div>
                {!!reviewItems.length && owner !== 'guest' && (
                  <button
                    className="callsign-review-link"
                    disabled={busy}
                    onClick={() => void begin(true)}
                  >
                    <RotateCcw size={16} /> Review {reviewItems.length} selected{' '}
                    {reviewItems.length === 1 ? 'call' : 'calls'} <ArrowRight size={17} />
                  </button>
                )}
              </section>
            </div>
            <aside className="callsign-setup-aside">
              <div className="callsign-listening-note">
                <span className="eyebrow">A WHOLE IDENTITY</span>
                <div className="callsign-example" aria-label="Example callsign VU2ABC">
                  <span>VU</span>
                  <span>2</span>
                  <span>ABC</span>
                </div>
                <div className="callsign-example-labels">
                  <span>identifier</span>
                  <span>number</span>
                  <span>suffix</span>
                </div>
                <h2>
                  Hear the shape.
                  <br />
                  Keep the whole call.
                </h2>
                <p>
                  Callsigns mix letters, digits and sometimes a slash. Let them become one small
                  rhythm.
                </p>
                <div className="callsign-aside-note">
                  <Globe2 size={20} />
                  <p>
                    International shapes include digit-leading identifiers and Indian examples. A
                    format is not a station lookup.
                  </p>
                </div>
              </div>
              <div className="callsign-progress-teaser">
                <ChartNoAxesCombined size={25} />
                <h3>Your callsign progress</h3>
                <p>Whole calls, first attempts, repaired copies. See what is getting easier.</p>
                <button className="callsign-text-action" onClick={onProgress}>
                  View progress <ArrowUpRight size={17} />
                </button>
              </div>
            </aside>
          </div>
          <section className="callsign-reference" aria-labelledby="callsign-library-heading">
            <div className="callsign-reference-heading">
              <span className="callsign-icon">
                <BookOpen size={25} />
              </span>
              <div>
                <span className="eyebrow">THE FORMAT LIBRARY</span>
                <h2 id="callsign-library-heading">Meet a few different shapes.</h2>
                <p>
                  Listen freely here. Reference listening does not count as independent practice.
                </p>
              </div>
            </div>
            <div className="callsign-reference-grid">
              {catalog?.references.map((item) => (
                <article key={item.id} className="callsign-reference-card">
                  <span className="eyebrow">{familyLabel(item.family)}</span>
                  <h3>{item.text}</h3>
                  <div className="callsign-reference-parts">
                    {item.parts.map((part, i) => (
                      <span key={`${part.kind}-${i}`}>
                        <strong>{part.text}</strong>
                        <small>{part.label}</small>
                      </span>
                    ))}
                  </div>
                  <button
                    className="callsign-outline-button"
                    disabled={busy}
                    onClick={() => void reference(item)}
                  >
                    <Volume2 size={16} />
                    {referencePlaying === item.id ? 'Stop listening' : 'Hear the whole call'}
                  </button>
                </article>
              ))}
            </div>
            <p className="callsign-small-note">
              Original synthetic examples. They do not assert assignment, licensing entitlement, or
              a universal country/DXCC mapping.
            </p>
          </section>
        </>
      )}

      {activeRound && trial && (
        <>
          <div className="callsign-round-heading">
            <button className="callsign-text-action" onClick={finish}>
              <Square size={15} /> Finish round <kbd>Esc</kbd>
            </button>
            <span>
              {index + 1} / {round.length} calls ·{' '}
              {input === 'touch' ? <Hand size={15} /> : <Keyboard size={15} />}{' '}
              {input === 'touch' ? 'Touch' : 'Keyboard'}
            </span>
          </div>
          <div className="callsign-round-layout">
            <section
              className={`callsign-focus-card ${trial.phase === 'paused' ? 'is-paused' : ''}`}
              aria-label="Current callsign"
            >
              <div className="callsign-focus-top">
                <span className="callsign-phase-pill">
                  <span className={playing ? 'callsign-live-dot' : ''} />
                  {trial.phase === 'paused'
                    ? 'Paused'
                    : playing
                      ? 'Listening'
                      : trial.result
                        ? 'A moment to notice'
                        : trial.played
                          ? 'Your turn'
                          : 'Ready when you are'}
                </span>
                <span>{conditionLabels[trial.item.condition]}</span>
              </div>
              {trial.phase === 'paused' ? (
                <div className="callsign-paused">
                  <Pause size={38} />
                  <h2>No rush.</h2>
                  <p>The same call will be here when you return.</p>
                  <button className="button" onClick={resume}>
                    I’m ready <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="callsign-prompt">
                    <span className="callsign-round-icon">
                      <Radio size={38} strokeWidth={1.25} />
                    </span>
                    <span className="eyebrow">
                      {modes.find((value) => value.id === trial.item.mode)?.title}
                    </span>
                    <h2>
                      {trial.result
                        ? trial.result.final_exact && trial.result.exchange_final_correct !== false
                          ? 'A whole call, heard.'
                          : 'A little more to catch.'
                        : playing
                          ? 'Stay with the signal.'
                          : trial.played
                            ? 'What did you hear?'
                            : 'One call. Your own pace.'}
                    </h2>
                    <p>
                      {trial.item.mode === 'qso' ? (
                        <>
                          Copy the station calling CQ. Your station is{' '}
                          <strong>{trial.item.own_call}</strong>.
                        </>
                      ) : trial.item.mode === 'pileup' ? (
                        'Copy the lower-pitched caller. The higher-pitched station may overlap.'
                      ) : trial.item.exchange ? (
                        `Copy the caller and the ${trial.item.exchange.kind === 'zone' ? 'CQ zone' : 'serial number'}. The RST report is not part of your answer.`
                      ) : trial.item.mode === 'recovery' ? (
                        'Keep what you catch first. A repeat can help you find the rest.'
                      ) : (
                        'Hear the complete call, then send your first copy.'
                      )}
                    </p>
                    {trial.item.condition === 'pileup' && trial.item.mode !== 'pileup' && (
                      <p>
                        Copy the lower-pitched caller; the higher-pitched station is interference.
                      </p>
                    )}
                  </div>
                  <form
                    className={`callsign-answer-form ${trial.item.exchange ? 'with-exchange' : ''}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      handlers.current.enter();
                    }}
                  >
                    <label>
                      Callsign you heard
                      <input
                        ref={inputRef}
                        aria-label="Callsign you heard"
                        value={trial.answer}
                        maxLength={64}
                        onChange={(event) =>
                          updateTrial({
                            ...trialRef.current!,
                            answer: normalize(event.target.value),
                          })
                        }
                        autoComplete="off"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={busy}
                        placeholder="Type the whole call"
                      />
                    </label>
                    {trial.item.exchange && (
                      <label>
                        {trial.item.exchange.label}
                        <input
                          aria-label={trial.item.exchange.label}
                          value={trial.exchange}
                          onChange={(event) =>
                            updateTrial({
                              ...trialRef.current!,
                              exchange: event.target.value.replace(/\D/g, '').slice(0, 6),
                            })
                          }
                          inputMode="numeric"
                          autoComplete="off"
                          disabled={busy}
                          placeholder={trial.item.exchange.kind === 'zone' ? 'Zone' : 'Number'}
                        />
                      </label>
                    )}
                    <button
                      type="submit"
                      className="button"
                      disabled={
                        disabled ||
                        !trial.played ||
                        trial.nextRevision >= 32 ||
                        (!trial.answer && !trial.item.exchange)
                      }
                    >
                      <Check size={17} />
                      {trial.result ? 'Check repair' : 'Check call'} <kbd>Enter</kbd>
                    </button>
                  </form>
                  {!trial.result && (
                    <div className="callsign-listening-actions">
                      <button
                        className="callsign-outline-button"
                        disabled={disabled}
                        onClick={() => void play()}
                      >
                        <Volume2 size={17} />
                        {trial.plays ? 'Replay call' : 'Play call'} <kbd>F6</kbd>
                      </button>
                      <div className="callsign-skip-actions">
                        <button
                          className="callsign-text-action"
                          disabled={disabled || !trial.played}
                          onClick={() => void submit(false, true)}
                        >
                          <HelpCircle size={16} /> I don’t know
                        </button>
                        <button
                          className="callsign-text-action"
                          disabled={disabled || !trial.played}
                          onClick={() => void submit(true)}
                        >
                          <Eye size={16} /> Reveal · assisted
                        </button>
                      </div>
                    </div>
                  )}
                  {trial.result && (
                    <div className="callsign-feedback" aria-live="polite">
                      <div className="callsign-comparison">
                        <div>
                          <span>Your first copy</span>
                          <strong>{trial.result.first_answer || '—'}</strong>
                        </div>
                        <ArrowRight size={23} />
                        <div>
                          <span>Expected call</span>
                          <strong>{trial.result.expected}</strong>
                        </div>
                      </div>
                      {trial.item.exchange && (
                        <div className="callsign-exchange-feedback">
                          <span>{trial.item.exchange.label}</span>
                          <strong>{trial.item.exchange.text}</strong>
                          <small>
                            {trial.result.exchange_correct
                              ? 'Copied on the first attempt'
                              : trial.result.exchange_final_correct
                                ? 'Repaired after the first attempt'
                                : 'A little more to listen for'}
                          </small>
                        </div>
                      )}
                      <div className="callsign-feedback-labels">
                        <span>
                          {trial.result.eligible
                            ? trial.result.first_exact
                              ? 'Independent · exact first copy'
                              : 'Independent · first copy kept'
                            : trial.interrupted
                              ? 'Interrupted · separate evidence'
                              : trial.review
                                ? 'Targeted review · assisted'
                                : 'Assisted · first copy kept'}
                        </span>
                        {trial.attempts.length > 1 && (
                          <span>
                            {trial.result.final_exact
                              ? 'Final copy exact'
                              : 'Final copy still differs'}
                          </span>
                        )}
                      </div>
                      <div className="callsign-part-list" aria-label="Callsign structure">
                        {trial.item.parts.map((part, i) => (
                          <button
                            key={`${part.kind}-${i}`}
                            disabled={disabled}
                            onClick={() => void play(part.text)}
                          >
                            <span>{part.label}</span>
                            <strong>{part.text}</strong>
                            <Volume2 size={14} />
                          </button>
                        ))}
                      </div>
                      <details className="callsign-symbol-reference">
                        <summary>Hear a missed character</summary>
                        <div>
                          {[...new Set(trial.item.text)].map((symbol) => (
                            <button
                              key={symbol}
                              disabled={disabled}
                              aria-label={`Hear ${symbol}`}
                              onClick={() => void play(symbol)}
                            >
                              {symbol}
                            </button>
                          ))}
                        </div>
                        <p>
                          Component or character listening is assistance. Return to the same whole
                          call when you are ready.
                        </p>
                      </details>
                      <div className="callsign-feedback-actions">
                        <button
                          className="callsign-outline-button"
                          disabled={disabled}
                          onClick={() => void play()}
                        >
                          <RotateCcw size={17} /> Hear the whole call
                        </button>
                        <button className="button" disabled={disabled} onClick={advance}>
                          {index + 1 === round.length ? 'Finish this round' : 'Next call'}{' '}
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="callsign-workspace-strip">
                <span>
                  {trial.c} / {trial.e} WPM <small>character / effective</small>
                </span>
                <span>
                  {trial.speedMode === 'adaptive' ? 'Callsign pace adapts' : 'Steady pace'}
                </span>
                <span>Timing estimated</span>
              </div>
            </section>
            <aside className="callsign-round-aside">
              <span className="eyebrow">A LITTLE AT A TIME</span>
              <strong className="callsign-round-number">
                {results.length}
                <span> / {round.length}</span>
              </strong>
              <p>
                calls submitted.
                <br />
                Your first copy is always kept.
              </p>
              <div className="callsign-round-mini-stats">
                <span>
                  <strong>
                    {firstExact} / {firstPass.length}
                  </strong>{' '}
                  exact independent
                </span>
                <span>
                  <strong>{finalExact}</strong> final copies exact
                </span>
                {trial.item.exchange && (
                  <span>
                    <strong>
                      {firstExchangeExact} / {exchangeResults.length}
                    </strong>{' '}
                    exact independent exchanges
                  </span>
                )}
              </div>
              <div className="callsign-aside-note">
                <Headphones size={22} />
                <p>Listen to the whole sound. Skip what you miss, then catch the next part.</p>
              </div>
              <button
                className="callsign-outline-button"
                onClick={() => (trial.phase === 'paused' ? resume() : pause())}
              >
                {trial.phase === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                {trial.phase === 'paused' ? 'Resume' : 'Pause'} <kbd>F5</kbd>
              </button>
              <small>
                Callsign practice has its own results. It never raises guided training targets.
              </small>
            </aside>
          </div>
        </>
      )}

      {done && (
        <section className="callsign-summary">
          <span className="callsign-icon">
            <Radio size={30} />
          </span>
          <span className="eyebrow">ONE ROUND, A LITTLE MORE FAMILIAR</span>
          <h1>Every call is a connection.</h1>
          <p>
            You made room for {results.length} {results.length === 1 ? 'call' : 'calls'}. Take a
            breath before the next one.
          </p>
          <div
            className={`callsign-summary-stats ${results.some((result) => result.item.exchange) ? 'with-exchange' : ''}`}
          >
            <div>
              <strong>{firstPass.length ? percent(firstExact / firstPass.length) : '—'}</strong>
              <span>exact independent first copies</span>
            </div>
            <div>
              <strong>
                {finalExact} / {results.length}
              </strong>
              <span>final copies exact</span>
            </div>
            <div>
              <strong>{results.length - firstPass.length}</strong>
              <span>assisted or interrupted calls</span>
            </div>
            {results.some((result) => result.item.exchange) && (
              <div>
                <strong>
                  {exchangeResults.length
                    ? percent(firstExchangeExact / exchangeResults.length)
                    : '—'}
                </strong>
                <span>exact independent exchanges</span>
              </div>
            )}
          </div>
          <div className="callsign-summary-actions">
            <button
              className="button"
              onClick={() => {
                updateTrial(null);
                setDone(false);
                setRound([]);
              }}
            >
              Set up another round <ArrowRight size={18} />
            </button>
            <button className="button secondary" onClick={onProgress}>
              View callsign progress <ArrowUpRight size={17} />
            </button>
          </div>
          <p className="callsign-small-note">
            Repaired copies never replace first attempts. Guided pace and verified milestones are
            unchanged.
          </p>
        </section>
      )}
      {message && (
        <p className="callsign-message" role="status">
          {message}
        </p>
      )}
      <div className="callsign-page-footer">
        <span>
          <Cloud size={15} /> {status}
        </span>
        <span>Listening practice · original synthetic calls</span>
      </div>
    </section>
  );
}
