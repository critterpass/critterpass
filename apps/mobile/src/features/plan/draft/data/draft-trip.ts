/**
 * What every drafting screen reads from synced rows: the trip (status, dates, destination and its
 * guide, which draft is current), the people on it in crew order, who organises, the redraft
 * quota and the setup inputs a draft is compared against. Everything here works offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { tokens } from '@cp/design-tokens';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { GuideId } from '@/ui/people/GuideLine';

import { redraftQuota, type RedraftQuota } from './quota';
import { useLiveRows } from './rows';
import type { Person, SetupNow } from './version';

export interface DraftTrip {
  readonly tripId: string;
  readonly status: string;
  readonly destinationName: string;
  readonly guide: GuideId;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** The destination's zone: redraft times are read in it. */
  readonly tz: string;
  readonly draftVersionId: string | null;
  readonly people: readonly Person[];
  readonly organisers: readonly Person[];
  readonly me: string;
  readonly isOrganiser: boolean;
  readonly quota: RedraftQuota;
  readonly setup: SetupNow;
}

interface TripRow {
  readonly status: string;
  readonly destination_name: string | null;
  readonly guide_slug: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly draft_version_id: string | null;
  readonly redraft_limit: number | null;
  readonly redrafts: number | null;
  readonly undelivered: number | null;
  readonly budget_version: number | null;
  readonly rooms_version: number | null;
}

interface MemberRow {
  readonly user_id: string;
  readonly role: string;
  readonly display_name: string | null;
}

const TRIP_SQL = `SELECT t.status, d.name AS destination_name, g.slug AS guide_slug, t.start_date,
    t.end_date, coalesce(t.tz, d.tz) AS tz, t.draft_version_id, e.redraft_limit,
    (SELECT count FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = t.id
       AND metric = 'redrafts' AND period_key = 'lifetime') AS redrafts,
    (SELECT count(*) FROM redraft_reservations r JOIN agent_jobs j ON j.id = r.agent_job_id
       WHERE r.trip_id = t.id AND r.status = 'reserved' AND j.status IN ('queued', 'running'))
      AS undelivered,
    (SELECT version FROM budget_plans WHERE trip_id = t.id) AS budget_version,
    (SELECT version FROM room_plans WHERE trip_id = t.id) AS rooms_version
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN trip_entitlements e ON e.trip_id = t.id
  WHERE t.id = ?`;
const TRIP_TABLES = [
  'trips',
  'destinations',
  'guides',
  'trip_entitlements',
  'usage_counters',
  'redraft_reservations',
  'agent_jobs',
  'budget_plans',
  'room_plans',
];

const MEMBERS_SQL = `SELECT p.user_id, p.role, u.display_name
  FROM trip_participants p
  JOIN trips t ON t.id = p.trip_id
  LEFT JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = p.user_id
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.trip_id = ? AND coalesce(p.rsvp, '') <> 'out'
  ORDER BY coalesce(m.created_at, p.created_at), p.user_id`;
const MEMBERS_TABLES = ['trip_participants', 'trips', 'crew_members', 'users'];

const MUST_DOS_SQL = `SELECT id FROM must_dos WHERE trip_id = ? AND deleted_at IS NULL`;
const MUST_DOS_TABLES = ['must_dos'];

const ME_SQL = 'SELECT value FROM local_state WHERE id = ?';
const ME_TABLES = ['local_state'];

const GUIDES: readonly string[] = tokens.guide.order;

export function firstName(displayName: string | null): string {
  return displayName?.trim().split(/\s+/u)[0] ?? '';
}

export function toDraftTrip(
  tripId: string,
  me: string,
  trip: TripRow,
  members: readonly MemberRow[],
  mustDoIds: readonly string[],
): DraftTrip {
  const people = members.map((row, joinIndex) => ({
    uid: row.user_id,
    name: firstName(row.display_name),
    joinIndex,
  }));
  const organiserIds = new Set(
    members.filter((row) => row.role === 'organiser').map((row) => row.user_id),
  );
  return {
    tripId,
    status: trip.status,
    destinationName: trip.destination_name ?? '',
    guide: (GUIDES.includes(trip.guide_slug ?? '') ? trip.guide_slug : 'tokek') as GuideId,
    startDate: trip.start_date,
    endDate: trip.end_date,
    tz: trip.tz ?? 'UTC',
    draftVersionId: trip.draft_version_id,
    people,
    organisers: people.filter((p) => organiserIds.has(p.uid)),
    me,
    isOrganiser: organiserIds.has(me),
    quota: redraftQuota({
      counted: trip.redrafts ?? 0,
      storedLimit: trip.redraft_limit,
      undelivered: trip.undelivered ?? 0,
    }),
    setup: {
      startDate: trip.start_date,
      endDate: trip.end_date,
      mustDoIds,
      budgetVersion: trip.budget_version,
      roomsVersion: trip.rooms_version,
    },
  };
}

/** The signed-in uid as the local database knows it (its bound owner); null until bound. */
function useMe(): string | null {
  const { rows } = useLiveRows<{ value: string }>(ME_SQL, [OWNER_UID_KEY], ME_TABLES);
  return rows[0]?.value ?? null;
}

/** The trip's drafting facts; `undefined` while loading, `null` when the trip is not on this phone. */
export function useDraftTrip(tripId: string): DraftTrip | null | undefined {
  const me = useMe();
  const trip = useLiveRows<TripRow>(TRIP_SQL, [tripId], TRIP_TABLES);
  const members = useLiveRows<MemberRow>(MEMBERS_SQL, [tripId], MEMBERS_TABLES);
  const mustDos = useLiveRows<{ id: string }>(MUST_DOS_SQL, [tripId], MUST_DOS_TABLES);
  if (me === null || !trip.loaded || !members.loaded || !mustDos.loaded) return undefined;
  const row = trip.rows[0];
  if (row === undefined) return null;
  return toDraftTrip(
    tripId,
    me,
    row,
    members.rows,
    mustDos.rows.map((m) => m.id),
  );
}
