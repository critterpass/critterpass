/**
 * `countdown.recompute` against a migrated Postgres. With no `FlightSegmentsSource` registered the
 * target is 00:00 of the trip's first day in the destination zone; once the bookings port knows an
 * outbound flight, a `booking.flight_added` event moves that traveller's target to the departure
 * and leaves everyone else's alone.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import {
  registerFlightSegmentsSource,
  resetFlightSegmentsSourceForTests,
  type DomainEventInput,
  type FlightSegment,
} from '@cp/domain';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildGuidePlan, type GuidePlanFixture } from '../guide-actions/plan-fixture';
import { recomputeCountdowns } from '../../src/jobs/countdown';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let fx: GuidePlanFixture;

async function emit(event: DomainEventInput): Promise<string> {
  return withSystem(harness.pool, async (tx) => (await appendDomainEvent(tx, event)).id);
}

async function targets(): Promise<Record<string, string | null>> {
  const { rows } = await harness.pool.query<{ user_id: string; at: Date | null }>(
    'SELECT user_id, countdown_target_at AS at FROM trip_participants WHERE trip_id = $1',
    [fx.tripId],
  );
  return Object.fromEntries(rows.map((row) => [row.user_id, row.at?.toISOString() ?? null]));
}

beforeAll(async () => {
  harness = await startJobsHarness();
  fx = await buildGuidePlan(harness.pool);
  await harness.pool.query(
    `UPDATE trips SET start_date = '2026-10-12', end_date = '2026-10-19', tz = 'Asia/Makassar'
      WHERE id = $1`,
    [fx.tripId],
  );
}, 240_000);

afterEach(() => resetFlightSegmentsSourceForTests());

afterAll(async () => {
  await harness?.close();
});

describe('recomputeCountdowns', () => {
  it('targets the first day at 00:00 destination time when no flights source is registered', async () => {
    const eventId = await emit({
      type: 'trip.dates_changed',
      aggregateKind: 'trip',
      aggregateId: fx.tripId,
      actorKind: 'user',
      actorId: fx.organiserId,
      payload: { trip_id: fx.tripId },
      tripId: fx.tripId,
      crewId: fx.crewId,
    });
    expect(await recomputeCountdowns(harness.pool, eventId)).toBeGreaterThan(0);
    const all = await targets();
    for (const at of Object.values(all)) expect(at).toBe('2026-10-11T16:00:00.000Z');
    // Nothing moves on a replay.
    expect(await recomputeCountdowns(harness.pool, eventId)).toBe(0);
  });

  it("moves a traveller's target to their outbound departure once a flight is booked", async () => {
    const segments: FlightSegment[] = [
      { userId: fx.rinId, departsAt: '2026-10-11T19:05:00+07:00', direction: 'outbound' },
      { userId: fx.rinId, departsAt: '2026-10-19T12:00:00+08:00', direction: 'return' },
    ];
    const asked: { tripId: string; userIds: readonly string[] }[] = [];
    registerFlightSegmentsSource<pg.PoolClient>((_tx, query) => {
      asked.push(query);
      return Promise.resolve(segments.filter((segment) => query.userIds.includes(segment.userId)));
    });
    const before = await targets();
    const eventId = await emit({
      type: 'booking.flight_added',
      aggregateKind: 'booking',
      aggregateId: fx.tripId,
      actorKind: 'user',
      actorId: fx.rinId,
      payload: { trip_id: fx.tripId, booking_id: fx.tripId, user_ids: [fx.rinId] },
      tripId: fx.tripId,
      crewId: fx.crewId,
    });
    expect(await recomputeCountdowns(harness.pool, eventId)).toBe(1);
    expect(asked).toEqual([{ tripId: fx.tripId, userIds: [fx.rinId] }]);
    const after = await targets();
    expect(after[fx.rinId]).toBe('2026-10-11T12:05:00.000Z');
    expect(after[fx.organiserId]).toBe(before[fx.organiserId]);

    const hints = await harness.pool.query(
      `SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'trip.summary'`,
      [`crew:${fx.crewId}`],
    );
    expect(hints.rowCount).toBeGreaterThan(0);
  });

  it('follows a traveller who changes zone without moving the instant', async () => {
    const before = await targets();
    const eventId = await emit({
      type: 'user.tz_changed',
      aggregateKind: 'user',
      aggregateId: fx.mayaId,
      actorKind: 'user',
      actorId: fx.mayaId,
      payload: { user_id: fx.mayaId, tz: 'Europe/London' },
    });
    await recomputeCountdowns(harness.pool, eventId);
    expect((await targets())[fx.mayaId]).toBe(before[fx.mayaId]);
  });
});
