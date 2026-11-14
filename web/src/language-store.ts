import { request, fromBase64, toBase64, ApiError } from './api';
import type { EngineClient } from './engine-client';
export type Activity = {
  version: 1;
  id: string;
  item: string;
  sentence: number;
  kind: 'word' | 'story';
  input: string;
  c: number;
  e: number;
  answer: string | null;
  attempts: string[];
  replay: boolean;
  revealed: boolean;
  review: boolean;
  interrupted: boolean;
  finished: boolean;
  self_report: boolean | null;
  created: number;
};
export type Outcome = {
  eligible: boolean;
  correct: boolean | null;
  attempt_accuracy: number | null;
  final_accuracy: number | null;
};
export type Entry = { activity: Activity; outcome: Outcome };
type Row = {
  id: string;
  owner: string;
  epoch: string;
  packet: Uint8Array;
  synced: boolean;
  accepted?: number;
};
function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('dojo-language', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('activity', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function rows(owner: string) {
  const d = await db();
  try {
    return await new Promise<Row[]>((resolve, reject) => {
      const r = d.transaction('activity').objectStore('activity').getAll();
      r.onsuccess = () => resolve(r.result.filter((r: Row) => r.owner === owner));
      r.onerror = () => reject(r.error);
    });
  } finally {
    d.close();
  }
}
async function write(row: Row) {
  const d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction('activity', 'readwrite');
      t.objectStore('activity').put(row);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
export async function clearLanguage(owner: string) {
  const list = await rows(owner);
  const d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction('activity', 'readwrite');
      for (const r of list) t.objectStore('activity').delete(r.id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    d.close();
  }
}
export class LanguageStore {
  epoch = '';
  status = 'Saved on this browser';
  entries: Entry[] = [];
  constructor(
    readonly owner: string,
    private engine: EngineClient,
  ) {}
  async open() {
    try {
      const local = await rows(this.owner);
      this.epoch = local[0]?.epoch || '';
      await this.decode(local);
      await this.sync();
    } catch {
      this.status = 'Unsaved · browser storage unavailable';
    }
  }
  private async decode(list: Row[]) {
    this.entries = [];
    list.sort(
      (a, b) => (a.accepted ?? Number.MAX_SAFE_INTEGER) - (b.accepted ?? Number.MAX_SAFE_INTEGER),
    );
    for (const row of list) {
      try {
        this.entries.push(await this.engine.json<Entry>('language_decode', row.packet));
      } catch {
        /* Keep unknown versions on disk for export. */
      }
    }
    const order = new Map(list.map((r) => [r.id.slice(this.owner.length + 1), r.accepted]));
    this.entries.sort(
      (a, b) =>
        (order.get(a.activity.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.activity.id) ?? Number.MAX_SAFE_INTEGER) ||
        a.activity.created - b.activity.created,
    );
  }
  async save(activity: Activity) {
    const packet = await this.engine.call<Uint8Array>('language_encode', JSON.stringify(activity));
    const entry = await this.engine.json<Entry>('language_decode', packet);
    this.entries.push(entry);
    try {
      await write({
        id: `${this.owner}:${activity.id}`,
        owner: this.owner,
        epoch: this.epoch,
        packet,
        synced: this.owner === 'guest',
      });
      this.status = this.owner === 'guest' ? 'Saved on this browser' : 'Saved here · sync pending';
    } catch {
      this.status = 'Unsaved · browser storage unavailable';
      return;
    }
    await this.sync();
  }
  private syncing: Promise<void> | null = null;
  async sync() {
    if (this.syncing) await this.syncing;
    const job = this.synchronize();
    this.syncing = job;
    try {
      await job;
    } finally {
      if (this.syncing === job) this.syncing = null;
    }
  }
  async export() {
    const list = await rows(this.owner);
    const frames: Uint8Array[] = [new TextEncoder().encode('CWLANG01')];
    for (const row of list) {
      const head = new Uint8Array(4);
      new DataView(head.buffer).setUint32(0, row.packet.length, true);
      frames.push(head, row.packet);
    }
    const output = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
    let offset = 0;
    for (const frame of frames) {
      output.set(frame, offset);
      offset += frame.length;
    }
    return output;
  }
  private async synchronize() {
    if (this.owner === 'guest') return;
    try {
      let after = 0,
        more = true;
      const remote: Row[] = [];
      while (more) {
        const page = await request<{
          epoch: string;
          records: string[];
          sequences: number[];
          cursor: number;
          more: boolean;
        }>(`/api/language?after=${after}`);
        if (this.epoch && page.epoch !== this.epoch) {
          await clearLanguage(this.owner);
          this.entries = [];
        }
        this.epoch = page.epoch;
        for (const [i, b] of page.records.entries()) {
          const packet = fromBase64(b),
            entry = await this.engine.json<Entry>('language_decode', packet);
          remote.push({
            id: `${this.owner}:${entry.activity.id}`,
            owner: this.owner,
            epoch: this.epoch,
            packet,
            synced: true,
            accepted: page.sequences[i],
          });
        }
        after = page.cursor;
        more = page.more;
      }
      for (const row of remote) await write(row);
      for (const row of await rows(this.owner)) {
        if (!row.synced) {
          if (row.epoch !== this.epoch) {
            this.status = 'Older unsynced activity cannot restore reset progress';
            continue;
          }
          const saved = await request<{ seq: number }>('/api/language', {
            method: 'POST',
            body: JSON.stringify({ epoch: this.epoch, packet: toBase64(row.packet) }),
          });
          await write({ ...row, synced: true, accepted: saved.seq });
        }
      }
      await this.decode(await rows(this.owner));
      this.status = 'Synced';
    } catch (error) {
      this.status =
        error instanceof ApiError && error.status === 410
          ? 'Activity was reset · reopen this tool'
          : 'Saved here · sync pending';
    }
  }
}
