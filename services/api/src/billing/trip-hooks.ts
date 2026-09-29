/**
 * How billing follows the trip (same transaction as the event): new dates move every boost and
 * first-trip-free window on the trip before anything recomputes the trip's perks; a trip entering
 * setup queues its first-trip-free check; a cancelled trip queues the move of its boost.
 */
import { sendInTx, type AppendedDomainEvent } from '@cp/db';
import { BILLING_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { asServer } from './as-server';
import { followTripDates } from './boost-lifecycle';

export async function billingTripHook(
  tx: pg.PoolClient,
  event: AppendedDomainEvent,
): Promise<void> {
  if (event.tripId === null) return;
  const tripId = event.tripId;
  if (event.type === 'trip.dates_changed') {
    await asServer(tx, () => followTripDates(tx, tripId, new Date()));
    return;
  }
  if (event.type !== 'trip.status_changed') return;
  // The status the trip just moved to, as this transaction sees it.
  const to = await asServer(tx, async () => {
    const { rows } = await tx.query<{ status: string }>('SELECT status FROM trips WHERE id = $1', [
      tripId,
    ]);
    return rows[0]?.status;
  });
  if (to === 'setup') {
    await sendInTx(tx, BILLING_QUEUES.ftfGrant, { trip_id: tripId }, { singletonKey: tripId });
  } else if (to === 'cancelled') {
    await sendInTx(tx, BILLING_QUEUES.tripChanged, { trip_id: tripId }, { singletonKey: tripId });
  }
}
