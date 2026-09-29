/**
 * A redraft that finally fails gives everything back: its reservation is released (the trip's
 * redraft count goes back down), the trip returns to review, and the drafting screen hears it
 * failed. The model call fails at the network boundary with a recorded overloaded status.
 */
import { createGateway, startAgentJob, type DraftModel } from '@cp/ai';
import { fixtureTransport } from '@cp/ai/testing';
import { sendInTx, withSystem } from '@cp/db';
import { DRAFT_QUEUES, DRAFT_STEP_IDS, REDRAFT_STEP_IDS } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { draftJob } from '../../../src/jobs/ai/draft';
import { redraftJob } from '../../../src/jobs/ai/redraft';
import { startJobsHarness, until, type JobsHarness } from '../../helpers/jobs-harness';
import { replay, seedTrip } from './draft/kyoto-trip';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness.close();
});

const overloaded: DraftModel = {
  call: (route, input) =>
    createGateway({
      apiKey: 'fixture-key',
      maxAttempts: 1,
      fetch: fixtureTransport(['anthropic/overloaded-529', 'anthropic/overloaded-529']).fetch,
    }).callModel(route, input),
};

async function jobStatus(id: string): Promise<string | undefined> {
  const { rows } = await harness.pool.query<{ status: string }>(
    'SELECT status FROM agent_jobs WHERE id = $1',
    [id],
  );
  return rows[0]?.status;
}

describe('ai.redraft', () => {
  it(
    'releases the reservation and the quota unit when the redraft finally fails',
    { timeout: 200_000 },
    async () => {
      const { tripId, organiser } = await seedTrip(harness.pool);
      await harness.startRuntime([
        draftJob({ model: () => replay }),
        redraftJob({ model: () => overloaded }),
      ]);
      const draft = await withSystem(harness.pool, (tx) =>
        startAgentJob(tx, (queue, data, options) => sendInTx(tx, queue, data, options), {
          kind: 'draft',
          queue: DRAFT_QUEUES.draft,
          userId: organiser,
          tripId,
          input: { trip_id: tripId, draft_seq: 1 },
          stepIds: DRAFT_STEP_IDS,
        }),
      );
      await until(async () => (await jobStatus(draft.id)) === 'succeeded', 60_000);
      const { rows } = await harness.pool.query<{ draft_version_id: string }>(
        'SELECT draft_version_id FROM trips WHERE id = $1',
        [tripId],
      );
      const base = rows[0]?.draft_version_id as string;

      // What request_redraft commits: one quota unit, the job, its reservation, the trip redrafting.
      await harness.pool.query(
        "SELECT app.consume_quota('trip', $1, 'redrafts', 'lifetime', 3, '9999-12-31T23:59:59Z')",
        [tripId],
      );
      const redraft = await withSystem(harness.pool, async (tx) => {
        const job = await startAgentJob(
          tx,
          (queue, data, options) => sendInTx(tx, queue, data, options),
          {
            kind: 'redraft',
            queue: DRAFT_QUEUES.redraft,
            userId: organiser,
            tripId,
            baseVersionId: base,
            input: {
              trip_id: tripId,
              day: 2,
              reasons: ['slower'],
              note: null,
              base_version: base,
              seq: 1,
            },
            stepIds: REDRAFT_STEP_IDS,
          },
        );
        await tx.query(
          "INSERT INTO redraft_reservations (trip_id, agent_job_id, quota_period_key) VALUES ($1, $2, 'lifetime')",
          [tripId, job.id],
        );
        await tx.query("UPDATE trips SET status = 'redrafting' WHERE id = $1", [tripId]);
        return job;
      });

      await until(async () => (await jobStatus(redraft.id)) === 'failed', 180_000);
      const { rows: after } = await harness.pool.query<{
        reservation: string;
        used: number;
        status: string;
      }>(
        `SELECT (SELECT status FROM redraft_reservations WHERE agent_job_id = $2) AS reservation,
              (SELECT count FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = $1
                 AND metric = 'redrafts' AND period_key = 'lifetime') AS used,
              (SELECT status FROM trips WHERE id = $1) AS status`,
        [tripId, redraft.id],
      );
      expect(after[0]).toEqual({ reservation: 'released', used: 0, status: 'draft_review' });
      const failed = await harness.pool.query(
        `SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'redraft.result'
         AND payload->'data'->>'status' = 'failed'`,
        [`trip_draft:${tripId}`],
      );
      expect(failed.rowCount).toBe(1);
      const candidates = await harness.pool.query(
        'SELECT 1 FROM itinerary_versions WHERE created_by_job_id = $1',
        [redraft.id],
      );
      expect(candidates.rowCount).toBe(0);
    },
  );
});
