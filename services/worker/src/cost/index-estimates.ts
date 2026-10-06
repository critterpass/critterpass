/**
 * The editorial cost index as cost lines: food, fun and (when no stay was quoted) the cheapest
 * stay type, from each stop's reviewed index. A trip with one stop gets one line of each from its
 * destination. A trip with several stops keeps one food and one fun line, their amounts added over
 * the stops (each stop's daily rate times its days: its nights, plus the last day for the last
 * stop), and one stay line per stop. When any stop has no reviewed index no line is written at
 * all: a part of the trip is never shown as its total.
 */
import {
  assertCurrencyCode,
  convertWith,
  type CostComponent,
  type CurrencyCode,
} from '@cp/cost-engine';
import { readLatestRates } from '@cp/db';
import type pg from 'pg';

const DAY_MS = 86_400_000;

export interface IndexTrip {
  readonly id: string;
  readonly destination_id: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  /** The currency the trip is priced in. */
  readonly currency: CurrencyCode;
}

export interface IndexEstimates {
  readonly components: CostComponent[];
  /** On a trip with several stops: the nights each stay line prices, in stop order. */
  readonly stayNights?: ReadonlyMap<string, number>;
}

interface IndexRow {
  readonly destination_id: string;
  readonly stay_type: string;
  readonly nightly_minor_high: string;
  readonly food_pp_day_minor: string;
  readonly fun_pp_day_minor: string;
  readonly currency: string;
  readonly reviewed_at: Date;
}

const iso = (value: Date | string) => new Date(value).toISOString();

/** The cheapest reviewed stay row of each destination. */
async function cheapestRows(
  tx: pg.PoolClient,
  destinationIds: readonly string[],
): Promise<Map<string, IndexRow>> {
  const { rows } = await tx.query<IndexRow>(
    `SELECT DISTINCT ON (destination_id) destination_id, stay_type, nightly_minor_high,
            food_pp_day_minor, fun_pp_day_minor, currency, reviewed_at
       FROM destination_cost_indices
      WHERE destination_id = ANY($1::uuid[]) AND reviewed_at IS NOT NULL
      ORDER BY destination_id, nightly_minor_high, stay_type`,
    [destinationIds],
  );
  return new Map(rows.map((row) => [row.destination_id, row]));
}

function oneStop(cheapest: IndexRow, nights: number, hasStayQuote: boolean): CostComponent[] {
  const days = BigInt(nights + 1);
  const base = {
    unit: 'person' as const,
    currency: assertCurrencyCode(cheapest.currency),
    source: 'editorial' as const,
    seenAt: iso(cheapest.reviewed_at),
  };
  return [
    {
      ...base,
      id: 'index:food',
      kind: 'food',
      amountMinor: BigInt(cheapest.food_pp_day_minor) * days,
    },
    {
      ...base,
      id: 'index:fun',
      kind: 'fun',
      amountMinor: BigInt(cheapest.fun_pp_day_minor) * days,
    },
    ...(hasStayQuote || nights === 0
      ? []
      : [
          {
            ...base,
            id: `index:stay:${cheapest.stay_type}`,
            kind: 'stay' as const,
            amountMinor: BigInt(cheapest.nightly_minor_high) * BigInt(nights),
            label: cheapest.stay_type,
          },
        ]),
  ];
}

interface Stop {
  readonly position: number;
  readonly nights: number;
  readonly row: IndexRow;
}

/**
 * Food and fun added over the stops, in the stops' one currency, or in the trip's when they are
 * priced in several (each stop converted first); `null` when a rate is missing.
 */
