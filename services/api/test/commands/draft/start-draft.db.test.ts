/**
 * Starting and cancelling a draft on the real stack: only an organiser starts it, once the dates
 * are locked; the job row and its queue entry commit with the command; a second start while one
 * runs is refused; cancelling stops the job and gives the trip back to setup.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../../src/commands/draft';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function tripStatus(): Promise<string> {
  const { rows } = await harness.pool.query<{ status: string }>(
    'SELECT status FROM trips WHERE id = $1',
    [crew.tripId],
  );
  return rows[0]?.status ?? '';
}

beforeAll(async () => {
  harness = await startSetupHarness(registerDraftCommands);
  crew = await buildSetupCrew(harness, 3);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('start_draft', () => {
  it('starts one private job for an organiser once the dates are locked, and cancels it', async () => {
    const [, member] = crew.members as [SignedIn, SignedIn];
    const early = await harness.run(crew.organiser, 'start_draft', { trip_id: crew.tripId });
    expect(errorOf(early)).toMatchObject({ code: 'STATE_INVALID' });

    const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
      trip_id: crew.tripId,
      start: day(40),
      end: day(43),
    });
    expect(locked.status, JSON.stringify(locked.body)).toBe(200);

    const denied = await harness.run(member, 'start_draft', { trip_id: crew.tripId });
    expect(errorOf(denied).code).toBe('FORBIDDEN');

    const started = await harness.run(crew.organiser, 'start_draft', { trip_id: crew.tripId });
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const { job_id: jobId } = resultOf<{ job_id: string }>(started);
    const { rows: jobs } = await harness.pool.query<{
      status: string;
      user_id: string;
      steps: { step: string }[];
    }>('SELECT status, user_id, steps FROM agent_jobs WHERE id = $1', [jobId]);
    expect(jobs[0]).toMatchObject({ status: 'queued', user_id: crew.organiser.uid });
    expect(jobs[0]?.steps.map((s) => s.step)).toEqual([
      'read_profiles',
      'check_season',
      'skeleton',
      'days',
      'validate',
      'persist',
    ]);
    const queued = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'ai.draft' AND data->>'agent_job_id' = $1",
      [jobId],
    );
    expect(queued.rowCount).toBe(1);
    expect(await tripStatus()).toBe('drafting');

    const again = await harness.run(crew.organiser, 'start_draft', { trip_id: crew.tripId });
    expect(errorOf(again)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'draft_running', job_id: jobId },
    });

    const memberCancel = await harness.run(member, 'cancel_draft', { trip_id: crew.tripId });
    expect(errorOf(memberCancel).code).toBe('FORBIDDEN');
    const cancelled = await harness.run(crew.organiser, 'cancel_draft', { trip_id: crew.tripId });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    const { rows: after } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM agent_jobs WHERE id = $1',
      [jobId],
    );
    expect(after[0]?.status).toBe('cancelled');
    expect(await tripStatus()).toBe('setup');
    const done = await harness.pool.query(
      `SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'draft.done'
         AND payload->'data'->>'status' = 'cancelled'`,
      [`trip_draft:${crew.tripId}`],
    );
    expect(done.rowCount).toBe(1);
  });
});
