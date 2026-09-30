/**
 * The guide's supplier tools (docs/api-contracts.md §6), registered by `registerApiToolExecutors`:
 *
 * - `ride_quote`: Grab's fare range and pickup time between two points of the turn's trip. Without
 *   an estimate (Grab not in the market, its switch off, no answer) the tool is unavailable, so the
 *   guide says it cannot check rather than guess; it never claims a car is booked.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { DomainError } from '@cp/domain';
import type pg from 'pg';

import { createAuditedSupplierHttp } from './http';
import type { SupplierEnv } from './link-config';
import { createRideQuoter, grabEstimatorFromEnv, type RideQuoter } from './rides-quote';

function turnTrip(context: ToolContext): string {
  if (context.tripId === null) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return context.tripId;
}

export interface SupplierToolDeps {
  readonly quoter: RideQuoter;
}

export function supplierToolDepsFromEnv(
  pool: pg.Pool,
  env: SupplierEnv = process.env,
): SupplierToolDeps {
  const http = createAuditedSupplierHttp(pool);
  return { quoter: createRideQuoter({ pool, grab: grabEstimatorFromEnv(env, http) }) };
}

export function registerSupplierToolExecutors(
  registry: ToolRegistry,
  pool: pg.Pool,
  deps: SupplierToolDeps = supplierToolDepsFromEnv(pool),
): void {
  registry.registerToolExecutor('ride_quote', async (input, context) => {
    const quote = await deps.quoter.quotePoints(
      context.uid,
      turnTrip(context),
      input.from,
      input.to,
    );
    const estimate = quote.estimate;
    if (estimate === null) {
      throw new DomainError('SUPPLIER_UNAVAILABLE', { supplier: 'grab', reason: 'no_estimate' });
    }
    return {
      provider: estimate.provider,
      fare_range_minor: { min: estimate.fare_low_minor, max: estimate.fare_high_minor },
      currency: estimate.currency,
      eta_min: estimate.eta_min,
      deep_link_ref: estimate.deep_link,
    };
  });
}
