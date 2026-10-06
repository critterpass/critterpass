/**
 * Restore drill (monthly, docs/runbooks/restore.md): downloads the newest nightly `pg_dump` from R2,
 * restores it into a scratch Postgres 18 and, with `--verify`, compares it with the live source:
 * the same tables, the same applied migrations, and row counts that only differ by what was written
 * since the dump. Prints the recovery time (download + restore) against the 2 h RTO.
 *
 *   BACKUP_S3_ENDPOINT=… BACKUP_S3_BUCKET=… BACKUP_S3_ACCESS_KEY_ID=… BACKUP_S3_SECRET_ACCESS_KEY=… \
 *   RESTORE_TARGET_URL=postgres://…/scratch SOURCE_DATABASE_URL=postgres://… \
 *   pnpm tsx tools/scripts/drills/restore.ts --verify [--key postgres/2026-10-05.dump] [--workdir dir]
 *
 * The target must be an empty scratch database on the same image as production (PostGIS and the
 * other extensions; `infra/docker/postgres`): the script refuses one that already has tables.
 * SOURCE_DATABASE_URL is read only (a BYPASSRLS role, like the backup job's, so counts are whole).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { downloadObject, listObjects, s3ConfigFromEnv, type S3Object } from './s3';

export const RTO_SECONDS = 2 * 60 * 60;
const DUMP_KEY = /\d{4}-\d{2}-\d{2}\.dump$/u;

export interface TableCount {
  readonly table: string;
  readonly rows: number;
}

export interface Comparison {
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly emptied: readonly string[];
  readonly drift: readonly { table: string; source: number; restored: number }[];
}

/** The newest daily dump (keys sort by date). */
export function newestDump(objects: readonly S3Object[]): S3Object | undefined {
  return [...objects]
    .filter((o) => DUMP_KEY.test(o.key))
    .sort((a, b) => (a.key < b.key ? 1 : -1))[0];
}

/**
 * Tables must match one to one. A table the source has rows in must not come back empty. Counts
 * may drift by what was written or purged since the dump: anything beyond 5 % (and 100 rows) is
 * reported for a look, not failed, because the source keeps moving.
 */
export function compareCounts(
  source: readonly TableCount[],
  restored: readonly TableCount[],
): Comparison {
  const restoredBy = new Map(restored.map((t) => [t.table, t.rows]));
  const sourceNames = new Set(source.map((t) => t.table));
  const missing: string[] = [];
  const emptied: string[] = [];
  const drift: { table: string; source: number; restored: number }[] = [];
  for (const { table, rows } of source) {
    const back = restoredBy.get(table);
    if (back === undefined) missing.push(table);
    else if (rows > 0 && back === 0) emptied.push(table);
    else if (Math.abs(rows - back) > Math.max(100, rows * 0.05)) {
      drift.push({ table, source: rows, restored: back });
    }
  }
  const extra = restored.map((t) => t.table).filter((t) => !sourceNames.has(t));
  return { missing, extra, emptied, drift };
}

export function comparisonFailed(comparison: Comparison): boolean {
  return comparison.missing.length > 0 || comparison.emptied.length > 0;
}

const USER_TABLES = `
  SELECT n.nspname || '.' || c.relname AS table
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'topology', 'tiger')
    AND n.nspname NOT LIKE 'pg_temp%'
  ORDER BY 1`;

async function countTables(client: pg.Client): Promise<TableCount[]> {
  const { rows } = await client.query<{ table: string }>(USER_TABLES);
  const counts: TableCount[] = [];
  for (const { table } of rows) {
    const [schema, name] = table.split('.') as [string, string];
    const ident = `${client.escapeIdentifier(schema)}.${client.escapeIdentifier(name)}`;
    const result = await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${ident}`);
    counts.push({ table, rows: Number(result.rows[0]?.n ?? 0) });
  }
  return counts;
}

async function migrations(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    'SELECT filename AS name FROM public._migrations ORDER BY 1',
  );
  return rows.map((r) => r.name);
}

/** Roles the dump's policies and grants name; created NOLOGIN on the scratch cluster. */
async function copyRoles(source: pg.Client, target: pg.Client): Promise<void> {
  const { rows } = await source.query<{ rolname: string }>(
    "SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' AND NOT rolsuper ORDER BY 1",
  );
  for (const { rolname } of rows) {
    await target.query(
      `DO $$ BEGIN CREATE ROLE ${target.escapeIdentifier(rolname)} NOLOGIN;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
  }
}

function run(command: string, args: readonly string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      verify: { type: 'boolean', default: false },
      key: { type: 'string' },
      prefix: { type: 'string', default: 'postgres/' },
      workdir: { type: 'string' },
      jobs: { type: 'string', default: '4' },
    },
  });
  const s3 = s3ConfigFromEnv(process.env);
  const target = new pg.Client({ connectionString: required('RESTORE_TARGET_URL') });
  const source = values.verify
    ? new pg.Client({ connectionString: required('SOURCE_DATABASE_URL') })
    : undefined;
  await target.connect();
  await source?.connect();
  const workdir = values.workdir ?? mkdtempSync(join(tmpdir(), 'cp-restore-'));
  try {
    const existing = await target.query(USER_TABLES);
    if (existing.rowCount !== 0) throw new Error('the restore target is not empty');

    const objects = await listObjects(s3, values.prefix);
    const dump = values.key ? objects.find((o) => o.key === values.key) : newestDump(objects);
    if (!dump) throw new Error(`no dump under ${values.prefix}`);
    console.log(`dump ${dump.key}: ${(dump.size / 1e6).toFixed(1)} MB (${objects.length} kept)`);

    const started = Date.now();
    const file = join(workdir, 'restore.dump');
    await downloadObject(s3, dump.key, file);
    const downloaded = Date.now();
    if (source) await copyRoles(source, target);
    const restore = await run('pg_restore', [
      '--no-owner',
      '--no-privileges',
      `--jobs=${values.jobs}`,
      `--dbname=${required('RESTORE_TARGET_URL')}`,
      file,
    ]);
    const restored = Date.now();
    const errors = restore.stderr.split('\n').filter((line) => line.includes('error:'));
    const seconds = (restored - started) / 1000;
    console.log(
      `download ${((downloaded - started) / 1000).toFixed(0)} s, restore ${((restored - downloaded) / 1000).toFixed(0)} s, ` +
        `total ${seconds.toFixed(0)} s (RTO ${RTO_SECONDS} s); pg_restore errors: ${errors.length}`,
    );
    for (const line of errors.slice(0, 20)) console.log(`  ${line}`);

    let failed = restore.code !== 0 || errors.length > 0;
    if (seconds > RTO_SECONDS) failed = true;
    if (source) {
      const sourceMigrations = await migrations(source);
      const restoredMigrations = await migrations(target);
      const notRestored = sourceMigrations.filter((m) => !restoredMigrations.includes(m));
      console.log(
        `migrations: ${restoredMigrations.length} restored, ${notRestored.length} applied since the dump`,
      );
      const comparison = compareCounts(await countTables(source), await countTables(target));
      console.log(JSON.stringify(comparison, null, 2));
      if (comparisonFailed(comparison)) failed = true;
    }
    console.log(failed ? 'restore drill FAILED' : 'restore drill passed');
    process.exitCode = failed ? 1 : 0;
  } finally {
    await target.end();
    await source?.end();
    if (!values.workdir) rmSync(workdir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
