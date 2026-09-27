import type pg from 'pg';

import { summarize, timeSequential, type LatencySummary } from './stats';

export interface ProbeTargets {
  /** PgBouncer / transaction-pooled endpoint (port 6432 on PlanetScale). */
  pooled: pg.Pool;
  /** Direct endpoint (port 5432): DDL, the HNSW build and the leak test's two connections. */
  direct: pg.Pool;
}

export interface LeakTestResult {
  /** True when `set_config('app.uid', ..., true)` never crossed from one pooled tx to the next. */
  isolated: boolean;
  clientASawUid: string | null;
  clientBSawUidBeforeSet: string | null;
}

export interface ExtensionCheck {
  name: string;
  installed: boolean;
}

export interface HnswResult {
  rows: number;
  dimensions: number;
  buildMs: number;
  query: LatencySummary;
}

export interface ProbeReport {
  target: string;
  selectOne: LatencySummary;
  singleRowInsertTx: LatencySummary;
  namedTx: LatencySummary;
  leakTest: LeakTestResult;
  extensions: ExtensionCheck[];
  /** Absent when `ProbeOptions.skipHnsw` is set (the build alone can take a very long time). */
  hnsw?: HnswResult;
}

async function ensureSpikeSchema(direct: pg.Pool): Promise<void> {
  await direct.query('create schema if not exists spike');
  await direct.query(`
    create table if not exists spike.spike_probe (
      id uuid primary key default gen_random_uuid(),
      n integer not null,
      at timestamptz not null default now()
    )
  `);
}

async function measureSelectOne(pool: pg.Pool, iterations: number): Promise<LatencySummary> {
  const samples = await timeSequential(iterations, async () => {
    await pool.query('select 1');
  });
  return summarize(samples);
}

async function measureSingleRowInsertTx(
  pool: pg.Pool,
  iterations: number,
): Promise<LatencySummary> {
  const samples = await timeSequential(iterations, async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('insert into spike.spike_probe (n) values ($1)', [1]);
      await client.query('commit');
    } finally {
      client.release();
    }
  });
  return summarize(samples);
}

/** A 10-statement tx using SET LOCAL + set_config, the shape a real command handler runs. */
async function measureNamedTx(pool: pg.Pool, iterations: number): Promise<LatencySummary> {
  const samples = await timeSequential(iterations, async () => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.uid', $1, true)", ['spike-probe-uid']);
      for (let i = 0; i < 8; i += 1) {
        await client.query('select 1');
      }
      await client.query("select current_setting('app.uid', true)");
      await client.query('commit');
    } finally {
      client.release();
    }
  });
  return summarize(samples);
}

/**
 * Opens two separate pooled connections and interleaves their transactions so PgBouncer is
 * likely to hand the same underlying server connection to both in turn. Proves
 * `set_config(..., true)` (transaction-local) never survives into the other client's next
 * transaction on that shared server connection — the property RLS's `withUser()` depends on.
 */
async function runLeakTest(pool: pg.Pool): Promise<LeakTestResult> {
  const clientA = await pool.connect();
  const clientB = await pool.connect();
  try {
    await clientB.query('begin');
    const before = await clientB.query<{ current_setting: string | null }>(
      "select current_setting('app.uid', true) as current_setting",
    );
    await clientB.query('commit');

    await clientA.query('begin');
    await clientA.query("select set_config('app.uid', $1, true)", ['client-a-uid']);
    const seenByA = await clientA.query<{ current_setting: string | null }>(
      "select current_setting('app.uid', true) as current_setting",
    );
    await clientA.query('commit');

    await clientB.query('begin');
    const afterA = await clientB.query<{ current_setting: string | null }>(
      "select current_setting('app.uid', true) as current_setting",
    );
    await clientB.query('commit');

    const clientBSawUidBeforeSet = before.rows[0]?.current_setting ?? null;
    const clientASawUid = seenByA.rows[0]?.current_setting ?? null;
    const leakedIntoB = afterA.rows[0]?.current_setting ?? null;
    return {
      isolated: !leakedIntoB || leakedIntoB.length === 0,
      clientASawUid,
      clientBSawUidBeforeSet,
    };
  } finally {
    clientA.release();
    clientB.release();
  }
}

