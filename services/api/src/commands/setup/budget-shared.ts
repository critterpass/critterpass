/**
 * What the budget commands and reads share: the trip's public price inputs (as the server, via
 * `app.setup_budget_inputs`), the $50 step in the crew currency, and the published crew-level band
 * as a `BudgetBand` (the only thing a lock is ever checked against). No function here reads a max.
 */
import {
  bandStepMinor,
  budgetEstimates,
  type BudgetBand,
  type BudgetEstimates,
  type BudgetEstimateSource,
} from '@cp/cost-engine';
import { DomainError } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

export async function loadBudgetEstimates(
  tx: pg.PoolClient,
  tripId: string,
): Promise<BudgetEstimates> {
  const source = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ inputs: BudgetEstimateSource | null }>(
      'SELECT app.setup_budget_inputs($1) AS inputs',
      [tripId],
    );
    return rows[0]?.inputs ?? null;
  });
  if (source === null) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return budgetEstimates(source);
}

/**
 * $50 in the crew currency (two significant digits). With no rate for that currency there is no
 * step: `null`, never a dollar-sized one (5,000 minor units is $50 but only 5,000 ₫). A dollar
 * crew needs no rate.
 */
export function budgetStep(estimates: BudgetEstimates): bigint | null {
  try {
    return bandStepMinor(estimates.currency, estimates.fx);
  } catch {
    return estimates.currency === 'USD' ? bandStepMinor('USD') : null;
  }
}

/**
 * The currency and step every target is held to: the published row's, else the estimates'. Both
 * are public price facts (the crew currency and $50 in it), so the band read may hand them to the
 * app at any crew size. The step is `null` while the crew currency has no rate.
 */
export function lockGrid(
  published: Pick<PublishedBudget, 'currency' | 'stepMinor'> | null,
  estimates: BudgetEstimates,
): { readonly currency: string; readonly stepMinor: bigint | null } {
  return {
    currency: published?.currency ?? estimates.currency,
    stepMinor: published?.stepMinor ?? budgetStep(estimates),
  };
}

export interface PublishedBudget {
  readonly currency: string;
  readonly maxesCount: number;
  readonly memberCount: number;
  readonly band: BudgetBand;
  readonly stepMinor: bigint | null;
}

/** The crew-level budget row as published (never recomputed here). */
export async function publishedBudget(
  tx: pg.PoolClient,
  tripId: string,
): Promise<PublishedBudget | null> {
  const { rows } = await tx.query<{
    currency: string;
    maxes_count: number;
    member_count: number;
    band_low_minor: string | null;
    band_high_minor: string | null;
    step_minor: string | null;
    under_all_ok: boolean | null;
    infeasible: boolean | null;
  }>(
    `SELECT currency, maxes_count, member_count, band_low_minor, band_high_minor, step_minor,
            under_all_ok, infeasible
       FROM trip_budget_aggregates WHERE trip_id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const currency = row.currency;
  const counts = { submitted: row.maxes_count, of: row.member_count };
  const band: BudgetBand =
    row.maxes_count >= 4 && row.band_high_minor !== null && row.band_low_minor !== null
      ? {
          state: 'band',
          ...counts,
          low: { amountMinor: BigInt(row.band_low_minor), currency },
          high: { amountMinor: BigInt(row.band_high_minor), currency },
          underAll: row.under_all_ok === true,
          dots: null,
        }
      : row.maxes_count >= 4 && row.infeasible === true
        ? {
            state: 'no_sweet_spot',
            ...counts,
            feasibleLow: { amountMinor: 0n, currency },
            dots: null,
          }
        : { state: 'waiting', ...counts };
  return {
    currency: row.currency,
    maxesCount: row.maxes_count,
    memberCount: row.member_count,
    band,
    stepMinor: row.step_minor === null ? null : BigInt(row.step_minor),
  };
}
