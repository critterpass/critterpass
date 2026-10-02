/**
 * What every setup step reads from synced rows: the trip (its step, dates, length, zone and
 * currency), the destination and its guide, the people taking part (everyone on the trip but those
 * who said no) in crew join order, who organises, and the destination vote's score for the header
 * tag. Everything here works offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { TRIP_SETUP_STEPS, type TripSetupStep } from '@cp/domain';

import { isGuideStickerId } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';

import { useLiveRows } from './rows';
import { memberFirstName } from '@/ui/people/member-name';

export interface SetupMember {
  readonly uid: string;
  /** First name, as the crew knows them. */
  readonly name: string;
  /** Crew join order: the member colour. */
  readonly joinIndex: number;
  readonly organiser: boolean;
}

export interface SetupTrip {
  readonly tripId: string;
  readonly crewId: string;
  readonly status: string;
  readonly step: TripSetupStep;
  readonly destinationName: string;
  readonly guide: GuideId;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly tz: string | null;
  readonly lengthDays: number | null;
  readonly currency: string | null;
  readonly seatCap: number | null;
  readonly isSolo: boolean;
  readonly members: readonly SetupMember[];
  readonly me: string;
  readonly isOrganiser: boolean;
  /** The destination vote's winning and runner-up counts ("won 4–2"); null without a vote. */
  readonly score: { readonly won: number; readonly next: number } | null;
}

interface TripRow {
  readonly crew_id: string;
  readonly status: string;
  readonly setup_step: string | null;
  readonly destination_name: string | null;
  readonly guide_slug: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly trip_length_days: number | null;
  readonly local_currency: string | null;
  readonly seat_cap: number | null;
  readonly is_solo: number | null;
}

interface MemberRow {
  readonly user_id: string;
  readonly role: string;
  readonly display_name: string | null;
}

interface TallyRow {
  readonly votes: number;
}

export const TRIP_SQL = `SELECT t.crew_id, t.status, t.setup_step, d.name AS destination_name,
    g.slug AS guide_slug, t.start_date, t.end_date, coalesce(t.tz, d.tz) AS tz, t.trip_length_days,
    t.local_currency, t.seat_cap, t.is_solo
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  WHERE t.id = ?`;
const TRIP_TABLES = ['trips', 'destinations', 'guides'];

/**
 * Who takes part in a trip's setup, the way the server counts them (`app.setup_member_ids`): the
 * trip's active crew members, less anyone who said no to the trip; a solo trip, its participants
 * only. A crew trip starts with the organiser as its one participant, so counting participants
 * would make a crew of five look like a crew of one and offer skips the server refuses.
 */
export const SETUP_MEMBERS_FROM = `FROM trips t
  JOIN crew_members m ON m.crew_id = t.crew_id AND m.status = 'active'
  LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = m.user_id
  LEFT JOIN users u ON u.id = m.user_id
  WHERE t.id = ? AND coalesce(p.rsvp, '') <> 'out'
    AND (coalesce(t.is_solo, 0) = 0 OR p.user_id IS NOT NULL)`;

/** Everyone taking part, in crew join order (member colours follow it). */
export const MEMBERS_SQL = `SELECT m.user_id, coalesce(p.role, 'member') AS role, u.display_name
  ${SETUP_MEMBERS_FROM}
  ORDER BY m.created_at, m.user_id`;
const MEMBERS_TABLES = ['trip_participants', 'trips', 'crew_members', 'users'];

/** Ballots per option of the trip's decided destination vote, most first. */
export const TALLY_SQL = `SELECT count(b.id) AS votes
  FROM polls p JOIN ballots b ON b.poll_id = p.id
  WHERE p.trip_id = ? AND p.kind = 'destination' AND p.status = 'closed'
  GROUP BY b.option_id ORDER BY votes DESC LIMIT 2`;
const TALLY_TABLES = ['polls', 'ballots'];

function stepOf(value: string | null): TripSetupStep {
  return (TRIP_SETUP_STEPS as readonly string[]).includes(value ?? '')
    ? (value as TripSetupStep)
    : 'when';
}

export function firstName(displayName: string | null): string {
  return displayName?.trim().split(/\s+/u)[0] ?? '';
}

export function toSetupTrip(
  tripId: string,
  me: string,
  trip: TripRow,
  members: readonly MemberRow[],
  tally: readonly TallyRow[],
): SetupTrip {
  const people = members.map((row, joinIndex) => ({
    uid: row.user_id,
    name: memberFirstName(row.display_name),
    joinIndex,
    organiser: row.role === 'organiser',
  }));
  const won = tally[0]?.votes;
  return {
    tripId,
    crewId: trip.crew_id,
    status: trip.status,
    step: stepOf(trip.setup_step),
    destinationName: trip.destination_name ?? '',
    guide: isGuideStickerId(trip.guide_slug) ? trip.guide_slug : 'tokek',
    startDate: trip.start_date,
    endDate: trip.end_date,
    tz: trip.tz,
    lengthDays: trip.trip_length_days,
    currency: trip.local_currency,
    seatCap: trip.seat_cap,
    isSolo: trip.is_solo === 1,
    members: people,
    me,
    isOrganiser: people.some((person) => person.uid === me && person.organiser),
    score: won === undefined ? null : { won, next: tally[1]?.votes ?? 0 },
  };
}

/** The trip's setup facts; `undefined` while loading, `null` when the trip is not on this phone. */
export function useSetupTrip(tripId: string, me: string | null): SetupTrip | null | undefined {
  const trip = useLiveRows<TripRow>(TRIP_SQL, [tripId], TRIP_TABLES);
  const members = useLiveRows<MemberRow>(MEMBERS_SQL, [tripId], MEMBERS_TABLES);
  const tally = useLiveRows<TallyRow>(TALLY_SQL, [tripId], TALLY_TABLES);
  if (me === null || !trip.loaded || !members.loaded || !tally.loaded) return undefined;
  const row = trip.rows[0];
  if (row === undefined) return null;
  return toSetupTrip(tripId, me, row, members.rows, tally.rows);
}
