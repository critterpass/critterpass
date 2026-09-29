/**
 * `billing.reconcile` (daily 05:00 Singapore, docs/api-contracts-async.md §2.3): re-reads from
 * RevenueCat every customer with a live store subscription (or one that lapsed in the last week,
 * or a grace that ran out) and repairs whatever a lost or late webhook left behind. Each customer
 * is its own transaction, so one failure never blocks the rest; running it twice changes nothing
 * the second time. The day's totals land in `ops_config billing.reconcile_last_run` for the
 * console's drift tile.
 */
import { withSystem } from '@cp/db';
import { RECONCILE_STATE_KEY, type ReconcileResult } from '@cp/domain';
import type pg from 'pg';

import { graceDays } from './grace';
import type { RevenueCatClient } from './rc-client';
import { loadCatalogue } from './store-records';
import { syncSubscriber } from './sync-subscriber';

export interface ReconcileDeps {
  readonly pool: pg.Pool;
  readonly revenuecat: RevenueCatClient | undefined;
  readonly now?: () => Date;
  readonly onError?: (error: unknown, uid: string) => void;
}

export interface ReconcileState {
  readonly run_date: string;
  readonly checked: number;
  readonly drifted: number;
  readonly failed: number;
  readonly finished_at: string | null;
}

async function dueUsers(
  pool: pg.Pool,
  after: string | null,
  limit: number,
  now: Date,
): Promise<string[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM subscriptions
        WHERE platform IN ('app_store', 'play')
          AND ($1::uuid IS NULL OR user_id > $1::uuid)
          AND (status NOT IN ('expired', 'revoked')
               OR period_end > $3::timestamptz - interval '7 days'
               OR (grace_ends_at IS NOT NULL AND grace_ends_at > $3::timestamptz - interval '7 days'))
        ORDER BY user_id LIMIT $2`,
      [after, limit, now],
    );
    return rows.map((row) => row.user_id);
  });
}

async function recordRun(pool: pg.Pool, now: Date, batch: ReconcileResult): Promise<void> {
  await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ value: ReconcileState }>(
      'SELECT value FROM ops.ops_config WHERE key = $1 FOR UPDATE',
      [RECONCILE_STATE_KEY],
    );
    const today = now.toISOString().slice(0, 10);
    const previous = rows[0]?.value;
    const carried = previous?.run_date === today && previous.finished_at === null ? previous : null;
    const next: ReconcileState = {
      run_date: today,
      checked: (carried?.checked ?? 0) + batch.checked,
      drifted: (carried?.drifted ?? 0) + batch.drifted,
      failed: (carried?.failed ?? 0) + batch.failed,
      finished_at: batch.next_after_user_id === null ? now.toISOString() : null,
    };
    await tx.query(
      `INSERT INTO ops.ops_config (key, value, is_public) VALUES ($1, $2::jsonb, false)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [RECONCILE_STATE_KEY, JSON.stringify(next)],
    );
  });
}

/** One batch of customers after `afterUserId`; `next_after_user_id` is null once all were seen. */
export async function reconcileBatch(
  deps: ReconcileDeps,
  afterUserId: string | null,
  limit: number,
): Promise<ReconcileResult> {
  const now = (deps.now ?? (() => new Date()))();
  if (deps.revenuecat === undefined) {
    const skipped = { checked: 0, drifted: 0, failed: 0, next_after_user_id: null };
    await recordRun(deps.pool, now, skipped);
    return skipped;
  }
  const users = await dueUsers(deps.pool, afterUserId, limit, now);
  const { days, catalogue } = await withSystem(deps.pool, async (tx) => ({
    days: await graceDays(tx),
    catalogue: await loadCatalogue(tx),
  }));
  let drifted = 0;
  let failed = 0;
  for (const uid of users) {
    try {
      const subscriber = await deps.revenuecat.getSubscriber(uid);
      const outcome = await withSystem(deps.pool, (tx) =>
        syncSubscriber(tx, uid, subscriber, { now, graceDays: days, catalogue }),
      );
      if (outcome.drifted > 0) drifted += 1;
    } catch (error) {
      failed += 1;
      deps.onError?.(error, uid);
    }
  }
  const result: ReconcileResult = {
    checked: users.length,
    drifted,
    failed,
    next_after_user_id: users.length < limit ? null : (users.at(-1) ?? null),
  };
  await recordRun(deps.pool, now, result);
  return result;
}
