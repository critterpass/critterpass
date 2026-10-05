/**
 * What a redraft job does around the guide's day: giving its reservation back when nothing was
 * delivered, and reading the language the organiser who asked reads the plan in.
 */
import { outbox, withSystem } from '@cp/db';
import { channelName, REDRAFT_COUNTER_RT } from '@cp/domain';
import type pg from 'pg';

/** Releases the job's reservation (and its quota unit) and gives the trip back to review. */
export async function release(tx: pg.PoolClient, jobId: string, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ quota_period_key: string | null }>(
    `UPDATE redraft_reservations SET status = 'released', settled_at = now()
      WHERE agent_job_id = $1 AND status = 'reserved' RETURNING quota_period_key`,
    [jobId],
  );
  const key = rows[0]?.quota_period_key ?? null;
  if (key !== null) {
    await tx.query("SELECT app.release_quota('trip', $1, 'redrafts', $2)", [tripId, key]);
  }
  await tx.query(
    "UPDATE trips SET status = 'draft_review' WHERE id = $1 AND status = 'redrafting'",
    [tripId],
  );
  const counter = await tx.query<{ used: number }>(
    `SELECT coalesce((SELECT count FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = $1
                        AND metric = 'redrafts' AND period_key = 'lifetime'), 0)::int AS used`,
    [tripId],
  );
  const limits = await tx.query<{ redraft_limit: number }>(
    'SELECT redraft_limit FROM trip_entitlements WHERE trip_id = $1',
    [tripId],
  );
  const limit = limits.rows[0]?.redraft_limit ?? 3;
  await outbox(tx, channelName('trip', tripId), REDRAFT_COUNTER_RT, {
    used: counter.rows[0]?.used ?? 0,
    limit: limit >= 2_147_483_647 ? null : limit,
  });
}

/** The app language of the organiser who asked, when she set one (else her account's). */
export async function readerLocale(
  pool: pg.Pool,
  userId: string | null,
): Promise<{ locale?: string }> {
  if (userId === null) return {};
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ locale: string | null }>(
      `SELECT coalesce(s.app_locale, u.locale) AS locale
         FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = $1`,
      [userId],
    ),
  );
  const locale = rows[0]?.locale ?? null;
  return locale === null ? {} : { locale };
}
