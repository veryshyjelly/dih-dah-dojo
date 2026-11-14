import { ProgressSummary } from './LanguageProgress';
import { useEffect, useRef, useState } from 'react';
import { audio } from './audio';
import {
  BookOpen,
  Headphones,
  SlidersHorizontal,
  Target,
  Shuffle,
  Play,
  Pause,
  RotateCcw,
  ArrowUpRight,
  Clock,
  Waves,
  Mail,
  Wrench,
  ShoppingBasket,
  CloudRain,
  TrainFront,
} from 'lucide-react';
import type { EngineClient } from './engine-client';
import type { Snapshot } from './types';
import { LanguageStore, type Activity, type Entry } from './language-store';
type Word = { id: string; text: string; meaning: string; set: string };
type Story = { id: string; title: string; sentences: string[]; seconds: number };
const storyIcons = [Waves, Mail, Wrench, ShoppingBasket, CloudRain, TrainFront];
const storyNotes: Record<string, { theme: string; description: string }> = {
  'story-1': { theme: 'By the water', description: 'An unhurried morning on the riverbank.' },
  'story-2': {
    theme: 'Everyday connections',
    description: 'A small delivery brings a distant friend closer.',
  },
  'story-3': {
    theme: 'Made by hand',
    description: 'Spend an afternoon where small things take shape.',
  },
  'story-4': {
    theme: 'Out and about',
    description: 'A familiar walk, with a few things to bring home.',
  },
  'story-5': {
    theme: 'A quiet moment',
    description: 'Settle indoors while the world carries on outside.',
  },
  'story-6': {
    theme: 'On the move',
    description: 'Watch the scenery change on a journey away from home.',
  },
};
export function LanguagePractice({
  kind,
  engine,
  owner,
  snapshot,
  input,
  requestedStory,
  onProgress,
}: {
  kind: 'word' | 'story';
  engine: EngineClient;
  owner: string;
  snapshot: Snapshot;
  input: string;
  requestedStory: string | null;
  onProgress: () => void;
}) {
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
    const leave = () => {
      generation.current++;
      continuousStarted.current = false;
    };
    window.addEventListener('dojo-navigation', leave);
    window.addEventListener('online', online);
    return () => {
      live = false;
      generation.current++;
      void audio.stop();
      window.removeEventListener('online', online);
      window.removeEventListener('dojo-navigation', leave);
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
    setStatus('Saving…');
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
      const sound = await audio.play(
        { text, c, e: Math.min(c, e), rescue: false },
        () => token === generation.current,
      );
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
  const openedRequest = useRef<string | null>(null);
  useEffect(() => {
    if (
      kind !== 'story' ||
      !requestedStory ||
      !catalog.length ||
      status === 'Loading saved activity…' ||
      openedRequest.current === requestedStory
    )
      return;
    openedRequest.current = requestedStory;
    const selected = catalog.find((s) => s.id === requestedStory);
    if (selected) startStory(selected);
    else setMessage('This story is unavailable. Choose another story below.');
  }, [requestedStory, catalog, status, kind]);
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
    <section
      className={`language-practice ${kind === 'story' ? 'story-mode' : 'word-mode'} ${kind === 'word' && phase === 'setup' ? 'word-setup' : ''} ${kind === 'story' && !story ? 'story-library-page' : ''} ${phase !== 'setup' && (kind === 'word' ? words.length > 0 : !!story) ? 'language-session' : ''}`}
    >
      <div className="language-heading">
        <div className="language-title">
          <span className="tool-icon" aria-hidden="true">
            {kind === 'word' ? <BookOpen size={25} /> : <Headphones size={25} />}
          </span>
          <div className="language-title-copy">
            <p className="eyebrow">{kind === 'word' ? 'YOUR WORD PRACTICE' : 'THE STORY ROOM'}</p>
            <h1>
              {kind === 'word' && phase === 'setup' ? (
                <>
                  Find your
                  <br />
                  <em>word rhythm.</em>
                </>
              ) : kind === 'story' && !story ? (
                <>
                  A little story.
                  <br />
                  <em>A little signal.</em>
                </>
              ) : kind === 'word' ? (
                'One whole word.'
              ) : (
                story?.title
              )}
            </h1>
            {kind === 'word' && phase === 'setup' && (
              <p className="word-intro">
                Listen, answer, and take the next word when you’re ready.
              </p>
            )}
            {kind === 'story' && !story && (
              <p className="story-intro">
                Six short escapes. Listen one sentence at a time, at your own pace.
              </p>
            )}
          </div>
        </div>
        <span className="language-save-status">
          <i aria-hidden="true" />
          {status}
        </span>
      </div>
      {(phase === 'setup' || (kind === 'story' && !story)) &&
        (kind === 'word' ? (
          <div className="word-workspace">
            <div className="word-start-bar continue-card">
              <div className="word-launch-copy">
                <span className="pill">ONE WHOLE SOUND</span>
                <h2>
                  Let the sounds
                  <br />
                  come together.
                </h2>
                <p>
                  {length === '1-30'
                    ? 'All lengths'
                    : length === '6-30'
                      ? '6+ letters'
                      : length.replace('-', '–') + ' letters'}{' '}
                  · {set === 'radio' ? 'Radio abbreviations' : 'Common English words'}
                  <br />
                  {listen ? 'Listen and reveal' : 'Type what you hear'} · Up to 10 words · No timer
                </p>
                <p className="word-launch-pace">
                  {c} / {Math.min(c, e)} character / effective WPM
                </p>
                <button
                  className="btn"
                  disabled={busy || repertoire.length === 0 || status === 'Loading saved activity…'}
                  onClick={() => void startWords()}
                >
                  <Play size={17} aria-hidden="true" />
                  Start word round
                  <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              </div>
              <div
                className="pace-orbit"
                role="img"
                aria-label={`Requested speed: ${c} character and ${Math.min(c, e)} overall words per minute`}
              >
                <span>
                  {c}
                  <small> / {Math.min(c, e)}</small>
                </span>
                <label>character / effective WPM</label>
                <i>YOUR LISTENING PACE</i>
              </div>
            </div>
            <fieldset className="word-round-settings">
              <legend>
                <Shuffle size={14} aria-hidden="true" />
                Your round
              </legend>
              <div className="language-settings">
                <label>
                  Word length
                  <select
                    aria-label="Word length"
                    value={length}
                    onChange={(ev) => setLength(ev.target.value)}
                  >
                    <option value="2-3">2–3 letters</option>
                    <option value="4-5">4–5 letters</option>
                    <option value="6-30">6+ letters</option>
                    <option value="1-30">All lengths</option>
                  </select>
                </label>
                <label>
                  Vocabulary
                  <select
                    aria-label="Vocabulary"
                    value={set}
                    onChange={(ev) => setSet(ev.target.value)}
                  >
                    <option value="words">Common English words</option>
                    <option value="radio">Radio abbreviations</option>
                  </select>
                </label>
                <label>
                  Response
                  <select
                    aria-label="Response"
                    value={String(listen)}
                    onChange={(ev) => setListen(ev.target.value === 'true')}
                  >
                    <option value="false">Type the word</option>
                    <option value="true">Listen and reveal</option>
                  </select>
                </label>
              </div>
            </fieldset>
            <div className="language-settings story-pace">
              <div className="story-pace-caption">
                <strong>
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  Your listening pace
                </strong>
                <span>Set the sound speed and the space to think.</span>
              </div>
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
            <section className="word-letter-section" aria-labelledby="word-letters-title">
              <div className="word-section-heading">
                <div>
                  <h3 id="word-letters-title">
                    <Target size={14} aria-hidden="true" />
                    Letters for this round <span>{new Set(repertoire).size} / 26</span>
                  </h3>
                  <p>
                    {owner === 'guest'
                      ? 'Choose the sounds you want to practise.'
                      : 'Your introduced letters are selected to start.'}
                  </p>
                </div>
                <div className="word-letter-actions">
                  <button onClick={() => setRepertoire('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}>
                    Use all letters
                  </button>
                  {owner !== 'guest' && (
                    <button
                      onClick={() => setRepertoire(snapshot.introduced.replace(/[^A-Z]/g, ''))}
                    >
                      Use introduced letters
                    </button>
                  )}
                  <button onClick={() => setRepertoire('')}>Clear letters</button>
                </div>
              </div>
              <div className="word-letter-picker" role="group" aria-label="Word characters">
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
                  <button
                    type="button"
                    key={letter}
                    aria-label={letter}
                    aria-pressed={repertoire.includes(letter)}
                    onClick={() =>
                      setRepertoire((current) =>
                        current.includes(letter)
                          ? current.replaceAll(letter, '')
                          : current + letter,
                      )
                    }
                  >
                    {letter}
                  </button>
                ))}
              </div>
              {repertoire.length === 0 && (
                <p className="word-selection-hint">
                  Select a few letters to build your word round.
                </p>
              )}
              <div className="word-letter-note">
                <Headphones size={17} aria-hidden="true" />
                <p>Start with familiar sounds. Add a few more whenever you feel ready.</p>
              </div>
            </section>
          </div>
        ) : (
          <>
            <div className="language-settings story-pace">
              <div className="story-pace-caption">
                <strong>
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  Your listening pace
                </strong>
                <span>Set the sound speed and the space to think.</span>
              </div>
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
            <div className="story-shelf-heading">
              <div>
                <span className="eyebrow">A PLACE TO BEGIN</span>
                <h2>The listening shelf.</h2>
              </div>
              <p>Six short escapes. Pick a place to tune in.</p>
            </div>
            <div className="story-library" aria-label="Story library">
              {catalog.map((s, number) => {
                const required = [...new Set(s.sentences.join('').replace(/ /g, ''))].sort();
                const unfamiliar = required.filter((ch) => !snapshot.introduced.includes(ch));
                const activity = entries.filter(
                  (v) => v.activity.kind === 'story' && v.activity.item === s.id,
                );
                const heard = new Set(
                  activity
                    .filter((v) => v.activity.finished && !v.activity.interrupted)
                    .map((v) => v.activity.sentence),
                ).size;
                const note = storyNotes[s.id];
                const StoryIcon = storyIcons[number % storyIcons.length];
                return (
                  <article
                    className={`story-entry story-tone-${number % 3} ${number === 0 ? 'story-featured' : ''}`}
                    key={s.id}
                  >
                    <button
                      className="story-card"
                      disabled={status === 'Loading saved activity…'}
                      onClick={() => startStory(s)}
                    >
                      <span className="story-card-top">
                        <span className="story-edition">
                          {String(number + 1).padStart(2, '0')} <span aria-hidden="true">/</span>{' '}
                          {note?.theme || 'Short story'}
                        </span>
                        <span className="story-category-icon" aria-hidden="true">
                          <StoryIcon size={21} strokeWidth={1.4} />
                        </span>
                      </span>
                      <strong>{s.title}</strong>
                      <span className="story-description">
                        {note?.description || 'A short story to find your listening rhythm.'}
                      </span>
                      {number === 0 && (
                        <svg className="story-cover-art" viewBox="0 0 440 190" aria-hidden="true">
                          <circle cx="325" cy="42" r="28" />
                          <path d="M0 99 Q80 55 165 92 T330 90 T470 94 M0 116 Q90 80 180 114 T360 111 T470 117 M30 140 Q120 115 210 142 T430 140 M90 165 Q190 142 285 164 T465 160" />
                        </svg>
                      )}
                      <span className="story-card-bottom">
                        <span className="story-metrics">
                          <Clock size={12} aria-hidden="true" />
                          {s.sentences.join(' ').split(/\s+/).length} words{' '}
                          <span aria-hidden="true">·</span> {Math.ceil(s.seconds / 60)} min
                        </span>
                        <span className="story-start">
                          {activity.length
                            ? heard === s.sentences.length
                              ? 'Listen again'
                              : 'Continue'
                            : 'Listen'}{' '}
                          <ArrowUpRight size={16} aria-hidden="true" />
                        </span>
                      </span>
                      {activity.length > 0 && (
                        <span className="story-progress">
                          {heard} / {s.sentences.length} sentences heard
                        </span>
                      )}
                    </button>
                    <details className="story-characters">
                      <summary>
                        Character guide{' '}
                        <span>
                          {owner === 'guest'
                            ? `${required.length} characters`
                            : unfamiliar.length
                              ? `${unfamiliar.length} new to you`
                              : 'All introduced'}
                        </span>
                      </summary>
                      <p>Required characters</p>
                      <div className="story-character-chips">
                        {required.map((ch) => (
                          <span
                            key={ch}
                            className={
                              owner !== 'guest' && unfamiliar.includes(ch) ? 'unfamiliar' : ''
                            }
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                      {owner !== 'guest' && (
                        <p>
                          {unfamiliar.length
                            ? `Not yet introduced in training: ${unfamiliar.join(' ')}`
                            : 'All characters have been introduced in your training.'}{' '}
                          You can listen at any stage.
                        </p>
                      )}
                    </details>
                  </article>
                );
              })}
            </div>{' '}
          </>
        ))}
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
              {playCount.current ? (
                <RotateCcw size={14} aria-hidden="true" />
              ) : (
                <Play size={14} aria-hidden="true" />
              )}
              {playCount.current ? 'Replay' : 'Play'} <small>F6</small>
            </button>
            {playing && (
              <button onClick={pause}>
                <Pause size={14} aria-hidden="true" />
                Pause · F5
              </button>
            )}
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
      {status !== 'Loading saved activity…' &&
        ((kind === 'word' && phase === 'setup') || (kind === 'story' && !story)) && (
          <ProgressSummary
            entries={entries}
            kind={kind}
            stories={catalog}
            onProgress={onProgress}
          />
        )}
      {message && <p role="status">{message}</p>}
      <p className="muted">
        These activities do not change your automatic training pace or verified milestones.
      </p>
    </section>
  );
}
