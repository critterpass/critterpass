import { serve, type ServerType } from '@hono/node-server';
import pg from 'pg';
import { z } from 'zod';

import { formatError } from '../shared/format-error';

import { createDeployAuth, createSpikeAuthApp } from './deploy-app';

/**
 * Railway entrypoint for the persistent "spike-auth" service (`tools/spikes/s-auth-app.Dockerfile`)
 * — T3's device half of S-AUTH. Never used locally; T2's own tests keep using the in-process
 * Testcontainers harness (`harness.ts`) with its mock IdP.
 *
 * Runs Better Auth's tables in their own `spike_auth` Postgres schema. **Must connect on
 * PlanetScale's direct port (5432), never the PgBouncer transaction-pooling port (6432)**: an
 * earlier version of this file ran `SET search_path` per pooled connection, which is a
 * session-level statement — PgBouncer transaction pooling hands that same backend session to a
 * *different* client on the next transaction, so the override leaked onto unrelated staging
 * connections (it reached a real migration and put PostGIS in the wrong schema; see the ADR's
 * device-half findings). `search_path` is instead set once via the `options` startup parameter on
 * each of this pool's own dedicated (unpooled) connections — safe specifically because they are
 * not shared with any other client.
 */
const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(8080),
  PUBLIC_BASE_URL: z.url().optional(),
  APPLE_APP_BUNDLE_ID: z.string().optional(),
});

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    options: '-c search_path=spike_auth,public',
  });
  pool.on('error', (error) =>
    console.error(JSON.stringify({ msg: 'spike-auth pool error', error: String(error) })),
  );
  // One-time setup on its own connection, not the shared pool's `connect` hook — schema creation
  // only needs to happen once per deploy, not once per pooled connection.
  await pool.query('create schema if not exists spike_auth');

  const { auth, capturedOtps } = await createDeployAuth(pool);
  const app = createSpikeAuthApp(auth, capturedOtps);

  const server: ServerType = await new Promise((resolve) => {
    const started = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, () =>
      resolve(started),
    );
  });
  console.log(JSON.stringify({ msg: 'spike-auth listening', port: env.PORT }));

  const shutdown = (): void => {
    console.log(JSON.stringify({ msg: 'spike-auth shutting down' }));
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 'spike-auth failed to start', error: formatError(error) }));
  process.exitCode = 1;
});
