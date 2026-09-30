/**
 * The budget step's synced inputs, all readable offline: the crew-level row (counts, and from four
 * maxes the band), a locked plan if there is one, and the public price inputs the server builds its
 * estimates from (`app.setup_budget_inputs`): the crew currency, the dates, each member's home
 * airport and cached flight quote, the destination's reviewed cost index and the latest FX rates.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { BudgetEstimateSource } from '@cp/cost-engine';

import { useLiveRows } from '../../data/rows';
import type { AggregateRow } from '../model';

const AGG_SQL = `SELECT currency, maxes_count, member_count, band_low_minor, band_high_minor,
    step_minor, track_high_minor, bucketed_dots, under_all_ok, infeasible
  FROM trip_budget_aggregates WHERE trip_id = ?`;

const PLAN_SQL = `SELECT target_minor, currency, locked_at FROM budget_plans
  WHERE trip_id = ? AND locked_at IS NOT NULL AND coalesce(is_stale, 0) = 0`;

const TRIP_SQL = `SELECT t.start_date, t.end_date, c.settlement_currency AS currency
  FROM trips t LEFT JOIN crews c ON c.id = t.crew_id WHERE t.id = ?`;

const HOMES_SQL = `SELECT p.user_id AS uid, upper(u.home_airport) AS home
  FROM trip_participants p LEFT JOIN users u ON u.id = p.user_id
  WHERE p.trip_id = ? AND coalesce(p.rsvp, '') <> 'out' ORDER BY p.user_id`;

const FARES_SQL = `SELECT upper(origin) AS origin, min(amount_minor) AS price_minor, currency
  FROM price_quotes WHERE trip_id = ? AND kind = 'flight' AND origin IS NOT NULL
  GROUP BY upper(origin), currency`;

const INDICES_SQL = `SELECT stay_type, nightly_minor_low, nightly_minor_high, food_pp_day_minor,
    fun_pp_day_minor, currency
  FROM destination_cost_indices
  WHERE destination_id = (SELECT destination_id FROM trips WHERE id = ?) AND reviewed_at IS NOT NULL
  ORDER BY stay_type`;

export const FX_SQL = `SELECT id, base, quote, rate, as_of, source FROM fx_snapshots
  WHERE as_of = (SELECT max(as_of) FROM fx_snapshots)`;

export interface FxRow {
  readonly id: string;
  readonly base: string;
  readonly quote: string;
  readonly rate: string | number;
  readonly as_of: string;
  readonly source: string;
}

interface TripRow {
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly currency: string | null;
}

interface IndexRow {
  readonly stay_type: string;
  readonly nightly_minor_low: number;
  readonly nightly_minor_high: number;
  readonly food_pp_day_minor: number;
  readonly fun_pp_day_minor: number;
  readonly currency: string;
}

export interface BudgetInputs {
  readonly loaded: boolean;
  readonly aggregate: AggregateRow | null;
  readonly lockedTargetMinor: number | null;
  readonly source: BudgetEstimateSource | null;
  readonly fx: readonly FxRow[];
}

export function fxRows(rows: readonly FxRow[]): BudgetEstimateSource['fx'] {
  return rows.map((row) => ({ ...row, rate: String(row.rate) }));
}

export function useBudgetInputs(tripId: string): BudgetInputs {
  const params = [tripId];
  const agg = useLiveRows<AggregateRow>(AGG_SQL, params, ['trip_budget_aggregates']);
  const plan = useLiveRows<{ target_minor: number }>(PLAN_SQL, params, ['budget_plans']);
  const trip = useLiveRows<TripRow>(TRIP_SQL, params, ['trips', 'crews']);
  const homes = useLiveRows<{ uid: string; home: string | null }>(HOMES_SQL, params, [
    'trip_participants',
    'users',
  ]);
  const fares = useLiveRows<{ origin: string; price_minor: number; currency: string }>(
    FARES_SQL,
    params,
    ['price_quotes'],
  );
  const indices = useLiveRows<IndexRow>(INDICES_SQL, params, ['destination_cost_indices', 'trips']);
  const fx = useLiveRows<FxRow>(FX_SQL, [], ['fx_snapshots']);
  const loaded = [agg, plan, trip, homes, fares, indices, fx].every((rows) => rows.loaded);
  const row = trip.rows[0];
  const source: BudgetEstimateSource | null =
    row === undefined
      ? null
      : {
          currency: row.currency ?? agg.rows[0]?.currency ?? 'USD',
          start_date: row.start_date,
          end_date: row.end_date,
          members: homes.rows,
          fares: fares.rows.map((fare) => ({ ...fare, days: [] })),
          indices: indices.rows.map((index) => ({
            stay_type: index.stay_type,
            nightly_low_minor: index.nightly_minor_low,
            nightly_high_minor: index.nightly_minor_high,
            food_pp_day_minor: index.food_pp_day_minor,
            fun_pp_day_minor: index.fun_pp_day_minor,
            currency: index.currency,
          })),
          fx: fxRows(fx.rows),
        };
  return {
    loaded,
    aggregate: agg.rows[0] ?? null,
    lockedTargetMinor: plan.rows[0]?.target_minor ?? null,
    source,
    fx: fx.rows,
  };
}
