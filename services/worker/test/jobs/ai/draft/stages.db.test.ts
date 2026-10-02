/**
 * The whole `ai.draft` job on recorded DeepSeek responses (the draft eval's kyoto-3 recording,
 * replayed by call at the network boundary): the crew is read through the guide's view, the
 * outline and the four days stream to `trip_draft:`, the planner validates, and one private
 * version is saved with its coverage and numbers; a rerun of the save step writes nothing new.
 */
import { startAgentJob } from '@cp/ai';
import { sendInTx, withSystem } from '@cp/db';
import { DRAFT_QUEUES, DRAFT_STEP_IDS, draftCoverageSchema, draftMetricsSchema } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { draftJob } from '../../../../src/jobs/ai/draft';
import { startJobsHarness, until, type JobsHarness } from '../../../helpers/jobs-harness';
import { RECORDING, replay, seedTrip } from './kyoto-trip';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

describe('ai.draft', () => {
  it('saves one validated private version from the recorded model replies', async () => {
    const { tripId, organiser } = await seedTrip(harness.pool);
    const job = draftJob({ model: () => replay });
    await harness.startRuntime([job]);
    const started = await withSystem(harness.pool, (tx) =>
      startAgentJob(tx, (queue, data, options) => sendInTx(tx, queue, data, options), {
        kind: 'draft',
        queue: DRAFT_QUEUES.draft,
        userId: organiser,
        tripId,
        input: { trip_id: tripId, draft_seq: 1 },
        stepIds: DRAFT_STEP_IDS,
      }),
    );
    const status = async () =>
      (
        await harness.pool.query<{ status: string }>(
          'SELECT status FROM agent_jobs WHERE id = $1',
          [started.id],
        )
      ).rows[0]?.status;
    await until(async () => ['succeeded', 'failed'].includes((await status()) ?? ''), 60_000);
    expect(await status()).toBe('succeeded');

    const { rows: trips } = await harness.pool.query<{ status: string; draft_version_id: string }>(
      'SELECT status, draft_version_id FROM trips WHERE id = $1',
      [tripId],
    );
    expect(trips[0]?.status).toBe('draft_review');
    const { rows: versions } = await harness.pool.query<{
      id: string;
      visibility: string;
      status: string;
      metrics: unknown;
      coverage: unknown;
    }>(
      'SELECT id, visibility, status, metrics, coverage FROM itinerary_versions WHERE created_by_job_id = $1',
      [started.id],
    );
    expect(versions).toHaveLength(1);
    const version = versions[0];
    expect(version).toMatchObject({
      id: trips[0]?.draft_version_id,
      visibility: 'organiser',
      status: 'draft',
    });
    const coverage = draftCoverageSchema.parse(version?.coverage);
    const metrics = draftMetricsSchema.parse(version?.metrics);
    expect(coverage.must_dos).toMatchObject({ total: 4, made: 4, missing: [], untimed: [] });
    // No must-do was typed by hand, so the guide answered none: saved as such for a redraft.
    expect(coverage.wish_answers).toEqual([]);
    expect(metrics.validation.first_pass_clean).toBe(true);
    const { rows: items } = await harness.pool.query<{ poi_id: string; created_by_kind: string }>(
      'SELECT poi_id, created_by_kind FROM plan_items WHERE version_id = $1',
      [version?.id],
    );
    const known = new Set(RECORDING.city.pois.map((p) => p.id));
    expect(items.length).toBeGreaterThan(8);
    expect(items.every((item) => known.has(item.poi_id) && item.created_by_kind === 'guide')).toBe(
      true,
    );
    expect(Object.keys(coverage.places).sort()).toEqual(
      [...new Set(items.map((i) => i.poi_id))].sort(),
    );

    const { rows: hints } = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1 ORDER BY id",
      [`trip_draft:${tripId}`],
    );
    const types = hints.map((h) => h.type);
    expect(types.filter((t) => t === 'draft.day_title')).toHaveLength(8);
    expect(types).toContain('draft.done');
    const ready = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'draft.ready' AND trip_id = $1",
      [tripId],
    );
    expect(ready.rowCount).toBe(1);

    // A worker that dies after the save but before the step is marked done reruns it: same version.
    await harness.pool.query(
      `UPDATE agent_jobs SET status = 'running',
         steps = (SELECT jsonb_agg(CASE WHEN s->>'step' = 'persist'
                                        THEN s || '{"status": "pending"}'::jsonb ELSE s END)
                    FROM jsonb_array_elements(steps) s)
       WHERE id = $1`,
      [started.id],
    );
    await withSystem(harness.pool, (tx) =>
      sendInTx(tx, DRAFT_QUEUES.draft, { agent_job_id: started.id, input: {} }, {}),
    );
    await until(async () => (await status()) === 'succeeded', 30_000);
    const again = await harness.pool.query('SELECT 1 FROM itinerary_versions WHERE trip_id = $1', [
      tripId,
    ]);
    expect(again.rowCount).toBe(1);
  });
});
