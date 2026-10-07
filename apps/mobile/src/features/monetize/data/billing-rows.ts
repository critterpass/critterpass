/**
 * The synced rows the monetization screens read, all local (so every screen opens with no signal):
 * the person's subscriptions and resolved entitlements, the server's perk and product lists, and
 * the boosts of their trips. The server writes every one of them; the app only reads.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import {
  PRODUCT_KEYS,
  storeIdsSchema,
  SUBSCRIPTION_STATES,
  type BillingPlatform,
  type ProductKey,
  type StoreIds,
  type SubscriptionState,
} from '@cp/domain';
import { PERK_TIERS, type Perk, type PerkTier } from '@cp/entitlements';

export const OWNER_SQL = 'SELECT value FROM local_state WHERE id = ?';
export const OWNER_TABLES = ['local_state'];

export const ME_SQL = 'SELECT display_name FROM users WHERE id = ?';
export const ME_TABLES = ['users'];

export const SUBSCRIPTIONS_SQL = `SELECT id, platform, product_key, status, auto_renew, period_end,
    grace_ends_at, paused_from, resume_at
  FROM subscriptions WHERE user_id = ? ORDER BY updated_at DESC`;
export const SUBSCRIPTIONS_TABLES = ['subscriptions'];

export interface SubscriptionRow {
  readonly id: string;
  readonly platform: string;
  readonly product_key: string;
  readonly status: string;
  readonly auto_renew: number | null;
  readonly period_end: string | null;
  readonly grace_ends_at: string | null;
  readonly paused_from: string | null;
  readonly resume_at: string | null;
}

export interface Subscription {
  readonly id: string;
  readonly platform: BillingPlatform;
  readonly productKey: ProductKey;
  readonly status: SubscriptionState;
  readonly autoRenew: boolean;
  readonly periodEnd: string | null;
  readonly graceEndsAt: string | null;
  readonly resumeAt: string | null;
}

const PLATFORMS: readonly string[] = ['app_store', 'play', 'promo', 'gift'];

/** A row this build understands; anything else (a newer state or product) is left out. */
export function subscriptionFromRow(row: SubscriptionRow): Subscription | null {
  if (!PLATFORMS.includes(row.platform)) return null;
  if (!(PRODUCT_KEYS as readonly string[]).includes(row.product_key)) return null;
  if (!(SUBSCRIPTION_STATES as readonly string[]).includes(row.status)) return null;
  return {
    id: row.id,
    platform: row.platform as BillingPlatform,
    productKey: row.product_key as ProductKey,
    status: row.status as SubscriptionState,
    autoRenew: row.auto_renew !== 0,
    periodEnd: row.period_end,
    graceEndsAt: row.grace_ends_at,
    resumeAt: row.resume_at,
  };
}

export const ENTITLEMENT_SQL =
  'SELECT pass_plus, expires_at FROM user_entitlements WHERE user_id = ?';
export const ENTITLEMENT_TABLES = ['user_entitlements'];

export interface EntitlementRow {
  readonly pass_plus: number | null;
  readonly expires_at: string | null;
}

export const PERKS_SQL = 'SELECT key, tier, copy_key, is_shipped, sort FROM perks';
export const PERKS_TABLES = ['perks'];

export interface PerkRow {
  readonly key: string;
  readonly tier: string;
  readonly copy_key: string;
  readonly is_shipped: number | null;
  readonly sort: number | null;
}

export function perkFromRow(row: PerkRow): Perk | null {
  if (!(PERK_TIERS as readonly string[]).includes(row.tier)) return null;
  return {
    key: row.key,
    tier: row.tier as PerkTier,
    copyKey: row.copy_key,
    enabled: row.is_shipped === 1,
    sort: row.sort ?? 0,
  };
}

export const PRODUCTS_SQL = 'SELECT key, store_ids FROM products';
export const PRODUCTS_TABLES = ['products'];

export interface ProductRow {
  readonly key: string;
  readonly store_ids: string | null;
}

export function catalogueFromRows(
  rows: readonly ProductRow[],
): { readonly key: ProductKey; readonly storeIds: StoreIds }[] {
  return rows.flatMap((row) => {
    if (!(PRODUCT_KEYS as readonly string[]).includes(row.key)) return [];
    try {
      const parsed = storeIdsSchema.safeParse(JSON.parse(row.store_ids ?? '{}'));
      return parsed.success ? [{ key: row.key as ProductKey, storeIds: parsed.data }] : [];
    } catch {
      return [];
    }
  });
}

