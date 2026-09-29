/**
 * `submit_budget_max` / `set_budget_default` (docs/api-contracts.md §4.5). A member's max is
 * write-only: it is converted into the crew currency through the latest FX run and stored as the
 * server; the answer says only that it is set. The crew learns one more max is in (the count, on
 * `trip_setup:` and in `budget.submission_counted`), and the band moves only when the debounced
 * recompute runs (two submissions or ten minutes), so no single change can be diffed out of it.
 * The member's own default max (prefilled into each trip) is theirs alone.
 */
import { convertWith } from '@cp/cost-engine';
import { emitEvent } from '@cp/db';
import {
  DomainError,
  setBudgetDefaultPayloadSchema,
  SETUP_RT,
  submitBudgetMaxPayloadSchema,
  type SubmitBudgetMaxResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { loadBudgetEstimates } from './budget-shared';
import {
  publishSetup,
  queueBudgetRecompute,
  requireSetupMember,
  requireStatus,
  SETUP_OPEN_STATUSES,
} from './shared';

export const submitBudgetMaxCommand = defineCommand({
  name: 'submit_budget_max',
  v: 1,
  schema: submitBudgetMaxPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    requireStatus(await requireSetupMember(tx, payload.trip_id, ctx.uid), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx): Promise<SubmitBudgetMaxResult> => {
    const estimates = await loadBudgetEstimates(tx, payload.trip_id);
    let converted: bigint;
    try {
      converted = convertWith(
        { amountMinor: BigInt(payload.amount_minor), currency: payload.currency },
        estimates.currency,
        estimates.fx,
      ).amountMinor;
    } catch {
      throw new DomainError('VALIDATION', { reason: 'fx_rate_missing' });
    }
    if (converted <= 0n) throw new DomainError('VALIDATION', { reason: 'amount_too_small' });
    const counts = await asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO budget_max_private (trip_id, user_id, amount_minor, currency, amount_trip_minor,
           trip_currency, fx_snapshot_id, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (trip_id, user_id) DO UPDATE
           SET amount_minor = EXCLUDED.amount_minor, currency = EXCLUDED.currency,
               amount_trip_minor = EXCLUDED.amount_trip_minor,
               trip_currency = EXCLUDED.trip_currency, fx_snapshot_id = EXCLUDED.fx_snapshot_id,
               source = EXCLUDED.source`,
        [
          payload.trip_id,
          ctx.uid,
          payload.amount_minor,
          payload.currency,
          converted.toString(),
          estimates.currency,
          payload.currency === estimates.currency ? null : (estimates.fx?.snapshotId ?? null),
          payload.source,
        ],
      );
      const { rows } = await tx.query<{ maxes: number; members: number }>(
        `SELECT (SELECT count(*) FROM budget_max_private b
                  WHERE b.trip_id = $1 AND b.user_id IN (SELECT app.setup_member_ids($1)))::int AS maxes,
                (SELECT count(*) FROM app.setup_member_ids($1))::int AS members`,
        [payload.trip_id],
      );
      const { maxes = 0, members = 0 } = rows[0] ?? {};
      // Count only: the band stays as published until the debounced recompute.
      await tx.query(
        `INSERT INTO trip_budget_aggregates (trip_id, currency, maxes_count, member_count)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (trip_id) DO UPDATE
           SET maxes_count = greatest(trip_budget_aggregates.maxes_count, EXCLUDED.maxes_count),
               member_count = EXCLUDED.member_count`,
        [payload.trip_id, estimates.currency, maxes, members],
      );
      return { maxes, members };
    });
    await publishSetup(tx, payload.trip_id, SETUP_RT.budgetCount, {
      maxes_count: counts.maxes,
      of: counts.members,
    });
    await emitEvent(tx, {
      type: 'budget.submission_counted',
      aggregateKind: 'trip',
      aggregateId: payload.trip_id,
      actorKind: 'user',
      actorId: ctx.uid,
      tripId: payload.trip_id,
      payload: { trip_id: payload.trip_id, maxes_count: counts.maxes },
    });
    await queueBudgetRecompute(tx, payload.trip_id);
    return { trip_id: payload.trip_id, set: true };
  },
});

export const setBudgetDefaultCommand = defineCommand({
  name: 'set_budget_default',
  v: 1,
  schema: setBudgetDefaultPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx) => {
    if (payload.amount_minor === null) {
      await asSystemRole(tx, () =>
        tx.query('DELETE FROM budget_defaults_private WHERE user_id = $1', [ctx.uid]),
      );
      return { set: false };
    }
    await tx.query(
      `INSERT INTO budget_defaults_private (user_id, amount_minor, currency) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET amount_minor = EXCLUDED.amount_minor, currency = EXCLUDED.currency`,
      [ctx.uid, payload.amount_minor, payload.currency],
    );
    return { set: true };
  },
});
