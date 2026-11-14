import { useEffect, useRef, useState } from 'react';
import { audio } from './audio';
import type { EngineClient } from './engine-client';
import type { Snapshot } from './types';
import { clearLanguage, LanguageStore, type Activity, type Entry } from './language-store';
type Word = { id: string; text: string; meaning: string; set: string };
type Story = { id: string; title: string; sentences: string[]; seconds: number };
export function LanguagePractice({
  kind,
  engine,
  owner,
  snapshot,
  input,
}: {
  kind: 'word' | 'story';
  engine: EngineClient;
  owner: string;
  snapshot: Snapshot;
  input: string;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [c, setC] = useState(owner === 'guest' ? 20 : snapshot.copyingC),
    [e, setE] = useState(owner === 'guest' ? 10 : snapshot.copyingE);
  const [repertoire, setRepertoire] = useState(
    owner === 'guest' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : snapshot.introduced.replace(/[^A-Z]/g, ''),
  );
  const [length, setLength] = useState('2-3'),
    [set, setSet] = useState('words'),
    [listen, setListen] = useState(false);
  const [catalog, setCatalog] = useState<Story[]>([]),
    [words, setWords] = useState<Word[]>([]),
    [story, setStory] = useState<Story | null>(null);
  const [index, setIndex] = useState(0),
    [phase, setPhase] = useState('setup'),
    [playing, setPlaying] = useState(false),
    [paused, setPaused] = useState(false);
  const [answer, setAnswer] = useState(''),
    [edits, setEdits] = useState<string[]>([]),
    [revealed, setRevealed] = useState(false),
    [replay, setReplay] = useState(false),
    [review, setReview] = useState(false),
    [continuous, setContinuous] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]),
    [status, setStatus] = useState('Loading saved activity…'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const store = useRef(new LanguageStore(owner, engine));
  const generation = useRef(0),
    played = useRef(false),
    playCount = useRef(0),
    current = useRef<() => void>(() => {}),
    pauseRef = useRef<() => void>(() => {}),
    nextRef = useRef<() => void>(() => {}),
    saving = useRef(Promise.resolve());
  const continuousStarted = useRef(false);
  const enterArmed = useRef(false);
  const round = useRef<string[]>([]);
  const field = useRef<HTMLInputElement>(null);
  const word = words[index],
    text = kind === 'word' ? word?.text : story?.sentences[index],
    item = kind === 'word' ? word?.id : story?.id;
  useEffect(() => {
    let live = true;
    void store.current.open().then(() => {
      if (live) {
        setEntries([...store.current.entries]);
        setStatus(store.current.status);
      }
    });
    const online = () =>
      void store.current.sync().then(() => {
        if (live) {
          setEntries([...store.current.entries]);
          setStatus(store.current.status);
        }
      });
    window.addEventListener('online', online);
    return () => {
      live = false;
      generation.current++;
      void audio.stop();
      window.removeEventListener('online', online);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void engine
      .json<{ stories: Story[] }>('language_catalog', c, Math.min(c, e))
      .then((v) => {
        if (active) setCatalog(v.stories);
      })
      .catch((err) => setMessage(String(err)));
    return () => {
      active = false;
    };
  }, [c, e, engine]);
  function persist(values: Partial<Activity> = {}) {
    if (!item) return;
    const activity: Activity = {
      version: 1,
      id: crypto.randomUUID(),
      kind,
      item,
      sentence: index,
      input,
      c,
      e: Math.min(c, e),
      answer: null,
      attempts: [],
      replay,
      review:
        review ||
        (kind === 'story' &&
          entries.some(
            (v) => v.activity.item === item && v.activity.sentence === index && v.activity.finished,
          )),
      revealed,
      interrupted: false,
      finished: played.current,
      self_report: null,
      created: Date.now(),
      ...values,
    };
    round.current.push(activity.id);
    saving.current = saving.current
      .then(() => store.current.save(activity))
      .then(() => {
        setEntries([...store.current.entries]);
        setStatus(store.current.status);
      })
      .catch((err) => setMessage(String(err)));
  }
  async function stop() {
    generation.current++;
    setPlaying(false);
    await audio.stop();
  }
  async function play() {
    if (!text || playing) return;
    continuousStarted.current = continuous && listen;
    const token = ++generation.current;
    const repeated = playCount.current++ > 0;
    if (repeated) setReplay(true);
    setPaused(false);
    setPlaying(true);
    setMessage('');
    try {
      const sound = await audio.play({ text, c, e: Math.min(c, e), rescue: false });
      const interrupted = await sound.finished;
      if (token !== generation.current) return;
      setPlaying(false);
      if (interrupted) {
        setPaused(true);
        persist({ interrupted: true, finished: false });
        setMessage('Playback interrupted. Replay when ready.');
        return;
      }
      played.current = true;
      setPhase('respond');
      field.current?.focus();
      if (kind === 'story' && listen && continuous) {
        persist({ finished: true, replay: replay || repeated });
        nextRef.current();
      }
    } catch (err) {
      if (token === generation.current) {
        setPlaying(false);
        setMessage(String(err));
      }
    }
  }
  function pause() {
    if (!playing) return;
    continuousStarted.current = false;
    void stop();
    setPaused(true);
    persist({ finished: false, interrupted: true });
    setMessage('Paused · Play restarts this sentence or word.');
  }
  function resetItem() {
    played.current = false;
    playCount.current = 0;
    setAnswer('');
    setEdits([]);
    setRevealed(false);
    setReplay(false);
    setPaused(false);
    setPhase('ready');
  }
  function next() {
    void stop();
    if (index + 1 < (kind === 'word' ? words.length : story?.sentences.length || 0)) {
      setIndex(index + 1);
      resetItem();
    } else setPhase('done');
  }
  current.current = () => void play();
  pauseRef.current = pause;
  nextRef.current = next;
  useEffect(() => {
    if (kind === 'story' && continuous && listen && continuousStarted.current && phase === 'ready')
      void current.current();
  }, [index, continuous, listen, phase, kind]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (ev.key === 'Enter' && !ev.repeat && phase === 'feedback' && ev.target === document.body)
        enterArmed.current = true;
      if (ev.key === 'F5' || ev.key === 'F6') {
        ev.preventDefault();
        if (ev.key === 'F5') {
          if (playing) pauseRef.current();
          else current.current();
        } else current.current();
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        generation.current++;
        void audio.stop();
        setPlaying(false);
        setStory(null);
        setPhase('setup');
      }
      if (
        ev.code === 'Space' &&
        !(ev.target instanceof HTMLInputElement) &&
        !(ev.target instanceof HTMLTextAreaElement) &&
        !(ev.target instanceof HTMLButtonElement)
      ) {
        ev.preventDefault();
        if (playing) pauseRef.current();
        else current.current();
      }
    };
    const enter = (ev: KeyboardEvent) => {
      if (
        enterArmed.current &&
        ev.key === 'Enter' &&
        phase === 'feedback' &&
        ev.target === document.body &&
        !document.querySelector('dialog[open]')
      ) {
        enterArmed.current = false;
        nextRef.current();
      }
    };
    window.addEventListener('keyup', enter);
    const hide = () => {
      if (document.hidden) pauseRef.current();
    };
    const observer = new MutationObserver(() => {
      if (document.querySelector('dialog[open]')) pauseRef.current();
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hide);
    const suspended = () => pauseRef.current();
    window.addEventListener('dojo-audio-suspended', suspended);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', enter);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('dojo-audio-suspended', suspended);
      observer.disconnect();
    };
  }, [playing, phase]);
  async function startWords(reviewWords?: Word[]) {
    setBusy(true);
    try {
      const [min, max] = length.split('-').map(Number);
      const selected =
        reviewWords ||
        (await engine.json<Word[]>(
          'language_words',
          repertoire,
          set,
          min,
          max,
          Math.floor(Math.random() * 2 ** 32),
        ));
      setWords(selected);
      setIndex(0);
      setReview(!!reviewWords);
      round.current = [];
      resetItem();
      if (!selected.length) {
        setPhase('setup');
        setMessage('No words match these filters. Try more characters or another length.');
      } else
        setMessage(
          selected.length < 10
            ? `Only ${selected.length} distinct words match. This round uses them all.`
            : '',
        );
    } catch (err) {
      setMessage(String(err));
    } finally {
      setBusy(false);
    }
  }
  function startStory(s: Story) {
    continuousStarted.current = false;
    const saved = [...entries]
      .reverse()
      .find((v) => v.activity.kind === 'story' && v.activity.item === s.id);
    setStory(s);
    setIndex(saved?.activity.sentence || 0);
    setListen(true);
    resetItem();
    setMessage(saved ? 'Resumed at your saved sentence. Press Play when ready.' : '');
  }
  function submit(skip = false) {
    if (!played.current || playing || phase === 'feedback') return;
    persist({ answer: skip ? '' : answer, attempts: skip ? [] : edits, finished: true });
    setPhase('feedback');
    setRevealed(true);
  }
  function reveal() {
    if (!played.current || playing) return;
    persist({ revealed: true, finished: true });
    setRevealed(true);
    setPhase('feedback');
  }
  const results = entries.filter((v) => round.current.includes(v.activity.id)),
    eligible = results.filter((v) => v.outcome.eligible),
    correct = eligible.filter((v) => v.outcome.correct).length;
  const missed = words.filter((w) =>
    results.some(
      (v) => v.activity.item === w.id && (v.outcome.correct === false || v.activity.revealed),
    ),
  );
  const disclosed = story
    ? story.sentences.filter((_, i) =>
        entries.some(
          (v) => v.activity.item === story.id && v.activity.sentence === i && v.activity.revealed,
        ),
      )
    : [];
  const completed = story
    ? new Set(
        entries
          .filter(
            (v) => v.activity.item === story.id && v.activity.finished && !v.activity.interrupted,
          )
          .map((v) => v.activity.sentence),
      ).size
    : 0;
  return (
    <section className="language-practice">
      <p className="eyebrow">{kind === 'word' ? 'ONE WHOLE WORD' : 'A STORY IN SIGNALS'}</p>
      <h2>
        {kind === 'word'
          ? 'Let the words come together.'
          : story?.title || 'Find a story to listen to.'}
      </h2>
      <p>Self-paced practice · {status}</p>
      {(phase === 'setup' || (kind === 'story' && !story)) && (
        <>
          <div className="language-settings">
            <label>
              Character WPM
              <input
                type="number"
                min="5"
                max="60"
                value={c}
                onChange={(ev) => setC(Math.max(5, Math.min(60, Number(ev.target.value) || 5)))}
              />
            </label>
            <label>
              Effective WPM
              <input
                type="number"
                min="5"
                max={c}
                value={Math.min(e, c)}
                onChange={(ev) => setE(Math.max(5, Math.min(c, Number(ev.target.value) || 5)))}
              />
            </label>
          </div>
          {kind === 'word' ? (
            <>
              <label className="field-label">
                Characters{' '}
                {owner === 'guest' ? '· guest repertoire' : '· introduced letters by default'}
                <input
                  aria-label="Word characters"
                  value={repertoire}
                  onChange={(ev) =>
                    setRepertoire(ev.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
                  }
                />
              </label>
              <button onClick={() => setRepertoire('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}>
                Use all letters
              </button>
              <div className="language-settings">
                <label>
                  Word length
                  <select value={length} onChange={(ev) => setLength(ev.target.value)}>
                    <option value="2-3">2–3 letters</option>
                    <option value="4-5">4–5 letters</option>
                    <option value="6-30">6+ letters</option>
                    <option value="1-30">All lengths</option>
                  </select>
                </label>
                <label>
                  Vocabulary
                  <select value={set} onChange={(ev) => setSet(ev.target.value)}>
                    <option value="words">Common English words</option>
                    <option value="radio">Radio abbreviations</option>
                  </select>
                </label>
                <label>
                  Response
                  <select
                    value={String(listen)}
                    onChange={(ev) => setListen(ev.target.value === 'true')}
                  >
                    <option value="false">Type the word</option>
                    <option value="true">Listen and reveal</option>
                  </select>
                </label>
              </div>
              <button className="btn" disabled={busy} onClick={() => void startWords()}>
                Start word round
              </button>
            </>
          ) : (
            <div className="story-library">
              {catalog.map((s) => (
                <button key={s.id} className="story-card" onClick={() => startStory(s)}>
                  <strong>{s.title}</strong>
                  <span>
                    {s.sentences.join(' ').split(/\s+/).length} words · about{' '}
                    {Math.ceil(s.seconds / 60)} min of signal
                  </span>
                  <small>
                    Required characters:{' '}
                    {[...new Set(s.sentences.join('').replace(/ /g, ''))].sort().join('')}
                  </small>
                  {owner !== 'guest' && (
                    <small>
                      Unintroduced:{' '}
                      {[...new Set(s.sentences.join('').replace(/ /g, ''))]
                        .filter((ch) => !snapshot.introduced.includes(ch))
                        .join('') || 'none'}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {phase !== 'setup' && (kind === 'word' ? words.length > 0 : !!story) && phase !== 'done' && (
        <>
          <div className="language-strip">
            <span>
              {kind === 'word'
                ? `Word ${index + 1} / ${words.length}${review ? ' · review' : ''}`
                : `Sentence ${index + 1} / ${story!.sentences.length}`}
            </span>
            <span>
              {c}/{Math.min(c, e)} WPM · Timing estimated
            </span>
          </div>
          {kind === 'story' && (
            <div className="language-settings">
              <label>
                <input
                  type="checkbox"
                  checked={listen}
                  onChange={(ev) => {
                    void stop();
                    setListen(ev.target.checked);
                    setContinuous(false);
                  }}
                />{' '}
                Listen without typing
              </label>
              {listen && (
                <label>
                  <input
                    type="checkbox"
                    checked={continuous}
                    onChange={(ev) => setContinuous(ev.target.checked)}
                  />{' '}
                  Continuous listening
                </label>
              )}
            </div>
          )}
          <div className="language-readout" aria-live="polite">
            {playing ? (
              'Listening…'
            ) : paused ? (
              'Paused'
            ) : phase === 'feedback' ? (
              <>
                <span>Your answer: {listen ? '—' : answer || 'Skipped'}</span>
                <strong>{text}</strong>
                {word?.meaning && <small>{word.meaning}</small>}
                <small>
                  {replay
                    ? 'Replayed · assisted'
                    : revealed && listen
                      ? 'Revealed · assisted'
                      : 'Answer captured'}
                </small>
              </>
            ) : played.current ? (
              'What did you hear?'
            ) : (
              'Ready when you are.'
            )}
          </div>
          {!listen && phase !== 'feedback' && (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                submit();
              }}
            >
              <label>
                Your {kind === 'word' ? 'word' : 'sentence'}
                <input
                  disabled={!playing && !played.current}
                  ref={field}
                  aria-label="Your answer"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={answer}
                  onChange={(ev) => {
                    const value = ev.target.value.toUpperCase().replace(/[^A-Z0-9 .,?\/=+]/g, '');
                    if (value.startsWith(answer) || answer.startsWith(value)) {
                      setAnswer(value);
                      setEdits((old) => [...old, value].slice(0, 512));
                    }
                  }}
                />
              </label>
              <button className="btn" disabled={!played.current || playing}>
                Check answer
              </button>
              <button
                type="button"
                disabled={!played.current || playing}
                onClick={() => submit(true)}
              >
                Skip
              </button>
            </form>
          )}
          {listen && phase === 'feedback' && kind === 'word' && (
            <div className="language-actions">
              <span>How did it feel? (self-report)</span>
              <button
                onClick={() => {
                  persist({ self_report: true, revealed: true });
                  next();
                }}
              >
                Got it
              </button>
              <button
                onClick={() => {
                  persist({ self_report: false, revealed: true });
                  next();
                }}
              >
                Again later
              </button>
            </div>
          )}
          <div className="language-actions">
            <button className="btn" disabled={playing} onClick={() => void play()}>
              {playCount.current ? 'Replay' : 'Play'} <small>F6</small>
            </button>
            {playing && <button onClick={pause}>Pause · F5</button>}
            <button disabled={!played.current || playing || phase === 'feedback'} onClick={reveal}>
              Reveal
            </button>
            {kind === 'story' && index > 0 && (
              <button
                onClick={() => {
                  void stop();
                  setIndex(index - 1);
                  resetItem();
                }}
              >
                Previous
              </button>
            )}
            <button
              disabled={!played.current || playing || (!listen && phase !== 'feedback')}
              onClick={() => {
                if (listen && phase !== 'feedback') persist({ finished: true });
                next();
              }}
            >
              Next
            </button>
            <button
              onClick={() => {
                void stop();
                setPhase('setup');
                setStory(null);
              }}
            >
              Finish · Esc
            </button>
          </div>
          {kind === 'story' && (
            <p>
              {completed} / {story!.sentences.length} sentences heard. Completion records listening,
              not comprehension.
            </p>
          )}
          {kind === 'story' && disclosed.length > 0 && (
            <details>
              <summary>Revealed transcript</summary>
              {disclosed.map((s, i) => (
                <p key={i}>{s}</p>
              ))}
            </details>
          )}
        </>
      )}
      {phase === 'done' && (
        <div className="language-summary">
          <h3>{kind === 'word' ? 'Round complete' : 'End of the story'}</h3>
          {kind === 'word' ? (
            <>
              <p>
                {eligible.length
                  ? `${correct} / ${eligible.length} independent words correct (${Math.round((correct / eligible.length) * 100)}%)`
                  : 'No independent typed accuracy for this round.'}
              </p>
              <p>
                {results.filter((v) => v.activity.replay || v.activity.revealed).length} assisted ·{' '}
                {results.filter((v) => v.activity.interrupted).length} interruptions
              </p>
              {missed.length > 0 && (
                <button onClick={() => void startWords(missed)}>
                  Practise missed words · review
                </button>
              )}
            </>
          ) : (
            <p>
              {completed} / {story!.sentences.length} sentences heard. Listening completion is
              separate from accuracy.
            </p>
          )}
          <button
            className="btn"
            onClick={() => {
              setStory(null);
              setPhase('setup');
            }}
          >
            Back to {kind === 'word' ? 'words' : 'stories'}
          </button>
        </div>
      )}
      <details>
        <summary>Your word and story data</summary>
        <p>
          Guest activity stays on this browser. Signed-in activity is included in account export and
          reset in Settings.
        </p>
        <button
          onClick={() =>
            void store.current
              .export()
              .then((bytes) => {
                const url = URL.createObjectURL(
                  new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'dojo-language.bin';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
              .catch((error) => setMessage(String(error)))
          }
        >
          Export this browser's activity
        </button>
        {owner === 'guest' && (
          <>
            <label>
              Type DELETE to clear guest activity
              <input
                aria-label="Confirm clearing guest activity"
                value={confirmation}
                onChange={(ev) => setConfirmation(ev.target.value)}
              />
            </label>
            <button
              disabled={confirmation !== 'DELETE'}
              onClick={() => {
                void stop();
                void clearLanguage('guest').then(() => {
                  store.current.entries = [];
                  setEntries([]);
                  setStory(null);
                  setPhase('setup');
                  setConfirmation('');
                  setMessage('Guest activity cleared.');
                });
              }}
            >
              Clear guest activity
            </button>
          </>
        )}
      </details>
      <details className="language-history">
        <summary>
          Recent {kind === 'word' ? 'word' : 'story'} activity (
          {entries.filter((v) => v.activity.kind === kind).length})
        </summary>
        {entries
          .filter((v) => v.activity.kind === kind)
          .slice(-20)
          .reverse()
          .map((v) => (
            <p key={v.activity.id}>
              {new Date(v.activity.created).toLocaleDateString()} · {v.activity.item}
              {kind === 'story' ? ` · sentence ${v.activity.sentence + 1}` : ''} ·{' '}
              {v.activity.interrupted
                ? 'Interrupted'
                : v.activity.self_report !== null
                  ? 'Self-report'
                  : v.activity.answer === null
                    ? 'Listening'
                    : v.outcome.correct
                      ? 'Correct'
                      : 'Answer recorded'}
              {v.activity.replay || v.activity.revealed ? ' · assisted' : ''}
              {v.activity.review ? ' · repeated material' : ''}
              {kind === 'story' && v.activity.answer !== null
                ? ` · attempt ${Math.round((v.outcome.attempt_accuracy || 0) * 100)}% / final ${Math.round((v.outcome.final_accuracy || 0) * 100)}%`
                : ''}
            </p>
          ))}
      </details>
      {message && <p role="status">{message}</p>}
      <p className="muted">
        These activities do not change your automatic training pace or verified milestones.
      </p>
    </section>
  );
}
