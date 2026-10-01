/**
 * The destination guide's rules, apart from any rendering: how the month bars read (height from
 * the crowd index, cheapest and peak months coloured), which calendar month a tapped bar prices,
 * who flies from which airport in the price panel, and the hero's flight and best-month facts.
 */
import type { ExploreDestinationWire } from '@cp/domain';

export type MonthRole = 'cheapest' | 'peak' | 'normal';

export interface MonthPoint {
  readonly month: number;
  readonly crowd_index: number;
  readonly highlight_tag: string | null;
  readonly colour_role: string;
}

export interface MonthBarModel {
  /** 1–12. */
  readonly month: number;
  /** Bar height, 0–1 of the chart (the busiest month fills it). */
  readonly fraction: number;
  readonly role: MonthRole;
  readonly highlight: string | null;
}

const MIN_BAR = 0.12;

/** Twelve bars in calendar order, or none when the curve does not cover the year. */
export function monthBars(curve: readonly MonthPoint[] | null): MonthBarModel[] {
  if (curve === null) return [];
  const byMonth = new Map(curve.map((point) => [point.month, point]));
  if (byMonth.size < 12) return [];
  const busiest = Math.max(1, ...curve.map((point) => point.crowd_index));
  return Array.from({ length: 12 }, (_, index) => {
    const point = byMonth.get(index + 1);
    const role = point?.colour_role;
    return {
      month: index + 1,
      fraction: Math.max(MIN_BAR, Math.min(1, (point?.crowd_index ?? 0) / busiest)),
      role: role === 'cheapest' || role === 'peak' ? role : 'normal',
      highlight: point?.highlight_tag ?? null,
    };
  });
}

export type LegendChip =
  | { readonly kind: 'highlight'; readonly month: number; readonly tag: string }
  | { readonly kind: 'cheapest'; readonly month: number };

/** The legend under the bars: each highlighted month with its tag, then the first cheapest month. */
export function legendChips(bars: readonly MonthBarModel[]): LegendChip[] {
  const chips: LegendChip[] = bars.flatMap((bar) =>
    bar.highlight === null || bar.highlight.trim() === ''
      ? []
      : [{ kind: 'highlight' as const, month: bar.month, tag: bar.highlight }],
  );
  const cheapest = bars.find((bar) => bar.role === 'cheapest');
  if (cheapest !== undefined) chips.push({ kind: 'cheapest', month: cheapest.month });
  return chips;
}

/** `YYYY-MM` of the next time `month` (1–12) comes round, this month included. */
export function monthKeyFor(month: number, today: Date): string {
  const thisMonth = today.getUTCMonth() + 1;
  const year = today.getUTCFullYear() + (month < thisMonth ? 1 : 0);
  return `${String(year)}-${String(month).padStart(2, '0')}`;
}

export type FareWire = ExploreDestinationWire['fares'][number];

export interface PriceRow {
  /** IATA code of the home airport. */
  readonly origin: string;
  /** The viewer flies from here. */
  readonly mine: boolean;
  /** Crewmates (not the viewer) flying from here, by name; unknown people are counted in `others`. */
  readonly names: readonly string[];
  readonly others: number;
  readonly price: { readonly minor: number; readonly currency: string } | null;
  readonly seenAt: string | null;
}

/**
 * One row per home airport, the viewer's first: who flies from it and the cheapest return fare
 * seen for the month, or no price when none was seen.
 */
export function priceRows(
  data: Pick<ExploreDestinationWire, 'fares' | 'origins'>,
  viewerId: string | null,
  names: ReadonlyMap<string, string>,
): PriceRow[] {
  const groups =
    data.origins.length > 0
      ? data.origins
      : data.fares.map((fare) => ({ origin: fare.origin, user_ids: [] as string[] }));
  const rows = groups.map((group): PriceRow => {
    const fare = data.fares.find((candidate) => candidate.origin === group.origin);
    const mates = group.user_ids.filter((id) => id !== viewerId);
    const known = mates.flatMap((id) => {
      const name = names.get(id);
      return name === undefined ? [] : [name];
    });
    return {
      origin: group.origin,
      mine: viewerId !== null && group.user_ids.includes(viewerId),
      names: known,
      others: mates.length - known.length,
      price:
        fare === undefined || fare.state === 'missing' || fare.price_minor === null
          ? null
          : { minor: fare.price_minor, currency: fare.currency },
      seenAt: fare?.seen_at ?? null,
    };
  });
  return rows.sort((a, b) => Number(b.mine) - Number(a.mine));
}

export interface FlightFact {
  readonly origin: string;
  /** Whole hours of the fastest itinerary, when a duration is known. */
  readonly hours: number | null;
  readonly transfers: number | null;
}

/** The hero's flight chip: from the viewer's home airport when it has a fare, else the first seen. */
export function flightFact(
  fares: readonly FareWire[],
  homeAirport: string | null,
): FlightFact | null {
  const usable = fares.filter(
    (fare) =>
      fare.state !== 'missing' &&
      (fare.fastest_duration_min !== null || fare.duration_min !== null || fare.transfers !== null),
  );
  const fare = usable.find((candidate) => candidate.origin === homeAirport) ?? usable[0];
  if (fare === undefined) return null;
  const minutes = fare.fastest_duration_min ?? fare.duration_min;
  return {
    origin: fare.origin,
    hours: minutes === null ? null : Math.max(1, Math.round(minutes / 60)),
    transfers: fare.transfers,
  };
}

/** `[4, 11]` from the synced catalogue's JSON text; anything else is no months. */
export function parseBestMonths(raw: string | null | undefined): number[] {
  if (raw === null || raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as unknown[]).filter(
          (m): m is number => typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= 12,
        )
      : [];
  } catch {
    return [];
  }
}

/** How busy a month is against the year, for the panel's crowd line. */
export function crowdBand(fraction: number): 'quiet' | 'steady' | 'busy' {
  if (fraction >= 0.8) return 'busy';
  return fraction <= 0.45 ? 'quiet' : 'steady';
}
