import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { createPool, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerKind } from '../src/kinds/registry';
import { runPipeline } from '../src/pipeline';
import { replayFetch } from './fixture-fetch';
import { quizKind } from './quiz-kind';

registerKind(quizKind());

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  container = await startPostgres();
  pool = createPool(container.getConnectionUri());
  await runMigrations(pool);
}, 240_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});

describe('review stage with a database', () => {
  it('queues the batch with a review row per item, bills an agent job and replaces it on re-run', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'factory-db-'));
    const replay = replayFetch(['deepseek-quiz-mornings']);
    const gateway = createGateway({ apiKey: 'test-key', fetch: replay.fetch, maxAttempts: 1 });
    const run = () =>
      runPipeline({
        kind: 'taste_quiz',
        batchKey: ['review', 'stage', 'fixture'].join('-'),
        stages: ['brief', 'generate', 'validate', 'review'],
        pool,
        gateway,
        root,
      });
    const first = await run();
    expect(first.queued?.version).toBe(1);
    await run();
    const releases = await pool.query<{
      status: string;
      stage: string;
      gate: string;
      job: string | null;
    }>('SELECT status, stage, gate, agent_job_id AS job FROM content_releases');
    expect(releases.rows).toHaveLength(1);
    expect(releases.rows[0]).toMatchObject({
      status: 'review',
      stage: 'review',
      gate: 'owner_approval',
    });
    expect(releases.rows[0]?.job).toMatch(/^[0-9a-f-]{36}$/u);
    const reviews = await pool.query<{ item_ref: string; severity: string; verdict: string }>(
      'SELECT item_ref, severity, verdict FROM ops.content_reviews',
    );
    expect(reviews.rows).toEqual([{ item_ref: 'mornings', severity: 'pass', verdict: 'pending' }]);
  });
});

describe('review from a clean checkout', () => {
  it('queues a committed batch from its artifact alone, without the model or work files', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'factory-artifact-'));
    const batchKey = ['artifact', 'only', 'check'].join('-');
    const replay = replayFetch(['deepseek-quiz-mornings']);
    await runPipeline({
      kind: 'taste_quiz',
      batchKey,
      stages: ['brief', 'generate', 'validate', 'review'],
      pool: null,
      gateway: createGateway({ apiKey: 'test-key', fetch: replay.fetch, maxAttempts: 1 }),
      root,
    });
    const artifactFile = path.join(root, 'batches', 'taste_quiz', `${batchKey}.json`);
    const before = readFileSync(artifactFile, 'utf8');
    rmSync(path.join(root, 'work'), { recursive: true, force: true });

    const queued = await runPipeline({
      kind: 'taste_quiz',
      batchKey,
      stages: ['review'],
      pool,
      gateway: null,
      root,
    });
    expect(queued.queued?.status).toBe('review');
    expect(readFileSync(artifactFile, 'utf8')).toBe(before);
    const { rows } = await pool.query<{ artifact: { items: unknown[] } }>(
      'SELECT artifact FROM content_releases WHERE batch_key = $1',
      [batchKey],
    );
    expect(rows[0]?.artifact.items).toEqual((JSON.parse(before) as { items: unknown[] }).items);
    const reviews = await pool.query(
      `SELECT r.item_ref FROM ops.content_reviews r JOIN content_releases c ON c.id = r.release_id
       WHERE c.batch_key = $1`,
      [batchKey],
    );
    expect(reviews.rowCount).toBe(1);
  });
});
