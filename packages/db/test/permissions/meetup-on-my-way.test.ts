/**
 * `app.meetup_on_my_way`: the worker's one read of who tapped ON MY WAY for a meet-up. It returns
 * member ids for that meet-up only, app_user cannot call it, and the event log itself stays closed
 * to app_system.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appendDomainEvent } from '../../src/events';
import { withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let trip: TripFixture;
let otherTrip: TripFixture;
let meetupId: string;
let otherMeetupId: string;
const device = anonymousActor().device;

async function insertMeetup(fx: TripFixture): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
       VALUES ($1, 'Campuhan Ridge', -8.5, 115.25, now() + interval '1 hour', $2) RETURNING id`,
      [fx.tripId, fx.organiserId],
    );
    return rows[0]!.id;
  });
}

async function ping(
  fx: TripFixture,
  by: string,
  kind: 'ping' | 'on_my_way',
  meetup: string | null,
): Promise<void> {
  await withSystem(db.pool, (tx) =>
    appendDomainEvent(tx, {
      type: 'crew.pinged',
      aggregateKind: 'trip',
      aggregateId: fx.tripId,
      actorKind: 'user',
      actorId: by,
      tripId: fx.tripId,
      payload: { trip_id: fx.tripId, by, kind, meetup_id: meetup, eta_min: null },
    }),
  );
}

async function onMyWay(meetup: string): Promise<string[]> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ ids: string[] }>('SELECT app.meetup_on_my_way($1) AS ids', [
      meetup,
    ]);
    return rows[0]!.ids;
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  trip = await buildTripFixture(db.pool);
  otherTrip = await buildTripFixture(db.pool);
  meetupId = await insertMeetup(trip);
  otherMeetupId = await insertMeetup(otherTrip);
});

afterAll(async () => {
  await db?.drop();
  await container?.stop();
});

describe('app.meetup_on_my_way', () => {
  it('is empty before anyone taps', async () => {
    expect(await onMyWay(meetupId)).toEqual([]);
  });

  it('names each member who tapped ON MY WAY for this meet-up once', async () => {
    await ping(trip, trip.memberId, 'on_my_way', meetupId);
    await ping(trip, trip.memberId, 'on_my_way', meetupId);
    // A plain ping, a tap with no meet-up and another trip's tap do not count.
    await ping(trip, trip.organiserId, 'ping', meetupId);
    await ping(trip, trip.organiserId, 'on_my_way', null);
    await ping(otherTrip, otherTrip.organiserId, 'on_my_way', otherMeetupId);

    expect(await onMyWay(meetupId)).toEqual([trip.memberId]);
    expect(await onMyWay(otherMeetupId)).toEqual([otherTrip.organiserId]);
  });

  it('cannot be called by app_user, not even by a member of the trip', async () => {
    await expect(
      withUser(db.pool, trip.memberId, device, (tx) =>
        tx.query('SELECT app.meetup_on_my_way($1)', [meetupId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('leaves the event log closed to app_system', async () => {
    await expect(
      withSystem(db.pool, (tx) => tx.query('SELECT actor_id FROM domain_events LIMIT 1')),
    ).rejects.toThrow(/permission denied/i);
  });
});
