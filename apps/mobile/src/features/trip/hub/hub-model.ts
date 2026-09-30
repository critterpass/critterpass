/**
 * The trip hub's phase and header (3k-1), from the trip and the viewer's own flight: planning
 * (a vote CTA, no countdown), before the trip ("Wheels up in" to the viewer's first departure, or
 * the trip's first day at 00:00 in its zone), a travel day ("Land in" to the flight's arrival),
 * in the trip ("Day 4 of 8" and what's next), and after it ("Home since Oct 19").
 */
/* eslint-disable lingui/no-unlocalized-strings -- trip statuses and wire values, never copy. */
import { localSchedule, toLocalWallTime } from '@cp/domain';

export type HubPhase = 'planning' | 'pre' | 'travel' | 'in' | 'post';

const PLANNING = new Set([
  'voting',
  'won',
  'setup',
  'drafting',
  'draft_review',
  'redrafting',
  'proposed',
]);
const AFTER = new Set(['post_trip', 'archived']);

export interface HubTripInput {
  readonly status: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly tz: string;
  /** C14: the viewer's first outbound departure, computed on the server. */
  readonly countdownTargetAt: string | null;
  readonly landedAt: string | null;
}

export interface HubFlight {
  readonly id: string;
  readonly title: string;
  readonly departsAt: Date;
  readonly arrivesAt: Date | null;
}

export type HubHeader =
  | { readonly phase: 'planning' }
  | { readonly phase: 'pre'; readonly target: Date }
  | { readonly phase: 'travel'; readonly target: Date; readonly flight: HubFlight }
  | { readonly phase: 'in'; readonly day: number; readonly days: number }
  | { readonly phase: 'post'; readonly homeSince: string };

function dayIndex(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/** The trip's first day at 00:00 in its own zone. */
export function tripStartAt(input: HubTripInput): Date | null {
  if (input.startDate === null) return null;
  return localSchedule({ date: input.startDate, time: '00:00', tz: input.tz });
}

export function hubHeader(
  input: HubTripInput,
  flights: readonly HubFlight[],
  now: Date,
): HubHeader {
  if (PLANNING.has(input.status) || input.startDate === null) return { phase: 'planning' };
  const today = toLocalWallTime(now, input.tz).date;
  const end = input.endDate ?? input.startDate;
  if (AFTER.has(input.status) || dayIndex(today) > dayIndex(end)) {
    return { phase: 'post', homeSince: end };
  }
  // A flight of mine in the air, or leaving today and not yet landed: the travel day.
  const flying = flights.find((flight) => {
    if (input.landedAt !== null && flight.departsAt.getTime() < Date.parse(input.landedAt)) {
      return false;
    }
    const arrives = flight.arrivesAt ?? new Date(flight.departsAt.getTime() + 12 * 3_600_000);
    const leavesToday = toLocalWallTime(flight.departsAt, input.tz).date === today;
    return arrives.getTime() > now.getTime() && (leavesToday || flight.departsAt <= now);
  });
  if (flying !== undefined && flying.departsAt.getTime() - now.getTime() < 24 * 3_600_000) {
    return {
      phase: 'travel',
      target:
        flying.departsAt.getTime() > now.getTime() ? flying.departsAt : (flying.arrivesAt ?? now),
      flight: flying,
    };
  }
  const start = tripStartAt(input);
  if (input.status === 'in_trip' || dayIndex(today) >= dayIndex(input.startDate)) {
    return {
      phase: 'in',
      day: Math.max(1, dayIndex(today) - dayIndex(input.startDate) + 1),
      days: dayIndex(end) - dayIndex(input.startDate) + 1,
    };
  }
  const target = input.countdownTargetAt === null ? start : new Date(input.countdownTargetAt);
  return { phase: 'pre', target: target ?? now };
}

/** "17D 05:26:29" (days, then hours:minutes:seconds), tabular. */
export function countdownClock(ms: number, dayUnit: string): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hh = String(Math.floor((total % 86_400) / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return days > 0 ? `${String(days)}${dayUnit} ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export interface LedgerRow {
  readonly debtor_id: string;
  readonly creditor_id: string;
  readonly amount_minor: number;
  readonly currency: string;
}

/** The viewer's net in the trip's main currency: positive is owed to them. */
export function viewerNet(
  rows: readonly LedgerRow[],
  me: string,
  preferred: string | null,
): { readonly amountMinor: number; readonly currency: string } | null {
  const byCurrency = new Map<string, number>();
  for (const row of rows) {
    const sign = row.creditor_id === me ? 1 : row.debtor_id === me ? -1 : 0;
    if (sign === 0) continue;
    byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + sign * row.amount_minor);
  }
  if (byCurrency.size === 0) return null;
  const currency =
    preferred !== null && byCurrency.has(preferred)
      ? preferred
      : [...byCurrency.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0];
  if (currency === undefined) return null;
  return { amountMinor: byCurrency.get(currency) ?? 0, currency };
}
