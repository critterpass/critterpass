import pg from 'pg';
import { z } from 'zod';

import { createAuthHarness } from '../s-auth/harness';
import { startMockIdp } from '../s-auth/mock-idp';
import { formatError } from '../shared/format-error';

import { createSpikeSyncApp } from './app';
import { listen } from './serve';

/**
 * Railway entrypoint for the persistent "spike-sync-app" service
 * (`tools/spikes/s-sync-app.Dockerfile`): Better Auth (JWKS + token minting) and `/sync/upload`
 * over one real Postgres connection (PlanetScale staging/main, `spike` schema — schema.ts).
 * Never used locally; the local harness (harness.ts) serves the same `createSpikeSyncApp` output
 * in-process instead.
 *
 * Deliberately does NOT create the spike schema or touch the shared `powersync` publication on
 * boot: this service can restart independently (Railway redeploy, crash recovery) and a restart
 * must never re-run lifecycle steps against a shared database. `load.ts`/`drill.ts` own that
 * lifecycle explicitly (ensure schema + add to publication before measuring, remove + drop after)
 * and assume this service is already up with the schema already in place.
 */
const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(8080),
});

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
  pool.on('error', (error) =>
    console.error(JSON.stringify({ msg: 's-sync app pool error', error: String(error) })),
  );

  const mockIdp = await startMockIdp();
  const { auth } = await createAuthHarness(pool, mockIdp);
  const app = createSpikeSyncApp({ auth, pool });
  const running = await listen(app, env.PORT);
  console.log(
    JSON.stringify({ msg: 's-sync app listening', baseUrl: running.baseUrl, port: env.PORT }),
  );

  const shutdown = async (): Promise<void> => {
    console.log(JSON.stringify({ msg: 's-sync app shutting down' }));
    await running.close();
    await mockIdp.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-sync app failed to start', error: formatError(error) }));
  process.exitCode = 1;
});