async function checkExtensions(pool: pg.Pool, names: readonly string[]): Promise<ExtensionCheck[]> {
  const { rows } = await pool.query<{ extname: string }>('select extname from pg_extension');
  const installed = new Set(rows.map((row) => row.extname));
  return names.map((name) => ({ name, installed: installed.has(name) }));
}

const VECTOR_DIMENSIONS = 1024;

function randomVectorLiteral(): string {
  const values = new Array<string>(VECTOR_DIMENSIONS);
  for (let i = 0; i < VECTOR_DIMENSIONS; i += 1) values[i] = (Math.random() * 2 - 1).toFixed(6);
  return `[${values.join(',')}]`;
}

async function insertRandomVectors(pool: pg.Pool, total: number, batchSize: number): Promise<void> {
  for (let inserted = 0; inserted < total; inserted += batchSize) {
    const count = Math.min(batchSize, total - inserted);
    const placeholders: string[] = [];
    const params: string[] = [];
    for (let i = 0; i < count; i += 1) {
      placeholders.push(`($${i + 1}::vector)`);
      params.push(randomVectorLiteral());
    }
    // Batches land in order so an interrupted run reports a clean, reproducible row count.
    await pool.query(
      `insert into spike.spike_vectors (embedding) values ${placeholders.join(',')}`,
      params,
    );
  }
}

async function buildHnswIndex(
  direct: pg.Pool,
  pooled: pg.Pool,
  {
    rows,
    batchSize,
    queryIterations,
  }: { rows: number; batchSize: number; queryIterations: number },
): Promise<HnswResult> {
  await direct.query('create extension if not exists vector');
  await direct.query('drop table if exists spike.spike_vectors');
  await direct.query(
    `create table spike.spike_vectors (id bigserial primary key, embedding vector(${VECTOR_DIMENSIONS}))`,
  );

  await insertRandomVectors(pooled, rows, batchSize);

  const startedAt = performance.now();
  await direct.query(
    'create index spike_vectors_hnsw_idx on spike.spike_vectors using hnsw (embedding vector_cosine_ops)',
  );
  const buildMs = performance.now() - startedAt;

  const querySamples = await timeSequential(queryIterations, async () => {
    const probe = randomVectorLiteral();
    await pooled.query(
      'select id from spike.spike_vectors order by embedding <=> $1::vector limit 10',
      [probe],
    );
  });

  return { rows, dimensions: VECTOR_DIMENSIONS, buildMs, query: summarize(querySamples) };
}

export interface ProbeOptions {
  target: string;
  latencyIterations: number;
  hnswRows: number;
  hnswBatchSize: number;
  hnswQueryIterations: number;
  /** Skips the HNSW build/query (its own report can take far longer than everything else combined). */
  skipHnsw?: boolean;
}

export async function runProbe(
  targets: ProbeTargets,
  options: ProbeOptions,
  onProgress: (step: string) => void = () => undefined,
): Promise<ProbeReport> {
  await ensureSpikeSchema(targets.direct);

  onProgress('selectOne');
  const selectOne = await measureSelectOne(targets.pooled, options.latencyIterations);
  onProgress('singleRowInsertTx');
  const singleRowInsertTx = await measureSingleRowInsertTx(
    targets.pooled,
    options.latencyIterations,
  );
  onProgress('namedTx');
  const namedTx = await measureNamedTx(targets.pooled, options.latencyIterations);
  onProgress('leakTest');
  const leakTest = await runLeakTest(targets.pooled);
  onProgress('extensions');
  const extensions = await checkExtensions(targets.direct, ['vector', 'pg_trgm', 'unaccent']);

  const report: ProbeReport = {
    target: options.target,
    selectOne,
    singleRowInsertTx,
    namedTx,
    leakTest,
    extensions,
  };
  if (options.skipHnsw) return report;

  onProgress('hnsw');
  report.hnsw = await buildHnswIndex(targets.direct, targets.pooled, {
    rows: options.hnswRows,
    batchSize: options.hnswBatchSize,
    queryIterations: options.hnswQueryIterations,
  });
  return report;
}
