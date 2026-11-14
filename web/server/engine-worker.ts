import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import init, { Engine } from '../public/engine/dojo.js';
import type { Job } from './engine-pool';
await init({
  module_or_path: await readFile(new URL('./engine/dojo_bg.wasm', import.meta.url)),
});
parentPort!.on('message', ({ id, job }: { id: number; job: Job }) => {
  const engine = new Engine();
  try {
    if (job.action === 'language') {
      const summary = JSON.parse(engine.language_decode(job.packet!));
      parentPort!.postMessage({ id, result: { state: new Uint8Array(), summary } });
      return;
    }
    if (job.action === 'restore-state') {
      engine.restore_checkpoint(job.state);
      parentPort!.postMessage({
        id,
        result: { state: engine.checkpoint(), summary: JSON.parse(engine.snapshot(Date.now())) },
      });
      return;
    }
    if (job.action === 'restore-record') {
      const summary = JSON.parse(engine.restore_record(job.packet!, !!job.values?.legacy));
      parentPort!.postMessage({
        id,
        result: { state: new Uint8Array(), summary, record: engine.record() },
      });
      return;
    }
    engine.load(job.state);
    let summary, record;
    if (job.packet) {
      summary = JSON.parse(engine.accept(job.packet, job.apply !== false));
      record = engine.record();
    } else if (job.action === 'bootstrap') {
      engine.bootstrap(String(job.values?.known ?? 'KM'), Date.now());
      if (job.values?.taught)
        engine.initial_disclosure(String(job.values?.known ?? 'KM'), Date.now());
    } else if (job.action === 'preferences')
      engine.preferences(Number(job.values?.volume), Number(job.values?.frequency));
    else if (job.action === 'begin') engine.begin_session();
    else if (job.action === 'end') engine.end_session();
    else if (job.action !== 'initialize') throw new Error('Unknown profile operation');
    parentPort!.postMessage({
      id,
      result: { state: engine.checkpoint(), summary, record },
    });
  } catch (error) {
    parentPort!.postMessage({ id, error: String(error) });
  } finally {
    engine.free();
  }
});
