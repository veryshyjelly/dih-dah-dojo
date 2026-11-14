import { serve } from '@hono/node-server';
import { mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Store } from './store';
import { EnginePool } from './engine-pool';
import { createApp } from './app';
const path = process.env.DB_PATH || './data/dojo.sqlite';
const store = new Store(path);
const pool = new EnginePool();
const { app } = await createApp(store, pool, {
  appOrigin: process.env.APP_ORIGIN || 'http://127.0.0.1:5173',
  apiOrigin: process.env.API_ORIGIN || 'http://127.0.0.1:8787',
  secret: process.env.AUTH_SECRET,
  googleId: process.env.GOOGLE_CLIENT_ID,
  googleSecret: process.env.GOOGLE_CLIENT_SECRET,
  githubId: process.env.GITHUB_CLIENT_ID,
  githubSecret: process.env.GITHUB_CLIENT_SECRET,
});
const server = serve(
  {
    fetch: app.fetch,
    hostname: '127.0.0.1',
    port: Number(process.env.PORT || 8787),
  },
  () => console.log('Dojo API listening on loopback.'),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(backups);
  server.close();
  await pool.close();
  store.close();
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
async function backup() {
  const directory = process.env.BACKUP_PATH || join(dirname(path), 'backups');
  const file = join(directory, `dojo-${new Date().toISOString().slice(0, 10)}.sqlite`);
  if (existsSync(file)) return;
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    await store.backup(file);
    const files = readdirSync(directory)
      .filter((v) => /^dojo-\d{4}-\d{2}-\d{2}\.sqlite$/.test(v))
      .sort();
    for (const old of files.slice(0, -14)) unlinkSync(join(directory, old));
  } catch (error) {
    console.error(
      'Consistent backup failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
  }
}
const backups = setInterval(() => void backup(), 3600000);
backups.unref();
void backup();
