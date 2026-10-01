/**
 * Crew live map pushes against a migrated Postgres: a crew ping reaches every participant but the
 * sender (ALWAYS, from the member), a moved meet-up reaches the sharing crew but the mover, and
 * "everyone's nearly there" reaches every sharing member. All open the crew map.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerLiveMapNotifications } from '../../src/jobs/live-map/notify';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';
import { addMeetup, buildCrewTrip, openShare, type CrewTrip } from './live-map-fixture';

let harness: JobsHarness;
let trip: CrewTrip;
let meetupId: string;

async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await harness.pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

function routed(
  type: string,
  actorId: string | null,
  payload: Record<string, unknown>,
): RoutedEvent {
  return {
    id: randomUUID(),
    type,
    payload,
    crewId: trip.crewId,
    tripId: trip.tripId,
    actorId,
    occurredAt: new Date(),
  };
}

beforeAll(async () => {
  harness = await startJobsHarness();
  registerLiveMapNotifications();
  trip = await buildCrewTrip(harness.pool);
  const [maya, rin] = trip.uids;
  await openShare(harness.pool, trip.tripId, maya);
  await openShare(harness.pool, trip.tripId, rin);
  meetupId = await addMeetup(harness.pool, trip.tripId, maya);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('crew_ping', () => {
  const registration = () => getRegistration('crew.pinged', 'crew_ping')!;

  it('reaches every participant but the sender', async () => {
    const [maya, rin, jordan] = trip.uids;
    const event = routed('crew.pinged', rin, {
      trip_id: trip.tripId,
      by: rin,
      kind: 'ping',
      meetup_id: meetupId,
      eta_min: null,
    });
    const audience = await withClient((c) => registration().audience(c, event));
    expect([...audience].sort()).toEqual([maya, jordan].sort());
    const composed = await withClient((c) => registration().compose(c, event, maya));
    expect(composed).toMatchObject({
      body: { id: 'notifications.crew_ping.ping_meetup' },
      vars: { sender: 'Rin', crew: 'The Bali Six', place: 'Campuhan Ridge' },
      deepLink: `/map/${trip.tripId}`,
      sender: { kind: 'member', id: rin },
    });
  });

  it('carries the sender’s minutes on I’m on my way', async () => {
    const [maya, rin] = trip.uids;
    const event = routed('crew.pinged', rin, {
      trip_id: trip.tripId,
      by: rin,
      kind: 'on_my_way',
      meetup_id: meetupId,
      eta_min: 12,
    });
    const composed = await withClient((c) => registration().compose(c, event, maya));
    expect(composed).toMatchObject({
      body: { id: 'notifications.crew_ping.on_my_way_eta' },
      vars: { minutes: 12 },
    });
  });
});

describe('meetup_changed', () => {
  it('tells the sharing crew but the mover about a move', async () => {
    const [maya, rin] = trip.uids;
    const registration = getRegistration('meetup.moved', 'meetup_changed')!;
    const event = routed('meetup.moved', maya, {
      trip_id: trip.tripId,
      meetup_id: meetupId,
      by: maya,
    });
    expect(await withClient((c) => registration.audience(c, event))).toEqual([rin]);
    const composed = await withClient((c) => registration.compose(c, event, rin));
    expect(composed).toMatchObject({
      body: { id: 'notifications.meetup_changed.moved' },
      collapseVars: { meetup_id: meetupId },
    });
  });

  it('tells every sharing member when the whole crew is close', async () => {
    const [maya, rin] = trip.uids;
    const registration = getRegistration('meetup.crew_close', 'meetup_changed')!;
    const event = routed('meetup.crew_close', null, { trip_id: trip.tripId, meetup_id: meetupId });
    expect([...(await withClient((c) => registration.audience(c, event)))].sort()).toEqual(
      [maya, rin].sort(),
    );
    const composed = await withClient((c) => registration.compose(c, event, maya));
    expect(composed).toMatchObject({ sender: { kind: 'system' } });
  });
});
