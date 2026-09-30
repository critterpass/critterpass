/**
 * Boost realtime hints (docs/api-contracts-async.md §1.2): `boost.state` on `trip:` and `crew:` when
 * a boost starts, ends, moves or is revoked, and `boost.intent_lock` on `trip:` while a member is
 * buying one ("{name} is boosting…"; `until` null once released). Ids only; the rows sync.
 */
import { outbox } from '@cp/db';
import { BILLING_RT, crewChannel, tripChannel, type TripBoostState } from '@cp/domain';
import type pg from 'pg';

export async function publishBoostState(
  tx: pg.PoolClient,
  boost: { readonly id: string; readonly tripId: string; readonly crewId: string },
  status: TripBoostState,
): Promise<void> {
  const data = { trip_id: boost.tripId, boost_id: boost.id, status };
  await outbox(tx, tripChannel(boost.tripId), BILLING_RT.boostState, data);
  await outbox(tx, crewChannel(boost.crewId), BILLING_RT.boostState, data);
}

export async function publishIntentLock(
  tx: pg.PoolClient,
  tripId: string,
  lock: { readonly intentId: string; readonly byUid: string; readonly until: Date | null },
): Promise<void> {
  await outbox(tx, tripChannel(tripId), BILLING_RT.intentLock, {
    intent_id: lock.intentId,
    by_uid: lock.byUid,
    until: lock.until?.toISOString() ?? null,
  });
}
