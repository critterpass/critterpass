/**
 * Landing and arrival signals against a migrated Postgres: the first inbound landing starts a
 * pre-trip trip once and a crewmate's later landing changes nothing; a connection starts nothing;
 * an arrival counts from the first day; a return landing home on the last day ends the trip early,
 * and one before it (a member leaving early) does not.
 */
import { randomUUID } from 'node:crypto';

import { appendDomainEvent, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyLifecycleSignal } from '../../src/jobs/trips/lifecycle-signal';
import { startTripsWorld, type TripsWorld } from './trips-world';

let world: TripsWorld;

beforeAll(async () => {
  world = await startTripsWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

interface Leg {
  readonly booking: string;
  readonly segment: string;
}

async function leg(
  tripId: string,
  uid: string,
  from: string,
  to: string,
  dep: string,
  arr: string,
): Promise<Leg> {
  const [booking] = await world.q<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
     VALUES ($1, $2, 'flight', 'Flight', 'crew', 'airline', ARRAY[$2]::uuid[]) RETURNING id`,
    [tripId, uid],
  );
  const [segment] = await world.q<{ id: string }>(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at, sched_arr_at)
     VALUES ($1, $2, $3, true, '9G', '956', $4, $5, $6, $7) RETURNING id`,
    [booking?.id, tripId, uid, from, to, dep, arr],
  );
  return { booking: booking?.id as string, segment: segment?.id as string };
}

async function signal(
  tripId: string,
  type: 'flight.landed' | 'egg.hatched',
  payload: Record<string, unknown>,
  now?: Date,
) {
  const eventId = await withSystem(world.harness.pool, async (tx) => {
    const event = await appendDomainEvent(tx, {
      type,
      aggregateKind: type === 'flight.landed' ? 'flight_segment' : 'egg',
      aggregateId: (payload['segment_id'] ?? payload['egg_id']) as string,
      actorKind: 'system',
      actorId: null,
      crewId: world.crewId,
      tripId,
      payload: { trip_id: tripId, ...payload },
    });
    return event.id;
  });
  return applyLifecycleSignal(world.harness.pool, eventId, now);
}

const landed = (tripId: string, uid: string, l: Leg) =>
  signal(tripId, 'flight.landed', {
    booking_id: l.booking,
    segment_id: l.segment,
    user_ids: [uid],
    source: 'provider',
  });

const dates = { start: '2026-10-02', end: '2026-10-04' };

describe('trips.lifecycle_signal', { timeout: 60_000 }, () => {
  it('starts the trip on the first inbound landing, once', async () => {
    const tripId = await world.trip({ status: 'pre_trip', ...dates });
    const [a, b] = world.members;
    const first = await leg(
      tripId,
      a,
      'SGN',
      'DAD',
      '2026-10-02T00:05:00Z',
      '2026-10-02T01:30:00Z',
    );
    const second = await leg(
      tripId,
      b,
      'HAN',
      'DAD',
      '2026-10-02T03:00:00Z',
      '2026-10-02T04:20:00Z',
    );
    expect(await landed(tripId, a, first)).toBe('started');
    expect(await world.status(tripId)).toBe('in_trip');
    expect(await landed(tripId, b, second)).toBe('none');
    expect(await world.moves(tripId)).toEqual(['pre_trip->in_trip']);
  });

  it('does not start the trip on a connection or on a landing days before the first day', async () => {
    const tripId = await world.trip({ status: 'pre_trip', ...dates });
    const [a, b] = world.members;
    const hop = await leg(tripId, a, 'SGN', 'HAN', '2026-10-01T22:00:00Z', '2026-10-02T00:00:00Z');
    await leg(tripId, a, 'HAN', 'DAD', '2026-10-02T02:00:00Z', '2026-10-02T03:20:00Z');
    const early = await leg(
      tripId,
      b,
      'SGN',
      'DAD',
      '2026-09-28T00:05:00Z',
      '2026-09-28T01:30:00Z',
    );
    expect(await landed(tripId, a, hop)).toBe('none');
    expect(await landed(tripId, b, early)).toBe('none');
    expect(await world.status(tripId)).toBe('pre_trip');
  });

  it('counts a device arrival from 00:00 on the first day, on the trip clock', async () => {
    const tripId = await world.trip({ status: 'pre_trip', ...dates });
    const arrived = (now: string) =>
      signal(
        tripId,
        'egg.hatched',
        {
          user_id: world.members[0],
          egg_id: randomUUID(),
          form_id: randomUUID(),
          trigger: 'arrived',
        },
        new Date(now),
      );
    // 23:59 on 1 Oct in Da Nang, then 00:00 on 2 Oct.
    expect(await arrived('2026-10-01T16:59:00Z')).toBe('none');
    expect(await arrived('2026-10-01T17:00:00Z')).toBe('started');
    expect(await world.moves(tripId)).toEqual(['pre_trip->in_trip']);
  });

  it('ends the trip on a return landing home on the last day, not before', async () => {
    const tripId = await world.trip({ status: 'in_trip', ...dates });
    const [a, b] = world.members;
    await leg(tripId, a, 'SGN', 'DAD', '2026-10-02T00:05:00Z', '2026-10-02T01:30:00Z');
    await leg(tripId, b, 'SGN', 'DAD', '2026-10-02T00:05:00Z', '2026-10-02T01:30:00Z');
    const leavesEarly = await leg(
      tripId,
      b,
      'DAD',
      'SGN',
      '2026-10-03T10:00:00Z',
      '2026-10-03T11:25:00Z',
    );
    const home = await leg(tripId, a, 'DAD', 'SGN', '2026-10-04T11:00:00Z', '2026-10-04T12:25:00Z');
    expect(await landed(tripId, b, leavesEarly)).toBe('none');
    expect(await world.status(tripId)).toBe('in_trip');
    expect(await landed(tripId, a, home)).toBe('ended');
    expect(await world.moves(tripId)).toEqual(['in_trip->post_trip']);
  });
});
