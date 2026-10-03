/**
 * What the crew live map reads from synced rows: the trip (its dates, zone and status for the
 * sharing window), the crew and its members (names, join order for member colours, phone cards),
 * the Boost snapshot, the open crew-map shares and the active meet-up. Everything here works
 * offline; positions and ETAs never come from sync.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

import type { MeetupWire } from '@cp/domain';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';

import { quoted } from '../../chat/data/rows';
import { memberFirstName } from '@/ui/people/member-name';

export interface CrewMate {
  readonly uid: string;
  readonly name: string;
  /** Join order in the crew: the member colour and ring pattern. */
  readonly joinIndex: number;
  /** Shown only when the member shares their number with the crew. */
  readonly phone: string | null;
}

export interface TripCrew {
  readonly tripId: string;
  readonly crewId: string;
  readonly crewName: string;
  readonly destinationId: string | null;
  /** The destination's slug: its region tiles live under it. */
  readonly destinationSlug: string | null;
  readonly status: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly tz: string | null;
  readonly boosted: boolean;
  readonly members: readonly CrewMate[];
  /** Open crew-map shares from sync (the channel's live state wins when it is newer). */
  readonly myShare: { readonly id: string; readonly paused: boolean } | null;
  readonly meetup: MeetupWire | null;
}

const TABLES = [
  'trips',
  'destinations',
  'crews',
  'crew_members',
  'users',
  'crew_contact_cards',
  'trip_entitlements',
  'location_shares',
  'meetups',
];

interface TripRow {
  crew_id: string;
  destination_id: string | null;
  destination_slug: string | null;
  crew_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  tz: string | null;
  boost_active: number | null;
}

interface MeetupRow {
  id: string;
  trip_id: string;
  poi_id: string | null;
  place_name: string;
  lat: number;
  lng: number;
  meet_at: string;
  created_by: string;
  status: string;
  arrived: string | null;
}

function parseArrived(value: string | null): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Synced timestamps may use a space before the time; `null` = until resolved. */
export function isOpen(endsAt: string | null, now: number): boolean {
  if (endsAt === null) return true;
  const at = Date.parse(endsAt.replace(' ', 'T'));
  return Number.isNaN(at) || at > now;
}

export async function loadTripCrew(
  db: AbstractPowerSyncDatabase,
  tripId: string,
  me: string,
  now: number = Date.now(),
): Promise<TripCrew | null> {
  const trip = quoted(tripId);
  const row = await db.getOptional<TripRow>(
    `SELECT t.crew_id, t.destination_id, d.slug AS destination_slug, c.name AS crew_name, t.status, t.start_date, t.end_date,
            coalesce(t.tz, d.tz) AS tz, e.boost_active
       FROM trips t LEFT JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN trip_entitlements e ON e.trip_id = t.id
      WHERE t.id = ${trip}`,
  );
  if (row === null) return null;
  const crew = quoted(row.crew_id);
  const [members, shares, meetup] = await Promise.all([
    db.getAll<{ user_id: string; display_name: string | null; phone: string | null }>(
      `SELECT cm.user_id, u.display_name, cc.phone_display AS phone
         FROM crew_members cm
         LEFT JOIN users u ON u.id = cm.user_id
         LEFT JOIN crew_contact_cards cc ON cc.crew_id = cm.crew_id AND cc.user_id = cm.user_id
        WHERE cm.crew_id = ${crew}
        ORDER BY cm.created_at, cm.user_id`,
    ),
    db.getAll<{ id: string; paused: number; ends_at: string | null }>(
      `SELECT id, paused, ends_at FROM location_shares
        WHERE trip_id = ${trip} AND user_id = ${quoted(me)} AND reason = 'crew_map'
        ORDER BY starts_at DESC`,
    ),
    db.getOptional<MeetupRow>(
      `SELECT id, trip_id, poi_id, place_name, lat, lng, meet_at, created_by, status, arrived
         FROM meetups WHERE trip_id = ${trip} AND status = 'active' LIMIT 1`,
    ),
  ]);
  const share = shares.find((candidate) => isOpen(candidate.ends_at, now)) ?? null;
  return {
    tripId,
    crewId: row.crew_id,
    crewName: row.crew_name ?? '',
    destinationId: row.destination_id,
    destinationSlug: row.destination_slug,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    tz: row.tz,
    boosted: row.boost_active === 1,
    members: members.map((member, index) => ({
      uid: member.user_id,
      name: memberFirstName(member.display_name),
      joinIndex: index,
      phone: member.phone,
    })),
    myShare: share === null ? null : { id: share.id, paused: share.paused === 1 },
    meetup:
      meetup === null
        ? null
        : {
            ...meetup,
            status: 'active',
            arrived: parseArrived(meetup.arrived),
          },
  };
}

/** Live synced facts for the trip; `undefined` while loading, `null` when the trip is unknown. */
export function useTripCrew(tripId: string, me: string | null): TripCrew | null | undefined {
  const { db } = useLocalFirst();
  const [crew, setCrew] = useState<TripCrew | null | undefined>(undefined);
  useEffect(() => {
    if (me === null) return undefined;
    return watchRows<never>(db, 'SELECT 1', TABLES, () => {
      void loadTripCrew(db, tripId, me).then(setCrew, () => setCrew(null));
    });
  }, [db, tripId, me]);
  return crew;
}
