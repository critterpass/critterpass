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
  if (sql.split('\n', 1)[0]?.trim() === NO_TRANSACTION_MARKER) {
    await applyWithoutTransaction(client, sql, filename);
    return;
  }
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

/** First line of a migration that must run outside a transaction (`CREATE INDEX CONCURRENTLY`). */
const NO_TRANSACTION_MARKER = '-- migrate:no-transaction';
const CONCURRENT_INDEX =
  /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+(\w+)\s/iu;

/**
 * Splits a no-transaction migration into its statements: full-line `--` comments are dropped and a
 * statement ends with a `;` at the end of a line. Dollar-quoted bodies are refused rather than
 * split wrongly; they belong in an ordinary (transactional) migration.
 */
export function splitMigrationStatements(sql: string): string[] {
  if (sql.includes('$$')) {
    throw new Error('a no-transaction migration cannot contain dollar-quoted bodies');
  }
  const body = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  return body
    .split(/;[ \t]*(?:\n|$)/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

/**
 * A failed `CREATE INDEX CONCURRENTLY` leaves an INVALID index behind, which `IF NOT EXISTS` would
 * then skip: drop it (concurrently, so writes carry on) so the retry builds it again.
 */
async function dropInvalidIndex(client: pg.PoolClient, statement: string): Promise<void> {
  const name = CONCURRENT_INDEX.exec(statement)?.[1];
  if (name === undefined) return;
  const { rowCount } = await client.query(
    `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1 AND NOT i.indisvalid`,
    [name],
  );
  if ((rowCount ?? 0) > 0) {
    await client.query(`DROP INDEX CONCURRENTLY IF EXISTS public.${client.escapeIdentifier(name)}`);
  }
}

/**
 * Runs each statement on its own (autocommit) and records the file only once all of them succeed,
 * so a failed run is retried from the top: every statement must be idempotent (`IF NOT EXISTS`).
 */
async function applyWithoutTransaction(client: pg.PoolClient, sql: string, filename: string) {
  // Session-level here (no transaction to scope `SET LOCAL`); reset before the client goes back.
  await client.query('SET search_path TO public');
  try {
    for (const statement of splitMigrationStatements(sql)) {
      await dropInvalidIndex(client, statement);
      await client.query(statement);
    }
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1)`, [filename]);
  } catch (error) {
    throw new Error(`migration "${filename}" failed: ${String(error)}`, { cause: error });
  } finally {
    await client.query('RESET search_path').catch(() => undefined);
  }
}

/**
 * Applies every `packages/db/migrations/*.sql` file not yet recorded in `_migrations`, one
 * transaction per file (or, for a file starting with `-- migrate:no-transaction`, one autocommit
 * statement at a time), in filename order. Re-running is a no-op once every file is recorded:
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
