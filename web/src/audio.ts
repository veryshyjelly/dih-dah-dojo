import type { AudioSpec } from './types';
export type Marker = {
  kind: number;
  id: number;
  index: number;
  frame: number;
  at: number;
  value: number;
};
export class AudioService {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private module: WebAssembly.Module | null = null;
  private output: GainNode | null = null;
  private environmentNodes: AudioNode[] = [];
  private environmentSources: AudioScheduledSourceNode[] = [];
  private interferer: AudioWorkletNode | null = null;
  private sequence = 0;
  private current = 0;
  private initialization: Promise<void> | null = null;
  private completion: ((stopped: boolean) => void) | null = null;
  private waiting: Promise<boolean> | null = null;
  onMarker: ((marker: Marker) => void) | null = null;
  onError: ((message: string) => void) | null = null;
  volume = 50;
  frequency = 600;
  get rate() {
    return this.context?.sampleRate ?? 48000;
  }
  get active() {
    return this.completion !== null;
  }
  async enable() {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'interactive' });
      this.context = context;
      this.initialization = (async () => {
        const [module] = await Promise.all([
          WebAssembly.compileStreaming(fetch('/engine/dojo_bg.wasm')),
          context.audioWorklet.addModule('/audio-worklet.js'),
        ]);
        const node = new AudioWorkletNode(context, 'dojo-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          processorOptions: { module },
        });
        this.module = module;
        this.node = node;
        this.output = context.createGain();
        node.connect(this.output);
        this.output.connect(context.destination);
        node.port.onmessage = ({ data }) => {
          if (data.type === 'markers')
            for (let i = 0; i < data.values.length; i += 5) {
              const [kind, id, index, frame, value] = data.values.slice(i, i + 5) as number[];
              const stamp =
                typeof context.getOutputTimestamp === 'function'
                  ? context.getOutputTimestamp()
                  : null;
              const at =
                stamp &&
                typeof stamp.performanceTime === 'number' &&
                typeof stamp.contextTime === 'number' &&
                stamp.performanceTime > 0
                  ? stamp.performanceTime + (frame / context.sampleRate - stamp.contextTime) * 1000
                  : performance.now() + (frame / context.sampleRate - context.currentTime) * 1000;
              this.onMarker?.({
                kind,
                id,
                index,
                frame,
                at: Math.max(0, at),
                value,
              });
              if ((kind === 7 || kind === 8) && id === this.current) {
                this.clearEnvironment();
                const done = this.completion;
                this.completion = null;
                done?.(kind === 8);
              }
            }
          if (data.type === 'error') {
            this.clearEnvironment();
            const done = this.completion;
            this.completion = null;
            done?.(true);
            window.dispatchEvent(new Event('dojo-audio-fault'));
            this.onError?.(data.message);
          }
        };
        node.onprocessorerror = () => {
          this.clearEnvironment();
          window.dispatchEvent(new Event('dojo-audio-fault'));
          this.onError?.('The audio processor stopped. This block is interrupted.');
          const done = this.completion;
          this.completion = null;
          done?.(true);
        };
        context.onstatechange = () => {
          if (context.state !== 'running' && this.active) {
            window.dispatchEvent(new Event('dojo-audio-suspended'));
            this.onError?.('Audio was suspended by the browser. Resume when you are ready.');
          }
        };
      })();
    }
    const resume = this.context.state !== 'running' ? this.context.resume() : Promise.resolve();
    try {
      await Promise.all([this.initialization, resume]);
    } catch (error) {
      await this.context?.close();
      this.context = null;
      this.node = null;
      this.output = null;
      this.module = null;
      this.initialization = null;
      throw error;
    }
  }
  async play(
    spec: AudioSpec,
    isCurrent: () => boolean = () => true,
  ): Promise<{ id: number; finished: Promise<boolean> }> {
    await this.enable();
    if (!isCurrent()) return { id: 0, finished: Promise.resolve(true) };
    await this.stop();
    if (!isCurrent()) return { id: 0, finished: Promise.resolve(true) };
    const id = ++this.sequence;
    this.current = id;
    this.waiting = new Promise<boolean>((resolve) => {
      this.completion = resolve;
    });
    try {
      this.prepareEnvironment(spec, id);
    } catch (error) {
      this.clearEnvironment();
      this.completion?.(true);
      this.completion = null;
      throw error;
    }
    this.node!.port.postMessage({
      type: 'prepare',
      id,
      ...spec,
      volume: this.volume,
      frequency: this.frequency,
    });
    return { id, finished: this.waiting };
  }
  private prepareEnvironment(spec: AudioSpec, id: number) {
    this.clearEnvironment();
    const context = this.context!;
    if (spec.condition === 'noise') {
      // Prepare a bounded noise buffer on the main thread, never in the callback.
      const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = buffer.getChannelData(0);
      let state = 0x6d2b79f5;
      for (let i = 0; i < data.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[i] = ((state >>> 0) / 0xffffffff) * 2 - 1;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = this.frequency;
      filter.Q.value = 0.7;
      const gain = context.createGain();
      gain.gain.value = (this.volume / 100) * 0.13;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      this.environmentSources.push(source);
      this.environmentNodes.push(source, filter, gain);
      source.start();
    } else if (spec.condition === 'fading') {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 0.7;
      const depth = context.createGain();
      depth.gain.value = 0.35;
      this.output!.gain.value = 0.65;
      oscillator.connect(depth);
      depth.connect(this.output!.gain);
      this.environmentSources.push(oscillator);
      this.environmentNodes.push(oscillator, depth);
      oscillator.start();
    } else if (spec.condition === 'pileup') {
      const interferer = new AudioWorkletNode(context, 'dojo-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { module: this.module! },
      });
      this.interferer = interferer;
      this.environmentNodes.push(interferer);
      interferer.connect(context.destination);
      const failInterferer = (message: string) => {
        if (this.interferer !== interferer || this.current !== id) return;
        window.dispatchEvent(new Event('dojo-audio-fault'));
        this.onError?.(message);
        void this.stop();
      };
      interferer.onprocessorerror = () =>
        failInterferer('The overlapping caller stopped. This activity is interrupted.');
      interferer.port.onmessage = ({ data }) => {
        if (data.type === 'error')
          failInterferer(String(data.message || 'The overlapping caller stopped.'));
      };
      const interfererC = Math.min(60, spec.c * 1.08);
      interferer.port.postMessage({
        type: 'prepare',
        id,
        text: Array(3)
          .fill(spec.interferer || 'W7QRM')
          .join(' '),
        c: interfererC,
        e: Math.min(interfererC, spec.e),
        volume: this.volume * 0.45,
        frequency: Math.min(1200, this.frequency + 180),
        rescue: false,
      });
    }
  }
  private clearEnvironment() {
    for (const source of this.environmentSources) {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
    }
    this.environmentSources = [];
    if (this.interferer) {
      this.interferer.onprocessorerror = null;
      this.interferer.port.onmessage = null;
      this.interferer.port.postMessage({ type: 'command', name: 'stop', value: 0 });
    }
    this.interferer = null;
    for (const node of this.environmentNodes) node.disconnect();
    this.environmentNodes = [];
    if (this.output && this.context) {
      this.output.gain.cancelScheduledValues(this.context.currentTime);
      this.output.gain.value = 1;
    }
  }
  command(name: string, value = 0) {
    this.node?.port.postMessage({ type: 'command', name, value });
  }
  async stop() {
    this.clearEnvironment();
    if (!this.completion) return;
    this.command('stop');
    await Promise.race([this.waiting, new Promise((resolve) => setTimeout(resolve, 1000))]);
    if (this.completion) {
      const done = this.completion;
      this.completion = null;
      done(true);
    }
  }
  setVolume(volume: number) {
    this.volume = volume;
    this.command('volume', volume);
    this.interferer?.port.postMessage({ type: 'command', name: 'volume', value: volume * 0.45 });
  }
  async resume() {
    await this.enable();
    this.command('pause', 0);
  }
  async close() {
    await this.stop();
    this.node?.disconnect();
    this.output?.disconnect();
    await this.context?.close();
    this.context = null;
    this.node = null;
    this.output = null;
    this.module = null;
    this.initialization = null;
  }
}
export const audio = new AudioService();
