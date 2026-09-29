/**
 * Which crew and trip Money shows, and who is in it. Money follows the crew the member chose on
 * Home; within it, the trip under way, else the next one, else the latest one that ended. The
 * split members are the trip's seated participants, falling back to the crew's active members.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import type { CrewRow, MemberRow, TripRow } from './queries';

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
    name: firstName(row.display_name),
    joinIndex: index,
    active: row.status === 'active',
  }));
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

/** Who an expense splits between by default: seated participants, else active crew members. */
export function splitMembers(
  members: readonly MoneyMember[],
  participantIds: readonly string[],
): MoneyMember[] {
  const seated = members.filter((member) => participantIds.includes(member.userId));
  return seated.length > 0 ? seated : members.filter((member) => member.active);
}

export function memberName(members: readonly MoneyMember[], userId: string): string {
  return members.find((member) => member.userId === userId)?.name ?? '';
}
