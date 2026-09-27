import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startPostgres } from '@cp/db/testing';
import pg from 'pg';

import { createAuthHarness, type SpikeAuthHarness } from '../s-auth/harness';
import { startMockIdp, type MockIdp } from '../s-auth/mock-idp';

import { createSpikeSyncApp } from './app';
import { POWERSYNC_LOCAL_URL, startPowerSync, stopPowerSync, type PowerSyncEndpoints } from './docker';
import { addSpikeTableToPublication, ensureSpikeSchema } from './schema';
import { listen, type RunningApp } from './serve';

const STORAGE_IMAGE = 'postgres:18.6-trixie';

function hostInternalUri(
  container: StartedPostgreSqlContainer,
  options: { database: string; port: number },
): string {
  return `postgresql://${container.getUsername()}:${container.getPassword()}@host.docker.internal:${container.getMappedPort(options.port)}/${options.database}`;
}

export interface SSyncHarness {
  appUrl: string;
  syncEndpoint: string;
  /** Pool against the source Postgres (spike schema, cmd_log, cmd_results — schema.ts). */
  pool: pg.Pool;
  close(): Promise<void>;
}

/**
 * Local, free-to-rerun S-SYNC stack: `startPostgres()` (Testcontainers, from
 * `infra/docker/postgres` — Postgres 18 with logical replication and an empty `powersync`
 * publication already created, same image the shared local infra and every other spike's
 * Testcontainers suite uses) as the replication source, a plain Postgres as PowerSync's bucket
 * storage, S-SYNC's own single-container PowerSync (docker.ts), and the combined app (app.ts)
 * served in-process. Mirrors the real topology (system-architecture.md §2) at spike scale.
 */
export async function createSSyncHarness(): Promise<SSyncHarness> {
  let source: StartedPostgreSqlContainer | undefined;
  let storage: StartedPostgreSqlContainer | undefined;
  let mockIdp: MockIdp | undefined;
  let pool: pg.Pool | undefined;
  let authHarness: SpikeAuthHarness | undefined;
  let appServer: RunningApp | undefined;
  let powerSyncStarted = false;

  try {
    [source, storage, mockIdp] = await Promise.all([
      startPostgres(),
      new PostgreSqlContainer(STORAGE_IMAGE).start(),
      startMockIdp(),
    ]);

    pool = new pg.Pool({ connectionString: source.getConnectionUri(), connectionTimeoutMillis: 5000 });
    await ensureSpikeSchema(pool);
    await addSpikeTableToPublication(pool);

    authHarness = await createAuthHarness(pool, mockIdp);
    const app = createSpikeSyncApp({ auth: authHarness.auth, pool });
    appServer = await listen(app);

    const endpoints: PowerSyncEndpoints = {
      dataSourceUri: hostInternalUri(source, { database: source.getDatabase(), port: 5432 }),
      storageUri: hostInternalUri(storage, { database: storage.getDatabase(), port: 5432 }),
      jwksUri: `${appServer.baseUrl.replace('127.0.0.1', 'host.docker.internal')}/api/auth/jwks`,
    };
    await startPowerSync(endpoints);
    powerSyncStarted = true;

    return {
      appUrl: appServer.baseUrl,
      syncEndpoint: POWERSYNC_LOCAL_URL,
      pool,
      async close() {
        if (powerSyncStarted) await stopPowerSync();
        await appServer?.close();
        await mockIdp?.close();
        await pool?.end();
        await Promise.allSettled([source?.stop(), storage?.stop()]);
      },
    };
  } catch (error) {
    if (powerSyncStarted) await stopPowerSync().catch(() => undefined);
    await appServer?.close().catch(() => undefined);
    await mockIdp?.close().catch(() => undefined);
    await pool?.end().catch(() => undefined);
    await Promise.allSettled([source?.stop(), storage?.stop()]);
    throw error;
  }
}
