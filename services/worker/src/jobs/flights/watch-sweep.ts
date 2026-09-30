/**
 * `flight.watch_sweep` (hourly): watches past their end (a day after landing, or two after the
 * scheduled arrival) are closed, and their AeroAPI alerts deleted so they stop costing.
 */
import { withSystem } from '@cp/db';
import { BOOKINGS_QUEUES } from '@cp/domain';
import type { AeroApiClient } from '@cp/suppliers';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

const sweepSchema = z.object({}).passthrough();

export function watchSweepJob(
  aero: AeroApiClient | undefined,
): JobDefinition<z.infer<typeof sweepSchema>> {
  return defineJob({
    queue: BOOKINGS_QUEUES.watchSweep,
    schema: sweepSchema,
    handler: async (_data, ctx) => {
      const due = await withSystem(ctx.pool, async (tx) => {
        const { rows } = await tx.query<{
          id: string;
          provider: string;
          provider_alert_id: string;
        }>(
          `SELECT id, provider, provider_alert_id FROM flight_watches
            WHERE ended_at IS NULL AND active_until < now() ORDER BY active_until LIMIT 200`,
        );
        return rows;
      });
      let ended = 0;
      for (const watch of due) {
        if (watch.provider === 'flightaware' && aero !== undefined) {
          const shared = await withSystem(ctx.pool, (tx) =>
            tx.query(
              `SELECT 1 FROM flight_watches WHERE provider_alert_id = $1 AND provider = 'flightaware'
                  AND ended_at IS NULL AND active_until >= now()`,
              [watch.provider_alert_id],
            ),
          );
          if ((shared.rowCount ?? 0) === 0) await aero.deleteAlert(watch.provider_alert_id);
        }
        await withSystem(ctx.pool, (tx) =>
          tx.query('UPDATE flight_watches SET ended_at = now() WHERE id = $1', [watch.id]),
        );
        ended += 1;
      }
      return { ended };
    },
  });
}
