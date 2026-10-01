/**
 * The timed trip lifecycle against a migrated Postgres: every move happens at its boundary on the
 * destination's own clock (a UTC+7 trip and a UTC−7 one), a rerun changes nothing, a trip that fell
 * behind catches up in one run, a proposed trip is left to the reply-by job and the organiser's lock,
 * and voting, setup-stage, cancelled and archived trips are never touched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runTripLifecycle } from '../../src/jobs/trips/lifecycle';
import { HCM, LAX, startTripsWorld, type TripsWorld } from './trips-world';

let world: TripsWorld;

beforeAll(async () => {
  world = await startTripsWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

const at = (iso: string) => new Date(iso);
const justBefore = (iso: string) => new Date(Date.parse(iso) - 1);

/** Start Fri 2 Oct, end Sun 4 Oct 2026; the boundaries as UTC instants for each zone. */
const TIMELINES = [
  {
    tz: HCM,
    preTrip: '2026-09-17T17:00:00Z',
    noonFallback: '2026-10-02T05:00:00Z',
    postTrip: '2026-10-04T17:00:00Z',
    archived: '2026-10-11T17:00:00Z',
  },
  {
    tz: LAX,
    preTrip: '2026-09-18T07:00:00Z',
    noonFallback: '2026-10-02T19:00:00Z',
    postTrip: '2026-10-05T07:00:00Z',
    archived: '2026-10-12T07:00:00Z',
  },
] as const;

describe('trips.lifecycle', { timeout: 60_000 }, () => {
  it.each(TIMELINES)('moves a $tz trip at each local boundary', async (line) => {
    const tripId = await world.trip({
      status: 'confirmed',
      tz: line.tz,
      start: '2026-10-02',
      end: '2026-10-04',
    });
    const steps = [
      [line.preTrip, 'confirmed', 'pre_trip'],
      [line.noonFallback, 'pre_trip', 'in_trip'],
      [line.postTrip, 'in_trip', 'post_trip'],
      [line.archived, 'post_trip', 'archived'],
    ] as const;
    for (const [boundary, before, after] of steps) {
      await runTripLifecycle(world.harness.pool, justBefore(boundary));
      expect(await world.status(tripId), `before ${boundary}`).toBe(before);
      await runTripLifecycle(world.harness.pool, at(boundary));
      expect(await world.status(tripId), `at ${boundary}`).toBe(after);
    }
    expect(await world.moves(tripId)).toEqual([
      'confirmed->pre_trip',
      'pre_trip->in_trip',
      'in_trip->post_trip',
      'post_trip->archived',
    ]);
  });

  it('moves a trip confirmed inside the fortnight straight to pre-trip, and a rerun does nothing', async () => {
    const tripId = await world.trip({
      status: 'confirmed',
      start: '2026-10-02',
      end: '2026-10-04',
    });
    const now = at('2026-10-01T00:30:00Z');
    await runTripLifecycle(world.harness.pool, now);
    expect(await world.status(tripId)).toBe('pre_trip');
    const again = await runTripLifecycle(world.harness.pool, now);
    expect(Object.values(again).every((moved) => moved === 0)).toBe(true);
    expect(await world.moves(tripId)).toEqual(['confirmed->pre_trip']);
  });

  it('catches a trip that fell behind up in one run, one event per step', async () => {
    const tripId = await world.trip({
      status: 'confirmed',
      start: '2026-10-02',
      end: '2026-10-04',
    });
    await runTripLifecycle(world.harness.pool, at('2026-10-03T00:00:00Z'));
    expect(await world.status(tripId)).toBe('in_trip');
    expect(await world.moves(tripId)).toEqual(['confirmed->pre_trip', 'pre_trip->in_trip']);
  });

  it('leaves a proposed trip to the reply-by job and the organiser’s lock', async () => {
    const dates = { start: '2026-12-10', end: '2026-12-12' };
    const due = await world.trip({
      status: 'proposed',
      ...dates,
      rsvps: ['in', 'in', 'unopened'],
    });
    await world.q(
      `INSERT INTO proposals (trip_id, created_by, reply_by, status, sent_at)
       VALUES ($1, $2, $3, 'sent', $3::timestamptz - interval '3 days')`,
      [due, world.members[0], '2026-10-01T00:00:00Z'],
    );
    await runTripLifecycle(world.harness.pool, at('2026-10-01T00:00:00Z'));
    expect(await world.status(due)).toBe('proposed');
    expect(await world.moves(due)).toEqual([]);
  });

  it('never touches voting, setup-stage, cancelled or archived trips', async () => {
    const dates = { start: '2026-01-02', end: '2026-01-04' };
    const untouched = {
      voting: await world.trip({ status: 'voting', ...dates }),
      setup: await world.trip({ status: 'setup', ...dates }),
      draft_review: await world.trip({ status: 'draft_review', ...dates }),
      cancelled: await world.trip({ status: 'cancelled', ...dates }),
      archived: await world.trip({ status: 'archived', ...dates }),
    };
    await runTripLifecycle(world.harness.pool, at('2027-01-01T00:00:00Z'));
    for (const [status, tripId] of Object.entries(untouched)) {
      expect(await world.status(tripId), status).toBe(status);
      expect(await world.moves(tripId), status).toEqual([]);
    }
  });
});
