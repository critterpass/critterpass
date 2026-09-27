/**
 * A trip fixture (see ./trip-fixture.ts) with one crew-visible 'current' itinerary version on top:
 * two days, one plan item per day. `trips.current_version_id` is pointed at it so
 * `app.apply_change_set`'s staleness check has a real base to compare against.
 */
import type pg from 'pg';

import { withSystem } from '../../src/tx';
import {
  insertItineraryVersion,
  insertPlanDay,
  insertPlanItem,
  type PlanItemRef,
} from './plan-actors';
import { buildTripFixture, type TripFixture } from './trip-fixture';

export interface PlanFixture extends TripFixture {
  readonly versionId: string;
  readonly dayIds: readonly [string, string];
  readonly items: readonly [PlanItemRef, PlanItemRef];
}

export async function buildPlanFixture(pool: pg.Pool): Promise<PlanFixture> {
  const trip = await buildTripFixture(pool);
  return withSystem(pool, async (tx) => {
    const versionId = await insertItineraryVersion(tx, {
      tripId: trip.tripId,
      visibility: 'crew',
      status: 'current',
    });
    const day1 = await insertPlanDay(tx, { versionId, tripId: trip.tripId, dayNo: 1 });
    const day2 = await insertPlanDay(tx, { versionId, tripId: trip.tripId, dayNo: 2 });
    const item1 = await insertPlanItem(tx, {
      versionId,
      dayId: day1,
      tripId: trip.tripId,
      category: 'breakfast',
    });
    const item2 = await insertPlanItem(tx, {
      versionId,
      dayId: day2,
      tripId: trip.tripId,
      category: 'museum',
    });
    await tx.query('UPDATE trips SET current_version_id = $1 WHERE id = $2', [
      versionId,
      trip.tripId,
    ]);
    return { ...trip, versionId, dayIds: [day1, day2], items: [item1, item2] };
  });
}