const OWING = `FROM expenses e JOIN expense_shares s ON s.expense_id = e.id
  WHERE e.boost_id = b.id AND e.deleted_at IS NULL AND s.user_id <> b.buyer_id
    AND s.computed_minor > 0`;
/** What a member is owed minus what they owe on the trip, a marked-paid payment counted as made. */
const NET = `(SELECT coalesce(sum(CASE WHEN l.creditor_id = s.user_id THEN l.amount_minor
        ELSE -l.amount_minor END), 0) FROM ledger_entries l
      WHERE l.trip_id = b.trip_id AND l.currency = e.crew_currency
        AND (l.creditor_id = s.user_id OR l.debtor_id = s.user_id))
    + (SELECT coalesce(sum(CASE WHEN p.from_id = s.user_id THEN p.amount_minor
        ELSE -p.amount_minor END), 0) FROM payments p
      WHERE p.trip_id = b.trip_id AND p.status = 'marked_paid' AND p.currency = e.crew_currency
        AND (p.from_id = s.user_id OR p.to_id = s.user_id))`;
/**
 * `owing`: crewmates with a share of the split. `settled`: those whose IOU for it is in the ledger
 * and who owe nothing on the trip any more (balances are netted, so a payment is never tied to
 * one expense; the crew's boost card counts the same way).
 */
export const BOOSTS_SQL = `SELECT b.id, b.trip_id, b.source, b.status, b.ends_at, b.buyer_id,
    b.split_mode, d.name AS destination, c.name AS crew,
    (SELECT count(*) ${OWING}) AS owing,
    (SELECT count(*) ${OWING}
      AND EXISTS (SELECT 1 FROM ledger_entries i WHERE i.source_kind = 'boost_iou'
        AND i.source_id = e.id AND i.debtor_id = s.user_id AND i.creditor_id = b.buyer_id)
      AND ${NET} >= 0) AS settled
  FROM trip_boosts b
  LEFT JOIN trips t ON t.id = b.trip_id
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN crews c ON c.id = b.crew_id
  WHERE b.status IN ('scheduled', 'active', 'ended')
  ORDER BY b.created_at DESC LIMIT 20`;
export const BOOSTS_TABLES = [
  'trip_boosts',
  'trips',
  'destinations',
  'crews',
  'expenses',
  'expense_shares',
  'ledger_entries',
  'payments',
];

export interface BoostRow {
  readonly id: string;
  readonly trip_id: string;
  readonly source: string;
  readonly status: string;
  readonly ends_at: string | null;
  readonly buyer_id: string | null;
  readonly split_mode: string | null;
  readonly destination: string | null;
  readonly crew: string | null;
  readonly owing: number | null;
  readonly settled: number | null;
}

export const TRIP_SQL = `SELECT t.id, t.crew_id, t.status, t.start_date, t.end_date, t.is_solo,
    d.name AS destination, c.name AS crew, e.boost_active
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN crews c ON c.id = t.crew_id
  LEFT JOIN trip_entitlements e ON e.trip_id = t.id
  WHERE t.id = ?`;
export const TRIP_TABLES = ['trips', 'destinations', 'crews', 'trip_entitlements'];

export interface TripRow {
  readonly id: string;
  readonly crew_id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly is_solo: number | null;
  readonly destination: string | null;
  readonly crew: string | null;
  readonly boost_active: number | null;
}

/** Seated members of a trip (RSVP not out), in crew join order. */
export const SEATED_SQL = `SELECT p.user_id, u.display_name
  FROM trip_participants p
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.trip_id = ? AND p.rsvp <> 'out'
  ORDER BY p.created_at, p.user_id`;
export const SEATED_TABLES = ['trip_participants', 'users'];

export interface SeatedRow {
  readonly user_id: string;
  readonly display_name: string | null;
}

/** Someone else's live boost lock on the trip. */
export const LOCK_SQL = `SELECT i.buyer_id, i.expires_at, u.display_name
  FROM boost_intents i LEFT JOIN users u ON u.id = i.buyer_id
  WHERE i.trip_id = ? AND i.status IN ('open', 'purchasing')`;
export const LOCK_TABLES = ['boost_intents', 'users'];

export interface LockRow {
  readonly buyer_id: string;
  readonly expires_at: string;
  readonly display_name: string | null;
}
