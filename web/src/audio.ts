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
        this.node = node;
        node.connect(context.destination);
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
                const done = this.completion;
                this.completion = null;
                done?.(kind === 8);
              }
            }
          if (data.type === 'error') {
            const done = this.completion;
            this.completion = null;
            done?.(true);
            this.onError?.(data.message);
          }
        };
        node.onprocessorerror = () => {
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
    this.node!.port.postMessage({
      type: 'prepare',
      id,
      ...spec,
      volume: this.volume,
      frequency: this.frequency,
    });
    return { id, finished: this.waiting };
  }
  command(name: string, value = 0) {
    this.node?.port.postMessage({ type: 'command', name, value });
  }
  async stop() {
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
  }
  async resume() {
    await this.enable();
    this.command('pause', 0);
  }
  async close() {
    await this.stop();
    this.node?.disconnect();
    await this.context?.close();
    this.context = null;
    this.node = null;
    this.initialization = null;
  }
}
export const audio = new AudioService();
