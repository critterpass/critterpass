/**
 * The guide drafts around what the organiser already placed, on the whole `ai.draft` job with
 * recorded model replies: her stops come out of the draft with their own ids, times, people and
 * pins, nothing of the guide's overlaps them, a stop she has not timed yet is still there, her
 * plan stays in the history behind the guide's draft, and the places the crew saved to Ideas are
 * offered to the guide. A place she already put on a day is not offered again and a must-do she
 * placed herself counts as made.
 */
import { randomUUID } from 'node:crypto';

import { startAgentJob } from '@cp/ai';
import { sendInTx, withSystem } from '@cp/db';
import { DRAFT_QUEUES, DRAFT_STEP_IDS, draftCoverageSchema } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AgentStepContext } from '../../../../src/ai/job-runner';
import { draftJob } from '../../../../src/jobs/ai/draft';
import { load } from '../../../../src/jobs/ai/draft/job-context';
import { startJobsHarness, until, type JobsHarness } from '../../../helpers/jobs-harness';
import { RECORDING, replay, seedTrip } from './kyoto-trip';

let harness: JobsHarness;
let tripId: string;
let organiser: string;
let handPlan: string;
const stops = {
  lunch: randomUUID(),
  walk: randomUUID(),
  someday: randomUUID(),
  wish: randomUUID(),
};
const { start, days: dayCount, must_dos: mustDos } = RECORDING.crew;
const dateOf = (dayNo: number) =>
  new Date(Date.parse(`${start}T00:00:00Z`) + (dayNo - 1) * 86_400_000).toISOString().slice(0, 10);
const kyoto = (dayNo: number, hour: number) =>
  new Date(`${dateOf(dayNo)}T${String(hour).padStart(2, '0')}:00:00+09:00`);
const wishPlace = mustDos[0]?.poi_id as string;

async function addStop(
  stable: string,
  dayNo: number,
  hours: readonly [number, number] | null,
  place: { poiId: string } | { pin: { name: string; lat: number; lng: number } },
  attendees: readonly string[] | null = null,
) {
  await harness.pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, poi_id,
       custom_place, attendee_ids, category, created_by_kind, notes)
     SELECT $1, d.id, $2, $3, $5, $6, 'Asia/Tokyo', $7, $8, $9, 'other', 'user', 'Mine'
       FROM plan_days d WHERE d.version_id = $1 AND d.day_no = $4`,
    [
      handPlan,
      tripId,
      stable,
      dayNo,
      hours === null ? null : kyoto(dayNo, hours[0]),
      hours === null ? null : kyoto(dayNo, hours[1]),
      'poiId' in place ? place.poiId : null,
      'pin' in place ? JSON.stringify(place.pin) : null,
      attendees,
    ],
  );
}

function stepContext(): AgentStepContext {
  return {
    pool: harness.pool,
    agentJob: { id: randomUUID(), tripId, userId: organiser },
    input: { trip_id: tripId },
    results: {},
    usage: {},
  } as unknown as AgentStepContext;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  ({ tripId, organiser } = await seedTrip(harness.pool));
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status, origin, coverage)
     VALUES ($1, 'organiser', 'draft', 'hand', $2) RETURNING id`,
    [tripId, JSON.stringify({ places: {} })],
  );
  handPlan = rows[0]?.id as string;
  for (let dayNo = 1; dayNo <= dayCount; dayNo += 1) {
    await harness.pool.query(
      'INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, $3, $4)',
      [handPlan, tripId, dayNo, dateOf(dayNo)],
    );
  }
  await harness.pool.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [
    tripId,
    handPlan,
  ]);
  // Lunch with an aunt across the middle of day 2 (two of the crew), a walk on day 3, and a
  // stop she has not given a time yet.
  await addStop(stops.lunch, 2, [11, 14], { pin: { name: 'Aunt Mai', lat: 35.01, lng: 135.76 } }, [
    organiser,
  ]);
  await addStop(stops.walk, 3, [15, 17], { pin: { name: 'River walk', lat: 35.0, lng: 135.77 } });
  await addStop(stops.someday, 4, null, { pin: { name: 'Tea with Aki', lat: 35.02, lng: 135.75 } });
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

