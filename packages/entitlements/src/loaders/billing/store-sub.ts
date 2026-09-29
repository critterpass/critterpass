/**
 * Pass+ from the user's own subscriptions: a store subscription as the server last verified it,
 * and Pass+ time we granted ourselves (gift or promo rows). Play's account hold resolves like the
 * App Store's billing retry: Pass+ only until the server grace ends.
 */
import type { CodeGrantSource, StoreSubSource, SubscriptionStatus } from '../../sources';
import { iso, type RunQuery } from './query';

interface Row {
  readonly platform: string;
  readonly status: string;
  readonly period_end: Date | null;
  readonly grace_ends_at: Date | null;
}

export async function loadStoreSubSources(
  run: RunQuery,
  uid: string,
): Promise<(StoreSubSource | CodeGrantSource)[]> {
  const rows = await run<Row>(
    `SELECT platform, status, period_end, grace_ends_at FROM subscriptions
      WHERE user_id = $1 AND product_key IN ('pass_monthly', 'pass_yearly', 'gift_pass_3m')
        AND status NOT IN ('expired', 'revoked')`,
    [uid],
  );
  return rows.map((row) => {
    if (row.platform === 'promo' || row.platform === 'gift') {
      return { kind: 'code_grant', expiresAt: iso(row.period_end ?? new Date(0)) };
    }
    const status: SubscriptionStatus =
      row.status === 'on_hold' ? 'billing_retry' : (row.status as SubscriptionStatus);
    return {
      kind: 'store_sub',
      status,
      currentPeriodEnd: iso(row.period_end ?? new Date(0)),
      ...(row.grace_ends_at === null ? {} : { graceEndsAt: iso(row.grace_ends_at) }),
    };
  });
}
