/**
 * `plan.check.sweep`, hourly: each active trip (planning, before or during the trip) is checked
 * at 06:00 its own time, so forecasts that moved overnight show up by breakfast; and any active
 * trip whose check is missing or behind its current plan is queued now, which is also how existing
 * trips get their first check and idea fits after this ships.
 */
import { withSystem } from '@cp/db';
import { DEFAULT_QUEUE_SPEC } from '@cp/domain';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../../boss';
import { queuePlanCheck } from './hooks';

export const PLAN_CHECK_SWEEP_QUEUE = 'plan.check.sweep';
export const DAILY_CHECK_HOUR = 6;

export async function sweepPlanChecks(
  pool: Parameters<typeof withSystem>[0],
  now: Date,
): Promise<{ daily: number; behind: number }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; daily: boolean; behind: boolean }>(
      `SELECT t.id,
              extract(hour FROM $1::timestamptz AT TIME ZONE coalesce(t.tz, d.tz, 'UTC')) = $2 AS daily,
              (c.trip_id IS NULL OR c.version_id IS DISTINCT FROM t.current_version_id) AS behind
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
         LEFT JOIN plan_checks c ON c.trip_id = t.id
        WHERE t.phase IN ('planning', 'pre', 'in') AND t.current_version_id IS NOT NULL`,
      [now, DAILY_CHECK_HOUR],
    );
    let daily = 0;
    let behind = 0;
    for (const row of rows) {
      if (row.daily) {
        await queuePlanCheck(tx, row.id, 'daily');
        daily += 1;
      } else if (row.behind) {
        await queuePlanCheck(tx, row.id, 'plan');
        behind += 1;
      }
    }
    return { daily, behind };
  });
}

export function planCheckSweepJob(): AnyJobDefinition {
  return defineJob({
    queue: PLAN_CHECK_SWEEP_QUEUE,
    spec: {
      ...DEFAULT_QUEUE_SPEC,
      policy: 'exclusive',
      retryLimit: 1,
      expireInSeconds: 10 * 60,
      cron: { expr: '5 * * * *', tz: 'UTC' },
    },
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger }) {
      const report = await sweepPlanChecks(pool, new Date());
      logger.info(report, 'plan checks swept');
      return report;
    },
  });
}
