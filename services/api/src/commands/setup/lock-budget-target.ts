/**
 * `lock_budget_target` (docs/api-contracts.md §4.5). The organiser locks a $50-step target. From
 * four maxes it is checked against the published band only (which the crew already sees): above it
 * answers `STATE_INVALID{over_band}` with no distance, and with no sweet spot at all
 * `STATE_INVALID{infeasible}`. Below four maxes it consults nobody's max. Every attempt counts
 * toward 3 an hour and 10 a day per trip (`RATE_LIMITED`), so repeated locks cannot search for a
 * max. The plan keeps the target, the band it was checked against, the breakdown and stay mix;
 * the step moves on to rooms.
 */
import { breakdownBars, checkLockTarget, planBreakdown } from '@cp/cost-engine';
import { emitEvent } from '@cp/db';
import {
  BUDGET_LOCKS_PER_DAY,
  BUDGET_LOCKS_PER_HOUR,
  DomainError,
  lockBudgetTargetPayloadSchema,
  SETUP_RT,
  type LockBudgetTargetResult,
} from '@cp/domain';

import { checkRateLimit, type RateLimitRedisClient } from '../../abuse/rate-limits';
import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { budgetStep, loadBudgetEstimates, publishedBudget } from './budget-shared';
import { moveStep } from './lock-trip-dates';
import {
  loadSetupTrip,
  publishSetup,
  requireOrganiser,
  requireStatus,
  SETUP_OPEN_STATUSES,
} from './shared';

async function countAttempt(redis: RateLimitRedisClient, tripId: string): Promise<void> {
  for (const [window, rule] of [
    ['h', { windowSeconds: 3_600, max: BUDGET_LOCKS_PER_HOUR }],
    ['d', { windowSeconds: 86_400, max: BUDGET_LOCKS_PER_DAY }],
  ] as const) {
    const decision = await checkRateLimit(redis, `setup:budget-lock:${tripId}:${window}`, rule);
    if (!decision.allowed) {
      throw new DomainError('RATE_LIMITED', { retry_after_s: decision.retryAfterS });
    }
  }
}

export function createLockBudgetTargetCommand(deps: { readonly redis: RateLimitRedisClient }) {
  return defineCommand({
    name: 'lock_budget_target',
    v: 1,
    schema: lockBudgetTargetPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      requireStatus(await requireOrganiser(tx, payload.trip_id), SETUP_OPEN_STATUSES);
    },
    handle: async (tx, payload, ctx): Promise<LockBudgetTargetResult> => {
      await countAttempt(deps.redis, payload.trip_id);
      const estimates = await loadBudgetEstimates(tx, payload.trip_id);
      const published = await publishedBudget(tx, payload.trip_id);
      const currency = published?.currency ?? estimates.currency;
      const step = published?.stepMinor ?? budgetStep(estimates);
      const target = { amountMinor: BigInt(payload.target_minor), currency };
      const band = published?.band ?? { state: 'waiting' as const, submitted: 0, of: 0 };
      const check = checkLockTarget(target, band, step);
      if (!check.ok) {
        throw new DomainError(check.reason === 'off_step' ? 'VALIDATION' : 'STATE_INVALID', {
          reason: check.reason,
          ...(check.reason === 'off_step' ? { step_minor: Number(step) } : {}),
        });
      }
      const plan = planBreakdown(target, estimates);
      const bars = breakdownBars(target, plan);
      const breakdown =
        bars === null
          ? {}
          : {
              flights: Number(bars.flights.amountMinor),
              stays: Number(bars.stays.amountMinor),
              food: Number(bars.food.amountMinor),
              fun: Number(bars.fun.amountMinor),
            };
      await asSystemRole(tx, async () => {
        const trip = await loadSetupTrip(tx, payload.trip_id, true);
        await tx.query(
          `INSERT INTO budget_plans (trip_id, target_minor, currency, band_low_minor, band_high_minor,
             breakdown, stay_mix, locked_at, locked_by, is_stale)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
           ON CONFLICT (trip_id) DO UPDATE
             SET target_minor = EXCLUDED.target_minor, currency = EXCLUDED.currency,
                 band_low_minor = EXCLUDED.band_low_minor, band_high_minor = EXCLUDED.band_high_minor,
                 breakdown = EXCLUDED.breakdown, stay_mix = EXCLUDED.stay_mix,
                 locked_at = EXCLUDED.locked_at, locked_by = EXCLUDED.locked_by, is_stale = false,
                 version = budget_plans.version + 1`,
          [
            payload.trip_id,
            payload.target_minor,
            currency,
            band.state === 'band' ? band.low.amountMinor.toString() : null,
            band.state === 'band' ? band.high.amountMinor.toString() : null,
            JSON.stringify(breakdown),
            plan.stayMix === null ? null : JSON.stringify(plan.stayMix),
            ctx.clock.serverNow,
            ctx.uid,
          ],
        );
        if (trip.setup_step === 'budget') await moveStep(tx, trip, 'rooms', ctx.uid);
      });
      await publishSetup(tx, payload.trip_id, SETUP_RT.budgetLocked, {
        target_minor: payload.target_minor,
        currency,
      });
      await emitEvent(tx, {
        type: 'budget.locked',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: { trip_id: payload.trip_id, checked_against_band: check.checkedAgainstBand },
      });
      return {
        trip_id: payload.trip_id,
        target_minor: payload.target_minor,
        currency,
        checked_against_band: check.checkedAgainstBand,
      };
    },
  });
}
