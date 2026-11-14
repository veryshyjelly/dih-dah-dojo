/// <reference lib="webworker" />
import init, { Engine } from './generated/dojo';
let engine: Engine;
const ready = init({ module_or_path: '/engine/dojo_bg.wasm' }).then(() => {
  engine = new Engine();
});
self.onmessage = async (event: MessageEvent<{ id: number; method: string; args: unknown[] }>) => {
  const { id, method, args } = event.data;
  try {
    await ready;
    const callable = (engine as unknown as Record<string, (...args: unknown[]) => unknown>)[method];
    if (typeof callable !== 'function' || method === 'free')
      throw new Error('Unknown engine command');
    const result = callable.apply(engine, args);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
