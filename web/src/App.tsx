import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Headphones,
  Play,
  Pause,
  Square,
  RotateCcw,
  Volume2,
  SlidersHorizontal,
  ChevronRight,
  Check,
  X,
  Activity,
  Keyboard,
  Hand,
  LogOut,
  Download,
  Trash2,
  ArrowLeft,
  Info,
  Target,
  Radio,
  BookOpen,
  Shuffle,
  Signal,
  Clock,
  Cloud,
  CloudOff,
  LoaderCircle,
  HelpCircle,
  Mail,
} from 'lucide-react';
import { EngineClient } from './engine-client';
import { Training, type TrainingView } from './training';
import { audio } from './audio';
import { Privacy } from './Privacy';
import { ThemeToggle } from './ThemeToggle';
import { HelpGuide } from './HelpGuide';
import { LanguagePractice } from './LanguagePractice';
import { clearLanguage } from './language-store';
import * as api from './api';
import { pending, putPending, removePending } from './outbox';
import {
  SYMBOLS,
  percent,
  type User,
  type InputProfile,
  type Snapshot,
  type Summary,
  type Progress,
  type Graph,
  type CharacterEstimate,
} from './types';
const empty: Snapshot = {
  policy: 'cw-policy-v1.2',
  introduced: '',
  entryComplete: false,
  recognitionC: 20,
  copyingC: 20,
  copyingE: 5,
  timeout: 4,
  sessions: 0,
  volume: 50,
  frequency: 600,
  nextMode: 'recognition',
  milestones: [],
  checkOffer: null,
};
type Route = 'home' | 'practice' | 'tools' | 'progress' | 'settings' | 'privacy';
const routeFromPath = (): Route => {
  const path = location.pathname.split('/')[1];
  return ['practice', 'tools', 'progress', 'settings', 'privacy'].includes(path)
    ? (path as Route)
    : 'home';
};
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true">
      <i />
      <b />
    </span>
  );
}
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`${secondary ? 'button secondary' : 'button'} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
function Modal({
  title,
  children,
  onClose,
  wide = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''} ${className}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const [route, setRoute] = useState<Route>(routeFromPath);
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [profile, setProfile] = useState<InputProfile>(() =>
    matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard',
  );
  const profileRef = useRef(profile);
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [signin, setSignin] = useState(false);
  const [help, setHelp] = useState(false);
  const [providers, setProviders] = useState({ google: false, github: false });
  const syncingRef = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [known, setKnown] = useState('');
  const [lesson, setLesson] = useState(false);
  const [heard, setHeard] = useState<string[]>([]);
  const [engine] = useState(() => new EngineClient());
  const revision = useRef(0);
  const epoch = useRef('');
  const [range, setRange] = useState(30);
  const [training] = useState(() => new Training(engine, saveBlock, endSession));
  const [session, setSession] = useState<TrainingView>(training.view);
  const snapshotRef = useRef(snapshot);
  const [preview, setPreview] = useState('Ready to listen');
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewGeneration = useRef(0);
  const [reference, setReference] = useState<{ symbol: string; pattern: string }[]>([]);
  const [details, setDetails] = useState<{
    title: string;
    lines: string[];
  } | null>(null);
  useEffect(() => {
    training.onChange = setSession;
    audio.onError = (message) => {
      if (training.active) void training.finish(false, message);
      else notify(message);
    };
    void engine
      .json<{ symbol: string; pattern: string }[]>('reference')
      .then(setReference)
      .catch(notify);
    void api
      .getSession()
      .then(async (response) => {
        setProviders(response.providers);
        if (response.user) {
          userRef.current = response.user;
          setUser(response.user);
          await loadProfile();
          await syncOutbox();
        }
      })
      .catch(() => {});
    const pop = () => {
      void training.leave().then(() => setRoute(routeFromPath()));
    };
    window.addEventListener('popstate', pop);
    const visibility = () => {
      if (
        document.visibilityState === 'hidden' &&
        training.active &&
        training.view.phase !== 'paused'
      )
        void training.pause();
    };
    document.addEventListener('visibilitychange', visibility);
    const online = () => {
      if (userRef.current) void syncOutbox();
    };
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('dialog[open]')) {
        if (training.active && (event.key === 'F5' || event.key === 'F6')) event.preventDefault();
        return;
      }
      if (session.phase === 'summary') {
        if (event.key === ' ') {
          event.preventDefault();
          training.hold();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          void training.continue();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          void training.end();
        }
        return;
      }
      if (!training.active) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        void training.finish(false, 'Practice ended by the learner.');
      } else if (event.key === 'F5') {
        event.preventDefault();
        void training.pause();
      } else if (event.key === 'F6' && session.mode === 'recognition') {
        event.preventDefault();
        void training.answer('replay');
      } else if (
        session.mode === 'recognition' &&
        !['paused', 'teaching', 'feedback'].includes(session.phase)
      ) {
        if (event.key === 'Tab') {
          event.preventDefault();
          void training.answer('unknown');
        } else if (event.key.length === 1 && SYMBOLS.includes(event.key.toUpperCase())) {
          event.preventDefault();
          void training.answer(event.key, event.timeStamp);
        }
      } else if (session.mode === 'copying' && session.phase === 'tail' && event.key === 'Enter') {
        event.preventDefault();
        void training.finish(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [session.phase, session.mode]);
  async function openHelp() {
    try {
      if (training.view.phase === 'summary' && !training.view.held) training.hold();
      else if (training.active && training.view.phase !== 'paused') await training.pause();
      setHelp(true);
    } catch (error) {
      notify(error);
    }
  }
  function notify(message: unknown) {
    setToast(message instanceof Error ? message.message : String(message));
  }
  async function refresh() {
    const result = await engine.json<Snapshot>('snapshot', Date.now());
    snapshotRef.current = result;
    setSnapshot(result);
    audio.volume = result.volume;
    audio.frequency = result.frequency;
    return result;
  }
  async function loadProfile() {
    if (!userRef.current) return;
    setLoading(true);
    try {
      const p = await api.getProfile(profileRef.current);
      revision.current = p.revision;
      epoch.current = p.epoch;
      let records = [...p.records];
      let cursor = (p as typeof p & { cursor: number | null }).cursor;
      while (cursor) {
        const more = await api.request<{
          records: string[];
          cursor: number | null;
        }>(`/api/records/${profileRef.current}?before=${cursor}`);
        records.push(...more.records);
        cursor = more.cursor;
      }
      await engine.call('load', api.fromBase64(p.state));
      for (const record of records.reverse())
        await engine.call('history_add', api.fromBase64(record));
      await refresh();
      setProgress(await engine.json<Progress>('progress', Date.now(), range));
    } catch (error) {
      notify(error);
    } finally {
      setLoading(false);
    }
  }
  async function profileAction(action: string, values: Record<string, unknown> = {}) {
    const result = await api.updateProfile(
      profileRef.current,
      action,
      values,
      revision.current,
      epoch.current,
    );
    revision.current = result.revision;
    await loadProfile();
  }
  async function saveBlock(id: string, packet: Uint8Array, _summary: Summary, source: string) {
    if (source === 'demo') return 'Demo complete · no account data saved';
    if (!userRef.current) {
      await refresh();
      return 'Manual practice · not saved to an account';
    }
    const block = {
      epoch: epoch.current,
      id,
      profile: profileRef.current,
      baseRevision: revision.current,
      packet,
    };
    await putPending(userRef.current.id, block);
    setPendingCount((await pending(userRef.current.id)).length);
    try {
      const result = await api.uploadBlock(block);
      await removePending(id);
      revision.current = result.revision;
      setPendingCount((await pending(userRef.current.id)).length);
      if (result.conflict) {
        await loadProfile();
        return 'Saved as extra practice · newer progress preserved';
      }
      await refresh();
      return source === 'guided' ? 'Synced' : 'Manual practice synced';
    } catch {
      await refresh();
      return 'Saved on this device · waiting to sync';
    }
  }
  async function syncOutbox() {
    if (!userRef.current || syncingRef.current || training.active) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      for (const block of await pending(userRef.current.id)) {
        try {
          const result = await api.uploadBlock(block);
          revision.current = result.revision;
        } catch (error) {
          if (!(error instanceof api.ApiError) || error.status !== 410) throw error;
          notify('Progress was reset on another device. Older pending results were removed.');
        }
        await removePending(block.id);
      }
      setPendingCount((await pending(userRef.current.id)).length);
      if (!training.active) {
        await loadProfile();
        training.syncStatus('Synced');
      }
    } catch (error) {
      notify(error);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }
  async function endSession() {
    if (userRef.current) {
      try {
        await profileAction('end');
      } catch (error) {
        notify(error);
      }
    }
  }
  function cancelPreview() {
    previewGeneration.current++;
    if (previewTimer.current) clearTimeout(previewTimer.current);
  }
  async function navigate(next: Route) {
    cancelPreview();
    if (training.sessionActive || training.active) await training.leave();
    if (previewTimer.current) clearTimeout(previewTimer.current);
    await audio.stop();
    setRoute(next);
    history.pushState({}, '', next === 'home' ? '/' : `/${next}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (next === 'progress' && userRef.current) {
      await loadProfile();
      setProgress(await engine.json<Progress>('progress', Date.now(), range));
    }
  }
  async function chooseProfile(next: InputProfile) {
    if (next === profile || training.active || loading || syncingRef.current) return;
    await training.leave();
    setProfile(next);
    profileRef.current = next;
    setProgress(null);
    await engine.call('load', new Uint8Array());
    await refresh();
    if (userRef.current) await loadProfile();
  }
  async function start(mode = 'adaptive', source = 'guided', extra: Record<string, unknown> = {}) {
    cancelPreview();
    try {
      if (source === 'guided' && !userRef.current) {
        setSignin(true);
        return;
      }
      await audio.enable();
      if (source === 'guided') {
        await profileAction('begin');
      } else if (source === 'demo') {
        await engine.call('load', new Uint8Array());
      }
      setRoute('practice');
      history.pushState({}, '', '/practice');
      await training.start({
        mode,
        source,
        characters: source === 'demo' ? 'KM' : SYMBOLS,
        ...extra,
      });
    } catch (error) {
      notify(error);
    }
  }
  async function beginFresh() {
    if (!userRef.current) {
      setSignin(true);
      return;
    }
    setHeard([]);
    setLesson(true);
  }
  async function hearLesson(symbol: string) {
    try {
      setPreview(`Listening to ${symbol}`);
      const sound = await audio.play({
        text: symbol,
        c: 20,
        e: 20,
        rescue: false,
      });
      if (await sound.finished) return;
      setHeard((old) => [...new Set([...old, symbol])]);
      setPreview('Ready to listen');
    } catch (error) {
      notify(error);
    }
  }
  async function finishLesson() {
    try {
      await profileAction('bootstrap', { known: 'KM', taught: true });
      setLesson(false);
      await start();
    } catch (error) {
      notify(error);
    }
  }
  async function declareKnown() {
    try {
      if (!known) return;
      await profileAction('bootstrap', { known });
      setKnown('');
      await start();
    } catch (error) {
      notify(error);
    }
  }
  async function previewSound(volume: number, frequency: number) {
    const generation = ++previewGeneration.current;
    audio.setVolume(volume);
    audio.frequency = frequency;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    setPreview('Preparing your sound…');
    try {
      await audio.enable();
      await audio.stop();
    } catch (error) {
      notify(error);
      setPreview('Preview unavailable');
      return;
    }
    if (generation !== previewGeneration.current) return;
    previewTimer.current = setTimeout(() => {
      void (async () => {
        try {
          if (generation !== previewGeneration.current) return;
          const sound = await audio.play({
            text: 'K',
            c: 20,
            e: 20,
            rescue: false,
          });
          if (generation === previewGeneration.current) setPreview('Playing preview');
          await sound.finished;
          if (generation === previewGeneration.current) setPreview('Ready to listen');
        } catch (error) {
          notify(error);
          setPreview('Preview unavailable');
        }
      })();
    }, 100);
  }
  async function signout() {
    await training.leave();
    await api.signOut();
    userRef.current = null;
    setUser(null);
    await engine.call('load', new Uint8Array());
    await refresh();
    setProgress(null);
    await navigate('home');
  }
  const busy = training.active || session.phase === 'summary';
  return (
    <div className="site-shell">
      <header className="site-header">
        <button
          className="brand"
          onClick={() => void navigate('home')}
          aria-label="Dih Dah Dojo home"
        >
          <Mark />
          <span>
            dih dah<span className="brand-dojo">dojo</span>
          </span>
        </button>
        <nav aria-label="Main navigation">
          {(['home', 'practice', 'tools', 'progress'] as Route[]).map((item, i) => (
            <button
              key={item}
              className={route === item ? 'active' : ''}
              onClick={() => void navigate(item)}
            >
              {['The studio', 'Practice', 'Tools', 'Your progress'][i]}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          <button
            className="icon-button help-button"
            aria-label="Help"
            onClick={() => void openHelp()}
            disabled={session.phase === 'loading'}
          >
            <HelpCircle size={19} />
          </button>
          {user ? (
            <button
              className="account-button"
              aria-label="Sound and settings"
              onClick={() => void navigate('settings')}
            >
              <span className="avatar">{(user.name || user.email)[0].toUpperCase()}</span>
              <span>{user.name?.split(' ')[0] || 'Your account'}</span>
            </button>
          ) : (
            <button className="sign-in" onClick={() => setSignin(true)}>
              Sign in <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </header>
      <main>
        {busy || session.phase === 'finished' || session.phase === 'error' ? (
          <TrainingScreen
            training={training}
            session={session}
            profile={profile}
            onClose={() => void training.leave()}
            onSignin={() => setSignin(true)}
            onRetry={() => void syncOutbox()}
            syncing={syncing}
          />
        ) : (
          <>
            {route === 'home' && (
              <Home
                onStart={() =>
                  void (user
                    ? snapshot.entryComplete
                      ? start()
                      : navigate('practice')
                    : start('recognition', 'demo'))
                }
                onTools={() => void navigate('tools')}
                onPractice={() => void navigate('practice')}
                user={user}
                snapshot={snapshot}
              />
            )}
            {route === 'practice' && (
              <section className="page">
                <div className="page-heading">
                  <span className="eyebrow">YOUR DAILY PRACTICE</span>
                  <h1>
                    A little focus.
                    <br />
                    <em>A steadier ear.</em>
                  </h1>
                  <p>Pick up where you are. We’ll find the right pace together.</p>
                </div>
                <div className="practice-layout">
                  <div className="practice-main">
                    <div className="profile-toggle">
                      <span>How you respond</span>
                      <div className="segmented">
                        <button
                          className={profile === 'keyboard' ? 'selected' : ''}
                          onClick={() => void chooseProfile('keyboard')}
                        >
                          <Keyboard size={15} /> Keyboard
                        </button>
                        <button
                          className={profile === 'touch' ? 'selected' : ''}
                          onClick={() => void chooseProfile('touch')}
                        >
                          <Hand size={15} /> Touch
                        </button>
                      </div>
                    </div>
                    {!user ? (
                      <div className="welcome-card">
                        <Headphones size={33} />
                        <h2>Make this your space.</h2>
                        <p>
                          Sign in to find your starting point, train at your pace, and take your
                          progress with you.
                        </p>
                        <Button onClick={() => setSignin(true)}>
                          Start your learning journey <ArrowRight size={17} />
                        </Button>
                        <button
                          className="text-button"
                          onClick={() => void start('recognition', 'demo')}
                        >
                          Try five sounds first <Play size={14} />
                        </button>
                      </div>
                    ) : loading ? (
                      <div className="loading-card">
                        <LoaderCircle className="spin" /> Preparing your studio…
                      </div>
                    ) : !snapshot.entryComplete ? (
                      <div className="onboarding">
                        <Pill tone="green">A GOOD PLACE TO BEGIN</Pill>
                        <h2>
                          Every good ear
                          <br />
                          starts somewhere.
                        </h2>
                        <p>
                          New to Morse? Start with two contrasting sounds. Already know a little?
                          We’ll listen together to find your starting point.
                        </p>
                        <div className="button-row">
                          <Button onClick={() => void beginFresh()}>
                            I’m starting fresh <ArrowRight size={16} />
                          </Button>
                          <Button secondary onClick={() => void start('placement')}>
                            Find my starting point
                          </Button>
                        </div>
                        <details>
                          <summary>I know which characters I’ve learned</summary>
                          <p>This declares familiarity, not mastery.</p>
                          <CharacterPicker selected={known} onChange={setKnown} />
                          <Button secondary disabled={!known} onClick={() => void declareKnown()}>
                            Use these characters
                          </Button>
                        </details>
                      </div>
                    ) : (
                      <>
                        <div className="continue-card">
                          <div>
                            <Pill tone="green">ADAPTIVE PRACTICE</Pill>
                            <h2>A rhythm of your own.</h2>
                            <p>
                              Recognition, copying, and a little review.
                              <br />
                              Around ten minutes, at a pace that follows you.
                            </p>
                            <Button onClick={() => void start()}>
                              Continue training <ArrowRight size={18} />
                            </Button>
                          </div>
                          <div className="pace-orbit">
                            <span>
                              {snapshot.copyingC}
                              <small> / {snapshot.copyingE}</small>
                            </span>
                            <label>character / overall WPM</label>
                            <i>YOUR NEXT AUTOMATIC PACE</i>
                          </div>
                        </div>
                        <div className="mode-cards">
                          <button onClick={() => void start('recognition')}>
                            <Headphones />
                            <h3>Recognize a sound</h3>
                            <p>One character. Your first instinct.</p>
                            <ArrowUpRight />
                          </button>
                          <button onClick={() => void start('copying')}>
                            <Keyboard />
                            <h3>Stay with the stream</h3>
                            <p>Listen, type, miss a little, rejoin.</p>
                            <ArrowUpRight />
                          </button>
                        </div>
                        {snapshot.checkOffer && (
                          <div className="check-offer">
                            <Target />
                            <div>
                              <h3>Ready for a steady-pace check?</h3>
                              <p>
                                Three minutes at demonstrated {snapshot.checkOffer.c}/
                                {snapshot.checkOffer.e} WPM. No catch-up gaps.
                              </p>
                            </div>
                            <Button secondary onClick={() => void start('check')}>
                              Take a check
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <aside className="practice-aside">
                    <span className="eyebrow">A LITTLE AT A TIME</span>
                    <h2>
                      {snapshot.introduced.length}
                      <span> / 42</span>
                    </h2>
                    <p>
                      characters introduced.
                      <br />
                      Familiarity is a beginning, not a finish line.
                    </p>
                    <div className="mini-grid">
                      {SYMBOLS.split('').map((c) => (
                        <span key={c} className={snapshot.introduced.includes(c) ? 'learned' : ''}>
                          {c}
                        </span>
                      ))}
                    </div>
                    <div className="aside-note">
                      <Clock size={17} />
                      <p>Ten focused minutes beats waiting for the perfect hour.</p>
                    </div>
                    <p className="fine-print">
                      Keyboard and touch have separate evidence and automatic targets. Both travel
                      with your account.
                    </p>
                  </aside>
                </div>
              </section>
            )}
            {route === 'tools' && (
              <Tools
                engine={engine}
                inputProfile={profile}
                reference={reference}
                snapshot={snapshot}
                progress={progress}
                user={user}
                preview={preview}
                onPreview={previewSound}
                onStart={(mode, extra) => void start(mode, 'tool', extra)}
                onError={notify}
                onSignin={() => setSignin(true)}
              />
            )}
            {route === 'progress' && (
              <ProgressPage
                user={user}
                data={progress}
                snapshot={snapshot}
                profile={profile}
                onProfile={chooseProfile}
                range={range}
                onRange={async (value) => {
                  setRange(value);
                  setProgress(await engine.json<Progress>('progress', Date.now(), value));
                }}
                onSignin={() => setSignin(true)}
                onStart={() => void navigate('practice')}
                onDetail={setDetails}
              />
            )}
            {route === 'settings' && (
              <Settings
                user={user}
                snapshot={snapshot}
                preview={preview}
                onPreview={previewSound}
                onSave={async (volume, frequency) => {
                  try {
                    await audio.stop();
                    await profileAction('preferences', { volume, frequency });
                    notify('Your sound is saved.');
                  } catch (error) {
                    notify(error);
                  }
                }}
                onSignout={() => void signout()}
                onReset={async () => {
                  await loadProfile();
                  setProgress(null);
                  notify('Your progress has been reset.');
                }}
                onDelete={async () => {
                  userRef.current = null;
                  setUser(null);
                  await engine.call('load', new Uint8Array());
                  await refresh();
                  await navigate('home');
                }}
                onError={notify}
                onSignin={() => setSignin(true)}
                pendingCount={pendingCount}
                onSync={() => void syncOutbox()}
              />
            )}
            {route === 'privacy' && <Privacy />}
          </>
        )}
      </main>
      <footer className="site-footer">
        <div>
          <Mark small />
          <span>A little practice. A little more fluent.</span>
        </div>
        <div>
          <button onClick={() => void openHelp()} disabled={session.phase === 'loading'}>
            How the dojo works <ArrowUpRight size={13} />
          </button>
          <button onClick={() => void navigate('privacy')}>Privacy</button>
          <a
            href="https://github.com/veryshyjelly/dih-dah-dojo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub source code"
          >
            <GithubIcon /> GitHub <ArrowUpRight size={13} />
          </a>
          <span>Made for curious ears.</span>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {signin && (
        <Modal title="Your progress, wherever you go." onClose={() => setSignin(false)}>
          <p>
            A small daily practice adds up. Sign in to keep your place and let the dojo adapt to
            you.
          </p>
          <div className="social-buttons">
            <Button
              disabled={!providers.google}
              secondary
              onClick={() => void api.signIn('google').catch(notify)}
            >
              <GoogleIcon /> Continue with Google <ArrowUpRight size={16} />
            </Button>
            <Button
              disabled={!providers.github}
              secondary
              onClick={() => void api.signIn('github').catch(notify)}
            >
              <GithubIcon /> Continue with GitHub <ArrowUpRight size={16} />
            </Button>
          </div>
          {!providers.google && !providers.github && (
            <p className="service-note">
              Sign-in is being prepared. You can explore the listening tools and try the studio
              meanwhile.
            </p>
          )}
          <p className="fine-print">
            Your practice history is private. We don’t publish scores or put learners on a
            leaderboard.
          </p>
          <button
            className="text-button"
            onClick={() => {
              setSignin(false);
              void start('recognition', 'demo');
            }}
          >
            Try five sounds first <ArrowRight size={14} />
          </button>
        </Modal>
      )}
      {lesson && (
        <Modal
          title="Two sounds. A beginning."
          onClose={() => {
            setLesson(false);
            void audio.stop();
          }}
        >
          <p>
            Listen to each character as a whole sound. You don’t need to count the dots and dashes.
          </p>
          <div className="lesson-cards">
            {['K', 'M'].map((c) => (
              <button
                key={c}
                onClick={() => void hearLesson(c)}
                className={heard.includes(c) ? 'heard' : ''}
              >
                <strong>{c}</strong>
                <span>
                  <Play size={14} /> Listen {heard.includes(c) && <Check size={14} />}
                </span>
              </button>
            ))}
          </div>
          <p className="fine-print">
            These first repetitions are assisted. Independent evidence comes with time and a little
            space.
          </p>
          <Button disabled={heard.length < 2} onClick={() => void finishLesson()}>
            I’ve heard both. Let’s begin. <ArrowRight size={15} />
          </Button>
        </Modal>
      )}
      {help && (
        <Modal title="Quick guide" onClose={() => setHelp(false)} className="help-modal">
          <HelpGuide
            onClose={() => setHelp(false)}
            paused={session.phase === 'paused'}
            summaryHeld={session.phase === 'summary' && session.held}
          />
        </Modal>
      )}
      {details && (
        <Modal title={details.title} onClose={() => setDetails(null)} wide>
          <div className="detail-lines">
            {details.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
function Home({
  onStart,
  onTools,
  onPractice,
  user,
  snapshot,
}: {
  onStart: () => void;
  onTools: () => void;
  onPractice: () => void;
  user: User | null;
  snapshot: Snapshot;
}) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-dot" /> A PLACE TO TUNE IN
          </span>
          <h1>
            Small sounds.
            <br />
            Endless
            <br />
            <em>possibilities.</em>
          </h1>
          <p>
            Morse code, learned by listening.
            <br />
            Find your rhythm with thoughtful practice
            <br className="desktop-break" /> that grows with you.
          </p>
          <div className="button-row">
            <Button onClick={onStart}>
              {user ? 'Continue your practice' : 'Find your rhythm'} <ArrowRight size={18} />
            </Button>
            <button className="text-button" onClick={onTools}>
              Explore the tools <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="hero-footnote">
            <Headphones size={15} />
            <span>Bring your ears. We’ll take it from there.</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-label">
            <span>THE ART OF PAYING ATTENTION</span>
            <span>01 — ∞</span>
          </div>
          <div className="sound-card">
            <div className="sound-card-top">
              <span>
                <i /> THE LISTENING ROOM
              </span>
              <Volume2 size={17} />
            </div>
            <div className="sound-orbit">
              <span className="orbit-ring ring-one" />
              <span className="orbit-ring ring-two" />
              <span className="orbit-ring ring-three" />
              <div className="sound-core">
                <Mark />
              </div>
              <span className="orbit-node node-one" />
              <span className="orbit-node node-two" />
            </div>
            <div className="hero-wave" aria-hidden="true">
              {Array.from({ length: 49 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    height: `${8 + Math.abs(Math.sin(i * 0.47)) * Math.sin((i / 48) * Math.PI) * 40}px`,
                  }}
                />
              ))}
            </div>
            <div className="sound-card-bottom">
              <div>
                <small>ONE SOUND AT A TIME</small>
                <strong>
                  A little signal.
                  <br />A new connection.
                </strong>
              </div>
              <button className="round-play" onClick={onStart} aria-label="Try the listening room">
                <Play size={24} fill="currentColor" />
              </button>
            </div>
          </div>
          <div className="visual-caption">
            <span>LISTEN → RECOGNIZE → GROW</span>
            <span>600 Hz / GOOD COMPANY</span>
          </div>
          <div className="floating-note">
            <span>LESS COUNTING.</span>
            <strong>More listening.</strong>
            <svg viewBox="0 0 100 24" aria-hidden="true">
              <path d="M2 17 Q26 3 49 14 T98 8" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </section>
      <section className="intro-strip">
        <div>
          <strong>42</strong>
          <span>
            little patterns.
            <br />a whole new language.
          </span>
        </div>
        <div>
          <strong>
            10<small>min</small>
          </strong>
          <span>
            a little room
            <br />
            in your everyday.
          </span>
        </div>
        <div>
          <Mark />
          <span>
            your pace.
            <br />
            your own progress.
          </span>
        </div>
        <p>
          No rushing.
          <br />
          Just a good next step.
        </p>
      </section>
      <section className="home-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">MAKE YOURSELF AT HOME</span>
            <h2>
              There’s a way in
              <br />
              for every curious ear.
            </h2>
          </div>
          <p>
            Start from scratch. Pick it back up.
            <br />
            Or just play with a little sound.
          </p>
        </div>
        <div className="feature-grid">
          <button className="feature-card lime" onClick={onPractice}>
            <span className="card-number">01 / PRACTICE</span>
            <Headphones className="feature-icon" />
            <h3>
              Find your
              <br />
              listening rhythm.
            </h3>
            <p>A thoughtful mix of recognition, copying and review that follows your progress.</p>
            <span className="feature-link">
              Enter the studio <ArrowUpRight size={18} />
            </span>
          </button>
          <button className="feature-card cream" onClick={onTools}>
            <span className="card-number">02 / EXPLORE</span>
            <SlidersHorizontal className="feature-icon" />
            <h3>
              A playground
              <br />
              for your ears.
            </h3>
            <p>
              Custom text, callsigns, random groups. A few useful tools. Plenty of possibilities.
            </p>
            <span className="feature-link">
              Play with sound <ArrowUpRight size={18} />
            </span>
          </button>
          <button className="feature-card sage" onClick={onPractice}>
            <span className="card-number">03 / GROW</span>
            <Activity className="feature-icon" />
            <h3>
              Small steps.
              <br />
              Something lasting.
            </h3>
            <p>
              See what’s getting easier, discover what needs a little attention, and keep going.
            </p>
            <span className="feature-link">
              {user
                ? `${snapshot.introduced.length} characters introduced`
                : 'Meet your next good habit'}{' '}
              <ArrowUpRight size={18} />
            </span>
          </button>
        </div>
      </section>
      <section className="closing-note">
        <span className="eyebrow">YOU DON’T HAVE TO GET IT ALL AT ONCE.</span>
        <h2>
          Just listen for
          <br />
          <em>the next sound.</em>
        </h2>
        <Button onClick={onStart}>
          Let’s begin <ArrowRight size={18} />
        </Button>
        <span className="closing-dots" aria-hidden="true">
          • — • &nbsp; — — &nbsp; • • •
        </span>
      </section>
    </>
  );
}
function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M22 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.6a4.8 4.8 0 0 1-2.1 3.1V20h3.6c2.1-1.9 2.9-4.5 2.9-7.8Z"
      />
      <path
        fill="#34a853"
        d="M12 22c3 0 5.5-1 7.1-2.7l-3.6-2.8c-.9.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.5v2.9A10.7 10.7 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.2 13.3a6.1 6.1 0 0 1 0-3.8V6.7H2.5a10.7 10.7 0 0 0 0 9.5l3.7-2.9Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.3c1.6 0 2.9.6 4 1.6l3-3A10 10 0 0 0 12 1 10.7 10.7 0 0 0 2.5 6.7l3.7 2.8C7 7.1 9.3 5.3 12 5.3Z"
      />
    </svg>
  );
}
function GithubIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .8a11.2 11.2 0 0 0-3.5 21.8c.6.1.8-.2.8-.6v-2.1c-3.2.7-3.8-1.4-3.8-1.4-.5-1.3-1.3-1.6-1.3-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 .1 1.3 2.1 3.3 1.3.1-.7.4-1.2.7-1.5-2.6-.3-5.2-1.3-5.2-5.6 0-1.2.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.1 1.2a10.8 10.8 0 0 1 5.6 0c2.2-1.5 3.1-1.2 3.1-1.2.7 1.6.3 2.8.2 3.1.8.8 1.2 1.9 1.2 3.1 0 4.3-2.6 5.3-5.2 5.6.4.4.8 1.1.8 2.1V22c0 .4.2.7.8.6A11.2 11.2 0 0 0 12 .8Z" />
    </svg>
  );
}
function CharacterPicker({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="character-picker" aria-label="Choose characters">
      {SYMBOLS.split('').map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={selected.includes(c)}
          className={selected.includes(c) ? 'selected' : ''}
          onClick={() =>
            onChange(
              selected.includes(c)
                ? selected.replace(c, '')
                : SYMBOLS.split('')
                    .filter((x) => x === c || selected.includes(x))
                    .join(''),
            )
          }
        >
          {c}
        </button>
      ))}
    </div>
  );
}
function TrainingScreen({
  training,
  session,
  profile,
  onClose,
  onSignin,
  onRetry,
  syncing,
}: {
  training: Training;
  session: TrainingView;
  profile: InputProfile;
  onClose: () => void;
  onSignin: () => void;
  onRetry: () => void;
  syncing: boolean;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const copyTail = useRef(session.copy);
  const edits = useRef(Promise.resolve());
  const editGeneration = useRef(0);
  const [draftCopy, setDraftCopy] = useState(session.copy);
  const [composition, setComposition] = useState('');
  const composing = useRef(false);
  const [heard, setHeard] = useState(false);
  useEffect(() => {
    setHeard(false);
  }, [session.trial?.symbol]);
  useEffect(() => {
    if (session.phase === 'loading') {
      copyTail.current = '';
      setDraftCopy('');
      editGeneration.current++;
    }
  }, [session.phase]);
  useEffect(() => {
    if (session.mode === 'copying' && ['copying', 'tail'].includes(session.phase)) {
      input.current?.focus({ preventScroll: true });
      if (input.current) {
        input.current.selectionStart = input.current.selectionEnd = input.current.value.length;
        input.current.scrollTop = input.current.scrollHeight;
      }
    }
  }, [session.copy, session.phase]);
  async function changeCopy(value: string) {
    const old = copyTail.current;
    const upper = value.toUpperCase();
    let keys: string[] = [];
    if (upper.startsWith(old)) {
      keys = [...upper.slice(old.length)];
    } else if (old.startsWith(upper)) {
      keys = Array(old.length - upper.length).fill('backspace');
    } else return;
    copyTail.current = upper;
    setDraftCopy(upper);
    const generation = ++editGeneration.current;
    edits.current = edits.current.then(async () => {
      for (const key of keys) await training.edit(key);
    });
    await edits.current;
    if (generation === editGeneration.current) {
      copyTail.current = training.view.copy;
      setDraftCopy(training.view.copy);
    }
  }
  const summary = session.summary;
  const recognition = session.mode === 'recognition';
  const label: Record<string, string> = {
    loading: 'Preparing your sound',
    listening: 'Listen to the whole sound',
    waiting: 'Your turn',
    captured: 'Answer captured',
    unknown: 'It’s okay not to know',
    replay: 'Assisted replay',
    timeout: 'The response window ended',
    feedback: 'A moment to notice',
    copying: 'Stay with the stream',
    tail: 'Finish your last thought',
    paused: 'Take a breath',
    teaching: 'Meet a new sound',
  };
  if (session.phase === 'error')
    return (
      <section className="page">
        <div className="welcome-card">
          <CloudOff size={32} />
          <h1>A small interruption.</h1>
          <p role="alert">{session.error}</p>
          <p>We won’t treat a technical problem as a learner mistake.</p>
          <Button onClick={onClose}>
            Back to the studio <ArrowLeft size={16} />
          </Button>
        </div>
      </section>
    );
  if (session.phase === 'summary' || session.phase === 'finished')
    return (
      <section className="page summary-page">
        <span className="eyebrow">A LITTLE PRACTICE, KEPT</span>
        <h1>{summary?.interrupted ? 'A pause in the story.' : 'That’s a little more fluent.'}</h1>
        <p>
          {session.phase === 'finished'
            ? 'Your completed observations stay with you.'
            : 'Take a moment. Notice what felt a little easier.'}
        </p>
        <div className="summary-status">
          <Pill tone={summary?.interrupted ? 'red' : 'green'}>
            {summary?.interrupted
              ? 'INTERRUPTED'
              : summary?.source === 'demo'
                ? 'DEMO'
                : summary?.source === 'tool'
                  ? 'MANUAL PRACTICE'
                  : 'BLOCK COMPLETE'}
          </Pill>
          <span>
            {session.sync === 'Synced' ? <Cloud size={16} /> : <CloudOff size={16} />}{' '}
            {session.sync}
          </span>
        </div>
        <div className="summary-grid">
          <article>
            <span className="eyebrow">YOUR FIRST ATTEMPT</span>
            <strong>{percent(summary?.attempt)}</strong>
            <p>The original answers, including corrections.</p>
          </article>
          <article>
            <span className="eyebrow">YOUR FINAL COPY</span>
            <strong>{percent(summary?.finalAccuracy)}</strong>
            <p>The transcript you left at the end.</p>
          </article>
        </div>
        <div className="result-notes">
          <div>
            <span className="eyebrow">THE PACE YOU PRACTICED</span>
            <p className="pre-line">{summary?.pace}</p>
          </div>
          <div>
            <span className="eyebrow">WHAT HAPPENS NEXT</span>
            <p>{summary?.decision}</p>
            <p>{summary?.reason}</p>
            {!!summary?.gaps && <Pill>{summary.gaps} catch-up gaps · assisted</Pill>}
            {summary?.interrupted && <p className="technical-note">{summary.interrupted}</p>}
          </div>
        </div>
        {summary?.qualifying && (
          <p className="success-note">
            <Check size={18} /> A qualifying result at these conditions. A verified milestone needs
            matching results on different dates.
          </p>
        )}
        <div className="summary-actions">
          {session.phase === 'summary' &&
          session.source === 'guided' &&
          session.sync === 'Synced' ? (
            <>
              <Button onClick={() => void training.continue()}>
                Continue <ArrowRight size={16} />
              </Button>
              <Button secondary onClick={() => training.hold()}>
                {session.held ? <Play size={16} /> : <Pause size={16} />}{' '}
                {session.held ? 'Resume countdown' : 'Hold this moment'}
              </Button>
              <span>
                {session.held
                  ? 'Held. Already saved.'
                  : `Next step in ${Math.ceil(session.remaining / 1000)}s`}
              </span>
            </>
          ) : session.sync.includes('waiting') ? (
            <Button disabled={syncing} onClick={onRetry}>
              {syncing ? <LoaderCircle className="spin" size={16} /> : <Cloud size={16} />} Retry
              sync
            </Button>
          ) : session.source === 'demo' ? (
            <Button onClick={onSignin}>
              Make this your daily practice <ArrowRight size={16} />
            </Button>
          ) : null}
          <button className="text-button" onClick={onClose}>
            Finish for now <Square size={13} />
          </button>
        </div>
        <p className="fine-print">
          {summary?.targets ?? 0} independent targets · latency includes typing · timing estimated
        </p>
      </section>
    );
  return (
    <section className="practice-workspace">
      <div className="workspace-bar">
        <button
          className="text-button"
          onClick={() => void training.finish(false, 'Practice ended by the learner.')}
        >
          <ArrowLeft size={15} /> Finish practice
        </button>
        <span>
          {session.source === 'demo'
            ? 'A FIVE-SOUND HELLO'
            : session.source === 'tool'
              ? 'YOUR OWN PRACTICE'
              : session.plan?.placement
                ? 'FINDING YOUR STARTING POINT'
                : 'YOUR DAILY LISTENING ROOM'}
        </span>
        <Pill>
          {profile === 'touch' ? <Hand size={13} /> : <Keyboard size={13} />} {profile}
        </Pill>
      </div>
      <div className="workspace-card">
        <div className="workspace-top">
          <Pill tone={session.phase === 'paused' ? 'amber' : 'green'}>
            <span
              className={`status-dot ${['listening', 'copying'].includes(session.phase) ? 'live' : ''}`}
            />
            {label[session.phase] || 'Listening room'}
          </Pill>
          <span>
            {recognition
              ? `${(session.trial?.index ?? 0) + 1} / ${session.plan?.count || 5}`
              : `${Math.floor(session.elapsed / 60)}:${String(session.elapsed % 60).padStart(2, '0')}`}
          </span>
        </div>
        {session.phase === 'paused' ? (
          <div className="paused-state">
            <Pause size={40} />
            <h2>No rush.</h2>
            <p>
              The affected trial or block is marked interrupted.
              <br />A pause is a pause, not a mistake.
            </p>
            <Button onClick={() => void training.pause()}>
              I’m ready <Play size={16} />
            </Button>
          </div>
        ) : session.phase === 'teaching' ? (
          <div className="recognition-center">
            <span className="eyebrow">ONE NEW SOUND TO KNOW</span>
            <strong className="answer-readout">{session.trial?.symbol}</strong>
            <span className="morse-caption">{session.trial?.pattern}</span>
            <p>
              Listen to the whole character.
              <br />
              You don’t need to count its pieces.
            </p>
            <div className="button-row">
              <Button
                secondary
                onClick={() =>
                  void training
                    .playTeaching()
                    .then(() => setHeard(true))
                    .catch(() => setHeard(false))
                }
              >
                <Volume2 size={16} /> Listen
              </Button>
              <Button
                disabled={!heard || audio.active}
                onClick={() => void training.acknowledgeTeaching()}
              >
                I’ve heard it <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        ) : recognition ? (
          <>
            <div className="recognition-center">
              <div
                className={`listening-orb ${session.answer ? 'answered' : ''}`}
                aria-hidden="true"
              >
                {session.answer && session.answer.length === 1 ? (
                  session.answer
                ) : session.phase === 'feedback' ? (
                  '—'
                ) : (
                  <>
                    <span className="orb-ripple" />
                    <Headphones size={40} strokeWidth={1} />
                  </>
                )}
              </div>
              <p className="response-caption" aria-live="polite">
                {session.answer
                  ? `Response: ${session.answer}`
                  : session.phase === 'waiting'
                    ? 'Type the character you heard.'
                    : 'Let the sound find its shape.'}
              </p>
              <div className="recognition-feedback" aria-live="polite">
                {session.phase === 'feedback' && session.feedback ? (
                  <>
                    <div className="recognition-result">
                      <span>
                        <span>Your answer</span> <strong>{session.feedback.response || '—'}</strong>
                      </span>
                      <span>
                        <span>Expected character</span> <strong>{session.feedback.expected}</strong>
                      </span>
                    </div>
                    <small>
                      {session.feedback.interrupted
                        ? 'Interrupted · excluded from independent evidence'
                        : session.feedback.assisted
                          ? 'Assisted repetition'
                          : session.feedback.correct
                            ? 'Recognized. A little more familiar.'
                            : 'Listen once more · the next repetition is assisted.'}
                    </small>
                  </>
                ) : (
                  <small>
                    {session.trial?.assisted
                      ? 'Assisted repetition · separate from independent evidence'
                      : 'Your first answer. No second guessing needed.'}
                  </small>
                )}
              </div>
            </div>
            {profile === 'touch' && (
              <div className="response-keyboard" aria-label="Recognition response keys">
                {['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM', '1234567890', '.,?/=+'].map((row) => (
                  <div key={row}>
                    {row.split('').map((c) => (
                      <button
                        key={c}
                        disabled={!['listening', 'waiting'].includes(session.phase)}
                        onClick={() => void training.answer(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="copying-center">
            <div className="copy-instruction">
              <Keyboard size={19} />
              <p>
                {session.phase === 'tail'
                  ? 'The sound has finished. Your last few characters still have room.'
                  : 'Keep listening. Skip what you miss and rejoin the stream.'}
              </p>
            </div>
            <label className="sr-only" htmlFor="copy-input">
              Your received copy
            </label>
            <textarea
              id="copy-input"
              ref={input}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              value={composing.current ? composition : draftCopy}
              placeholder="Your copy goes here…"
              onPaste={(event) => {
                event.preventDefault();
                void training.edit('paste');
              }}
              onDrop={(event) => event.preventDefault()}
              onCompositionStart={() => {
                composing.current = true;
                setComposition(session.copy);
              }}
              onCompositionEnd={(event) => {
                composing.current = false;
                void changeCopy(event.currentTarget.value);
              }}
              onChange={(event) => {
                if (composing.current) setComposition(event.target.value);
                else void changeCopy(event.target.value);
              }}
              onSelect={(event) => {
                const el = event.currentTarget;
                el.selectionStart = el.selectionEnd = el.value.length;
              }}
            />
            <div className="copy-tail">
              <span>
                <i /> RECEIVED COPY
              </span>
              <span>Backspace edits the tail. Correctness waits until the block ends.</span>
            </div>
            {session.phase === 'tail' && (
              <Button onClick={() => void training.finish(true)}>
                Save this block <Check size={16} />
              </Button>
            )}
          </div>
        )}
        <div className="workspace-bottom">
          <span>
            {session.plan?.c || 20} character WPM{' '}
            {recognition ? '' : `/ ${session.plan?.e || 5} overall`}
          </span>
          <span>
            {session.gaps ? `${session.gaps} catch-up gaps · assisted` : 'Timing estimated'}
          </span>
          {recognition && <span>{session.plan?.timeout || 4}s response window</span>}
        </div>
      </div>
      <div className="practice-controls">
        {recognition && (
          <>
            <button
              onClick={() => void training.answer('unknown')}
              disabled={!['listening', 'waiting'].includes(session.phase)}
            >
              I don’t know <kbd>Tab</kbd>
            </button>
            <button
              onClick={() => void training.answer('replay')}
              disabled={!['listening', 'waiting'].includes(session.phase)}
            >
              <RotateCcw size={16} /> Hear it again <kbd>F6</kbd>
            </button>
          </>
        )}
        <button onClick={() => void training.pause()}>
          <Pause size={16} /> {session.phase === 'paused' ? 'Resume' : 'Pause'} <kbd>F5</kbd>
        </button>
      </div>
      <p className="practice-reminder">
        Some sounds land. Some take another visit. Both are part of learning.
      </p>
    </section>
  );
}
function Tools({
  engine,
  inputProfile,
  reference,
  snapshot,
  progress,
  user,
  preview,
  onPreview,
  onStart,
  onError,
  onSignin,
}: {
  engine: EngineClient;
  inputProfile: InputProfile;
  reference: { symbol: string; pattern: string }[];
  snapshot: Snapshot;
  progress: Progress | null;
  user: User | null;
  preview: string;
  onPreview: (v: number, f: number) => Promise<void>;
  onStart: (mode: string, extra: Record<string, unknown>) => void;
  onError: (error: unknown) => void;
  onSignin: () => void;
}) {
  const [tool, setTool] = useState('text');
  const [text, setText] = useState('HELLO WORLD');
  const [characters, setCharacters] = useState(SYMBOLS);
  const [count, setCount] = useState(5);
  const [c, setC] = useState(20);
  const [e, setE] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [material, setMaterial] = useState('');
  const [frequency, setFrequency] = useState(snapshot.frequency);
  const [volume, setVolume] = useState(snapshot.volume);
  const tools = [
    {
      id: 'words',
      name: 'Word training',
      icon: BookOpen,
      description: 'Hear a whole word. Give it time.',
    },
    {
      id: 'stories',
      name: 'Story listening',
      icon: Headphones,
      description: 'Follow a story, one sentence at a time.',
    },
    {
      id: 'text',
      name: 'Your own words',
      icon: BookOpen,
      description: 'Turn a little text into a little signal.',
    },
    {
      id: 'groups',
      name: 'Random groups',
      icon: Shuffle,
      description: 'Five characters. A fresh combination.',
    },
    {
      id: 'callsigns',
      name: 'Callsign practice',
      icon: Radio,
      description: 'A familiar format. A different sound.',
    },
    {
      id: 'characters',
      name: 'Selected sounds',
      icon: Target,
      description: 'Give a few characters your attention.',
    },
    {
      id: 'weak',
      name: 'A little extra care',
      icon: Activity,
      description: 'Return to the sounds that need you.',
    },
    {
      id: 'reference',
      name: 'The sound library',
      icon: Headphones,
      description: 'Meet every character, one at a time.',
    },
  ];
  const current = tools.find((t) => t.id === tool)!;
  const unsupported =
    tool === 'text'
      ? [
          ...new Set(
            text
              .toUpperCase()
              .split('')
              .filter((x) => x !== ' ' && x !== '\n' && !SYMBOLS.includes(x)),
          ),
        ].join(' ')
      : '';
  async function content() {
    if (tool === 'text') return text.toUpperCase().split(/\s+/).join(' ').trim();
    let chosen = characters;
    if (tool === 'weak' && progress)
      chosen = [...progress.characters]
        .filter((ch) => ch.introduced)
        .sort(
          (a, b) =>
            (a.recognition.n ? a.recognition.mean : 0) - (b.recognition.n ? b.recognition.mean : 0),
        )
        .slice(0, 6)
        .map((v) => v.symbol)
        .join('');
    return engine.call<string>('tool_material', tool, chosen, seed(), count);
  }
  async function listen() {
    try {
      if (playing) {
        await audio.stop();
        setPlaying(false);
        return;
      }
      const value = await content();
      setMaterial(value);
      audio.volume = volume;
      audio.frequency = frequency;
      setPlaying(true);
      const sound = await audio.play({ text: value, c, e, rescue: false });
      await sound.finished;
    } catch (error) {
      onError(error);
    } finally {
      setPlaying(false);
    }
  }
  async function drill(mode: string) {
    try {
      const value = await content();
      onStart(mode, {
        text: mode === 'copying' ? value : undefined,
        characters:
          tool === 'weak' && progress
            ? [...progress.characters]
                .filter((v) => v.introduced)
                .sort((a, b) => a.recognition.mean - b.recognition.mean)
                .slice(0, 6)
                .map((v) => v.symbol)
                .join('')
            : characters,
        c,
        e,
      });
    } catch (error) {
      onError(error);
    }
  }
  return (
    <section className="page tools-page">
      <div className="page-heading">
        <span className="eyebrow">THE LISTENING PLAYGROUND</span>
        <h1>
          Make a little
          <br />
          <em>room for curiosity.</em>
        </h1>
        <p>Your words. Your sounds. A few tools to make them your own.</p>
      </div>
      <div className="tool-layout">
        <aside className="tool-menu" aria-label="Practice tools">
          {tools.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? 'selected' : ''}
              onClick={() => {
                void audio.stop();
                setPlaying(false);
                setTool(t.id);
                setMaterial('');
              }}
            >
              <t.icon size={20} />
              <span>{t.name}</span>
              <ChevronRight size={15} />
            </button>
          ))}
        </aside>
        <div className="tool-panel">
          {tool === 'words' || tool === 'stories' ? (
            <LanguagePractice
              key={`${tool}-${user?.id || 'guest'}`}
              kind={tool === 'words' ? 'word' : 'story'}
              engine={engine}
              owner={user?.id || 'guest'}
              snapshot={snapshot}
              input={inputProfile}
            />
          ) : (
            <>
              <div className="tool-heading">
                <span className="tool-icon">
                  <current.icon size={25} />
                </span>
                <div>
                  <h2>{current.name}</h2>
                  <p>{current.description}</p>
                </div>
                <Pill>UNSCORED LISTENING</Pill>
              </div>
              {tool === 'reference' ? (
                <>
                  <p>
                    Tap a character and listen to its whole pattern. These patterns are visible here
                    because this is a reference, not an assessment.
                  </p>
                  <div className="reference-grid">
                    {reference.map((item) => (
                      <button
                        key={item.symbol}
                        onClick={() => {
                          void audio
                            .play({ text: item.symbol, c, e: c, rescue: false })
                            .catch(onError);
                        }}
                      >
                        <strong>{item.symbol}</strong>
                        <span>{item.pattern}</span>
                        <Volume2 size={13} />
                      </button>
                    ))}
                  </div>
                </>
              ) : tool === 'weak' && !user ? (
                <div className="welcome-card compact">
                  <Activity size={30} />
                  <h3>A little attention goes a long way.</h3>
                  <p>
                    Sign in and practice a few blocks to discover your own recurring trouble spots.
                  </p>
                  <Button onClick={onSignin}>
                    Find your starting point <ArrowRight size={16} />
                  </Button>
                </div>
              ) : (
                <>
                  {tool === 'text' ? (
                    <>
                      <label className="field-label" htmlFor="custom-text">
                        WHAT WOULD YOU LIKE TO HEAR?
                      </label>
                      <textarea
                        id="custom-text"
                        className="custom-text"
                        maxLength={4096}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        spellCheck={false}
                      />
                      <div className="field-note">
                        <span>
                          {unsupported
                            ? `Unsupported characters: ${unsupported}`
                            : 'A–Z, 0–9 and . , ? / = +. Whitespace becomes a gap.'}
                        </span>
                        <span>{text.length} / 4096</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {tool === 'callsigns' ? (
                        <p className="tool-description">
                          Freshly generated callsigns for listening practice. These are synthetic
                          examples, not a lookup of assigned stations.
                        </p>
                      ) : tool === 'weak' ? (
                        <p className="tool-description">
                          Your six lowest recognition estimates among introduced characters. This is
                          extra practice; automatic targets and milestone evidence stay separate.
                        </p>
                      ) : (
                        <>
                          <div className="picker-heading">
                            <label className="field-label">
                              GIVE THESE CHARACTERS A LITTLE SPACE
                            </label>
                            <button
                              className="text-button"
                              onClick={() => setCharacters(characters === SYMBOLS ? '' : SYMBOLS)}
                            >
                              {characters === SYMBOLS ? 'Clear' : 'Select all'}
                            </button>
                          </div>
                          <CharacterPicker selected={characters} onChange={setCharacters} />
                        </>
                      )}
                      <label className="slider-field">
                        {tool === 'callsigns' ? 'Callsigns' : 'Five-character groups'}{' '}
                        <strong>{count}</strong>
                        <input
                          aria-label="Number of groups"
                          type="range"
                          min="1"
                          max="30"
                          value={count}
                          onChange={(event) => setCount(Number(event.target.value))}
                        />
                      </label>
                    </>
                  )}
                  <div className="speed-controls">
                    <RangeField
                      label="Character speed"
                      unit="WPM"
                      value={c}
                      min={12}
                      max={35}
                      onChange={(value) => {
                        setC(value);
                        if (e > value) setE(value);
                      }}
                    />
                    <RangeField
                      label="Overall speed"
                      unit="WPM"
                      value={e}
                      min={3}
                      max={c}
                      onChange={setE}
                    />
                  </div>
                  <p className="fine-print">
                    Overall speed adds space between characters. The shape of each sound stays
                    intact.
                  </p>
                  <div className="tool-actions">
                    <Button
                      disabled={
                        !!unsupported ||
                        (tool === 'text' && !text.trim()) ||
                        (tool !== 'text' && tool !== 'callsigns' && !characters)
                      }
                      onClick={() => void listen()}
                    >
                      {playing ? <Square size={15} /> : <Play size={16} fill="currentColor" />}
                      {playing ? 'Stop listening' : 'Listen to this'}
                    </Button>
                    <Button
                      secondary
                      disabled={!!unsupported || !text.trim()}
                      onClick={() => void drill('copying')}
                    >
                      <Keyboard size={16} /> Try copying
                    </Button>
                    {['characters', 'groups', 'weak'].includes(tool) && (
                      <button className="text-button" onClick={() => void drill('recognition')}>
                        Try recognition <ArrowUpRight size={14} />
                      </button>
                    )}
                  </div>
                  {material && (
                    <div className="material-preview">
                      <span className="eyebrow">YOUR CURRENT MATERIAL</span>
                      <p>{material}</p>
                    </div>
                  )}
                </>
              )}
              <details className="sound-preferences">
                <summary>
                  <SlidersHorizontal size={15} /> Tune your sound
                </summary>
                <div className="speed-controls">
                  <RangeField
                    label="Volume"
                    unit="%"
                    value={volume}
                    min={0}
                    max={100}
                    onChange={(v) => {
                      setVolume(v);
                      void onPreview(v, frequency);
                    }}
                  />
                  <RangeField
                    label="Tone"
                    unit="Hz"
                    value={frequency}
                    min={300}
                    max={1000}
                    step={50}
                    onChange={(v) => {
                      setFrequency(v);
                      void onPreview(volume, v);
                    }}
                  />
                </div>
                <small>{preview}</small>
              </details>
            </>
          )}
        </div>
      </div>
      <div className="tool-bottom-note">
        <Info size={16} />
        <p>
          Listening tools are for exploring. Manual drills have their own results and never raise
          your automatic targets.
        </p>
      </div>
    </section>
  );
}
function RangeField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      {label}
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
function ProgressPage({
  user,
  data,
  snapshot,
  profile,
  onProfile,
  range,
  onRange,
  onSignin,
  onStart,
  onDetail,
}: {
  user: User | null;
  data: Progress | null;
  snapshot: Snapshot;
  profile: InputProfile;
  onProfile: (profile: InputProfile) => Promise<void>;
  range: number;
  onRange: (value: number) => Promise<void>;
  onSignin: () => void;
  onStart: () => void;
  onDetail: (value: { title: string; lines: string[] }) => void;
}) {
  const [expanded, setExpanded] = useState<Graph | null>(null);
  const [point, setPoint] = useState(0);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (user)
      void api
        .request<{ records: Record<string, unknown>[] }>('/api/account/history')
        .then((r) => setHistory(r.records))
        .catch(() => {});
  }, [user, data]);
  if (!user)
    return (
      <section className="page">
        <div className="page-heading">
          <span className="eyebrow">YOUR OWN KIND OF PROGRESS</span>
          <h1>
            Small steps.
            <br />
            <em>A longer story.</em>
          </h1>
          <p>
            Sign in to keep your practice, find recurring patterns, and watch your listening grow.
          </p>
          <Button onClick={onSignin}>
            Make a little beginning <ArrowRight size={16} />
          </Button>
        </div>
        <div className="empty-illustration">
          <Activity size={62} strokeWidth={1} />
          <p>Your first sounds belong here.</p>
        </div>
      </section>
    );
  function charDetail(ch: CharacterEstimate) {
    const lines = [`${ch.introduced ? 'Introduced' : 'Not introduced'} · ${profile} profile`];
    for (const [name, e] of [
      ['Recognition', ch.recognition],
      ['Copying', ch.copying],
    ] as const) {
      lines.push(
        e.n
          ? `${name}: ${percent(e.mean)} · model 10–90% interval ${percent(e.lower)}–${percent(e.upper)} · effective evidence ${e.n.toFixed(1)} · ${e.reliable ? 'reliable at these conditions' : 'limited evidence'}`
          : `${name}: unobserved at the current automatic conditions`,
      );
      lines.push(
        `Typing-inclusive latency: median ${e.median === null ? 'unknown' : `${Math.round(e.median)} ms`} / p90 ${e.p90 === null ? 'unknown' : `${Math.round(e.p90)} ms`} · n=${e.latencyN}`,
      );
      for (const c of e.confusions)
        lines.push(`Recurring ${ch.symbol} → ${c.response}: ${c.count} attributable substitutions`);
    }
    lines.push(
      ch.due ? 'Review is due.' : 'Review is scheduled or this character has not been introduced.',
    );
    onDetail({ title: `A closer listen: ${ch.symbol}`, lines });
  }
  return (
    <section className="page progress-page">
      <div className="page-heading">
        <span className="eyebrow">A LITTLE MORE THAN YESTERDAY</span>
        <h1>
          Your listening,
          <br />
          <em>taking shape.</em>
        </h1>
        <p>Real practice. Specific conditions. A story that belongs to you.</p>
      </div>
      <div className="progress-toolbar">
        <div className="segmented">
          <button
            className={profile === 'keyboard' ? 'selected' : ''}
            onClick={() => void onProfile('keyboard')}
          >
            <Keyboard size={15} />
            Keyboard
          </button>
          <button
            className={profile === 'touch' ? 'selected' : ''}
            onClick={() => void onProfile('touch')}
          >
            <Hand size={15} />
            Touch
          </button>
        </div>
        <div className="range-control">
          <span>Eligible blocks</span>
          <div className="segmented">
            {[30, 100, 0].map((v) => (
              <button
                key={v}
                className={range === v ? 'selected' : ''}
                onClick={() => void onRange(v)}
              >
                {v || 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="progress-stat-row">
        <div>
          <strong>
            {snapshot.introduced.length}
            <small> /42</small>
          </strong>
          <span>characters introduced</span>
        </div>
        <div>
          <strong>{snapshot.sessions}</strong>
          <span>completed sessions</span>
        </div>
        <div>
          <strong>
            {snapshot.copyingC}
            <small> / {snapshot.copyingE}</small>
          </strong>
          <span>next character / overall WPM</span>
        </div>
      </div>
      <div className="graph-grid">
        {data?.graphs.map((graph, i) => (
          <article className="graph-card" key={graph.title}>
            <div>
              <span className="eyebrow">0{i + 1} / OBSERVED EVIDENCE</span>
              <h3>{['Copying pace', 'Attempt accuracy', 'Response latency'][i]}</h3>
              <p>
                {i === 0
                  ? 'Requested character and overall WPM'
                  : i === 1
                    ? 'Matching mode, speed and material'
                    : 'Median and p90 · typing included'}
              </p>
            </div>
            <MiniGraph graph={graph} />
            <div className="graph-card-footer">
              <span>
                {graph.points.length
                  ? `${graph.points.length} actual points`
                  : 'No eligible blocks yet'}
              </span>
              <button
                className="text-button"
                onClick={() => {
                  setPoint(0);
                  setExpanded(graph);
                }}
              >
                Inspect <ArrowUpRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!data?.graphs.some((g) => g.points.length) && (
        <div className="quiet-empty">
          <span className="tool-icon">
            <Headphones size={24} />
          </span>
          <div>
            <h3>Your first block is a good beginning.</h3>
            <p>
              There’s no trend to infer yet. A little consistent practice will give these graphs
              something honest to say.
            </p>
          </div>
          <Button secondary onClick={onStart}>
            Go practice <ArrowRight size={15} />
          </Button>
        </div>
      )}
      <section className="character-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">MEET YOUR SOUNDS AGAIN</span>
            <h2>A character at a time.</h2>
          </div>
          <p>
            Select a character for its evidence,
            <br />
            response latency and recurring confusions.
          </p>
        </div>
        <div className="progress-character-grid">
          {data?.characters.map((ch) => (
            <button
              key={ch.symbol}
              className={ch.introduced ? 'introduced' : ''}
              onClick={() => charDetail(ch)}
            >
              <strong>{ch.symbol}</strong>
              <span>
                {!ch.introduced
                  ? 'not introduced'
                  : ch.recognition.n
                    ? percent(ch.recognition.mean)
                    : 'unobserved'}
              </span>
              {ch.due && <i aria-label="review due" />}
            </button>
          ))}
        </div>
        <p className="fine-print">
          Introduced is not mastered. Model intervals describe uncertainty; reliability needs enough
          independent evidence across dates.
        </p>
      </section>
      <section className="history-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">EVERY VISIT HAS ITS PLACE</span>
            <h2>Recent practice.</h2>
          </div>
          <p>
            Latest 100 results.
            <br />
            Assisted and interrupted stay visible.
          </p>
        </div>
        {history.length ? (
          <div className="history-table">
            {history.map((row) => (
              <button
                key={String(row.id)}
                onClick={() =>
                  onDetail({
                    title: `${row.kind} · ${new Date(Number(row.created)).toLocaleDateString()}`,
                    lines: [
                      `${row.input} · ${row.source} · ${row.completed ? 'complete' : 'incomplete'} · ${row.applied ? 'accepted revision' : 'extra practice'}`,
                      `Attempt ${percent(row.attempt as number | null)} / final ${percent(row.final_accuracy as number | null)} · targets ${row.targets}`,
                      String(row.pace),
                      String(row.decision),
                      row.interrupted
                        ? `Technical/control interruption: ${row.interrupted}`
                        : 'No technical interruption recorded.',
                    ],
                  })
                }
              >
                <span>
                  {new Date(Number(row.created)).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <strong>{String(row.kind)}</strong>
                <span>{String(row.input)}</span>
                <Pill tone={row.interrupted ? 'red' : row.source === 'tool' ? 'amber' : 'green'}>
                  {row.interrupted ? 'interrupted' : row.source === 'tool' ? 'manual' : 'guided'}
                </Pill>
                <span>{percent(row.attempt as number | null)}</span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-history">
            No practice history yet. Your first session will have a place here.
          </p>
        )}
      </section>
      {snapshot.milestones.length > 0 && (
        <section className="milestone-list">
          <span className="eyebrow">TESTED, ON DIFFERENT DATES</span>
          <h2>Your verified milestones.</h2>
          {snapshot.milestones.map((m) => (
            <p key={m}>
              <Check size={18} />
              {m}
            </p>
          ))}
        </section>
      )}
      {expanded && (
        <Modal title={expanded.title} onClose={() => setExpanded(null)} wide>
          <p>{expanded.context}</p>
          <MiniGraph graph={expanded} selected={point} onPoint={setPoint} />
          {expanded.points.length ? (
            <>
              <div className="point-navigation">
                <button
                  className="icon-button"
                  aria-label="Previous point"
                  disabled={point === 0}
                  onClick={() => setPoint((p) => p - 1)}
                >
                  <ArrowLeft size={18} />
                </button>
                <span>
                  Point {point + 1} of {expanded.points.length}
                </span>
                <button
                  className="icon-button"
                  aria-label="Next point"
                  disabled={point >= expanded.points.length - 1}
                  onClick={() => setPoint((p) => p + 1)}
                >
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="detail-lines">
                {expanded.points[point]?.detail.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          ) : (
            <p>
              No eligible points yet. Latency needs at least eight correct independent nonnegative
              responses per comparable block.
            </p>
          )}
          <p className="fine-print">
            {expanded.trend ||
              'Sparse or mixed evidence; no trend inferred. Actual points are never extrapolated.'}
          </p>
        </Modal>
      )}
    </section>
  );
}
function MiniGraph({
  graph,
  selected,
  onPoint,
}: {
  graph: Graph;
  selected?: number;
  onPoint?: (point: number) => void;
}) {
  if (!graph.points.length)
    return (
      <div className="empty-graph">
        <svg viewBox="0 0 280 110" aria-hidden="true">
          <path d="M10 25H270M10 60H270M10 95H270" stroke="currentColor" strokeDasharray="3 5" />
        </svg>
        <span>A little practice goes here.</span>
      </div>
    );
  const values = graph.points.flatMap((p) => [p.primary, p.secondary ?? 0]);
  const max = Math.max(1, ...values) * 1.12;
  const x = (i: number) => 20 + (i * 240) / Math.max(1, graph.points.length - 1);
  const y = (v: number) => 100 - (v / max) * 84;
  return (
    <div className="chart-wrap">
      <svg
        viewBox="0 0 280 116"
        role="img"
        aria-label={`${graph.title}, ${graph.points.length} actual points`}
      >
        <path
          d="M20 16H266M20 58H266M20 100H266"
          stroke="var(--chart-grid, #dfe5da)"
          strokeDasharray="3 5"
        />
        <text x="2" y="18">
          {Math.round(max)}
        </text>
        <text x="7" y="103">
          0
        </text>
        {graph.points.map((p, i) => (
          <g key={i}>
            {p.secondary !== null && (
              <circle cx={x(i)} cy={y(p.secondary)} r="3" fill="var(--chart-secondary, #c19641)" />
            )}
            <circle
              cx={x(i)}
              cy={y(p.primary)}
              r={selected === i ? 5 : 3.5}
              fill={
                selected === i ? 'var(--chart-selected, #173d38)' : 'var(--chart-primary, #729078)'
              }
              onClick={() => onPoint?.(i)}
              style={{ cursor: onPoint ? 'pointer' : 'default' }}
            >
              <title>
                {p.detail[0]} · {p.primary.toFixed(1)}
              </title>
            </circle>
            {p.milestone && (
              <path
                d={`M${x(i)} ${y(p.secondary ?? p.primary) - 8}l-4 -6h8Z`}
                fill="var(--chart-selected, #173d38)"
              />
            )}
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span>
          <i />
          {graph.primary_label}
        </span>
        {graph.secondary_label && (
          <span>
            <i className="amber" />
            {graph.secondary_label}
          </span>
        )}
      </div>
    </div>
  );
}
function Settings({
  user,
  snapshot,
  preview,
  onPreview,
  onSave,
  onSignout,
  onReset,
  onDelete,
  onError,
  onSignin,
  pendingCount,
  onSync,
}: {
  user: User | null;
  snapshot: Snapshot;
  preview: string;
  onPreview: (volume: number, frequency: number) => Promise<void>;
  onSave: (volume: number, frequency: number) => Promise<void>;
  onSignout: () => void;
  onReset: () => Promise<void>;
  onDelete: () => Promise<void>;
  onError: (error: unknown) => void;
  onSignin: () => void;
  pendingCount: number;
  onSync: () => void;
}) {
  const [volume, setVolume] = useState(snapshot.volume);
  const [frequency, setFrequency] = useState(snapshot.frequency);
  const [action, setAction] = useState<'reset' | 'delete' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setVolume(snapshot.volume);
    setFrequency(snapshot.frequency);
  }, [snapshot.volume, snapshot.frequency]);
  async function confirm() {
    if (!action || confirmation !== 'DELETE') return;
    setSaving(true);
    try {
      await api.request(`/api/account/${action}`, {
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      });
      if (user) await clearLanguage(user.id).catch(() => {});
      setAction(null);
      setConfirmation('');
      if (user) for (const row of await pending(user.id)) await removePending(row.id);
      if (action === 'reset') await onReset();
      else await onDelete();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  async function download() {
    try {
      const response = await fetch(api.API + '/api/account/export', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not export history. Please try again.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dih-dah-dojo.cwweb';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      onError(error);
    }
  }
  return (
    <section className="page settings-page">
      <div className="page-heading">
        <span className="eyebrow">MAKE YOURSELF COMFORTABLE</span>
        <h1>
          Your sound.
          <br />
          <em>Your little space.</em>
        </h1>
        <p>A few things to help you settle in.</p>
      </div>
      <div className="settings-grid">
        <article className="settings-card">
          <div className="tool-heading">
            <span className="tool-icon">
              <Volume2 size={25} />
            </span>
            <div>
              <h2>A sound that feels right.</h2>
              <p>Adjustments preview automatically.</p>
            </div>
          </div>
          <RangeField
            label="Volume"
            unit="%"
            value={volume}
            min={0}
            max={100}
            onChange={(value) => {
              setVolume(value);
              void onPreview(value, frequency);
            }}
          />
          <RangeField
            label="Tone"
            unit="Hz"
            value={frequency}
            min={300}
            max={1000}
            step={50}
            onChange={(value) => {
              setFrequency(value);
              void onPreview(volume, value);
            }}
          />
          <div className="preview-status">
            <span className="status-dot" />
            {preview}
          </div>
          <div className="button-row">
            <Button secondary onClick={() => void onPreview(volume, frequency)}>
              <Play size={16} /> Hear it again
            </Button>
            {user && (
              <Button onClick={() => void onSave(volume, frequency)}>
                Save my sound <Check size={16} />
              </Button>
            )}
          </div>
          <p className="fine-print">
            Preview doesn’t count as practice. Timing is estimated; physical audio and input routes
            are not verified.
          </p>
        </article>
        <article className="settings-card">
          <span className="tool-icon">
            <Cloud size={25} />
          </span>
          <h2>Your practice travels.</h2>
          {user ? (
            <>
              <p>
                {user.name}
                <br />
                <span className="fine-print">{user.email}</span>
              </p>
              <div className="data-action">
                <div>
                  <h3>{pendingCount ? 'A few results are waiting.' : 'All caught up.'}</h3>
                  <p>
                    {pendingCount
                      ? `${pendingCount} locally retained results await acknowledgement.`
                      : 'Acknowledged blocks are kept in your account.'}
                  </p>
                </div>
                {pendingCount > 0 && (
                  <Button secondary onClick={onSync}>
                    Retry sync
                  </Button>
                )}
              </div>
              <button className="setting-link" onClick={() => void download()}>
                <Download size={18} /> Export my history <ArrowUpRight size={15} />
              </button>
              <button className="setting-link" onClick={onSignout}>
                <LogOut size={18} /> Sign out <ArrowUpRight size={15} />
              </button>
            </>
          ) : (
            <>
              <p>
                Sign in with Google or GitHub to keep your practice and use it on another device.
              </p>
              <Button onClick={onSignin}>
                Sign in <ArrowRight size={16} />
              </Button>
            </>
          )}
        </article>
      </div>
      {user && (
        <div className="data-danger">
          <div>
            <span className="eyebrow">YOUR DATA, YOUR CHOICE</span>
            <h3>A fresh start, if you want one.</h3>
            <p>
              Reset keeps your account. Deleting your account removes its sessions and practice
              data.
            </p>
          </div>
          <Button
            secondary
            onClick={() => {
              setConfirmation('');
              setAction('reset');
            }}
          >
            <RotateCcw size={15} /> Reset progress
          </Button>
          <button
            className="danger-link"
            onClick={() => {
              setConfirmation('');
              setAction('delete');
            }}
          >
            <Trash2 size={15} /> Delete account
          </button>
        </div>
      )}
      {action && (
        <Modal
          title={action === 'reset' ? 'A fresh start?' : 'Delete your account?'}
          onClose={() => setAction(null)}
        >
          <p>
            {action === 'reset'
              ? 'This removes your stored practice and automatic targets across both input profiles. Your account stays.'
              : 'This deletes your account and its practice history. You may need to sign in again first if your session is no longer recent.'}
          </p>
          <label className="field-label" htmlFor="confirm-delete">
            TYPE DELETE TO CONFIRM
          </label>
          <input
            id="confirm-delete"
            className="text-field"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
          <div className="button-row">
            <Button secondary onClick={() => setAction(null)}>
              Keep my progress
            </Button>
            <Button
              className="danger"
              disabled={confirmation !== 'DELETE' || saving}
              onClick={() => void confirm()}
            >
              {saving ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}{' '}
              {action === 'reset' ? 'Reset progress' : 'Delete account'}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
