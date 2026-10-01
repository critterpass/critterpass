/**
 * `eta.meetups` against a migrated Postgres: sharing members' latest fixes become ETAs (paused
 * members and stale fixes left out), arrivals inside 75 m, one "everyone is close" event, an `eta`
 * publication per run, and a chain that stops when nothing is left to count. The clock is passed
 * in, so every run is pinned.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recountMeetupEtas } from '../../src/jobs/live-map/eta-meetups';
import { straightLineRouter, type MeetupRouter } from '../../src/jobs/live-map/meetup-router';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import {
  addFix,
  addMeetup,
  buildCrewTrip,
  MEETUP,
  openShare,
  type CrewTrip,
} from './live-map-fixture';

let harness: JobsHarness;
let trip: CrewTrip;
let meetupId: string;
let now: Date;

const at = (secondsLater: number) => new Date(now.getTime() + secondsLater * 1000);

beforeAll(async () => {
  harness = await startJobsHarness();
  now = new Date();
  trip = await buildCrewTrip(harness.pool);
  const [maya, rin, jordan] = trip.uids;
  const mayaShare = await openShare(harness.pool, trip.tripId, maya);
  const rinShare = await openShare(harness.pool, trip.tripId, rin);
  const jordanShare = await openShare(harness.pool, trip.tripId, jordan, { paused: true });
  // Maya is ~50 m from the meet-up, Rin ~2 km out on a scooter, Jordan paused.
  await addFix(harness.pool, mayaShare, { lat: MEETUP.lat + 0.00045, lng: MEETUP.lng, at: now });
  await addFix(harness.pool, rinShare, {
    lat: -8.5069,
    lng: 115.2725,
    activity: 'automotive',
    at: now,
  });
  await addFix(harness.pool, jordanShare, { lat: -8.51, lng: 115.26, at: now });
  meetupId = await addMeetup(harness.pool, trip.tripId, maya);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('recountMeetupEtas', () => {
  it('counts every sharing member, marks arrivals and publishes one eta message', async () => {
    const result = await recountMeetupEtas(harness.pool, meetupId, straightLineRouter, now);
    expect(result.reschedule).toBe(true);
    const [maya, rin, jordan] = trip.uids;
    const byUid = new Map(result.etas.map((eta) => [eta.uid, eta]));
    expect(byUid.has(jordan)).toBe(false);
    expect(byUid.get(maya)).toMatchObject({ arrived: true, min: 0, status: { key: 'arrived' } });
    expect(byUid.get(rin)).toMatchObject({ arrived: false, mode: 'auto', estimate: true });
    expect(byUid.get(rin)?.min).toBeGreaterThan(5);
    expect(result.allClose).toBe(false);

    const rows = await harness.pool.query<{
      user_id: string;
      eta_min: number;
      status_text: string;
    }>(
      'SELECT user_id, eta_min, status_text FROM member_etas WHERE meetup_id = $1 ORDER BY user_id',
      [meetupId],
    );
    expect(rows.rows).toHaveLength(2);
    const arrived = await harness.pool.query<{ arrived: Record<string, string> }>(
      'SELECT arrived FROM meetups WHERE id = $1',
      [meetupId],
    );
    expect(Object.keys(arrived.rows[0]!.arrived)).toEqual([maya]);
    const published = await harness.pool.query<{ type: string }>(
      `SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = 'trip_locations:' || $1`,
      [trip.tripId],
    );
    expect(published.rows.map((row) => row.type)).toEqual(['eta']);
  });

  it('leaves a second chain nothing to do inside the minute', async () => {
    const again = await recountMeetupEtas(harness.pool, meetupId, straightLineRouter, at(20));
    expect(again).toMatchObject({ reschedule: false });
  });

  it('fires the all-close moment once when everyone is under five minutes', async () => {
    const [, rin] = trip.uids;
    const share = await harness.pool.query<{ id: string }>(
      "SELECT id FROM location_shares WHERE user_id = $1 AND reason = 'crew_map'",
      [rin],
    );
    await addFix(harness.pool, share.rows[0]!.id, {
      lat: MEETUP.lat + 0.0015,
      lng: MEETUP.lng,
      activity: 'walking',
      at: at(60),
    });
    // Valhalla (the network boundary) answers four minutes for the last stretch.
    const fourMinutes: MeetupRouter = {
      matrix: (_mode, sources) =>
        Promise.resolve(sources.map(() => ({ minutes: 4, distanceM: 170, estimate: false }))),
    };
    const close = await recountMeetupEtas(harness.pool, meetupId, fourMinutes, at(61));
    expect(close.allClose).toBe(true);
    const later = await recountMeetupEtas(harness.pool, meetupId, fourMinutes, at(122));
    expect(later.allClose).toBe(true);
    const events = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'meetup.crew_close' AND aggregate_id = $1",
      [meetupId],
    );
    expect(events.rows).toHaveLength(1);
  });

  it('stops the chain once nobody is sharing', async () => {
    await harness.pool.query(
      "UPDATE location_shares SET paused = true WHERE trip_id = $1 AND reason = 'crew_map'",
      [trip.tripId],
    );
    const result = await recountMeetupEtas(harness.pool, meetupId, straightLineRouter, at(200));
    expect(result).toMatchObject({ reschedule: false, etas: [] });
  });

  it('ends a meet-up once the crew map has closed', async () => {
    await harness.pool.query(
      'UPDATE trip_entitlements SET boost_active = false WHERE trip_id = $1',
      [trip.tripId],
    );
    const result = await recountMeetupEtas(harness.pool, meetupId, straightLineRouter, at(260));
    expect(result.reschedule).toBe(false);
    const row = await harness.pool.query<{ status: string }>(
      'SELECT status FROM meetups WHERE id = $1',
      [meetupId],
    );
    expect(row.rows[0]?.status).toBe('done');
  });
});
