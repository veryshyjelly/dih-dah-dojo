import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
export type ProfileRow = {
  owner: string;
  input: string;
  revision: number;
  state: Buffer;
};
export class Store {
  readonly db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }
  migrate() {
    this.db.exec(`
 CREATE TABLE IF NOT EXISTS dojo_epochs(owner TEXT PRIMARY KEY,generation TEXT NOT NULL DEFAULT (lower(hex(randomblob(16)))),FOREIGN KEY(owner) REFERENCES user(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS dojo_profiles(owner TEXT NOT NULL,input TEXT NOT NULL CHECK(input IN ('keyboard','touch')),revision INTEGER NOT NULL DEFAULT 0,state BLOB NOT NULL,PRIMARY KEY(owner,input),FOREIGN KEY(owner) REFERENCES user(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS dojo_blocks(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,owner TEXT NOT NULL,input TEXT NOT NULL,source TEXT NOT NULL,applied INTEGER NOT NULL,record BLOB NOT NULL,packet BLOB NOT NULL,created INTEGER NOT NULL,kind TEXT NOT NULL,attempt REAL,final_accuracy REAL,targets INTEGER NOT NULL,decision TEXT NOT NULL,pace TEXT NOT NULL,interrupted TEXT,completed INTEGER NOT NULL,UNIQUE(owner,id),FOREIGN KEY(owner) REFERENCES user(id) ON DELETE CASCADE);
 CREATE INDEX IF NOT EXISTS dojo_blocks_owner_input ON dojo_blocks(owner,input,seq DESC);
 `);
  }
  epoch(owner: string) {
    this.db.prepare('INSERT OR IGNORE INTO dojo_epochs(owner) VALUES(?)').run(owner);
    return (
      this.db.prepare('SELECT generation FROM dojo_epochs WHERE owner=?').get(owner) as {
        generation: string;
      }
    ).generation;
  }
  profile(owner: string, input: string) {
    return this.db
      .prepare('SELECT * FROM dojo_profiles WHERE owner=? AND input=?')
      .get(owner, input) as ProfileRow | undefined;
  }
  initialize(owner: string, input: string, state: Uint8Array) {
    this.db
      .prepare('INSERT OR IGNORE INTO dojo_profiles(owner,input,state) VALUES(?,?,?)')
      .run(owner, input, Buffer.from(state));
    return this.profile(owner, input)!;
  }
  history(owner: string, input: string, before: number, limit = 100) {
    return this.db
      .prepare(
        "SELECT seq,record FROM dojo_blocks WHERE owner=? AND input=? AND source='guided' AND applied=1 AND seq<? ORDER BY seq DESC LIMIT ?",
      )
      .all(owner, input, before, limit) as { seq: number; record: Buffer }[];
  }
  reset(owner: string) {
    this.epoch(owner);
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE dojo_epochs SET generation=lower(hex(randomblob(16))) WHERE owner=?')
        .run(owner);
      this.db.prepare('DELETE FROM dojo_blocks WHERE owner=?').run(owner);
      this.db.prepare('DELETE FROM dojo_profiles WHERE owner=?').run(owner);
    })();
  }
  export(owner: string) {
    const profiles = this.db
      .prepare('SELECT input,state FROM dojo_profiles WHERE owner=? ORDER BY input')
      .all(owner) as { input: string; state: Buffer }[];
    const blocks = this.db
      .prepare('SELECT input,packet FROM dojo_blocks WHERE owner=? ORDER BY seq')
      .all(owner) as { input: string; packet: Buffer }[];
    const frames: Buffer[] = [];
    for (const [type, items] of [
      [0, profiles],
      [1, blocks],
    ] as const)
      for (const row of items) {
        const bytes = 'state' in row ? row.state : row.packet;
        const head = Buffer.alloc(6);
        head[0] = type;
        head[1] = row.input === 'touch' ? 1 : 0;
        head.writeUInt32LE(bytes.length, 2);
        frames.push(head, bytes);
      }
    const body = Buffer.concat(frames);
    return Buffer.concat([
      Buffer.from('CWDOJOW1'),
      createHash('sha256').update(body).digest(),
      body,
    ]);
  }
  async backup(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    await this.db.backup(path);
  }
  close() {
    this.db.close();
  }
}
