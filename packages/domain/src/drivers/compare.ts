/**
 * Comparing drivers on equal terms (6d-1): a per-day, per-car or whole-trip price becomes what each
 * person pays for the chosen days, the lines a driver has not said are counted, and one
 * deterministic line names the biggest risk. Amounts are integer minor units in the driver's own
 * currency; `toCommon` (the app's FX) only ranks drivers quoted in different currencies.
 */
import type { IncludeKey, Includes, PriceUnit } from './schemas';

export interface CompareCandidate {
  readonly id: string;
  readonly name: string;
  readonly priceMinor: number | null;
  readonly currency: string | null;
  readonly priceUnit: PriceUnit | null;
  readonly includedHours: number | null;
  readonly seats: number | null;
  readonly includes: Includes;
  readonly overtimeMinor: number | null;
  readonly licenceShown: boolean | null;
  /** A private tour: the supplier checks licences and its price is all-in per car or group. */
  readonly supplier: boolean;
}

export interface CompareDay {
  readonly date: string;
  /** Hours the day needs a driver for; null when the plan has no times. */
  readonly hours: number | null;
}

/** The lines 6d-1 marks NOT SAID when a driver has not answered them. */
export const COMPARE_ASKABLE = ['tolls', 'entry', 'overtime', 'licence'] as const;
export type CompareAskable = (typeof COMPARE_ASKABLE)[number];

export interface CompareColumn {
  readonly id: string;
  /** The price for one day (or the whole trip for a `trip` price), as quoted. */
  readonly dayMinor: number | null;
  /** Each person's share for all the chosen days, rounded up to the minor unit. */
  readonly eachMinor: number | null;
  readonly cars: number;
  readonly notSaid: readonly CompareAskable[];
  /** Chosen days longer than the hours the price covers. */
  readonly longDays: readonly CompareDay[];
}

export function carsNeeded(people: number, seats: number | null): number {
  if (seats === null || seats <= 0) return 1;
  return Math.max(1, Math.ceil(people / seats));
}

function notSaid(candidate: CompareCandidate): CompareAskable[] {
  if (candidate.supplier) return [];
  const out: CompareAskable[] = [];
  const unknown = (key: IncludeKey) => (candidate.includes[key] ?? 'unknown') === 'unknown';
  if (unknown('tolls')) out.push('tolls');
  if (unknown('entry')) out.push('entry');
  if (candidate.overtimeMinor === null) out.push('overtime');
  if (candidate.licenceShown === null) out.push('licence');
  return out;
}

export function longDays(
  includedHours: number | null,
  days: readonly CompareDay[],
): readonly CompareDay[] {
  if (includedHours === null) return [];
  return days.filter((day) => day.hours !== null && day.hours > includedHours);
}

export function compareColumn(
  candidate: CompareCandidate,
  days: readonly CompareDay[],
  people: number,
): CompareColumn {
  const cars = carsNeeded(people, candidate.seats);
  const base = {
    id: candidate.id,
    cars,
    notSaid: notSaid(candidate),
    longDays: longDays(candidate.includedHours, days),
  };
  if (candidate.priceMinor === null || days.length === 0 || people <= 0) {
    return { ...base, dayMinor: candidate.priceMinor, eachMinor: null };
  }
  const total =
    candidate.priceUnit === 'trip'
      ? candidate.priceMinor
      : candidate.priceUnit === 'group'
        ? candidate.priceMinor * days.length
        : candidate.priceMinor * days.length * cars;
  return { ...base, dayMinor: candidate.priceMinor, eachMinor: Math.ceil(total / people) };
}

export type CompareRisk =
  | { readonly kind: 'overtime_unknown'; readonly name: string; readonly date: string }
  | { readonly kind: 'over_hours'; readonly name: string; readonly date: string }
  | { readonly kind: 'seats_short'; readonly name: string; readonly cars: number }
  | { readonly kind: 'not_said'; readonly name: string; readonly count: number }
  | { readonly kind: 'all_clear'; readonly name: string };

/**
 * The one risk line under the table, about the cheapest driver for each person: a long day his
 * price may not cover (worst when he has not said what overtime costs), too few seats, or lines he
 * has not answered. Null when no driver has a price yet.
 */
export function compareRisk(
  candidates: readonly CompareCandidate[],
  days: readonly CompareDay[],
  people: number,
  toCommon: (minor: number, currency: string) => number | null = (minor) => minor,
): CompareRisk | null {
  let cheapest: { candidate: CompareCandidate; column: CompareColumn; value: number } | null = null;
  for (const candidate of candidates) {
    const column = compareColumn(candidate, days, people);
    if (column.eachMinor === null || candidate.currency === null) continue;
    const value = toCommon(column.eachMinor, candidate.currency);
    if (value === null) continue;
    if (cheapest === null || value < cheapest.value) cheapest = { candidate, column, value };
  }
  if (cheapest === null) return null;
  const { candidate, column } = cheapest;
  const long = column.longDays[0];
  if (long !== undefined) {
    return candidate.overtimeMinor === null && !candidate.supplier
      ? { kind: 'overtime_unknown', name: candidate.name, date: long.date }
      : { kind: 'over_hours', name: candidate.name, date: long.date };
  }
  if (column.cars > 1) return { kind: 'seats_short', name: candidate.name, cars: column.cars };
  if (column.notSaid.length > 0) {
    return { kind: 'not_said', name: candidate.name, count: column.notSaid.length };
  }
  return { kind: 'all_clear', name: candidate.name };
}
