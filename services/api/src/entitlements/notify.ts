/**
 * Entitlement/usage change fan-out (docs/product-decisions.md §3 "Push invalidation"): recompute
 * writes `rt_outbox` rows on `user:#uid` in the same transaction, never after commit — the worker
 * relay (docs/system-architecture.md §4.3) only ever sees a row once the recompute it belongs to has
 * actually landed.
 */
import { enqueueRealtime } from '@cp/db';
import { userChannel } from '@cp/domain';
import type pg from 'pg';

export async function notifyUserEntitlementChanged(tx: pg.PoolClient, uid: string): Promise<void> {
  await enqueueRealtime(tx, {
    channel: userChannel(uid),
    payload: { type: 'entitlement.changed', scope: 'user' },
  });
}

export interface UsageChangedPayload {
  readonly metric: string;
  readonly used: number;
  readonly limit: number;
  readonly resetAt: string;
}

export async function notifyUsageChanged(
  tx: pg.PoolClient,
  uid: string,
  usage: UsageChangedPayload,
): Promise<void> {
  await enqueueRealtime(tx, {
    channel: userChannel(uid),
    payload: { type: 'usage.changed', ...usage },
  });
}

/** Every active member of `crewId` (docs/data-model.md §2 `app.is_crew_member`): the same audience
 * that can already SELECT `trip_entitlements` for one of that crew's trips, so this never notifies
 * someone who could not see the row that changed. */
export async function crewMemberUids(
  tx: pg.PoolClient,
  crewId: string,
): Promise<readonly string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    "SELECT user_id FROM crew_members WHERE crew_id = $1 AND status = 'active'",
    [crewId],
  );
  return rows.map((row) => row.user_id);
}

/** "recompute -> rt_outbox entitlement.changed on user:#uid (and per member for trip scope)": one
 * outbox row per member, not a single trip-channel broadcast — there is no trip-scoped realtime
 * namespace for entitlement changes (docs/api-contracts-async.md §1.2 carries it only on `user:#uid`). */
export async function notifyTripEntitlementChanged(
  tx: pg.PoolClient,
  memberUids: readonly string[],
): Promise<void> {
  for (const uid of memberUids) {
    // Sequential, not Promise.all: every row must be written in this same transaction, in order.
    await notifyUserEntitlementChanged(tx, uid);
  }
}
