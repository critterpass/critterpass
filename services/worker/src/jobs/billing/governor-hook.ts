/**
 * The paywall governor on the push path (docs/product-decisions.md §3): a paywall push (the free
 * boost ending, a crew boost card) asks the same `canShowPaywall` the app asks, over the user's
 * own impressions and their local day, before it is composed; a push that goes out is recorded as
 * that day's unsolicited paywall. The router's own paywall-class budget still applies after this.
 */
import { withSystem } from '@cp/db';
import {
  canShowPaywall,
  PAYWALL_ENTRIES,
  type PaywallChannel,
  type PaywallEntryPoint,
  type PaywallImpressionLike,
} from '@cp/domain';
import type pg from 'pg';

import type { NotificationRegistration, RoutedEvent } from '../notify/register';
import { localClock } from '../notify/policy';

interface ImpressionRow {
  readonly entry_point: PaywallEntryPoint;
  readonly trip_id: string | null;
  readonly outcome: PaywallImpressionLike['outcome'];
  readonly governed: boolean;
  readonly local_date: string;
}

/** Whether `entry` may reach `uid` now, and the local day it would count against. */
export async function paywallPushAllowed(
  tx: pg.PoolClient,
  uid: string,
  entry: PaywallEntryPoint,
  tripId: string | null,
  now: Date,
): Promise<{ allowed: boolean; localDate: string }> {
  const { rows: users } = await tx.query<{ tz: string | null }>(
    'SELECT tz FROM users WHERE id = $1',
    [uid],
  );
  const localDate = localClock(now, users[0]?.tz ?? 'UTC').date;
  const { rows } = await tx.query<ImpressionRow>(
    `SELECT entry_point, trip_id, outcome, governed, local_date::text AS local_date
       FROM paywall_impressions
      WHERE user_id = $1 AND (local_date >= $2::date - 1 OR outcome = 'quiet_no')`,
    [uid, localDate],
  );
  const decision = canShowPaywall({
    entry,
    tripId,
    localDate,
    now,
    contexts: [],
    lastErrorAt: null,
    impressions: rows.map((row) => ({
      entryPoint: row.entry_point,
      tripId: row.trip_id,
      outcome: row.outcome,
      governed: row.governed,
      localDate: row.local_date,
    })),
  });
  return { allowed: decision.show, localDate };
}

export async function recordPaywallPush(
  tx: pg.PoolClient,
  input: {
    readonly uid: string;
    readonly entry: PaywallEntryPoint;
    readonly tripId: string | null;
    readonly channel: PaywallChannel;
    readonly localDate: string;
    readonly now: Date;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO paywall_impressions (user_id, trip_id, entry_point, outcome, channel, governed,
       shown_at, local_date)
     VALUES ($1, $2, $3, 'shown', $4, $5, $6, $7)`,
    [
      input.uid,
      input.tripId,
      input.entry,
      input.channel,
      PAYWALL_ENTRIES[input.entry].governed,
      input.now,
      input.localDate,
    ],
  );
}

/**
 * Wraps a notification's `compose` so the governor decides first: a held-back paywall push
 * composes to nothing (the router skips that recipient), a sent one is recorded.
 */
export function governedCompose(
  entry: PaywallEntryPoint,
  channel: PaywallChannel,
  tripOf: (event: RoutedEvent) => string | null,
  compose: NotificationRegistration['compose'],
  now: () => Date = () => new Date(),
): NotificationRegistration['compose'] {
  return async (tx, event, uid) => {
    const tripId = tripOf(event);
    const at = now();
    const gate = await paywallPushAllowed(tx, uid, entry, tripId, at);
    if (!gate.allowed) return null;
    const composed = await compose(tx, event, uid);
    if (composed !== null) {
      await recordPaywallPush(tx, {
        uid,
        entry,
        tripId,
        channel,
        localDate: gate.localDate,
        now: at,
      });
    }
    return composed;
  };
}

/** For callers outside a routing transaction (a scheduled offer, a crew card). */
export function paywallAllowedFor(
  pool: pg.Pool,
  uid: string,
  entry: PaywallEntryPoint,
  tripId: string | null,
) {
  return withSystem(pool, (tx) => paywallPushAllowed(tx, uid, entry, tripId, new Date()));
}
