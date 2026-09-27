/**
 * Maps one month of Travelpayouts round trips to a fare cell summary: the cheapest trip, the
 * fastest direct or one-stop outbound ("7H FROM SIN"), the cheapest trip per departure day, and when
 * Aviasales users found the cheapest price. An empty month maps to `null`, never to a zero price.
 */
import type { FareDay } from '@cp/domain';

import type { TravelpayoutsPrice } from './client';

export interface FareCellSummary {
  readonly currency: string;
  readonly priceMinor: number;
  readonly departOn: string;
  readonly returnOn: string | null;
  readonly transfers: number;
  readonly durationMin: number | null;
  /** Shortest outbound among direct and one-stop trips; null when none qualifies. */
  readonly fastestDurationMin: number | null;
  readonly days: readonly FareDay[];
  /** Day the cheapest price was found (from the result's `search_date`), when the API says. */
  readonly foundAt: string | null;
}

/** USD, the only currency fares are requested in, has two minor digits. */
const MINOR_DIGITS: Readonly<Record<string, number>> = { USD: 2 };

function toMinor(price: number, currency: string): number {
  const digits = MINOR_DIGITS[currency];
  if (digits === undefined) throw new Error(`unsupported fare currency ${currency}`);
  return Math.round(price * 10 ** digits);
}

/** `2026-11-11T16:05:00+08:00` → `2026-11-11` (the local departure date the API reports). */
function localDate(instant: string): string {
  return instant.slice(0, 10);
}

/** `search_date=26092026` in the result link → `2026-09-26T00:00:00.000Z`. */
export function foundAtFromLink(link: string | undefined): string | null {
  const match = link?.match(/[?&]search_date=(\d{2})(\d{2})(\d{4})(?:&|$)/);
  if (match === null || match === undefined) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cheapestFirst(a: TravelpayoutsPrice, b: TravelpayoutsPrice): number {
  return a.price - b.price || a.departure_at.localeCompare(b.departure_at);
}

export function mapFareMonth(
  prices: readonly TravelpayoutsPrice[],
  apiCurrency: string,
): FareCellSummary | null {
  const currency = apiCurrency.toUpperCase();
  const sorted = [...prices].sort(cheapestFirst);
  const cheapest = sorted[0];
  if (cheapest === undefined) return null;

  const fastest = prices
    .filter((price) => price.transfers <= 1 && price.duration_to !== undefined)
    .map((price) => price.duration_to as number);

  const byDay = new Map<string, FareDay>();
  for (const price of sorted) {
    const day = localDate(price.departure_at);
    if (byDay.has(day)) continue;
    byDay.set(day, {
      depart_on: day,
      return_on: price.return_at !== undefined ? localDate(price.return_at) : null,
      price_minor: toMinor(price.price, currency),
      transfers: price.transfers,
    });
  }

  return {
    currency,
    priceMinor: toMinor(cheapest.price, currency),
    departOn: localDate(cheapest.departure_at),
    returnOn: cheapest.return_at !== undefined ? localDate(cheapest.return_at) : null,
    transfers: cheapest.transfers,
    durationMin: cheapest.duration_to ?? null,
    fastestDurationMin: fastest.length > 0 ? Math.min(...fastest) : null,
    days: [...byDay.values()].sort((a, b) => a.depart_on.localeCompare(b.depart_on)),
    foundAt: foundAtFromLink(cheapest.link),
  };
}
