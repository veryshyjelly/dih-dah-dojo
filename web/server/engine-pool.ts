import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
export type Job = {
  state: Uint8Array;
  packet?: Uint8Array;
  apply?: boolean;
  action?: string;
  values?: Record<string, unknown>;
};
export type Evaluation = {
  state: Uint8Array;
  record?: Uint8Array;
  summary?: Record<string, unknown>;
};
export class EnginePool {
  private worker: Worker | null = null;
  private sequence = 0;
  private jobs = new Map<
    number,
    {
      resolve: (value: Evaluation) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(private filename = fileURLToPath(new URL('./engine-worker.mjs', import.meta.url))) {}
  async run(job: Job): Promise<Evaluation> {
    if (this.jobs.size >= 16)
      throw new Error(
        'The evaluation queue is full. Your block remains on this device; retry shortly.',
      );
    if (!this.worker) {
      this.worker = new Worker(this.filename);
      this.worker.on('message', ({ id, result, error }) => {
        const job = this.jobs.get(id);
        if (!job) return;
        clearTimeout(job.timer);
        this.jobs.delete(id);
        error ? job.reject(new Error(error)) : job.resolve(result);
      });
      this.worker.on('error', (error) =>
        this.fail(error instanceof Error ? error : new Error(String(error))),
      );
      this.worker.on('exit', (code) => {
        this.worker = null;
        if (code !== 0)
          this.fail(new Error('Evaluation worker restarted. Retry the retained block.'));
      });
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error('Evaluation timed out. Retry the retained block.'));
        void this.worker?.terminate();
        this.worker = null;
      }, 15000);
      timer.unref();
      this.jobs.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, job });
    });
  }
  private fail(error: Error) {
    for (const job of this.jobs.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    this.jobs.clear();
  }
  async close() {
    this.fail(new Error('Server is stopping'));
    await this.worker?.terminate();
    this.worker = null;
  }
}
