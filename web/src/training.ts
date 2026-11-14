import { EngineClient } from './engine-client';
import { audio, type Marker } from './audio';
import type { AudioSpec, Feedback, Plan, Summary, Trial } from './types';
export type Phase =
  | 'idle'
  | 'loading'
  | 'teaching'
  | 'listening'
  | 'waiting'
  | 'captured'
  | 'unknown'
  | 'replay'
  | 'timeout'
  | 'feedback'
  | 'copying'
  | 'tail'
  | 'paused'
  | 'summary'
  | 'finished'
  | 'error';
export type TrainingView = {
  phase: Phase;
  source: string;
  mode: string;
  plan: Plan | null;
  trial: Trial | null;
  answer: string;
  feedback: Feedback | null;
  copy: string;
  elapsed: number;
  gaps: number;
  summary: Summary | null;
  remaining: number;
  held: boolean;
  sync: string;
  error: string;
};
const initial: TrainingView = {
  phase: 'idle',
  source: 'demo',
  mode: 'recognition',
  plan: null,
  trial: null,
  answer: '',
  feedback: null,
  copy: '',
  elapsed: 0,
  gaps: 0,
  summary: null,
  remaining: 3000,
  held: false,
  sync: '',
  error: '',
};
export class Training {
  view: TrainingView = { ...initial };
  onChange: (value: TrainingView) => void = () => {};
  private epoch = 0;
  private sessionStart = 0;
  private blockStart = 0;
  private blockId = '';
  private options: Record<string, unknown> = {};
  private activeId = 0;
  private track = false;
  private answered = false;
  private onset: number | null = null;
  private ended: number | null = null;
  private soundFinished = false;
  private captureAt = 0;
  private trialOpen = false;
  private closePending: Promise<Feedback> | null = null;
  private pausedPhase: Phase = 'idle';
  private advancePending = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private liveBusy = false;
  private lastLive = 0;
  private stopping = false;
  constructor(
    public engine: EngineClient,
    private onSave: (
      id: string,
      packet: Uint8Array,
      summary: Summary,
      source: string,
    ) => Promise<string>,
    private onEnd: () => Promise<void>,
  ) {
    audio.onMarker = (marker) => void this.marker(marker);
    audio.onError = (message) => {
      if (this.active) void this.finish(false, message);
    };
  }
  get active() {
    return !['idle', 'summary', 'finished', 'error'].includes(this.view.phase) || this.stopping;
  }
  get sessionActive() {
    return this.sessionStart > 0;
  }
  private emit(patch: Partial<TrainingView>) {
    this.view = { ...this.view, ...patch };
    this.onChange(this.view);
  }
  private after(ms: number, fn: () => void) {
    const epoch = this.epoch;
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        if (epoch === this.epoch) fn();
      },
      Math.max(0, ms),
    );
    this.timers.add(timer);
    return timer;
  }
  private clear() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.deadline = null;
  }
  async start(options: Record<string, unknown>) {
    if (this.active) await this.finish(false, 'A new exercise was selected.');
    this.sessionStart = performance.now();
    this.options = options;
    this.emit({
      ...initial,
      phase: 'loading',
      source: String(options.source || 'guided'),
      mode: String(options.mode || 'adaptive'),
    });
    try {
      await audio.enable();
      await this.block();
    } catch (error) {
      this.fail(error);
    }
  }
  private async block() {
    this.epoch++;
    this.clear();
    this.stopping = false;
    this.blockStart = performance.now();
    this.blockId = crypto.randomUUID();
    this.track = false;
    this.activeId = 0;
    this.emit({
      phase: 'loading',
      answer: '',
      feedback: null,
      copy: '',
      elapsed: 0,
      gaps: 0,
      summary: null,
      error: '',
      remaining: 3000,
      held: false,
    });
    const plan = await this.engine.json<Plan>(
      'prepare',
      JSON.stringify({
        ...this.options,
        id: this.blockId,
        now: Date.now(),
        at: performance.now(),
        offset: -new Date().getTimezoneOffset() * 60,
        rate: audio.rate,
        seed: crypto.getRandomValues(new Uint32Array(1))[0],
      }),
    );
    this.emit({ plan, mode: plan.mode });
    this.tick = setInterval(() => {
      this.emit({
        elapsed: Math.floor((performance.now() - this.blockStart) / 1000),
      });
      if (plan.mode === 'copying' && this.view.phase === 'copying') void this.live();
    }, 100);
    if (plan.mode === 'recognition') await this.nextTrial();
    else if (plan.audio) {
      this.emit({ phase: 'copying' });
      await this.play(plan.audio, true);
    }
  }
  private async play(spec: AudioSpec, track: boolean) {
    this.track = false;
    const playing = await audio.play(spec);
    this.activeId = playing.id;
    this.track = track;
    const epoch = this.epoch;
    void playing.finished.then((stopped) => {
      if (epoch !== this.epoch || this.stopping) return;
      if (stopped) {
        void this.finish(false, 'Playback was interrupted.');
        return;
      }
      if (track && this.view.mode === 'recognition') {
        this.soundFinished = true;
        this.scheduleClose();
      } else if (track && this.view.mode === 'copying') {
        this.emit({ phase: 'tail' });
        const window =
          this.options.mode === 'check'
            ? Math.max(0, 180000 - (performance.now() - this.blockStart))
            : 0;
        this.after(window + 10000, () => void this.finish(true));
      }
    });
    return playing;
  }
  private async nextTrial() {
    if (this.view.phase === 'paused') {
      this.advancePending = true;
      return;
    }
    if (this.stopping) return;
    if (performance.now() - this.blockStart > (this.view.plan?.placement ? 120000 : 90000)) {
      await this.finish(true);
      return;
    }
    const trial = await this.engine.json<Trial>('next_trial', Date.now());
    if (trial.done) {
      await this.finish(true);
      return;
    }
    this.emit({ trial, answer: '', feedback: null });
    if (trial.teaching) {
      this.emit({ phase: 'teaching' });
      return;
    }
    this.answered = false;
    this.onset = null;
    this.ended = null;
    this.soundFinished = false;
    this.trialOpen = true;
    this.emit({ phase: 'listening' });
    if (trial.audio) await this.play(trial.audio, true);
  }
  async playTeaching() {
    const trial = this.view.trial;
    if (!trial?.symbol) return;
    const sound = await this.play(
      { text: trial.symbol, c: trial.c || 20, e: trial.c || 20, rescue: false },
      false,
    );
    if (await sound.finished) throw new Error('Teaching playback was interrupted. Listen again.');
  }
  async acknowledgeTeaching() {
    const trial = this.view.trial;
    if (!trial?.symbol) return;
    await audio.stop();
    await this.engine.call('teach', trial.symbol, Date.now());
    await this.nextTrial();
  }
  private async marker(marker: Marker) {
    if (!this.track || marker.id !== this.activeId || this.stopping) return;
    try {
      const result = await this.engine.json<{
        end: number | null;
        gaps: number;
      }>('marker', marker.kind, marker.index, marker.frame, marker.at, marker.value);
      this.emit({ gaps: result.gaps });
      if (this.view.mode === 'recognition') {
        if (marker.kind === 1) this.onset = marker.at;
        if (marker.kind === 2) {
          this.ended = marker.at;
          if (!this.answered && this.view.phase !== 'paused') {
            this.emit({ phase: 'waiting' });
            if (this.deadline) clearTimeout(this.deadline);
            this.deadline = this.after(
              marker.at + (this.view.plan?.timeout || 4) * 1000 - performance.now(),
              () => {
                if (!this.answered) {
                  this.answered = true;
                  this.captureAt = performance.now();
                  this.emit({ phase: 'timeout', answer: 'Timed out' });
                  this.scheduleClose();
                }
              },
            );
          }
        }
      }
    } catch (error) {
      this.fail(error);
    }
  }
  async answer(key: string, at = performance.now()) {
    if (
      this.view.mode !== 'recognition' ||
      this.answered ||
      !['listening', 'waiting'].includes(this.view.phase)
    )
      return;
    if (key !== 'replay' && (this.onset === null || at < this.onset)) return;
    if (this.ended !== null && at > this.ended + (this.view.plan?.timeout || 4) * 1000) return;
    this.answered = true;
    this.captureAt = at;
    if (this.deadline) clearTimeout(this.deadline);
    this.emit({
      phase: key === 'unknown' ? 'unknown' : key === 'replay' ? 'replay' : 'captured',
      answer:
        key === 'unknown'
          ? 'I don’t know'
          : key === 'replay'
            ? 'Replay requested'
            : key.toUpperCase(),
    });
    try {
      const result = await this.engine.json<{ accepted: boolean }>('answer', key, at);
      if (!result.accepted) {
        this.answered = false;
        this.emit({
          phase: this.ended === null ? 'listening' : 'waiting',
          answer: '',
        });
        return;
      }
      this.scheduleClose();
    } catch (error) {
      this.fail(error);
    }
  }
  private scheduleClose() {
    if (!this.soundFinished || !this.answered || this.stopping || this.view.phase === 'paused')
      return;
    this.soundFinished = false;
    this.after(Math.max(0, this.captureAt + 500 - performance.now()), () => void this.closeTrial());
  }
  private async closeTrial() {
    const epoch = this.epoch;
    try {
      this.closePending = this.engine.json<Feedback>('close_trial', Date.now(), performance.now());
      const feedback = await this.closePending;
      this.closePending = null;
      this.trialOpen = false;
      if (epoch !== this.epoch || this.stopping) return;
      if (feedback.replay) {
        await this.engine.call('disclose', feedback.expected, Date.now());
        this.after(400, () => void this.nextTrial());
        return;
      }
      this.emit({ phase: 'feedback', feedback });
      if (!feedback.correct && !feedback.interrupted) {
        await this.engine.call('disclose', feedback.expected, Date.now());
        const sound = await this.play(
          {
            text: feedback.expected,
            c: this.view.plan!.c,
            e: this.view.plan!.c,
            rescue: false,
          },
          false,
        );
        await sound.finished;
      }
      if (epoch === this.epoch)
        this.after(feedback.correct ? 1000 : 1200, () => void this.nextTrial());
    } catch (error) {
      this.closePending = null;
      if (epoch === this.epoch && !this.stopping) this.fail(error);
    }
  }
  async edit(key: string, at = performance.now()) {
    if (this.view.mode !== 'copying' || !['copying', 'tail'].includes(this.view.phase)) return;
    try {
      const result = await this.engine.json<{
        transcript: string;
        accepted: boolean;
      }>('edit', key, at);
      this.emit({ copy: result.transcript });
    } catch (error) {
      this.fail(error);
    }
  }
  private async live() {
    if (this.liveBusy || performance.now() - this.lastLive < 100) return;
    this.liveBusy = true;
    const started = performance.now();
    this.lastLive = started;
    try {
      const result = await this.engine.json<{
        rescue: boolean;
        release: boolean;
        gaps: number;
      }>('live', started);
      if (this.stopping) return;
      if (performance.now() - started > 100) {
        await this.finish(false, 'Live analysis exceeded the 100 ms freshness limit.');
        return;
      }
      if (result.rescue) audio.command('rescue');
      if (result.release) audio.command('release');
      this.emit({ gaps: result.gaps });
    } catch (error) {
      if (!this.stopping) await this.finish(false, String(error));
    } finally {
      this.liveBusy = false;
    }
  }
  async pause() {
    if (this.view.phase === 'paused') {
      await audio.resume();
      this.emit({ phase: this.pausedPhase });
      if (this.advancePending) {
        this.advancePending = false;
        await this.nextTrial();
      } else if (this.pausedPhase === 'tail') this.after(10000, () => void this.finish(true));
      return;
    }
    if (!this.active || this.stopping || this.view.phase === 'loading') return;
    this.pausedPhase = this.view.phase;
    this.emit({ phase: 'paused' });
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.deadline = null;
    if (this.view.mode === 'recognition') {
      this.epoch++;
      await this.closePending?.catch(() => {});
    }
    await this.engine.call('interrupt', 'Practice paused; affected evidence excluded.');
    if (this.view.mode === 'recognition') {
      this.track = false;
      await audio.stop();
      if (this.trialOpen) {
        await this.engine.json('close_trial', Date.now(), performance.now());
        this.trialOpen = false;
      }
      this.advancePending = this.pausedPhase !== 'teaching';
    } else audio.command('pause', 1);
  }
  async finish(completed = false, reason?: string) {
    if (
      this.stopping ||
      this.view.phase === 'summary' ||
      this.view.phase === 'finished' ||
      this.view.phase === 'idle'
    )
      return;
    this.stopping = true;
    this.epoch++;
    this.clear();
    try {
      await this.closePending?.catch(() => {});
      if (reason) await this.engine.call('interrupt', reason);
      await audio.stop();
      this.track = false;
      if (this.trialOpen) {
        await this.engine.call('interrupt', reason || 'Current trial was ended.');
        await this.engine.json('close_trial', Date.now(), performance.now());
        this.trialOpen = false;
      }
      const summary = await this.engine.json<Summary>('finish', completed, performance.now());
      const packet = await this.engine.call<Uint8Array>('packet');
      this.emit({
        phase: 'summary',
        summary,
        sync:
          this.view.source === 'guided'
            ? 'Saving on this device…'
            : 'Unscored demo / manual practice',
        held: false,
        remaining: 3000,
      });
      const sync = await this.onSave(this.blockId, packet, summary, this.view.source);
      this.emit({ sync });
      this.stopping = false;
      if (this.view.source === 'guided' && sync === 'Synced') {
        let last = performance.now();
        this.tick = setInterval(() => {
          const now = performance.now();
          const elapsed = now - last;
          last = now;
          if (!this.view.held) {
            this.emit({
              remaining: Math.max(0, this.view.remaining - elapsed),
            });
            if (this.view.remaining <= 0) void this.continue();
          }
        }, 100);
      }
    } catch (error) {
      this.stopping = false;
      this.fail(error);
    }
  }
  syncStatus(sync: string) {
    if (this.view.phase === 'summary') this.emit({ sync, held: true });
  }
  hold() {
    if (this.view.phase === 'summary') this.emit({ held: !this.view.held });
  }
  async continue() {
    if (this.view.phase !== 'summary') return;
    this.clear();
    if (
      this.view.source !== 'guided' ||
      performance.now() - this.sessionStart >= 600000 ||
      !this.view.summary?.completed ||
      this.view.summary.interrupted
    ) {
      await this.end();
      return;
    }
    if (this.view.sync !== 'Synced') {
      this.emit({ held: true });
      return;
    }
    try {
      await this.block();
    } catch (error) {
      this.fail(error);
    }
  }
  async end() {
    this.epoch++;
    this.clear();
    await audio.stop();
    if (this.view.source === 'guided' && this.sessionStart > 0) await this.onEnd();
    this.sessionStart = 0;
    this.emit({ phase: 'finished' });
  }
  async leave() {
    if (this.active) await this.finish(false, 'Practice ended by the learner.');
    if (this.sessionStart > 0) await this.end();
    this.emit({ phase: 'idle' });
  }
  private fail(error: unknown) {
    this.emit({
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
    this.clear();
    void audio.stop();
    this.stopping = false;
  }
}
