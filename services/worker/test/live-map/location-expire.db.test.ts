/**
 * `location.expire` against a migrated Postgres: at a share's last-day midnight its end is
 * announced once, its fixes go, and when the crew map has closed every participant is
 * unsubscribed from `trip_locations:` and the meet-up ends. A share turned off earlier is not
 * announced twice.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireShare } from '../../src/jobs/live-map/location-expire';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import {
  addFix,
  addMeetup,
  buildCrewTrip,
  localDate,
  openShare,
  TRIP_TZ,
} from './live-map-fixture';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

async function outbox(
  tripId: string,
): Promise<{ kind: string; type: string | null; user: string | null }[]> {
  const { rows } = await harness.pool.query<{
    kind: string;
    type: string | null;
    user: string | null;
  }>(
    `SELECT kind, payload->>'type' AS type, payload->>'user_id' AS user FROM rt_outbox
      WHERE channel = 'trip_locations:' || $1 ORDER BY id`,
    [tripId],
  );
  return rows;
}

describe('expireShare', () => {
  it('announces the end, purges fixes and closes the map after the last day', async () => {
    const trip = await buildCrewTrip(harness.pool);
    const [maya, rin] = trip.uids;
    const endsAt = new Date(Date.now() - 1000);
    const shareId = await openShare(harness.pool, trip.tripId, maya, { endsAt });
    await addFix(harness.pool, shareId, {
      lat: -8.5,
      lng: 115.26,
      at: new Date(Date.now() - 5000),
    });
    const meetupId = await addMeetup(harness.pool, trip.tripId, rin);
    // The last day was yesterday: the window closed at midnight.
    await harness.pool.query('UPDATE trips SET start_date = $2, end_date = $3 WHERE id = $1', [
      trip.tripId,
      localDate(TRIP_TZ, -3),
      localDate(TRIP_TZ, -1),
    ]);

    const result = await expireShare(harness.pool, shareId, endsAt);
    expect(result).toEqual({ announced: true, closed: true, purged: 1 });
    const rows = await outbox(trip.tripId);
    expect(rows.filter((row) => row.type === 'share.ended')).toHaveLength(1);
    const unsubscribed = rows.filter((row) => row.kind === 'unsubscribe').map((row) => row.user);
    expect(new Set(unsubscribed)).toEqual(new Set(trip.uids));
    const meetup = await harness.pool.query<{ status: string }>(
      'SELECT status FROM meetups WHERE id = $1',
      [meetupId],
    );
    expect(meetup.rows[0]?.status).toBe('done');
  });

  it('keeps the map open for others when one share ends inside the window', async () => {
    const trip = await buildCrewTrip(harness.pool, { daysLeft: 2 });
    const endsAt = new Date(Date.now() - 1000);
    const shareId = await openShare(harness.pool, trip.tripId, trip.uids[0], { endsAt });
    const result = await expireShare(harness.pool, shareId, endsAt);
    expect(result).toMatchObject({ announced: true, closed: false });
    expect((await outbox(trip.tripId)).some((row) => row.kind === 'unsubscribe')).toBe(false);
  });

  it('does not announce a share that was turned off long before', async () => {
    const trip = await buildCrewTrip(harness.pool, { daysLeft: 2 });
    const shareId = await openShare(harness.pool, trip.tripId, trip.uids[1], {
      endsAt: new Date(Date.now() - 3_600_000),
    });
    const result = await expireShare(harness.pool, shareId, new Date());
    expect(result.announced).toBe(false);
  });

  it('does nothing before the share has ended', async () => {
    const trip = await buildCrewTrip(harness.pool, { daysLeft: 2 });
    const shareId = await openShare(harness.pool, trip.tripId, trip.uids[2]);
    expect(await expireShare(harness.pool, shareId, new Date())).toEqual({
      announced: false,
      closed: false,
      purged: 0,
    });
  });
});
