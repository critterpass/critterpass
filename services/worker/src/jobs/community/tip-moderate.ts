/**
 * Tips for the next crew through the `compliance.check` job (content kind `rating_tip`): a tip
 * that passes is published on its place as an anonymous community tip ("a crew in Oct 2026",
 * never the author); one held for review waits in the ops queue; a rejected one is marked so the
 * Rate the trip card can say so gently.
 */
import { withSystem } from '@cp/db';
import type { ComplianceResult } from '@cp/domain';
import type pg from 'pg';

import { registerComplianceHandler, type ComplianceHandler } from '../../ai/compliance-job';

export const RATING_TIP_CONTENT_KIND = 'rating_tip';

export async function publishRatingTip(tx: pg.PoolClient, ratingId: string): Promise<void> {
  const { rows } = await tx.query<{
    poi_id: string;
    tip: string | null;
    place_tip_id: string | null;
  }>('SELECT poi_id, tip, place_tip_id FROM ratings WHERE id = $1 FOR UPDATE', [ratingId]);
  const rating = rows[0];
  if (rating?.tip == null) return;
  if (rating.place_tip_id === null) {
    const { rows: inserted } = await tx.query<{ id: string }>(
      `INSERT INTO place_tips (poi_id, text, source, moderation_status)
       VALUES ($1, $2, 'community', 'approved') RETURNING id`,
      [rating.poi_id, rating.tip],
    );
    await tx.query('UPDATE ratings SET place_tip_id = $2 WHERE id = $1', [
      ratingId,
      inserted[0]!.id,
    ]);
  } else {
    await tx.query("UPDATE place_tips SET moderation_status = 'approved' WHERE id = $1", [
      rating.place_tip_id,
    ]);
  }
  await tx.query("UPDATE ratings SET tip_status = 'approved' WHERE id = $1", [ratingId]);
}

export async function applyTipVerdict(
  pool: pg.Pool,
  ratingId: string,
  result: ComplianceResult,
): Promise<void> {
  await withSystem(pool, async (tx) => {
    if (result.outcome === 'pass') {
      await publishRatingTip(tx, ratingId);
      return;
    }
    if (result.outcome === 'reject') {
      await tx.query(
        "UPDATE ratings SET tip_status = 'rejected' WHERE id = $1 AND tip IS NOT NULL",
        [ratingId],
      );
      return;
    }
    await tx.query("UPDATE ratings SET tip_status = 'review' WHERE id = $1 AND tip IS NOT NULL", [
      ratingId,
    ]);
    const reason = result.flags.map((flag) => flag.category).join(', ') || 'compliance';
    await tx.query(
      `INSERT INTO moderation_reports (source, target_kind, target_id, reason)
       SELECT 'compliance', $2, $1, $3
        WHERE NOT EXISTS (SELECT 1 FROM moderation_reports
                           WHERE target_kind = $2 AND target_id = $1 AND status = 'open')`,
      [ratingId, RATING_TIP_CONTENT_KIND, reason.slice(0, 500)],
    );
  });
}

export const ratingTipComplianceHandler: ComplianceHandler = {
  surface: 'public_text',
  async load(contentId, pool) {
    const { rows } = await withSystem(pool, (tx) =>
      tx.query<{ tip: string | null; user_id: string; trip_id: string; tip_status: string }>(
        'SELECT tip, user_id, trip_id, tip_status FROM ratings WHERE id = $1',
        [contentId],
      ),
    );
    const row = rows[0];
    if (row?.tip == null || row.tip_status !== 'pending') return null;
    return { text: row.tip, userId: row.user_id, tripId: row.trip_id };
  },
  apply: (contentId, result, pool) => applyTipVerdict(pool, contentId, result),
};

let registered = false;

export function registerRatingTipModeration(): void {
  if (registered) return;
  registered = true;
  registerComplianceHandler(RATING_TIP_CONTENT_KIND, ratingTipComplianceHandler);
}
