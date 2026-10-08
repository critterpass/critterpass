/**
 * PLACE THEM FOR ME on the real stack: a crew member starts the guide placing the trip's ideas in
 * the background. It needs a current plan and ideas that are really the trip's; one placement runs
 * per person per trip, so a second tap answers with the running job; a trip past its daily cap is
 * told to wait until tomorrow; someone outside the crew finds no trip.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerIdeaCommands } from '../../../src/commands/ideas';
import { seedCurrentPlan } from '../../plan/plan-fixture';
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
let organiser: SignedIn;
let maya: SignedIn;
let rin: SignedIn;
let outsider: SignedIn;
let versionId: string;
let temple: string;
let garden: string;
let removed: string;

interface JobRow {
  id: string;
  user_id: string;
  status: string;
  base_version_id: string | null;
  steps: { step: string }[];
}

async function placements(): Promise<JobRow[]> {
  const { rows } = await harness.pool.query<JobRow>(
    `SELECT id, user_id, status, base_version_id, steps FROM agent_jobs
      WHERE trip_id = $1 AND kind = 'place_ideas' ORDER BY created_at, id`,
    [crew.tripId],
  );
  return rows;
}

async function queued(jobId: string) {
  const { rows } = await harness.pool.query<{ data: Record<string, unknown> }>(
    "SELECT data FROM pgboss.job WHERE name = 'ai.place_ideas' AND data->>'agent_job_id' = $1",
    [jobId],
  );
  return rows.map((row) => row.data);
}

async function idea(name: string, deleted = false): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO trip_ideas (trip_id, name, category, lat, lng, sources, deleted_at)
     VALUES ($1, $2, 'temple_shrine', 35.0394, 135.7292, '{pin}', $3) RETURNING id`,
    [crew.tripId, name, deleted ? new Date() : null],
  );
  return rows[0]!.id;
}

const place = (who: SignedIn, ideaIds?: string[]) =>
  harness.run(who, 'start_idea_placement', {
    trip_id: crew.tripId,
    ...(ideaIds === undefined ? {} : { idea_ids: ideaIds }),
  });

const setCap = (value: number) =>
  harness.pool.query(
    `INSERT INTO ops.ops_config (key, value) VALUES ('fair_use.system_jobs_per_trip_day', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(value)],
  );

beforeAll(async () => {
  harness = await startSetupHarness(registerIdeaCommands);
  crew = await buildSetupCrew(harness, 3);
  [organiser, maya, rin] = crew.members as [SignedIn, SignedIn, SignedIn];
  outsider = await harness.signIn();
  temple = await idea('Kinkaku-ji');
  garden = await idea('Ryoan-ji');
  removed = await idea('Closed tea house', true);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('start_idea_placement', () => {
  let mayasJob: string;

  it('needs a current plan to place into', async () => {
    const early = await place(maya, [temple]);
    expect(errorOf(early)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'no_current_plan' },
    });
    expect(await placements()).toEqual([]);
    versionId = (await seedCurrentPlan(harness.pool, crew.tripId)).versionId;
  });

  it('finds no trip for someone outside the crew', async () => {
    const refused = await place(outsider, [temple]);
    expect(refused.status).toBe(404);
    expect(errorOf(refused)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'trip' } });
    expect(await placements()).toEqual([]);
  });

  it('refuses an idea that is not the trip’s, or was removed, starting nothing', async () => {
    for (const ids of [
      [temple, generateUuidV7()],
      [temple, removed],
    ]) {
      const refused = await place(maya, ids);
      expect(errorOf(refused)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'idea' } });
    }
    expect(await placements()).toEqual([]);
  });

  it('queues one placement of the chosen ideas against the current plan', async () => {
    const started = await place(maya, [temple, garden, temple]);
    mayasJob = resultOf<{ job_id: string }>(started).job_id;
    const jobs = await placements();
    expect(jobs).toMatchObject([
      { id: mayasJob, user_id: maya.uid, status: 'queued', base_version_id: versionId },
    ]);
    expect(jobs[0]!.steps.map((entry) => entry.step)).toEqual([
      'hours',
      'locks',
      'routing',
      'needs_you',
    ]);
    // Each idea once, in a stable order, whatever order the screen sent them in.
    expect(await queued(mayasJob)).toEqual([
      {
        agent_job_id: mayasJob,
        input: {
          trip_id: crew.tripId,
          idea_ids: [temple, garden].sort(),
          version_id: versionId,
        },
      },
    ]);
  });

  it('answers a second tap with the placement already running', async () => {
    const again = await place(maya, [garden]);
    expect(resultOf(again)).toEqual({ job_id: mayasJob });
    expect(await placements()).toHaveLength(1);
    expect(await queued(mayasJob)).toHaveLength(1);
  });

  it('gives each person their own placement; with no ideas named it places them all', async () => {
    const started = await place(organiser);
    const organisersJob = resultOf<{ job_id: string }>(started).job_id;
    expect(organisersJob).not.toBe(mayasJob);
    expect((await placements()).map((job) => [job.id, job.user_id, job.status])).toEqual([
      [mayasJob, maya.uid, 'queued'],
      [organisersJob, organiser.uid, 'queued'],
    ]);
    expect(await queued(organisersJob)).toEqual([
      {
        agent_job_id: organisersJob,
        input: { trip_id: crew.tripId, idea_ids: null, version_id: versionId },
      },
    ]);
  });

  it('tells a trip past its daily cap to wait until tomorrow, and still answers a running one', async () => {
    await setCap(2);
    try {
      const capped = await place(rin, [temple]);
      const error = errorOf(capped);
      expect(error.code).toBe('RATE_LIMITED');
      const retryAfter = Number(error.detail?.['retry_after_s']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(86_400);
      expect(await placements()).toHaveLength(2);

      const running = await place(maya, [temple]);
      expect(resultOf(running)).toEqual({ job_id: mayasJob });
    } finally {
      await setCap(40);
    }
    const allowed = await place(rin, [temple]);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect(await placements()).toHaveLength(3);
  });
});