async function addedOverStops(
  tx: pg.PoolClient,
  stops: readonly Stop[],
  tripCurrency: CurrencyCode,
): Promise<{ currency: CurrencyCode; food: bigint; fun: bigint } | null> {
  const currencies = [...new Set(stops.map((stop) => assertCurrencyCode(stop.row.currency)))];
  const currency = currencies.length === 1 ? (currencies[0] as CurrencyCode) : tripCurrency;
  const fx =
    currencies.length === 1
      ? undefined
      : ((await readLatestRates(tx, tripCurrency, assertCurrencyCode)) ?? undefined);
  let food = 0n;
  let fun = 0n;
  try {
    for (const [index, stop] of stops.entries()) {
      const days = BigInt(stop.nights + (index === stops.length - 1 ? 1 : 0));
      const from = assertCurrencyCode(stop.row.currency);
      const inTrip = (perDay: string) =>
        convertWith({ amountMinor: BigInt(perDay) * days, currency: from }, currency, fx)
          .amountMinor;
      food += inTrip(stop.row.food_pp_day_minor);
      fun += inTrip(stop.row.fun_pp_day_minor);
    }
  } catch {
    return null;
  }
  return { currency, food, fun };
}

async function severalStops(
  tx: pg.PoolClient,
  trip: IndexTrip,
  rows: readonly { position: number; destination_id: string; nights: number }[],
  hasStayQuote: boolean,
): Promise<IndexEstimates> {
  const cheapest = await cheapestRows(
    tx,
    rows.map((row) => row.destination_id),
  );
  const stops = rows.flatMap((stop) => {
    const row = cheapest.get(stop.destination_id);
    return row === undefined ? [] : [{ position: stop.position, nights: stop.nights, row }];
  });
  if (stops.length !== rows.length) return { components: [] };
  const added = await addedOverStops(tx, stops, trip.currency);
  if (added === null) return { components: [] };
  const base = {
    unit: 'person' as const,
    source: 'editorial' as const,
    // The oldest review among the stops: the lines are no fresher than their oldest part.
    seenAt: iso(
      stops.reduce(
        (oldest, stop) => (stop.row.reviewed_at < oldest ? stop.row.reviewed_at : oldest),
        (stops[0] as Stop).row.reviewed_at,
      ),
    ),
  };
  const stayNights = new Map<string, number>();
  const stays: CostComponent[] = hasStayQuote
    ? []
    : stops.map((stop, index) => {
        // The first stop keeps the one-stop id; a later stop's carries its position.
        const id = `index:stay:${stop.row.stay_type}${index === 0 ? '' : `:${stop.position}`}`;
        stayNights.set(id, stop.nights);
        return {
          ...base,
          id,
          kind: 'stay' as const,
          currency: assertCurrencyCode(stop.row.currency),
          seenAt: iso(stop.row.reviewed_at),
          amountMinor: BigInt(stop.row.nightly_minor_high) * BigInt(stop.nights),
          label: stop.row.stay_type,
        };
      });
  return {
    components: [
      {
        ...base,
        id: 'index:food',
        kind: 'food',
        currency: added.currency,
        amountMinor: added.food,
      },
      { ...base, id: 'index:fun', kind: 'fun', currency: added.currency, amountMinor: added.fun },
      ...stays,
    ],
    stayNights,
  };
}

/** Food, fun and (when no stay was quoted) the cheapest stay type, from the reviewed index. */
export async function loadIndexEstimates(
  tx: pg.PoolClient,
  trip: IndexTrip,
  hasStayQuote: boolean,
): Promise<IndexEstimates> {
  if (!trip.destination_id || !trip.start_date || !trip.end_date) return { components: [] };
  const nights = Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / DAY_MS);
  if (nights < 0) return { components: [] };
  const { rows: stops } = await tx.query<{
    position: number;
    destination_id: string;
    nights: number;
  }>(
    'SELECT position, destination_id, nights FROM trip_stops WHERE trip_id = $1 ORDER BY position',
    [trip.id],
  );
  if (stops.length > 1) return severalStops(tx, trip, stops, hasStayQuote);
  const cheapest = (await cheapestRows(tx, [trip.destination_id])).get(trip.destination_id);
  return { components: cheapest ? oneStop(cheapest, nights, hasStayQuote) : [] };
}
