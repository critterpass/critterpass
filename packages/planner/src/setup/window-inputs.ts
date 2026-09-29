/**
 * Turns what the database hands the window engine (`app.setup_window_inputs`: each setup member's
 * date-level days and askable days, the destination's reviewed season months and events, cached
 * fares from each member's home airport, the trip's must-dos with their places' hours) into the
 * engine's input. The api's on-demand windows route and the worker's recompute share it, so both
 * rank windows identically.
 */
import { hoursSchema, WEEKDAYS, type Hours } from '@cp/domain';

import { type MustDoWindowRef, type WindowOptionsInput } from './no-fit-options';
import { addDays, type WindowDayState, type WindowMember } from './windows';

export interface SetupWindowSource {
  readonly members: readonly {
    readonly uid: string;
    readonly home: string | null;
    readonly days: Readonly<Record<string, WindowDayState>>;
    readonly askable: readonly string[];
  }[];
  readonly months: readonly {
    readonly month: number;
    readonly role: 'cheapest' | 'peak' | 'normal' | null;
  }[];
  readonly events: readonly {
    readonly kind: string;
    readonly starts_on: string;
    readonly ends_on: string;
  }[];
  readonly fares: readonly {
    readonly origin: string;
    /** First of the month (`YYYY-MM-01`). */
    readonly month: string;
    readonly price_minor: number | null;
    readonly days: readonly { readonly depart_on: string; readonly price_minor: number }[];
  }[];
  readonly must_dos: readonly {
    readonly id: string;
    readonly owner_id: string;
    readonly hours: unknown;
  }[];
}

/** Events a crew travels for; closures and holidays do not raise a date's season score. */
const HIGHLIGHT_KINDS = new Set(['blossom', 'foliage', 'festival', 'ceremony']);
const NEAR_EVENT_DAYS = 3;

/** Season score of a date, 0–100: a highlight event 100 (85 within three days), else the month. */
export function seasonScorer(
  months: SetupWindowSource['months'],
  events: SetupWindowSource['events'],
): (date: string) => number {
  const roles = new Map(months.map((m) => [m.month, m.role]));
  const highlights = events.filter((e) => HIGHLIGHT_KINDS.has(e.kind));
  return (date) => {
    if (highlights.some((e) => date >= e.starts_on && date <= e.ends_on)) return 100;
    const near = highlights.some(
      (e) =>
        date >= addDays(e.starts_on, -NEAR_EVENT_DAYS) &&
        date <= addDays(e.ends_on, NEAR_EVENT_DAYS),
    );
    if (near) return 85;
    const role = roles.get(Number(date.slice(5, 7)));
    return role === 'peak' ? 70 : role === 'cheapest' ? 45 : role === 'normal' ? 55 : 50;
  };
}

/**
 * The crew's fare for a window: every member with a home airport, flying out on the first day
 * (that day's cached fare, else the month's cheapest). `null` unless every one of them is priced.
 */
export function fareLookup(
  members: SetupWindowSource['members'],
  fares: SetupWindowSource['fares'],
): ((start: string) => bigint | null) | undefined {
  const origins = members.map((m) => m.home).filter((home): home is string => home !== null);
  if (origins.length === 0 || fares.length === 0) return undefined;
  const cells = new Map(fares.map((cell) => [`${cell.origin}:${cell.month.slice(0, 7)}`, cell]));
  return (start) => {
    let total = 0n;
    for (const origin of origins) {
      const cell = cells.get(`${origin}:${start.slice(0, 7)}`);
      const price =
        cell?.days.find((day) => day.depart_on === start)?.price_minor ?? cell?.price_minor ?? null;
      if (price === null || price === undefined) return null;
      total += BigInt(price);
    }
    return total;
  };
}

/** Dates in `[from, to]` the place is open; `null` when its hours are unknown (any day). */
export function openDates(hours: unknown, from: string, to: string): Set<string> | null {
  const parsed = hoursSchema.safeParse(hours);
  if (!parsed.success) return null;
  const value: Hours = parsed.data;
  if (Object.keys(value.weekly).length === 0 && (value.exceptions ?? []).length === 0) return null;
  const open = new Set<string>();
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const exception = value.exceptions?.find((e) => e.date === date);
    const isoDow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const spans = exception ? exception.spans : (value.weekly[WEEKDAYS[isoDow] ?? 'mo'] ?? []);
    if (spans.length > 0) open.add(date);
  }
  return open;
}

export interface WindowInputOptions {
  readonly lengthDays: number;
  readonly from: string;
  readonly horizonDays: number;
}

export function windowInputFrom(
  source: SetupWindowSource,
  options: WindowInputOptions,
): WindowOptionsInput {
  const to = addDays(options.from, options.horizonDays);
  const members: WindowMember[] = source.members.map((m) => ({
    uid: m.uid,
    days: new Map(Object.entries(m.days)),
    askable: new Set(m.askable),
  }));
  const fare = fareLookup(source.members, source.fares);
  const mustDos: MustDoWindowRef[] = source.must_dos.map((m) => ({
    id: m.id,
    ownerId: m.owner_id,
    dates: openDates(m.hours, options.from, to),
  }));
  const hasSeason = source.months.length > 0 || source.events.length > 0;
  return {
    members,
    lengthDays: options.lengthDays,
    from: options.from,
    horizonDays: options.horizonDays,
    ...(hasSeason ? { seasonScore: seasonScorer(source.months, source.events) } : {}),
    ...(fare === undefined ? {} : { fare: (start: string) => fare(start) }),
    mustDos,
  };
}
