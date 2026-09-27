/**
 * `ops.backup` (docs/api-contracts-async.md §2.3, daily 20:00 UTC; docs/system-architecture.md §10):
 * an off-provider logical backup. `pg_dump -Fc` streams straight into a multipart upload on R2 under
 * a date key (`<prefix>YYYY-MM-DD.dump`, so a rerun the same day replaces that day's dump), and only
 * the newest 35 daily dumps are kept. Missing configuration fails the job, which dead-letters and
 * alerts: a backup is never skipped silently.
 *
 * The dump connects with its own URL: pg_dump refuses tables whose row security would hide rows,
 * so the role needs BYPASSRLS (or superuser) and read access to every schema.
 */
import { spawn } from 'node:child_process';

import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';
import type { ObjectStore } from './object-store';

export const BACKUP_KEEP_DAILY = 35;
export const DEFAULT_BACKUP_PREFIX = 'postgres/';

const DUMP_KEY = /^\d{4}-\d{2}-\d{2}\.dump$/;

export interface BackupOptions {
  readonly databaseUrl: string;
  readonly store: ObjectStore;
  readonly logger: JobLogger;
  /** Argv that runs pg_dump (default `['pg_dump']`); `-Fc` and connection env are added. */
  readonly pgDump?: readonly string[];
  readonly prefix?: string;
  readonly keep?: number;
  readonly now?: Date;
  readonly signal?: AbortSignal;
}

export interface BackupResult {
  readonly key: string;
  readonly bytes: number;
  readonly pruned: readonly string[];
}

/** libpq environment for a `postgres://` URL, so no credential ever appears in argv. */
export function libpqEnv(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  const env: Record<string, string> = {
    PGHOST: url.hostname,
    PGPORT: url.port === '' ? '5432' : url.port,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode !== null) env.PGSSLMODE = sslmode;
  return env;
}

/** Streams `pg_dump -Fc` output; the iterator throws if pg_dump exits non-zero. */
async function* dumpStream(
  argv: readonly string[],
  databaseUrl: string,
  signal: AbortSignal | undefined,
): AsyncGenerator<Uint8Array> {
  const [command, ...prefix] = argv;
  if (command === undefined) throw new Error('empty pg_dump command');
  const child = spawn(command, [...prefix, '-Fc', '--no-password'], {
    env: { ...process.env, ...libpqEnv(databaseUrl) },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(signal === undefined ? {} : { signal }),
  });
  const stderr: string[] = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => stderr.push(chunk));
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  exited.catch(() => undefined);
  try {
    for await (const chunk of child.stdout) yield chunk as Uint8Array;
  } finally {
    if (child.exitCode === null) child.kill();
  }
  const code = await exited;
  if (code !== 0) {
    throw new Error(`pg_dump exited with ${String(code)}: ${stderr.join('').trim().slice(-500)}`);
  }
}

function dateKey(now: Date): string {
  return `${now.toISOString().slice(0, 10)}.dump`;
}

/** Dumps, uploads, then prunes dumps beyond the newest `keep`. */
export async function runBackup(options: BackupOptions): Promise<BackupResult> {
  const prefix = options.prefix ?? DEFAULT_BACKUP_PREFIX;
  const keep = options.keep ?? BACKUP_KEEP_DAILY;
  const key = `${prefix}${dateKey(options.now ?? new Date())}`;
  const bytes = await options.store.putStream(
    key,
    dumpStream(options.pgDump ?? ['pg_dump'], options.databaseUrl, options.signal),
  );
  options.logger.info({ key, bytes }, 'database backup uploaded');

  const dumps = (await options.store.list(prefix))
    .filter((candidate) => DUMP_KEY.test(candidate.slice(prefix.length)))
    .sort()
    .reverse();
  const pruned = dumps.slice(keep);
  for (const old of pruned) await options.store.delete(old);
  return { key, bytes, pruned };
}

export interface BackupJobConfig {
  readonly databaseUrl: string | undefined;
  readonly store: ObjectStore | undefined;
  readonly pgDump?: readonly string[];
  readonly prefix?: string;
}

export function backupJob(config: BackupJobConfig): AnyJobDefinition {
  return defineJob({
    queue: 'ops.backup',
    schema: z.object({}).nullish(),
    async handler(_data, { logger, job }) {
      if (config.databaseUrl === undefined || config.store === undefined) {
        throw new Error(
          'backup is not configured: BACKUP_DATABASE_URL and the BACKUP_S3_* variables are required',
        );
      }
      const result = await runBackup({
        databaseUrl: config.databaseUrl,
        store: config.store,
        logger,
        signal: job.signal,
        ...(config.pgDump === undefined ? {} : { pgDump: config.pgDump }),
        ...(config.prefix === undefined ? {} : { prefix: config.prefix }),
      });
      return { key: result.key, bytes: result.bytes, pruned: result.pruned.length };
    },
  });
}