describe('a draft over a plan she started by hand', () => {
  it('does not offer her place again, counts her must-do as made and offers saved ideas', async () => {
    await addStop(stops.wish, 1, [10, 12], { poiId: wishPlace });
    const idea = RECORDING.city.pois.find((p) => !mustDos.some((m) => m.poi_id === p.id));
    await harness.pool.query(
      `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{save}')`,
      [tripId, idea?.id, idea?.name, idea?.category, idea?.lat, idea?.lng, [organiser]],
    );
    const loaded = await load(stepContext());
    expect(loaded.held.map((stop) => [stop.dayNo, stop.item.stable_id])).toEqual([
      [1, stops.wish],
      [2, stops.lunch],
      [3, stops.walk],
    ]);
    expect(loaded.held[0]?.item).toMatchObject({ locked_reason: 'user', poi_id: wishPlace });
    expect(loaded.held[0]?.item.must_do_id).not.toBeNull();
    expect(loaded.input.pois.has(wishPlace)).toBe(false);
    expect(loaded.input.frame.mustDos).toHaveLength(mustDos.length - 1);
    expect(loaded.trip.mustDos).toHaveLength(mustDos.length);
    const offered = [...loaded.input.pools.activities, ...loaded.input.pools.eateries];
    expect(offered.some((poi) => poi.id === idea?.id)).toBe(true);
    await harness.pool.query('DELETE FROM plan_items WHERE stable_id = $1', [stops.wish]);
  });

  it('keeps her stops exactly and plans the rest around them', { timeout: 120_000 }, async () => {
    await harness.startRuntime([draftJob({ model: () => replay })]);
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

    const { rows: versions } = await harness.pool.query<{
      id: string;
      parent_id: string;
      origin: string;
      coverage: unknown;
    }>(
      'SELECT id, parent_id, origin, coverage FROM itinerary_versions WHERE created_by_job_id = $1',
      [started.id],
    );
    const draft = versions[0];
    // Her plan stays in the history, behind the guide's draft.
    expect(draft).toMatchObject({ parent_id: handPlan, origin: 'guide' });
    const { rows: base } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM itinerary_versions WHERE id = $1',
      [handPlan],
    );
    expect(base[0]?.status).toBe('superseded');

    const { rows: items } = await harness.pool.query<{
      stable_id: string;
      day_no: number;
      starts_at: Date | null;
      ends_at: Date | null;
      created_by_kind: string;
      custom_place: { name: string } | null;
      attendee_ids: string[] | null;
      category: string;
      locked_reason: string | null;
      notes: string | null;
    }>(
      `SELECT i.stable_id, d.day_no, i.starts_at, i.ends_at, i.created_by_kind, i.custom_place,
              i.attendee_ids, i.category, i.locked_reason, i.notes
         FROM plan_items i JOIN plan_days d ON d.id = i.day_id WHERE i.version_id = $1`,
      [draft?.id],
    );
    const mine = (id: string) => items.find((item) => item.stable_id === id);
    expect(mine(stops.lunch)).toMatchObject({
      day_no: 2,
      starts_at: kyoto(2, 11),
      ends_at: kyoto(2, 14),
      created_by_kind: 'user',
      custom_place: { name: 'Aunt Mai' },
      attendee_ids: [organiser],
      category: 'other',
      locked_reason: null,
      notes: 'Mine',
    });
    expect(mine(stops.walk)).toMatchObject({ day_no: 3, starts_at: kyoto(3, 15) });
    expect(mine(stops.someday)).toMatchObject({
      day_no: 4,
      starts_at: null,
      custom_place: { name: 'Tea with Aki' },
    });

    // The guide planned the rest: its stops are there, and none of them runs into hers.
    const guides = items.filter((item) => item.created_by_kind === 'guide');
    expect(guides.length).toBeGreaterThan(6);
    for (const id of [stops.lunch, stops.walk]) {
      const held = mine(id);
      const clashing = guides.filter(
        (item) =>
          item.day_no === held?.day_no &&
          item.locked_reason === null &&
          item.starts_at !== null &&
          item.ends_at !== null &&
          item.starts_at < (held.ends_at as Date) &&
          (held.starts_at as Date) < item.ends_at,
      );
      expect(clashing).toEqual([]);
    }
    const coverage = draftCoverageSchema.parse(draft?.coverage);
    expect(coverage.must_dos.total).toBe(mustDos.length);
  });
});
