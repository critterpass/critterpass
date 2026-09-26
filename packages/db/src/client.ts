/**
 * Postgres connection pool and the forward-only SQL migration runner shared by every service and
 * by Testcontainers-backed tests. Roles, schemas and every table live in packages/db/migrations;
 * this module only knows how to connect and how to apply them, in order, exactly once each.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const DEFAULT_MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../migrations');
const MIGRATIONS_TABLE = 'public._migrations';

export interface CreatePoolOptions {
  readonly connectionString: string;
  /** Defaults to 10; keep low for services (per-replica) and lower still for tests. */
  readonly max?: number;
}

/** A pooled connection; the pool itself carries no session state (every helper uses `SET LOCAL`). */
export function createPool(options: CreatePoolOptions | string): pg.Pool {
  const resolved = typeof options === 'string' ? { connectionString: options } : options;
  return new pg.Pool({ connectionString: resolved.connectionString, max: resolved.max ?? 10 });
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

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'] ?? process.env['DATABASE_DIRECT_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_DIRECT_URL is required to run migrations');
  }
  const pool = createPool(connectionString);
  try {
    const { applied } = await runMigrations(pool);
    console.log(applied.length > 0 ? `applied: ${applied.join(', ')}` : 'no pending migrations');
  } finally {
    await pool.end();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
