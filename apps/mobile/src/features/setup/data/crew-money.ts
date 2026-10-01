/**
 * Setup amounts in the crew's own currency. Cost indices and fares are quoted in dollars; a crew
 * that settles in đồng reads them in đồng, converted with the day's synced rates (the same rows
 * the budget step prices with) and rounded the way every estimate is (`roundEstimate`: three
 * significant digits, never finer than the cash step). With no rate on the device yet, the amount
 * stays as quoted, in its own currency, rather than hidden.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import {
  assertCurrencyCode,
  convertWith,
  isKnownCurrency,
  roundEstimate,
  type FxContext,
} from '@cp/cost-engine';
import { useMemo } from 'react';

import { FX_SQL, type FxRow } from '../budget/data/use-budget-inputs';
import { useLiveRows } from './rows';

const CREW_CURRENCY_SQL = `SELECT c.settlement_currency AS currency
  FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = ?`;

export interface CrewAmount {
  readonly amountMinor: number;
  readonly currency: string;
}

/** `amountMinor` rounded as an estimate in `currency` (as given when the currency is unknown). */
export function estimateMinor(amountMinor: number, currency: string): number {
  if (!isKnownCurrency(currency) || !Number.isFinite(amountMinor)) return amountMinor;
  return Number(
    roundEstimate({ amountMinor: BigInt(Math.round(amountMinor)), currency }).amountMinor,
  );
}

function contextOf(rows: readonly FxRow[]): FxContext | undefined {
  const first = rows[0];
  if (first === undefined) return undefined;
  try {
    return {
      snapshotId: first.id,
      snapshots: rows.map((row) => ({
        base: assertCurrencyCode(row.base),
        quote: assertCurrencyCode(row.quote),
        rate: String(row.rate),
        asOf: row.as_of,
        source: row.source,
      })),
    };
  } catch {
    return undefined;
  }
}

/**
 * `amountMinor` of `from` in `crewCurrency`, rounded as an estimate; in its own currency (rounded
 * the same way) when it cannot be converted.
 */
export function inCrewCurrency(
  amountMinor: number,
  from: string,
  crewCurrency: string | null,
  fx: readonly FxRow[],
): CrewAmount {
  const quoted = { amountMinor: estimateMinor(amountMinor, from), currency: from };
  if (crewCurrency === null || crewCurrency === from) return quoted;
  try {
    const sign = amountMinor < 0 ? -1 : 1;
    const converted = convertWith(
      {
        amountMinor: BigInt(Math.abs(Math.round(amountMinor))),
        currency: assertCurrencyCode(from),
      },
      assertCurrencyCode(crewCurrency),
      contextOf(fx),
    );
    return {
      amountMinor: sign * estimateMinor(Number(converted.amountMinor), crewCurrency),
      currency: crewCurrency,
    };
  } catch {
    return quoted;
  }
}

/** The trip's crew currency and a converter into it, from synced rows (works offline). */
export function useCrewMoney(tripId: string) {
  const crew = useLiveRows<{ currency: string | null }>(
    CREW_CURRENCY_SQL,
    [tripId],
    ['trips', 'crews'],
  );
  const fx = useLiveRows<FxRow>(FX_SQL, [], ['fx_snapshots']);
  const currency = crew.rows[0]?.currency ?? null;
  return useMemo(
    () => ({
      loaded: crew.loaded && fx.loaded,
      currency,
      convert: (amountMinor: number, from: string) =>
        inCrewCurrency(amountMinor, from, currency, fx.rows),
    }),
    [crew.loaded, fx.loaded, fx.rows, currency],
  );
}
