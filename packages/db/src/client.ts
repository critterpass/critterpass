/**
 * Postgres connection pool and the forward-only SQL migration runner shared by every service and
 * by Testcontainers-backed tests. Roles, schemas and every table live in packages/db/migrations;
 * this module only knows how to connect and how to apply them, in order, exactly once each.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import pg from 'pg';

const DEFAULT_MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../migrations');
const MIGRATIONS_TABLE = 'public._migrations';

export interface CreatePoolOptions {
  readonly connectionString: string;
  /** Defaults to 10; keep low for services (per-replica) and lower still for tests. */
  readonly max?: number;
  /** Receives connection errors (e.g. a database restart), idle or checked out; defaults to a process warning. */
  readonly onIdleError?: (error: Error) => void;
}

/**
 * Keeps a pool's connection errors from crashing the process. pg re-emits a socket error (a TLS
 * `read ETIMEDOUT`, a failover reset) as an `error` event on the client even while a query is in
 * flight, and pg-pool listens only while the client sits idle; a checked-out client whose socket
 * dies with nobody listening throws an uncaught exception. So every client gets its own listener
 * for its whole life, and the pool's idle-client event, which repeats the same error, is absorbed.
 * The failed client is not queryable any more: its query rejects, and the pool discards it on
 * release and opens a fresh connection for the next caller.
 *
 * `onError` receives the error only (pg errors carry no connection string or password).
 */
export function watchPoolErrors(pool: pg.Pool, onError: (error: Error) => void): pg.Pool {
  pool.on('connect', (client) => {
    client.on('error', onError);
  });
  pool.on('error', () => undefined);
  return pool;
}

/** A pooled connection; the pool itself carries no session state (every helper uses `SET LOCAL`). */
export function createPool(options: CreatePoolOptions | string): pg.Pool {
  const resolved: CreatePoolOptions =
    typeof options === 'string' ? { connectionString: options } : options;
  const pool = new pg.Pool({
    connectionString: resolved.connectionString,
    max: resolved.max ?? 10,
  });
  return watchPoolErrors(
    pool,
    resolved.onIdleError ??
      ((error) => process.emitWarning(`database client error: ${error.message}`)),
  );
}

export interface RunMigrationsOptions {
  /** Defaults to packages/db/migrations; overridable so a bundled service can locate copied SQL. */
  readonly migrationsDir?: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  // Real UTC timestamps in the filename (docs/code-standards.md §13) sort in application order.
  return entries.filter((entry) => entry.endsWith('.sql')).sort();
}

async function isApplied(client: pg.PoolClient, filename: string): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE filename = $1`, [
    filename,
  ]);
  return (result.rowCount ?? 0) > 0;
}

async function applyMigration(client: pg.PoolClient, migrationsDir: string, filename: string) {
  const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
  await client.query('BEGIN');
  try {
    // A pooled connection (PgBouncer transaction mode) can carry a session-level search_path set by
    // another client; pin it so unqualified DDL and CREATE EXTENSION always land in `public`.
    await client.query('SET LOCAL search_path TO public');
    await client.query(sql);
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1)`, [filename]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new Error(`migration "${filename}" failed: ${String(error)}`, { cause: error });
  }
}

/**
 * Applies every `packages/db/migrations/*.sql` file not yet recorded in `_migrations`, one
 * transaction per file, in filename order. Re-running is a no-op once every file is recorded:
 * that is what "idempotent" means for this runner, not that every individual statement inside a
 * migration is idempotent (some intentionally are, e.g. the guarded publication DO block).
 */
export async function runMigrations(
  pool: pg.Pool,
  options: RunMigrationsOptions = {},
): Promise<MigrationResult> {
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await ensureMigrationsTable(client);
    const files = await listMigrationFiles(migrationsDir);
    for (const filename of files) {
      if (await isApplied(client, filename)) continue;
      await applyMigration(client, migrationsDir, filename);
      applied.push(filename);
    }
  } finally {
    client.release();
  }
  return { applied };
}
