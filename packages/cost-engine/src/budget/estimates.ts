/**
 * The budget step's price estimates from public data only (never a max): each member's cached
 * fare from their home airport for the first day, the destination's editorial cost index, and the
 * locked dates' nights and days, all in the crew's currency through one FX run. From them: the
 * cheapest workable trip for anyone in the crew (the band's low end and the infeasibility check)
 * and the breakdown the organiser's target is locked with.
 */
import { assertCurrencyCode, type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { convertWith, type FxContext } from '../shares/fx';
import { budgetBreakdown, feasibleLow, type Breakdown, type CostIndex } from './breakdown';

/** `app.setup_budget_inputs` as JSON. */
export interface BudgetEstimateSource {
  readonly currency: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly members: readonly { readonly uid: string; readonly home: string | null }[];
  readonly fares: readonly {
    readonly origin: string;
    readonly price_minor: number | null;
    readonly currency: string;
    readonly days: readonly { readonly depart_on: string; readonly price_minor: number }[];
  }[];
  readonly indices: readonly {
    readonly stay_type: string;
    readonly nightly_low_minor: number;
    readonly nightly_high_minor: number;
    readonly food_pp_day_minor: number;
    readonly fun_pp_day_minor: number;
    readonly currency: string;
  }[];
  readonly fx: readonly {
    readonly id: string;
    readonly base: string;
    readonly quote: string;
    readonly rate: string;
    readonly as_of: string;
    readonly source: string;
  }[];
}

export interface BudgetEstimates {
  readonly currency: CurrencyCode;
  readonly nights: number;
  readonly days: number;
  /** Each member's flight in the crew currency; `null` when unknown. */
  readonly flights: ReadonlyMap<string, Money | null>;
  readonly index: CostIndex | null;
  readonly fx: FxContext | undefined;
}

function tryConvert(
  amount: Money,
  currency: CurrencyCode,
  fx: FxContext | undefined,
): Money | null {
  try {
    return convertWith(amount, currency, fx);
  } catch {
    return null;
  }
}

export function fxContextOf(source: BudgetEstimateSource): FxContext | undefined {
  const first = source.fx[0];
  if (first === undefined) return undefined;
  return {
    snapshotId: first.id,
    snapshots: source.fx.map((row) => ({
      base: assertCurrencyCode(row.base),
      quote: assertCurrencyCode(row.quote),
      rate: row.rate,
      asOf: row.as_of,
      source: row.source,
    })),
  };
}

export function budgetEstimates(source: BudgetEstimateSource): BudgetEstimates {
  const currency = assertCurrencyCode(source.currency);
  const fx = fxContextOf(source);
  const span =
    source.start_date === null || source.end_date === null
      ? null
      : Math.round((Date.parse(source.end_date) - Date.parse(source.start_date)) / 86_400_000);
  const nights = span === null ? 0 : Math.max(0, span);
  const days = span === null ? 0 : nights + 1;
  const flights = new Map<string, Money | null>();
  for (const member of source.members) {
    const cell = source.fares.find((fare) => fare.origin === member.home);
    const price =
      cell?.days.find((d) => d.depart_on === source.start_date)?.price_minor ??
      cell?.price_minor ??
      null;
    flights.set(
      member.uid,
      cell === undefined || price === null
        ? null
        : tryConvert(
            { amountMinor: BigInt(price), currency: assertCurrencyCode(cell.currency) },
            currency,
            fx,
          ),
    );
  }
  const stays = source.indices.flatMap((row) => {
    const low = tryConvert(
      { amountMinor: BigInt(row.nightly_low_minor), currency: assertCurrencyCode(row.currency) },
      currency,
      fx,
    );
    const high = tryConvert(
      { amountMinor: BigInt(row.nightly_high_minor), currency: assertCurrencyCode(row.currency) },
      currency,
      fx,
    );
    return low === null || high === null
      ? []
      : [
          {
            type: row.stay_type,
            nightlyLowMinor: low.amountMinor,
            nightlyHighMinor: high.amountMinor,
          },
        ];
  });
  const first = source.indices[0];
  const food =
    first === undefined
      ? null
      : tryConvert(
          {
            amountMinor: BigInt(first.food_pp_day_minor),
            currency: assertCurrencyCode(first.currency),
          },
          currency,
          fx,
        );
  const fun =
    first === undefined
      ? null
      : tryConvert(
          {
            amountMinor: BigInt(first.fun_pp_day_minor),
            currency: assertCurrencyCode(first.currency),
          },
          currency,
          fx,
        );
  const index: CostIndex | null =
    stays.length === 0 || food === null || fun === null || days === 0
      ? null
      : { currency, stays, foodPpDayMinor: food.amountMinor, funPpDayMinor: fun.amountMinor };
  return { currency, nights, days, flights, index, fx };
}

/** The cheapest flight any member has (the crew's floor), or `null` when nobody is priced. */
function cheapestFlight(estimates: BudgetEstimates): Money | null {
  let best: Money | null = null;
  for (const flight of estimates.flights.values()) {
    if (flight !== null && (best === null || flight.amountMinor < best.amountMinor)) best = flight;
  }
  return best;
}

/** The cheapest workable trip anyone in the crew could take; `null` when prices are missing. */
export function crewFeasibleLow(estimates: BudgetEstimates): Money | null {
  return feasibleLow({
    flights: cheapestFlight(estimates),
    nights: estimates.nights,
    days: estimates.days,
    index: estimates.index,
  });
}

/** The breakdown a target is locked with (on the crew's cheapest flight). */
export function planBreakdown(target: Money, estimates: BudgetEstimates): Breakdown {
  return budgetBreakdown({
    target,
    flights: cheapestFlight(estimates),
    nights: estimates.nights,
    days: estimates.days,
    index: estimates.index,
  });
}
