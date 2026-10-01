/**
 * `ops.backup` restore round trip: pg_dump (the test Postgres image's own binary, run through
 * `docker exec` so client and server majors always match) streams into a multipart upload on an
 * S3-compatible store (RustFS standing in for R2), the object is downloaded and restored with
 * pg_restore into a fresh database, and every table's row count matches the source. Retention keeps
 * the newest 35 daily dumps.
 */
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

import { AwsClient } from 'aws4fetch';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createObjectStore, type ObjectStore } from '../src/jobs/ops/object-store';
import { libpqEnv, runBackup } from '../src/jobs/ops/backup';
import { silent, startJobsHarness, type JobsHarness } from './helpers/jobs-harness';

const S3_IMAGE = 'rustfs/rustfs:1.0.0';
const ACCESS_KEY = 'backup-test-access';
const SECRET_KEY = 'backup-test-secret-key-0123456789';
const BUCKET = 'cp-backups';
/** How pg_dump inside the Postgres container reaches its own server. */
const IN_CONTAINER_URL = 'postgres://app_owner:app_owner@localhost:5432/critterpass';

let harness: JobsHarness;
let s3: StartedTestContainer;
let store: ObjectStore;

beforeAll(async () => {
  [harness, s3] = await Promise.all([
    startJobsHarness(),
    new GenericContainer(S3_IMAGE)
      .withEnvironment({ RUSTFS_ACCESS_KEY: ACCESS_KEY, RUSTFS_SECRET_KEY: SECRET_KEY })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
      .start(),
  ]);
  const endpoint = `http://${s3.getHost()}:${s3.getMappedPort(9000)}`;
  const admin = new AwsClient({
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    service: 's3',
    region: 'auto',
  });
  const created = await admin.fetch(`${endpoint}/${BUCKET}`, { method: 'PUT' });
  if (!created.ok) throw new Error(`bucket create failed: ${created.status}`);
  // Small parts so the dump really spans several multipart parts.
  store = createObjectStore(
    { endpoint, bucket: BUCKET, accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    5 * 1024 * 1024,
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
  await s3?.stop();
});

function textBody(text: string): AsyncIterable<Uint8Array> {
  return Readable.from([new TextEncoder().encode(text)]);
}

/** `docker exec` into the Postgres container, forwarding the libpq variables pg_dump reads. */
function inContainer(binary: string): string[] {
  const forwarded = Object.keys(libpqEnv(IN_CONTAINER_URL)).flatMap((name) => ['-e', name]);
  return ['docker', 'exec', '-i', ...forwarded, harness.postgres.getId(), binary];
}

function restore(dump: Uint8Array, database: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const [command = 'docker', ...args] = inContainer('pg_restore');
    const child = spawn(command, [...args, '--exit-on-error', '--dbname', database], {
      env: { ...process.env, ...libpqEnv(IN_CONTAINER_URL) },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`pg_restore exited ${code}: ${stderr}`)),
    );
    child.stdin.end(dump);
  });
}

async function rowCounts(database: string): Promise<Record<string, number>> {
  const url = new URL(harness.postgres.getConnectionUri());
  url.pathname = `/${database}`;
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows: tables } = await client.query<{ name: string }>(
      `SELECT format('%I.%I', table_schema, table_name) AS name FROM information_schema.tables
       WHERE table_type = 'BASE TABLE' AND table_schema IN ('public', 'auth', 'ops', 'pgboss')
       ORDER BY 1`,
    );
    const counts: Record<string, number> = {};
    for (const { name } of tables) {
      const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${name}`);
      counts[name] = rows[0]?.n ?? -1;
    }
    return counts;
  } finally {
    await client.end();
  }
}

describe('ops.backup', () => {
  it('restores a streamed dump with every row count intact and keeps 35 daily dumps', async () => {
    const pool = harness.pool;
    await pool.query(
      `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
       SELECT 'EUR', q, 1.5, DATE '2026-01-01' + i, 'test'
       FROM unnest(ARRAY['USD', 'VND', 'SGD']) AS q, generate_series(0, 999) AS i`,
    );
    // Incompressible payloads so the dump exceeds one 5 MiB part.
    await pool.query(
      `INSERT INTO rt_outbox (channel, payload, idem_key, kind)
       SELECT 'user:#' || gen_random_uuid(),
              jsonb_build_object('blob', (SELECT string_agg(md5(random()::text || g.i || s.j), '') FROM generate_series(1, 96) AS s(j))),
              gen_random_uuid(), 'publish'
       FROM generate_series(1, 6000) AS g(i)`,
    );
    for (let day = 0; day < 36; day += 1) {
      const date = new Date(Date.UTC(2026, 7, 1 + day)).toISOString().slice(0, 10);
      await store.putStream(`postgres/${date}.dump`, textBody('old dump'));
    }
    await store.putStream('postgres/notes.txt', textBody('not a dump'));

    const result = await runBackup({
      databaseUrl: IN_CONTAINER_URL,
      store,
      logger: silent,
      pgDump: inContainer('pg_dump'),
      now: new Date('2026-09-27T20:00:00Z'),
    });
    expect(result.key).toBe('postgres/2026-09-27.dump');
    expect(result.bytes).toBeGreaterThan(5 * 1024 * 1024);

    const kept = await store.list('postgres/');
    const dumps = kept.filter((key) => key.endsWith('.dump'));
    expect(dumps).toHaveLength(35);
    expect(dumps).toContain('postgres/2026-09-27.dump');
    expect(dumps).not.toContain('postgres/2026-08-01.dump');
    expect(dumps).not.toContain('postgres/2026-08-02.dump');
    expect(kept).toContain('postgres/notes.txt');
    expect(result.pruned).toEqual(['postgres/2026-08-02.dump', 'postgres/2026-08-01.dump']);

    const dump = await store.get(result.key);
    expect(dump.byteLength).toBe(result.bytes);
    await pool.query('CREATE DATABASE restored');
    await restore(dump, 'restored');

    const [source, restored] = await Promise.all([rowCounts('critterpass'), rowCounts('restored')]);
    expect(source['public.fx_snapshots']).toBe(3000);
    expect(source['public.rt_outbox']).toBe(6000);
    expect(restored).toEqual(source);
  }, 240_000);

  it('fails, and leaves no object behind, when pg_dump fails', async () => {
    await expect(
      runBackup({
        databaseUrl: 'postgres://app_owner:app_owner@localhost:5432/no_such_database',
        store,
        logger: silent,
        pgDump: inContainer('pg_dump'),
        prefix: 'failing/',
      }),
    ).rejects.toThrow(/pg_dump exited/);
    expect(await store.list('failing/')).toEqual([]);
  });
});
