import { mkdtempSync } from 'node:fs';
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
