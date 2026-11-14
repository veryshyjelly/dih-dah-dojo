import { createHash } from 'node:crypto';
import { parseBackup, richBlock, digest } from '../src/backup-format';
import type { EnginePool, Evaluation } from './engine-pool';
import type { Store } from './store';
export function baseline(store: Store, owner: string) {
  const hash = createHash('sha256').update(store.epoch(owner));
  const profiles = store.db
    .prepare('SELECT input,revision,state FROM dojo_profiles WHERE owner=? ORDER BY input')
    .all(owner) as { input: string; revision: number; state: Buffer }[];
  for (const p of profiles) hash.update(p.input).update(String(p.revision)).update(p.state);
  for (const table of ['dojo_blocks', 'dojo_language']) {
    const key = table === 'dojo_blocks' ? 'seq' : 'rowid';
    const value = store.db
      .prepare(`SELECT COUNT(*) AS n,COALESCE(MAX(${key}),0) AS last FROM ${table} WHERE owner=?`)
      .get(owner);
    hash.update(JSON.stringify(value));
  }
  return hash.digest('hex');
}
export async function validateAccount(bytes: Uint8Array, pool: Pick<EnginePool, 'run'>) {
  const parsed = await parseBackup(bytes);
  if (parsed.kind !== 'account')
    throw new Error('Choose an account .cwweb backup for full restoration.');
  const profiles = new Map<string, Uint8Array>(),
    language = new Map<string, Uint8Array>(),
    blocks: {
      id: string;
      input: string;
      created: number;
      applied: boolean;
      packet: Uint8Array;
      record: Uint8Array;
      summary: Record<string, unknown>;
    }[] = [];
  const ids = new Set<string>();
  for (const frame of parsed.frames) {
    if (frame.type === 0) {
      if (profiles.has(frame.input)) throw new Error('Duplicate input profile in backup.');
      const v = await pool.run({ state: frame.bytes, action: 'restore-state' });
      profiles.set(frame.input, v.state);
    } else if (frame.type === 2) {
      const v = await pool.run({
        state: new Uint8Array(),
        packet: frame.bytes,
        action: 'language',
      });
      const id = String((v.summary!.activity as { id: string }).id);
      if (language.has(id) && Buffer.compare(language.get(id)!, frame.bytes) !== 0)
        throw new Error('Conflicting language IDs in backup.');
      language.set(id, frame.bytes);
    } else {
      const rich = frame.type === 3 ? richBlock(frame.bytes) : null,
        packet = rich?.packet || frame.bytes;
      const decoded = await pool.run({ state: new Uint8Array(), packet, apply: false });
      let v: Evaluation = rich
        ? decoded
        : await pool.run({
            state: new Uint8Array(),
            packet: decoded.record!,
            action: 'restore-record',
            values: { legacy: true },
          });
      if (rich) {
        v = await pool.run({
          state: new Uint8Array(),
          packet: rich.record,
          action: 'restore-record',
        });
        for (const key of ['attempt', 'finalAccuracy', 'targets', 'kind', 'content', 'utc'])
          if (v.summary![key] !== decoded.summary![key])
            throw new Error('Saved block and packet disagree.');
      }
      const id = rich?.id || 'legacy-' + (await digest(packet));
      if (ids.has(id)) throw new Error('Duplicate block ID in backup.');
      ids.add(id);
      const summary: Record<string, unknown> = { ...v.summary, source: decoded.summary!.source };

      blocks.push({
        id,
        input: frame.input,
        created: rich?.created || Number(decoded.summary!.utc) || 0,
        applied: rich?.applied || false,
        packet,
        record: v.record!,
        summary,
      });
    }
  }
  for (const b of blocks)
    if (!profiles.has(b.input)) throw new Error('Accepted history has no saved input profile.');
  return { profiles, language, blocks, legacy: parsed.legacy, digest: parsed.digest };
}
export type ValidatedAccount = Awaited<ReturnType<typeof validateAccount>>;
export function commitAccount(store: Store, owner: string, data: ValidatedAccount) {
  store.db.transaction(() => {
    store.reset(owner);
    for (const [input, state] of data.profiles) store.initialize(owner, input, state);
    const language = store.db.prepare(
      'INSERT INTO dojo_language(owner,id,packet,created) VALUES(?,?,?,?)',
    );
    let order = Date.now();
    for (const [id, packet] of data.language) language.run(owner, id, Buffer.from(packet), order++);
    const insert = store.db.prepare(
      'INSERT INTO dojo_blocks(id,owner,input,source,applied,record,packet,created,kind,attempt,final_accuracy,targets,decision,pace,interrupted,completed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    for (const b of data.blocks) {
      const s = b.summary;
      insert.run(
        b.id,
        owner,
        b.input,
        String(s.source),
        b.applied ? 1 : 0,
        Buffer.from(b.record),
        Buffer.from(b.packet),
        b.created,
        String(s.kind),
        s.attempt as number | null,
        s.finalAccuracy as number | null,
        Number(s.targets),
        String(s.decision),
        String(s.pace),
        s.interrupted as string | null,
        s.completed ? 1 : 0,
      );
    }
  })();
}
