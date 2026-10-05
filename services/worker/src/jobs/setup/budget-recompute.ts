/**
 * `setup.budget_recompute` (docs/api-contracts-async.md §2.2, doc delta): the crew-level budget row
 * from the current setup members' maxes, read as the server and never written anywhere else. It is
 * debounced so one change cannot be diffed out of the band: it recomputes once two submissions are
 * pending or the oldest has waited ten minutes (a timer brings it back then), and at once when a
 * member left (`force`: the minimum-k check cannot wait). The crew hears the count and, from four
 * maxes, the band; the job's own output is counts only.
 */
import {
  bandStepMinor,
  budgetAggregate,
  budgetEstimates,
  crewFeasibleLow,
  type BudgetEstimateSource,
} from '@cp/cost-engine';
import { outbox, scheduleEvent, scheduledJobDataSchema, withSystem } from '@cp/db';
import {
  BUDGET_RECOMPUTE_DEBOUNCE_MINUTES,
  BUDGET_RECOMPUTE_MIN_SUBMISSIONS,
  channelName,
  SETUP_QUEUES,
  SETUP_RT,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';

export const budgetRecomputeSchema = z.union([
  z.object({ trip_id: z.uuid(), force: z.boolean().default(false) }),
  scheduledJobDataSchema.transform((timer) => ({ trip_id: timer.ref_id, force: false })),
]);
export type BudgetRecomputeJob = z.output<typeof budgetRecomputeSchema>;

export type BudgetRecomputeOutcome =
  | { readonly outcome: 'recomputed'; readonly maxes: number; readonly banded: boolean }
  | { readonly outcome: 'waiting' | 'nothing_pending' | 'missing' };

export async function recomputeBudget(
  pool: pg.Pool,
  tripId: string,
  force: boolean,
  now: Date = new Date(),
): Promise<BudgetRecomputeOutcome> {
  return withSystem(pool, async (tx) => {
    const trip = await tx.query<{ status: string; tz: string | null }>(
      `SELECT t.status, coalesce(t.tz, d.tz) AS tz
         FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE t.id = $1 FOR UPDATE OF t`,
      [tripId],
    );
    if (trip.rows[0] === undefined) return { outcome: 'missing' };
    const aggregate = await tx.query<{ computed_at: Date | null }>(
      'SELECT computed_at FROM trip_budget_aggregates WHERE trip_id = $1',
      [tripId],
    );
    const computedAt = aggregate.rows[0]?.computed_at ?? null;
    const maxes = await tx.query<{ amount_trip_minor: string; updated_at: Date }>(
      `SELECT amount_trip_minor, updated_at FROM budget_max_private
        WHERE trip_id = $1 AND user_id IN (SELECT app.setup_member_ids($1))`,
      [tripId],
    );
    if (!force) {
      const pending = maxes.rows
        .filter((row) => computedAt === null || row.updated_at > computedAt)
        .map((row) => row.updated_at.getTime())
        .sort((a, b) => a - b);
      const oldest = pending[0];
      if (oldest === undefined) return { outcome: 'nothing_pending' };
      const due = oldest + BUDGET_RECOMPUTE_DEBOUNCE_MINUTES * 60_000;
      if (pending.length < BUDGET_RECOMPUTE_MIN_SUBMISSIONS && due > now.getTime()) {
        await scheduleEvent(tx, {
          kind: SETUP_QUEUES.budgetRecompute,
          refId: tripId,
          slot: 'debounce',
          tz: trip.rows[0].tz ?? 'UTC',
          at: new Date(due),
        });
        return { outcome: 'waiting' };
      }
    }
    const inputs = await tx.query<{ inputs: BudgetEstimateSource }>(
      'SELECT app.setup_budget_inputs($1) AS inputs',
      [tripId],
    );
    const source = inputs.rows[0]?.inputs;
    if (source === undefined) return { outcome: 'missing' };
    const estimates = budgetEstimates(source);
    // The crew currency's own step, or the round amount nearest $50. A currency with neither a
    // step of its own nor a rate has no step, and so no band: never a dollar-sized grid.
    let step: bigint | null;
    try {
      step = bandStepMinor(estimates.currency, estimates.fx);
    } catch {
      step = estimates.currency === 'USD' ? bandStepMinor('USD') : null;
    }
    const members = await tx.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM app.setup_member_ids($1)',
      [tripId],
    );
    const counted = {
      memberCount: members.rows[0]?.n ?? 0,
      currency: estimates.currency,
      feasibleLow: crewFeasibleLow(estimates),
      seed: tripId,
    };
    const row =
      step === null
        ? // Counts only, as below four maxes.
          {
            ...budgetAggregate({ ...counted, maxes: [], stepMinor: 1n }),
            maxesCount: maxes.rows.length,
          }
        : budgetAggregate({
            ...counted,
            maxes: maxes.rows.map((m) => BigInt(m.amount_trip_minor)),
            stepMinor: step,
          });
    const text = (value: bigint | null) => (value === null ? null : value.toString());
    await tx.query(
      `INSERT INTO trip_budget_aggregates AS a (trip_id, currency, maxes_count, member_count,
         band_low_minor, band_high_minor, step_minor, track_high_minor, bucketed_dots, under_all_ok,
         infeasible, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (trip_id) DO UPDATE SET
         currency = EXCLUDED.currency, maxes_count = EXCLUDED.maxes_count,
         member_count = EXCLUDED.member_count, band_low_minor = EXCLUDED.band_low_minor,
         band_high_minor = EXCLUDED.band_high_minor, step_minor = EXCLUDED.step_minor,
         track_high_minor = EXCLUDED.track_high_minor, bucketed_dots = EXCLUDED.bucketed_dots,
         under_all_ok = EXCLUDED.under_all_ok, infeasible = EXCLUDED.infeasible,
         computed_at = EXCLUDED.computed_at`,
      [
        tripId,
        row.currency,
        row.maxesCount,
        row.memberCount,
        text(row.bandLowMinor),
        text(row.bandHighMinor),
        text(row.stepMinor),
        text(row.trackHighMinor),
        row.dots === null ? null : JSON.stringify(row.dots),
        row.underAllOk,
        row.infeasible,
      ],
    );
    const banded = row.bandHighMinor !== null || row.infeasible === true;
    await outbox(tx, channelName('trip_setup', tripId), SETUP_RT.budgetBand, {
      maxes_count: row.maxesCount,
      of: row.memberCount,
      ...(banded
        ? {
            band:
              row.bandHighMinor === null
                ? null
                : {
                    low_minor: Number(row.bandLowMinor),
                    high_minor: Number(row.bandHighMinor),
                    currency: row.currency,
                  },
            infeasible: row.infeasible === true,
          }
        : {}),
    });
    return { outcome: 'recomputed', maxes: row.maxesCount, banded };
  });
}

export function budgetRecomputeJob(): JobDefinition<BudgetRecomputeJob> {
  return defineJob({
    queue: SETUP_QUEUES.budgetRecompute,
    schema: budgetRecomputeSchema,
    singletonKey: (data) => data.trip_id,
    handler: async (data, ctx) => ({
      ...(await recomputeBudget(ctx.pool, data.trip_id, data.force)),
    }),
  });
}
