export class EngineClient {
  private worker = new Worker(new URL('./engine.worker.ts', import.meta.url), {
    type: 'module',
  });
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    this.worker.onmessage = ({ data }) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      clearTimeout(job.timer);
      this.pending.delete(data.id);
      data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
    };
    this.worker.onerror = () =>
      this.fail(new Error('The training worker stopped. Your last saved results are safe.'));
  }
  call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The training engine did not respond. Please restart this block.'));
      }, 15000);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.worker.postMessage({ id, method, args });
    });
  }
  async json<T>(method: string, ...args: unknown[]): Promise<T> {
    return JSON.parse(await this.call<string>(method, ...args)) as T;
  }
  private fail(error: Error) {
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    this.pending.clear();
  }
  close() {
    this.fail(new Error('Engine closed'));
    this.worker.terminate();
  }
}
