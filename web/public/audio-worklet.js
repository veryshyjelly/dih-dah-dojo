import './audio-text-codec.js';
import { initSync, AudioKernel } from './engine/dojo.js';
class DojoProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.wasm = initSync({ module: options.processorOptions.module });
    this.kernel = new AudioKernel();
    this.view = new Float32Array(this.wasm.memory.buffer, this.kernel.buffer_ptr(), 2048);
    this.reportedFault = false;
    this.port.onmessage = ({ data }) => {
      try {
        if (data.type === 'prepare') {
          this.kernel.prepare(
            data.id,
            data.text,
            data.c,
            data.e,
            sampleRate,
            data.frequency,
            data.volume,
            data.rescue,
          );
          this.view = new Float32Array(this.wasm.memory.buffer, this.kernel.buffer_ptr(), 2048);
          this.reportedFault = false;
          this.port.postMessage({ type: 'prepared', id: data.id });
        } else if (data.type === 'command') {
          this.kernel.command(data.name, data.value ?? 0);
        }
      } catch (error) {
        this.port.postMessage({ type: 'error', message: String(error) });
      }
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const pointer = this.kernel.render(currentFrame, output.length);
    if (
      !this.view ||
      this.view.buffer !== this.wasm.memory.buffer ||
      this.view.byteOffset !== pointer
    )
      this.view = new Float32Array(this.wasm.memory.buffer, pointer, 2048);
    for (let i = 0; i < output.length; i++) output[i] = this.view[i];
    const count = this.kernel.drain();
    if (count) {
      const markers = new Float64Array(this.wasm.memory.buffer, this.kernel.markers_ptr(), count);
      this.port.postMessage({ type: 'markers', values: markers.slice() });
    }
    if (this.kernel.fault() && !this.reportedFault) {
      this.reportedFault = true;
      this.port.postMessage({
        type: 'error',
        message: 'Audio transport lost timing continuity.',
      });
    }
    return true;
  }
}
registerProcessor('dojo-processor', DojoProcessor);
