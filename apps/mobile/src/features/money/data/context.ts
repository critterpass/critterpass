/**
 * Which crew and trip Money shows, and who is in it. Money follows the crew the member chose on
 * Home; within it, the trip under way, else the next one, else the latest one that ended. The
 * split members are the crew's active members seated on the trip, else all its active members.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import type { CrewRow, MemberRow, TripRow } from './queries';
import { memberFirstName } from '@/ui/people/member-name';

export interface MoneyMember {
  readonly userId: string;
  /** First name, as avatars and rows show it. */
  readonly name: string;
  /** Position in the crew's join order: picks the avatar colour. */
  readonly joinIndex: number;
  readonly active: boolean;
}

export interface MoneyTrip {
  readonly id: string;
  readonly status: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly tz: string | null;
  readonly localCurrency: string | null;
  readonly days: number;
  readonly versionId: string | null;
  readonly destinationName: string | null;
  readonly organiser: boolean;
}

export interface MoneyCrew {
  readonly id: string;
  readonly name: string;
  readonly settlementCurrency: string;
  readonly organiser: boolean;
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/u)[0] ?? '';
}

export function pickCrew(crews: readonly CrewRow[], chosen: string | null): CrewRow | null {
  return crews.find((crew) => crew.id === chosen) ?? crews[0] ?? null;
}

const UNDER_WAY = new Set(['in_trip']);
const AHEAD = new Set(['pre_trip', 'confirmed', 'proposed', 'draft_review', 'setup', 'drafting']);
const ENDED = new Set(['post_trip', 'archived']);

/** The requested trip, else the one under way, else the soonest ahead, else the latest ended. */
export function pickTrip(trips: readonly TripRow[], requested: string | null): TripRow | null {
  const asked = trips.find((trip) => trip.id === requested);
  if (asked !== undefined) return asked;
  const underWay = trips.find((trip) => UNDER_WAY.has(trip.status));
  if (underWay !== undefined) return underWay;
  const ahead = trips
    .filter((trip) => AHEAD.has(trip.status))
    .sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'));
  if (ahead[0] !== undefined) return ahead[0];
  return trips.find((trip) => ENDED.has(trip.status)) ?? trips[0] ?? null;
}

/**
 * The crew a money screen shows: the crew of the trip its route names when the viewer is in it (an
 * expense card in another crew's chat), else the crew chosen on Home.
 */
export function crewForRoute(
  crews: readonly CrewRow[],
  chosen: string | null,
  routeCrewId: string | null,
): CrewRow | null {
  return crews.find((crew) => crew.id === routeCrewId) ?? pickCrew(crews, chosen);
}

/**
 * The trip a money screen shows. A trip named by the screen's route is shown or nothing is: the
 * screen never falls back to another trip, so an expense opened from chat is looked up in its own
 * trip and a new one never lands in the wrong one. Without a route trip it follows Balances.
 */
export function tripForRoute(
  trips: readonly TripRow[],
  selected: string | null,
  routeTripId: string | null,
): TripRow | null {
  if (routeTripId !== null) return trips.find((trip) => trip.id === routeTripId) ?? null;
  return pickTrip(trips, selected);
}

const DAY_MS = 86_400_000;

/** Whole days from start to end inclusive; 0 when the dates are not set yet. */
export function tripDays(trip: Pick<TripRow, 'start_date' | 'end_date' | 'trip_length_days'>) {
  if (trip.start_date !== null && trip.end_date !== null) {
    const span =
      Date.parse(`${trip.end_date}T00:00:00Z`) - Date.parse(`${trip.start_date}T00:00:00Z`);
    if (Number.isFinite(span) && span >= 0) return Math.round(span / DAY_MS) + 1;
  }
  return trip.trip_length_days ?? 0;
}

export function toMembers(rows: readonly MemberRow[]): MoneyMember[] {
  return rows.map((row, index) => ({
    userId: row.user_id,
    name: memberFirstName(row.display_name),
    joinIndex: index,
    active: row.status === 'active',
  }));
}

/**
 * The currency a crew's money is in. The server writes it when the crew starts (its creator's home
 * currency) or when its money first needs one (its members' most common home currency, else USD).
 * Until the written value syncs: the currency its ledger is already in, else the viewer's home
 * currency, which is what a crew of one settles in.
 */
export function crewCurrencyOf(
  crew: Pick<CrewRow, 'settlement_currency' | 'ledger_currency'> | null,
  homeCurrency: string | null | undefined,
): string {
  return crew?.settlement_currency ?? crew?.ledger_currency ?? homeCurrency?.toUpperCase() ?? 'USD';
}

export function toTrip(row: TripRow, crew: CrewRow | null): MoneyTrip {
  return {
    id: row.id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    tz: row.tz,
    localCurrency: row.local_currency,
    days: tripDays(row),
    versionId: row.current_version_id,
    destinationName: row.destination_name,
    organiser: row.my_role === 'organiser' || crew?.role === 'organiser',
  };
}

/**
 * Who a new expense can name, as payer or with a share: the crew's active members who hold a seat
 * on the trip (the server refuses anyone else), else every active member while the trip's seats
 * have not synced. Someone who left the crew is never offered; the expenses, shares and balances
 * they already have are read from `members` and stay as they were.
 */
export function splitMembers(
  members: readonly MoneyMember[],
  participantIds: readonly string[],
): MoneyMember[] {
  const active = members.filter((member) => member.active);
  const seated = active.filter((member) => participantIds.includes(member.userId));
  return seated.length > 0 ? seated : active;
}

export function memberName(members: readonly MoneyMember[], userId: string): string {
  return members.find((member) => member.userId === userId)?.name ?? '';
}
