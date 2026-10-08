/**
 * Test-only Postgres lifecycle: a migrated template database, then a fast
 * `CREATE DATABASE ... TEMPLATE` clone per test, so every test gets full isolation without
 * re-running the whole migration suite each time. In a run with a shared server
 * (./shared-postgres-global-setup) the template is the run's, migrated once for every file;
 * otherwise the file starts its own container (./containers.ts) and migrates its own template.
 */
import pg from 'pg';

import { startPostgres } from './containers';
import { migrateTestDatabase } from './migrate';
import { sharedPostgres, uniqueDatabaseName, withDatabase } from './shared-server';

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
  /** Releases the server (stopping the file's own container, if it has one); call once per file (afterAll). */
  stop(): Promise<void>;
}

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

interface TemplateServer {
  /** Superuser URL of a database that is not the template. */
  readonly adminUrl: string;
  readonly template: string;
  stop(): Promise<void>;
}

/** One container for the calling test file, with a template database migrated once. */
async function startOwnTemplateServer(): Promise<TemplateServer> {
  const container = await startPostgres({ ownContainer: true });
  const adminUrl = container.getConnectionUri();
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${TEMPLATE_DATABASE}`);
  } finally {
    await admin.end();
  }
  const templatePool = silenceIdleClientErrors(
    new pg.Pool({ connectionString: withDatabase(adminUrl, TEMPLATE_DATABASE), max: 1 }),
  );
  await migrateTestDatabase(templatePool);
  // Postgres refuses `CREATE DATABASE ... TEMPLATE x` while any session is connected to x.
  await templatePool.end();
  return {
    adminUrl,
    template: TEMPLATE_DATABASE,
    async stop() {
      await container.stop();
    },
  };
}

/**
 * The server and migrated template the calling test file clones from: the run's shared ones when
 * there are any, otherwise a container of the file's own. Vitest's per-file module isolation gives
 * each test file its own copy of the state here, so nothing is shared between files but the
 * template.
 */
export async function startDbTestContainer(): Promise<DbTestContainer> {
  const shared = sharedPostgres();
  const server: TemplateServer =
    shared === undefined
      ? await startOwnTemplateServer()
      : { adminUrl: shared.adminUrl, template: shared.template, stop: () => Promise.resolve() };
  const adminPool = silenceIdleClientErrors(
    new pg.Pool({ connectionString: server.adminUrl, max: 5 }),
  );

  // Clones a test has not dropped yet. On a container of the file's own they went away with the
  // container; on the run's shared server they would pile up until the run ends.
  const open = new Set<string>();
  const dropDatabase = async (name: string): Promise<void> => {
    await adminPool.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    open.delete(name);
  };

  return {
    async createDatabase() {
      const name = uniqueDatabaseName();
      await adminPool.query(`CREATE DATABASE ${name} TEMPLATE ${server.template}`);
      open.add(name);
      const pool = silenceIdleClientErrors(
        new pg.Pool({ connectionString: withDatabase(server.adminUrl, name), max: 5 }),
      );
      return {
        name,
        pool,
        async drop() {
          // Force-drop while `pool` is still open: any client it still has idle is then
          // terminated by Postgres while pg.Pool's own idle-client error handling is listening,
          // which evicts it cleanly. Ending the pool first and force-dropping after races the
          // client's own socket teardown against Postgres independently killing the same backend.
          await dropDatabase(name);
          await pool.end();
        },
      };
    },
    async stop() {
      if (shared !== undefined) {
        for (const name of [...open]) await dropDatabase(name).catch(() => undefined);
      }
      await adminPool.end();
      await server.stop();
    },
  };
}
