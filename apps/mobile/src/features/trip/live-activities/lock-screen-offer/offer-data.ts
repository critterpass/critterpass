/**
 * What the lock-screen sheet reads from the phone's own rows: the trip's place, its next meet-up
 * and the crew holding a seat (first names, in joining order).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from '../../hub/data/live-rows';
import type { OfferFacts } from './offer-model';

const TRIP_SQL = `SELECT d.name AS destination, t.tz
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;
const TRIP_TABLES = ['trips', 'destinations'] as const;

const MEETUP_SQL = `SELECT place_name, meet_at FROM meetups
  WHERE trip_id = ? AND status = 'active' ORDER BY meet_at LIMIT 1`;
const MEETUP_TABLES = ['meetups'] as const;

const CREW_SQL = `SELECT u.display_name
  FROM trip_participants p LEFT JOIN users u ON u.id = p.user_id
  WHERE p.trip_id = ? AND p.holds_seat = 1 ORDER BY p.created_at, p.user_id`;
const CREW_TABLES = ['trip_participants', 'users'] as const;

function firstName(name: string | null): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first === '' ? null : first;
}

export interface OfferData {
  readonly facts: OfferFacts;
  /** The trip's zone, for the meet-up's clock time; null until the trip has one. */
  readonly tz: string | null;
}

export function useOfferData(tripId: string): OfferData {
  const trip = useLiveRows<{ destination: string | null; tz: string | null }>(
    TRIP_SQL,
    [tripId],
    TRIP_TABLES,
  ).rows[0];
  const meetup = useLiveRows<{ place_name: string; meet_at: string }>(
    MEETUP_SQL,
    [tripId],
    MEETUP_TABLES,
  ).rows[0];
  const crew = useLiveRows<{ display_name: string | null }>(CREW_SQL, [tripId], CREW_TABLES).rows;
  return useMemo(
    () => ({
      facts: {
        tripName: trip?.destination ?? null,
        meetup:
          meetup === undefined
            ? null
            : { placeName: meetup.place_name, meetAt: new Date(meetup.meet_at) },
        crew: crew.map((member) => firstName(member.display_name)),
      },
      tz: trip?.tz ?? null,
    }),
    [trip, meetup, crew],
  );
}
