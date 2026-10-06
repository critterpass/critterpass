/**
 * The automated check on a crew's tip about its driver (surface `public_text`): a pass shows it on
 * his listing; a doubtful one is held and filed for ops review; a rejected one (a phone number, a
 * link, someone else's personal details) is removed. Registered as the `driver_tip` handler of the
 * `compliance.check` job the api queues when a tip is written.
 */
import { withSystem } from '@cp/db';
import type { ComplianceResult } from '@cp/domain';
import type pg from 'pg';

import { registerComplianceHandler, type ComplianceHandler } from '../../ai/compliance-job';

export const DRIVER_TIP_CONTENT_KIND = 'driver_tip';

const STATUS_BY_OUTCOME: Record<ComplianceResult['outcome'], 'visible' | 'held' | 'removed'> = {
  pass: 'visible',
  review: 'held',
  reject: 'removed',
};

export const driverTipComplianceHandler: ComplianceHandler = {
  surface: 'public_text',
  load: (contentId, pool) =>
    withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{ text: string; author_id: string | null; trip_id: string }>(
        "SELECT text, author_id, trip_id FROM driver_tips WHERE id = $1 AND status = 'pending'",
        [contentId],
      );
      const tip = rows[0];
      return tip === undefined
        ? null
        : { text: tip.text, userId: tip.author_id, tripId: tip.trip_id };
    }),
  apply: (contentId, result, pool) =>
    withSystem(pool, async (tx: pg.PoolClient) => {
      const status = STATUS_BY_OUTCOME[result.outcome];
      await tx.query("UPDATE driver_tips SET status = $2 WHERE id = $1 AND status = 'pending'", [
        contentId,
        status,
      ]);
      if (status === 'held') {
        await tx.query(
          `INSERT INTO moderation_reports (source, target_kind, target_id, reason)
           SELECT 'compliance', $2, $1, $3
            WHERE NOT EXISTS (SELECT 1 FROM moderation_reports
                               WHERE target_kind = $2 AND target_id = $1 AND status = 'open')`,
          [contentId, DRIVER_TIP_CONTENT_KIND, result.flags[0]?.category ?? 'other'],
        );
      }
    }),
};

let registered = false;

export function registerDriverTipCheck(): void {
  if (registered) return;
  registerComplianceHandler(DRIVER_TIP_CONTENT_KIND, driverTipComplianceHandler);
  registered = true;
}
