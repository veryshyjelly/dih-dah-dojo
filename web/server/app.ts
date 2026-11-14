import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { randomBytes } from 'node:crypto';
import type { Store } from './store';
import type { EnginePool, Evaluation, Job } from './engine-pool';
const MAX_BINARY = 8 * 1024 * 1024;
const profiles = new Set(['keyboard', 'touch']);
export type Identity = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};
export type Config = {
  appOrigin: string;
  apiOrigin: string;
  secret?: string;
  googleId?: string;
  googleSecret?: string;
  githubId?: string;
  githubSecret?: string;
  resolveSession?: (headers: Headers) => Promise<Identity | null>;
};
export async function createApp(store: Store, pool: Pick<EnginePool, 'run'>, config: Config) {
  const production = config.apiOrigin.startsWith('https://');
  if (production && !config.secret) throw new Error('AUTH_SECRET is required in production');
  const providers = {
    google: !!(config.googleId && config.googleSecret),
    github: !!(config.githubId && config.githubSecret),
  };
  const auth = betterAuth({
    database: store.db,
    baseURL: config.apiOrigin,
    secret: config.secret || randomBytes(32).toString('hex'),
    trustedOrigins: [config.appOrigin],
    user: { deleteUser: { enabled: true } },
    advanced: { useSecureCookies: production },
    socialProviders: {
      ...(providers.google
        ? {
            google: {
              clientId: config.googleId!,
              clientSecret: config.googleSecret!,
            },
          }
        : {}),
      ...(providers.github
        ? {
            github: {
              clientId: config.githubId!,
              clientSecret: config.githubSecret!,
            },
          }
        : {}),
    },
  });
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  store.migrate();
  const identity =
    config.resolveSession ??
    (async (headers: Headers) => (await auth.api.getSession({ headers }))?.user ?? null);
  const app = new Hono<{ Variables: { user: Identity } }>();
  app.use(
    '*',
    cors({
      origin: config.appOrigin,
      credentials: true,
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 12 * 1024 * 1024,
      onError: (c) =>
        c.json({ error: 'Block exceeds the upload limit. Keep the local copy.' }, 413),
    }),
  );
  const attempts = new Map<string, { count: number; at: number }>();
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    const origin = c.req.header('Origin');
    if (c.req.method !== 'GET' && origin !== config.appOrigin)
      return c.json({ error: 'This request origin is not allowed.' }, 403);
    const key = c.req.header('CF-Connecting-IP') || 'local';
    const now = Date.now();
    let item = attempts.get(key);
    if (!item || now - item.at > 60000) {
      item = { count: 0, at: now };
      attempts.set(key, item);
    }
    if (++item.count > 240) return c.json({ error: 'Too many requests. Retry in a minute.' }, 429);
    if (attempts.size > 2000)
      for (const [k, v] of attempts) if (now - v.at > 60000) attempts.delete(k);
    if (attempts.size > 4000)
      return c.json({ error: 'The account service is busy. Retry shortly.' }, 503);
    return next();
  });
  app.get('/health', (c) => c.json({ ok: true, service: 'dojo-api', providers }));
  app.get('/api/session', async (c) =>
    c.json({ user: await identity(c.req.raw.headers), providers }),
  );
  app.all('/api/auth/*', async (c) => {
    if (c.req.path === '/api/auth/delete-user')
      return c.json({ error: 'Use the account deletion confirmation.' }, 400);
    return auth.handler(c.req.raw);
  });
  const authenticated: MiddlewareHandler<{
    Variables: { user: Identity };
  }> = async (c, next) => {
    const user = await identity(c.req.raw.headers);
    if (!user) return c.json({ error: 'Sign in to save personal progress.' }, 401);
    c.set('user', user);
    return next();
  };
  app.use('/api/profile/*', authenticated);
  app.use('/api/records/*', authenticated);
  app.use('/api/blocks', authenticated);
  app.use('/api/account/*', authenticated);

  async function getProfile(owner: string, input: string) {
    let row = store.profile(owner, input);
    if (!row) {
      const result = await pool.run({
        state: new Uint8Array(),
        action: 'initialize',
      });
      row = store.initialize(owner, input, result.state);
    }
    return row;
  }
  app.get('/api/profile/:input', async (c) => {
    const input = c.req.param('input');
    if (!profiles.has(input)) return c.json({ error: 'Unknown input profile' }, 400);
    const row = await getProfile(c.get('user').id, input);
    const history = store.history(row.owner, input, Number.MAX_SAFE_INTEGER);
    return c.json({
      epoch: store.epoch(row.owner),
      state: row.state.toString('base64'),
      revision: row.revision,
      records: history.map((r) => r.record.toString('base64')),
      cursor: history.length === 100 ? history.at(-1)!.seq : null,
    });
  });
  app.get('/api/records/:input', (c) => {
    const input = c.req.param('input');
    if (!profiles.has(input)) return c.json({ error: 'Unknown input profile' }, 400);
    const before = Number(c.req.query('before') || Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(before) || before < 1)
      return c.json({ error: 'Invalid history cursor' }, 400);
    const rows = store.history(c.get('user').id, input, before);
    return c.json({
      records: rows.map((r) => r.record.toString('base64')),
      cursor: rows.length === 100 ? rows.at(-1)!.seq : null,
    });
  });
  app.post('/api/profile/:input', async (c) => {
    const input = c.req.param('input');
    if (!profiles.has(input)) return c.json({ error: 'Unknown input profile' }, 400);
    const body = await c.req.json();
    const row = await getProfile(c.get('user').id, input);
    if (body.epoch !== store.epoch(row.owner))
      return c.json(
        {
          error: 'Progress was reset. Refresh this profile before continuing.',
        },
        410,
      );
    if (body.baseRevision !== row.revision)
      return c.json(
        {
          error: 'Another device updated this profile. Refresh before continuing.',
        },
        409,
      );
    if (!['bootstrap', 'preferences', 'begin', 'end'].includes(body.action))
      return c.json({ error: 'Unknown profile action' }, 400);
    if (
      body.action === 'preferences' &&
      (!Number.isInteger(body.volume) ||
        body.volume < 0 ||
        body.volume > 100 ||
        !Number.isInteger(body.frequency) ||
        body.frequency < 300 ||
        body.frequency > 1000)
    )
      return c.json({ error: 'Choose volume from 0–100 and tone from 300–1000 Hz.' }, 400);
    const result = await pool.run({
      state: row.state,
      action: body.action,
      values: body,
    });
    if (body.epoch !== store.epoch(row.owner))
      return c.json({ error: 'Progress was reset. Refresh this profile before continuing.' }, 410);
    const changed = store.db
      .prepare(
        'UPDATE dojo_profiles SET state=?,revision=revision+1 WHERE owner=? AND input=? AND revision=?',
      )
      .run(Buffer.from(result.state), row.owner, input, row.revision);
    if (!changed.changes)
      return c.json(
        {
          error: 'Another device updated this profile. Refresh before continuing.',
        },
        409,
      );
    return c.json({
      state: Buffer.from(result.state).toString('base64'),
      revision: row.revision + 1,
    });
  });
  app.post('/api/blocks', async (c) => {
    const body = await c.req.json();
    if (
      !profiles.has(body.profile) ||
      typeof body.id !== 'string' ||
      !/^[a-zA-Z0-9-]{8,100}$/.test(body.id) ||
      typeof body.packet !== 'string' ||
      body.packet.length > Math.ceil((MAX_BINARY * 4) / 3) + 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.packet)
    )
      return c.json({ error: 'Invalid block envelope' }, 400);
    const owner = c.get('user').id;
    const resetResponse = () =>
      c.json(
        {
          error:
            'Progress was reset on another device. This older result cannot restore deleted history.',
        },
        410,
      );
    if (body.epoch !== store.epoch(owner))
      return c.json(
        {
          error:
            'Progress was reset on another device. This older result cannot restore deleted history.',
        },
        410,
      );
    const row = await getProfile(owner, body.profile);
    if (body.epoch !== store.epoch(owner)) return resetResponse();
    if (store.db.prepare('SELECT 1 FROM dojo_blocks WHERE owner=? AND id=?').get(owner, body.id))
      return c.json({
        state: row.state.toString('base64'),
        revision: row.revision,
        duplicate: true,
        conflict: false,
      });
    const packet = Buffer.from(body.packet, 'base64');
    if (packet.length > MAX_BINARY) return c.json({ error: 'Block is too large' }, 413);
    let apply = body.baseRevision === row.revision;
    let result = await pool.run({ state: row.state, packet, apply });
    if (body.epoch !== store.epoch(owner)) return resetResponse();
    // A different request may have committed while the worker evaluated this block.
    if (apply && store.profile(owner, body.profile)!.revision !== row.revision) {
      apply = false;
      result = await pool.run({
        state: store.profile(owner, body.profile)!.state,
        packet,
        apply: false,
      });
    }
    // No await separates this generation check from the synchronous transaction.
    if (body.epoch !== store.epoch(owner)) return resetResponse();
    const summary = result.summary!;
    const saved = store.db.transaction(() => {
      const existing = store.db
        .prepare('SELECT 1 FROM dojo_blocks WHERE owner=? AND id=?')
        .get(owner, body.id);
      if (existing) return false;
      const current = store.profile(owner, body.profile)!;
      if (apply && current.revision !== row.revision)
        throw new Error('Profile changed during final commit; retry the retained block.');
      store.db
        .prepare(
          'INSERT INTO dojo_blocks(id,owner,input,source,applied,record,packet,created,kind,attempt,final_accuracy,targets,decision,pace,interrupted,completed) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          body.id,
          owner,
          body.profile,
          String(summary.source),
          apply ? 1 : 0,
          Buffer.from(result.record!),
          packet,
          Date.now(),
          String(summary.kind),
          summary.attempt as number | null,
          summary.finalAccuracy as number | null,
          Number(summary.targets),
          String(summary.decision),
          String(summary.pace),
          summary.interrupted as string | null,
          summary.completed ? 1 : 0,
        );
      if (apply && summary.source === 'guided')
        store.db
          .prepare('UPDATE dojo_profiles SET state=?,revision=revision+1 WHERE owner=? AND input=?')
          .run(Buffer.from(result.state), owner, body.profile);
      return true;
    })();
    const current = store.profile(owner, body.profile)!;
    return c.json({
      state: current.state.toString('base64'),
      revision: current.revision,
      summary,
      conflict: !apply,
      duplicate: !saved,
    });
  });
  app.get('/api/account/history', (c) => {
    const rows = store.db
      .prepare(
        'SELECT id,input,source,applied,created,kind,attempt,final_accuracy,targets,decision,pace,interrupted,completed FROM dojo_blocks WHERE owner=? ORDER BY seq DESC LIMIT 100',
      )
      .all(c.get('user').id);
    return c.json({ records: rows });
  });
  app.get(
    '/api/account/export',
    (c) =>
      new Response(store.export(c.get('user').id), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="dih-dah-dojo.cwweb"',
          'Cache-Control': 'private, no-store',
        },
      }),
  );
  app.post('/api/account/reset', async (c) => {
    const body = await c.req.json();
    if (body.confirmation !== 'DELETE')
      return c.json({ error: 'Type DELETE to reset progress.' }, 400);
    store.reset(c.get('user').id);
    return c.json({ ok: true });
  });
  app.post('/api/account/delete', async (c) => {
    const body = await c.req.json();
    if (body.confirmation !== 'DELETE')
      return c.json({ error: 'Type DELETE to delete this account.' }, 400);
    return auth.api.deleteUser({
      headers: c.req.raw.headers,
      body: {},
      asResponse: true,
    });
  });
  app.onError((error, c) => {
    console.error(
      'API request failed:',
      error.message.replace(/(?:token|secret|password)=\S+/gi, '[redacted]'),
    );
    return c.json(
      {
        error: error.message.startsWith('Error:')
          ? error.message.slice(6)
          : 'This request could not be completed. Your local block is retained.',
      },
      500,
    );
  });
  return { app, auth, providers };
}
