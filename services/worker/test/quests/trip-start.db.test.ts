/**
 * A trip that turns `in_trip` gets its day's quests at once: the `trip.status_changed` hook queues
 * `quests.generate` for the trip's local date in the same transaction, the generator writes the
 * day without waiting for the hourly sweep, and the sweep then finds nothing left to queue.
 */
import { moveTripStatus, withSystem } from '@cp/db';
import { QUEST_QUEUES } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateQuestsJob } from '../../src/jobs/quests/generate';
import { sweepQuestDays } from '../../src/jobs/quests/sweep';
import { until } from '../helpers/jobs-harness';
import { startQuestWorld, TZ, type QuestWorld } from './quests-world';

let world: QuestWorld;

beforeAll(async () => {
  world = await startQuestWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

const TO_PRE_TRIP = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
];

/** A second trip of the world's crew, starting today, held at `pre_trip`. */
async function tripStartingToday(): Promise<string> {
  const [trip] = await world.q<{ id: string }>(
    "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
    [world.crewId, world.ids['destination']],
  );
  const tripId = trip?.id ?? '';
  for (const [i, uid] of world.members.entries()) {
    await world.q(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, i === 0 ? 'organiser' : 'member'],
    );
  }
  await world.q(
    'UPDATE trips SET tz = $2, start_date = $3::date, end_date = $3::date + 2 WHERE id = $1',
    [tripId, TZ, world.today],
  );
  for (const status of TO_PRE_TRIP) {
    await world.q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  return tripId;
}

const questsOf = (tripId: string) =>
  world.q<{ local_date: string }>(
    'SELECT local_date::text AS local_date FROM quests WHERE trip_id = $1',
    [tripId],
  );

describe('quests on trip start', () => {
  it("writes the day's quests when the trip turns in_trip, without the hourly sweep", async () => {
    const tripId = await tripStartingToday();
    const moved = await withSystem(world.harness.pool, (tx) =>
      moveTripStatus(tx, { tripId, from: 'pre_trip', to: 'in_trip', actor: { kind: 'system' } }),
    );
    expect(moved).toBe(true);
    const queued = await world.q<{ data: { trip_id: string; local_date: string } }>(
      'SELECT data FROM pgboss.job WHERE name = $1 AND data->>$2 = $3',
      [QUEST_QUEUES.generate, 'trip_id', tripId],
    );
    expect(queued.map((job) => job.data)).toEqual([{ trip_id: tripId, local_date: world.today }]);

    await world.harness.startRuntime([generateQuestsJob()]);
    await until(async () => (await questsOf(tripId)).length > 0, 30_000);
    const written = await questsOf(tripId);
    expect(new Set(written.map((quest) => quest.local_date))).toEqual(new Set([world.today]));

    // The hourly sweep finds the day written and queues nothing more for it.
    await sweepQuestDays(world.harness.pool, world.at('13:00'));
    const after = await world.q<{ n: number }>(
      'SELECT count(*)::int AS n FROM pgboss.job WHERE name = $1 AND data->>$2 = $3',
      [QUEST_QUEUES.generate, 'trip_id', tripId],
    );
    expect(after[0]?.n).toBe(1);
    expect(await questsOf(tripId)).toHaveLength(written.length);
  }, 90_000);

  it('queues nothing for a status change that does not start the trip', async () => {
    const tripId = await tripStartingToday();
    await withSystem(world.harness.pool, (tx) =>
      moveTripStatus(tx, { tripId, from: 'pre_trip', to: 'cancelled', actor: { kind: 'system' } }),
    );
    const queued = await world.q('SELECT 1 FROM pgboss.job WHERE name = $1 AND data->>$2 = $3', [
      QUEST_QUEUES.generate,
      'trip_id',
      tripId,
    ]);
    expect(queued).toHaveLength(0);
  });
});
