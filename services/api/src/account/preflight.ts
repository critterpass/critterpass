/**
 * `GET /v1/me/deletion/preflight` (3n-9, docs/api-contracts.md §5.5): what goes with the account and
 * what the crew keeps, with real counts; balances per crew; open trips the user organises and who
 * takes over; an active trip; Boost IOUs; where Pass+ is billed (deleting never cancels a store
 * subscription). Counts for areas a later feature owns read zero until its table exists.
 */
import type { DeletionPreflight, SubscriptionSource } from '@cp/domain';
import type pg from 'pg';

import { crewBalances } from './balances';
import { organisedTrips } from './organiser-transfer';

async function countIfPresent(
  tx: pg.PoolClient,
  table: string,
  sql: string,
  uid: string,
): Promise<number> {
  const { rows } = await tx.query<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [`public.${table}`],
  );
  if (rows[0]?.present !== true) return 0;
  const counted = await tx.query<{ n: number }>(sql, [uid]);
  return counted.rows[0]?.n ?? 0;
}

const ACTIVE_SUBSCRIPTION_STATUSES = [
  'active',
  'grace',
  'billing_retry',
  'on_hold',
  'paused',
  'cancelled_active',
];

function subscriptionSource(platform: string | undefined): SubscriptionSource {
  if (platform === 'app_store' || platform === 'play') return platform;
  if (platform === 'gift' || platform === 'promo') return 'gift';
  return 'none';
}

export async function loadDeletionPreflight(
  tx: pg.PoolClient,
  uid: string,
): Promise<DeletionPreflight> {
  const { rows: identity } = await tx.query<{ has: boolean }>(
    'SELECT app.account_has_identity($1) AS has',
    [uid],
  );
  const count = (table: string, sql: string) => countIfPresent(tx, table, sql, uid);
  const [critters, stamps, uploads, messages, plans, expenses] = await Promise.all([
    count(
      'collection_entries',
      'SELECT count(DISTINCT form_id)::int AS n FROM collection_entries WHERE user_id = $1',
    ),
    count('stamps', 'SELECT count(*)::int AS n FROM stamps WHERE user_id = $1'),
    count('media_objects', 'SELECT count(*)::int AS n FROM media_objects WHERE owner_id = $1'),
    count(
      'messages',
      'SELECT count(*)::int AS n FROM messages WHERE sender_id = $1 AND deleted_at IS NULL',
    ),
    count('change_sets', 'SELECT count(*)::int AS n FROM change_sets WHERE author_id = $1'),
    count(
      'expenses',
      'SELECT count(*)::int AS n FROM expenses WHERE created_by = $1 AND deleted_at IS NULL',
    ),
  ]);

  const balances = await crewBalances(tx, uid);
  const organised = await organisedTrips(tx, uid);
  const { rows: active } = await tx.query<{ trip_id: string; trip_name: string | null }>(
    `SELECT t.id AS trip_id, d.name AS trip_name FROM trip_participants p
       JOIN trips t ON t.id = p.trip_id LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE p.user_id = $1 AND p.rsvp = 'in' AND t.status = 'in_trip'
      ORDER BY t.created_at LIMIT 1`,
    [uid],
  );
  const { rows: ious } = await tx.query<{ n: number }>(
    `SELECT count(DISTINCT l.source_id)::int AS n FROM ledger_entries l
      WHERE l.source_kind = 'boost_iou' AND l.debtor_id = $1
        AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_id = l.id)`,
    [uid],
  );
  const { rows: subs } = await tx.query<{ platform: string; period_end: Date | null }>(
    `SELECT platform, period_end FROM subscriptions
      WHERE user_id = $1 AND status = ANY ($2::text[])
      ORDER BY period_end DESC NULLS LAST LIMIT 1`,
    [uid, ACTIVE_SUBSCRIPTION_STATUSES],
  );
  const { rows: open } = await tx.query<{ requested_at: Date; purge_at: Date }>(
    `SELECT requested_at, purge_at FROM account_deletions
      WHERE user_id = $1 AND restored_at IS NULL AND purged_at IS NULL`,
    [uid],
  );

  const sub = subs[0];
  const pending = open[0];
  const trip = active[0];
  return {
    anonymous: identity[0]?.has !== true,
    goes: { critters, stamps, uploads, messages },
    crew_keeps: { plans, expenses },
    balances: balances.map((balance) => ({
      crew_id: balance.crewId,
      crew_name: balance.crewName,
      direction: balance.netMinor > 0 ? 'owed_to_you' : 'you_owe',
      amount_minor: Math.abs(balance.netMinor),
      currency: balance.currency,
    })),
    organiser_roles: organised.map((entry) => ({
      trip_id: entry.tripId,
      crew_id: entry.crewId,
      trip_name: entry.tripName,
      transfer_to: entry.transferTo,
      sole_member: entry.soleMember,
    })),
    active_trip: trip === undefined ? null : { trip_id: trip.trip_id, trip_name: trip.trip_name },
    boost_ious: ious[0]?.n ?? 0,
    subscription: {
      source: subscriptionSource(sub?.platform),
      active: sub !== undefined,
      expires_at: sub?.period_end?.toISOString() ?? null,
    },
    open_deletion:
      pending === undefined
        ? null
        : {
            requested_at: pending.requested_at.toISOString(),
            purge_at: pending.purge_at.toISOString(),
          },
  };
}
