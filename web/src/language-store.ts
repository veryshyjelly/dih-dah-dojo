import { parseBackup } from './backup-format';
import { request, fromBase64, toBase64, ApiError } from './api';
import type { EngineClient } from './engine-client';
export type Activity = {
  version: 1;
  id: string;
  item: string;
  sentence: number;
  kind: 'word' | 'story' | 'callsign' | 'prosign';
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
  // Independent practice packets extend this interface without changing legacy bytes.
  latency_ms?: number | null;
  speed_mode?: 'fixed' | 'adaptive';
  exchange_answer?: string | null;
  exchange_attempts?: string[];
  trial_id?: string;
  revision?: number;
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
const generations = new Map<string, number>();
const generation = (owner: string) => generations.get(owner) || 0;
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
async function write(row: Row, valid: () => boolean = () => true) {
  const d = await db();
  try {
    if (!valid()) throw new Error('Progress changed before storage commit.');
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
  generations.set(owner, generation(owner) + 1);
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
    window.dispatchEvent(new Event('dojo-language-change'));
  }
}
export class LanguageStore {
  epoch = '';
  private cursor = 0;
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
    const expected = generation(this.owner);
    const packet = await this.engine.call<Uint8Array>('language_encode', JSON.stringify(activity));
    const entry = await this.engine.json<Entry>('language_decode', packet);
    if (expected !== generation(this.owner))
      throw new Error('Progress changed before this activity was saved. Reopen the page.');
    this.entries.push(entry);
    try {
      await write(
        {
          id: `${this.owner}:${activity.id}`,
          owner: this.owner,
          epoch: this.epoch,
          packet,
          synced: this.owner === 'guest',
        },
        () => expected === generation(this.owner),
      );
      this.status = this.owner === 'guest' ? 'Saved on this browser' : 'Saved here · sync pending';
    } catch {
      this.status = 'Unsaved · browser storage unavailable';
      return;
    }
    await this.sync();
    window.dispatchEvent(new Event('dojo-language-change'));
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
    await this.decode(list);
    const order = new Map(this.entries.map((e, i) => [`${this.owner}:${e.activity.id}`, i]));
    list.sort(
      (a, b) =>
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
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
  async previewImport(bytes: Uint8Array) {
    const parsed = await parseBackup(bytes);
    if (parsed.kind !== 'language') throw new Error('Choose a browser activity .bin backup here.');
    await this.open();
    if (this.owner !== 'guest' && this.status !== 'Synced')
      throw new Error('Go online and sync this account before importing.');
    const existing = await rows(this.owner),
      packets = new Map<string, Uint8Array>();
    let duplicates = 0;
    const equal = (a: Uint8Array, b: Uint8Array) =>
      a.length === b.length && a.every((n, i) => n === b[i]);
    for (const frame of parsed.frames) {
      const entry = await this.engine.json<Entry>('language_decode', frame.bytes),
        id = `${this.owner}:${entry.activity.id}`;
      const known = packets.get(id) || existing.find((r) => r.id === id)?.packet;
      if (known) {
        if (!equal(known, frame.bytes))
          throw new Error('A record ID conflicts with existing activity. Nothing was imported.');
        duplicates++;
      } else packets.set(id, frame.bytes);
    }
    return { packets, duplicates, existing, epoch: this.epoch, cursor: this.cursor, bytes };
  }
  async importPreview(preview: Awaited<ReturnType<LanguageStore['previewImport']>>) {
    if (this.owner !== 'guest') {
      const result = await request<{ imported: number }>(
        `/api/language/import?epoch=${encodeURIComponent(preview.epoch)}&cursor=${preview.cursor}&owner=${encodeURIComponent(this.owner)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          signal: AbortSignal.timeout(120000),
          body: new Uint8Array(preview.bytes),
        },
      );
      await this.open();
      window.dispatchEvent(new Event('dojo-language-change'));
      return result.imported;
    }
    const d = await db();
    try {
      await new Promise<void>((resolve, reject) => {
        const t = d.transaction('activity', 'readwrite'),
          object = t.objectStore('activity'),
          request = object.getAll();
        let failure = 'Could not import activity.';
        request.onsuccess = () => {
          const now = (request.result as Row[]).filter((r) => r.owner === this.owner),
            same = (a: Row, b: Row) =>
              a.id === b.id &&
              a.epoch === b.epoch &&
              a.packet.length === b.packet.length &&
              a.packet.every((v, i) => v === b.packet[i]);
          if (
            now.length !== preview.existing.length ||
            !now.every((a) => preview.existing.some((b) => same(a, b)))
          ) {
            failure = 'Activity changed. Preview the file again.';
            t.abort();
            return;
          }
          for (const [id, packet] of preview.packets)
            object.put({
              id,
              packet,
              owner: this.owner,
              epoch: preview.epoch,
              synced: this.owner === 'guest',
            } satisfies Row);
        };
        t.oncomplete = () => resolve();
        t.onerror = () => reject(new Error(failure));
        t.onabort = () => reject(new Error(failure));
      });
    } finally {
      d.close();
    }
    await this.open();
    window.dispatchEvent(new Event('dojo-language-change'));
    return preview.packets.size;
  }
  private async synchronize() {
    if (this.owner === 'guest') return;
    let expected = generation(this.owner);
    const current = () => expected === generation(this.owner);
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
        }>(`/api/language?after=${after}&owner=${encodeURIComponent(this.owner)}`);
        if (!current()) {
          this.entries = [];
          this.status = 'Activity changed · reopen this page';
          return;
        }
        if (this.epoch && page.epoch !== this.epoch) {
          await clearLanguage(this.owner);
          expected = generation(this.owner);
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
      this.cursor = after;
      const local = await rows(this.owner);
      for (const row of remote) {
        if (!current()) return;
        const pending = local.find((r) => r.id === row.id && !r.synced);
        if (
          pending &&
          (pending.packet.length !== row.packet.length ||
            pending.packet.some((n, i) => n !== row.packet[i]))
        )
          throw new Error('Sync conflict');
        await write(row, current);
      }
      const ordered = await rows(this.owner);
      const order = new Map(this.entries.map((e, i) => [`${this.owner}:${e.activity.id}`, i]));
      ordered.sort(
        (a, b) =>
          (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
      for (const row of ordered) {
        if (!current()) return;
        if (!row.synced) {
          if (row.epoch !== this.epoch) {
            this.status = 'Older unsynced activity cannot restore reset progress';
            continue;
          }
          const saved = await request<{ seq: number }>('/api/language', {
            method: 'POST',
            body: JSON.stringify({
              owner: this.owner,
              epoch: this.epoch,
              packet: toBase64(row.packet),
            }),
          });
          if (!current()) return;
          this.cursor = Math.max(this.cursor, saved.seq);
          await write({ ...row, synced: true, accepted: saved.seq }, current);
        }
      }
      if (!current()) return;
      await this.decode(await rows(this.owner));
      this.status = 'Synced';
    } catch (error) {
      this.status =
        error instanceof ApiError && error.status === 410
          ? 'Activity was reset · reopen this tool'
          : error instanceof Error && error.message === 'Sync conflict'
            ? 'Sync conflict · export this browser’s activity before retrying'
            : 'Saved here · sync pending';
    }
  }
}
