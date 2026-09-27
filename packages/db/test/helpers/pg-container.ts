/**
 * Test-only Postgres lifecycle on top of ./containers.ts: one container per test file, migrated
 * once into a template database, then a fast `CREATE DATABASE ... TEMPLATE` clone per test so every
 * test gets full isolation without re-running the whole migration suite each time.
 */
import pg from 'pg';

import { startPostgres } from './containers';
import { migrateTestDatabase } from './migrate';

const TEMPLATE_DATABASE = 'cp_test_template';

export interface DbTestDatabase {
  readonly name: string;
  readonly pool: pg.Pool;
  /** Closes the pool and drops the throwaway database; call once per test (afterEach/finally). */
  drop(): Promise<void>;
}

export interface DbTestContainer {
  /** Clones the migrated template database and returns a pool connected to the clone. */
  createDatabase(): Promise<DbTestDatabase>;
  /** Stops the container and drops the template database; call once per file (afterAll). */
  stop(): Promise<void>;
}

function withDatabase(connectionUri: string, database: string): string {
  const url = new URL(connectionUri);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * Starts one Postgres container for the calling test file and migrates a template database once.
 * Vitest's default per-file module isolation gives each test file its own copy of the module-level
 * state here, which is what makes "one container per test file worker" happen without extra
 * coordination code.
 */
/**
 * `pg.Pool` documents an `'error'` listener as required on every pool: without one, an idle
 * client's connection-level error (e.g. a backend the admin connection just force-terminated)
 * throws as an uncaught exception instead of being handled internally. Every pool this file hands
 * out is short-lived and closed explicitly by its owner, so there is nothing useful to do with the
 * error beyond not crashing the process.
 */
function silenceIdleClientErrors(pool: pg.Pool): pg.Pool {
  pool.on('error', () => undefined);
  return pool;
}

export async function startDbTestContainer(): Promise<DbTestContainer> {
  const container = await startPostgres();
  const adminUrl = container.getConnectionUri();
  const adminPool = silenceIdleClientErrors(new pg.Pool({ connectionString: adminUrl, max: 5 }));
  let created = 0;

  await adminPool.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`);
  const templatePool = silenceIdleClientErrors(
    new pg.Pool({ connectionString: withDatabase(adminUrl, TEMPLATE_DATABASE), max: 1 }),
  );
  await migrateTestDatabase(templatePool);
  // Postgres refuses `CREATE DATABASE ... TEMPLATE x` while any session is connected to x.
  await templatePool.end();

  return {
    async createDatabase() {
      created += 1;
      const name = `cp_test_${process.pid}_${created}`;
      await adminPool.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DATABASE}`);
      const pool = silenceIdleClientErrors(
        new pg.Pool({ connectionString: withDatabase(adminUrl, name), max: 5 }),
      );
      return {
        name,
        pool,
        async drop() {
          // Force-drop while `pool` is still open: any client it still has idle is then
          // terminated by Postgres while pg.Pool's own idle-client error handling is listening,
          // which evicts it cleanly. Ending the pool first and force-dropping after races the
          // client's own socket teardown against Postgres independently killing the same backend.
          await adminPool.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
          await pool.end();
        },
      };
    },
    async stop() {
      await adminPool.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DATABASE} WITH (FORCE)`);
      await adminPool.end();
      await container.stop();
    },
  };
}
