/**
 * The server's billing grace (docs/product-decisions.md §3 lifecycle overlays: "billing grace 7 d
 * server-side on both stores"), configurable as `ops_config billing.grace_days`. A lapsed
 * subscription keeps Pass+ until `grace_ends_at`; the reconcile sweep moves anything past its
 * grace on, even when no store event arrives.
 */
import type pg from 'pg';

export const DEFAULT_GRACE_DAYS = 7;
export const GRACE_DAYS_CONFIG_KEY = 'billing.grace_days';

/** The configured grace in days (must run as app_system: `ops` is not app_user's). */
export async function graceDays(tx: pg.PoolClient): Promise<number> {
  const { rows } = await tx.query<{ value: unknown }>(
    'SELECT value FROM ops.ops_config WHERE key = $1',
    [GRACE_DAYS_CONFIG_KEY],
  );
  const value = rows[0]?.value;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 60
    ? value
    : DEFAULT_GRACE_DAYS;
}

/**
 * Subscriptions whose grace has run out while still marked `grace`: the user ids to re-read.
 * A store usually tells us first; this catches the ones it did not.
 */
export async function lapsedGraceUsers(tx: pg.PoolClient, now: Date): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM subscriptions
      WHERE status = 'grace' AND grace_ends_at IS NOT NULL AND grace_ends_at <= $1`,
    [now],
  );
  return rows.map((row) => row.user_id);
}
