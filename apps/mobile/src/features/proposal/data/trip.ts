/**
 * What every proposal screen reads about the trip from synced rows: the destination and its
 * guide, the dates, who is signed in, and the crew in join order with each member's public RSVP
 * status and role. Everything here works offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { isGuideStickerId, type GuideStickerId as GuideId } from '@/ui/avatar/guides';

import { firstName } from './format';
import { useLiveRows } from './rows';

export type RsvpStatus = 'unopened' | 'opened' | 'maybe' | 'in' | 'out' | 'waitlisted';

export interface CrewPerson {
  readonly uid: string;
  readonly name: string;
  readonly fullName: string;
  readonly joinIndex: number;
  readonly organiser: boolean;
  readonly rsvp: RsvpStatus;
  /** When the member's RSVP row last changed (public: the reply time, never an open). */
  readonly repliedAt: string | null;
}

export interface ProposalTrip {
  readonly tripId: string;
  readonly crewId: string;
  readonly status: string;
  readonly destination: string;
  /** The destination's catalogue slug (its airports and travel data key). */
  readonly destinationSlug: string | null;
  readonly guide: GuideId;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly me: string;
  readonly isOrganiser: boolean;
  readonly people: readonly CrewPerson[];
  /** Everyone the proposal goes to: the crew other than me. */
  readonly recipients: readonly CrewPerson[];
  /** My share of the trip as the cost engine last priced it. */
  readonly shareMinor: number | null;
  readonly currency: string | null;
}

interface TripRow {
  readonly crew_id: string;
  readonly status: string;
  readonly destination_name: string | null;
  readonly destination_slug: string | null;
  readonly guide_slug: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
}

interface PersonRow {
  readonly user_id: string;
  readonly display_name: string | null;
  readonly role: string | null;
  readonly rsvp: string | null;
  readonly updated_at: string | null;
}

const TRIP_SQL = `SELECT t.crew_id, t.status, d.name AS destination_name, d.slug AS destination_slug, g.slug AS guide_slug,
    t.start_date, t.end_date
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  WHERE t.id = ?`;
const TRIP_TABLES = ['trips', 'destinations', 'guides'];

const PEOPLE_SQL = `SELECT cm.user_id, u.display_name, tp.role, tp.rsvp, tp.updated_at
  FROM trips t
  JOIN crew_members cm ON cm.crew_id = t.crew_id AND cm.status = 'active'
  LEFT JOIN trip_participants tp ON tp.trip_id = t.id AND tp.user_id = cm.user_id
  LEFT JOIN users u ON u.id = cm.user_id
  WHERE t.id = ?
  ORDER BY cm.created_at, cm.user_id`;
const PEOPLE_TABLES = ['trips', 'crew_members', 'trip_participants', 'users'];

const SHARE_SQL = `SELECT total_minor, currency FROM trip_share_totals
  WHERE trip_id = ? AND user_id = ? AND coalesce(is_missing, 0) = 0`;
const SHARE_TABLES = ['trip_share_totals'];

const ME_SQL = 'SELECT value FROM local_state WHERE id = ?';
const ME_TABLES = ['local_state'];

const STATUSES: readonly string[] = ['unopened', 'opened', 'maybe', 'in', 'out', 'waitlisted'];

export function toPerson(row: PersonRow, joinIndex: number): CrewPerson {
  const fullName = row.display_name?.trim() ?? '';
  return {
    uid: row.user_id,
    name: firstName(fullName),
    fullName,
    joinIndex,
    organiser: row.role === 'organiser',
    rsvp: (STATUSES.includes(row.rsvp ?? '') ? row.rsvp : 'unopened') as RsvpStatus,
    repliedAt: row.updated_at,
  };
}

/** The signed-in uid as the local database knows it (its bound owner); null until bound. */
export function useMe(): string | null {
  const { rows } = useLiveRows<{ value: string }>(ME_SQL, [OWNER_UID_KEY], ME_TABLES);
  return rows[0]?.value ?? null;
}

/** The trip's proposal facts; `undefined` while loading, `null` when the trip is not here. */
export function useProposalTrip(tripId: string | null): ProposalTrip | null | undefined {
  const me = useMe();
  const params = tripId === null ? null : [tripId];
  const trip = useLiveRows<TripRow>(TRIP_SQL, params, TRIP_TABLES);
  const people = useLiveRows<PersonRow>(PEOPLE_SQL, params, PEOPLE_TABLES);
  const share = useLiveRows<{ total_minor: number | null; currency: string | null }>(
    SHARE_SQL,
    tripId === null || me === null ? null : [tripId, me],
    SHARE_TABLES,
  );
  if (tripId === null || me === null || !trip.loaded || !people.loaded) return undefined;
  const row = trip.rows[0];
  if (row === undefined) return null;
  const crew = people.rows.map(toPerson);
  const mine = share.rows[0];
  return {
    tripId,
    crewId: row.crew_id,
    status: row.status,
    destination: row.destination_name ?? '',
    destinationSlug: row.destination_slug,
    guide: isGuideStickerId(row.guide_slug) ? row.guide_slug : 'tokek',
    startDate: row.start_date,
    endDate: row.end_date,
    me,
    isOrganiser: crew.some((p) => p.uid === me && p.organiser),
    people: crew,
    recipients: crew.filter((p) => p.uid !== me && p.rsvp !== 'out'),
    shareMinor: mine?.total_minor ?? null,
    currency: mine?.currency ?? null,
  };
}
