/**
 * The place page's local reads: the place and its destination (zone, guide) from the synced
 * catalogue, the trip's crew for the avatars and the crewmate whose must-do the place is.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { DESTINATION_GUIDE_TABLES, destinationGuideSql, useGuidesPerCity } from '@/data/guides';

import { useLiveRows } from './data/live-rows';

export interface PoiRow {
  readonly id: string;
  readonly destination_id: string | null;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly address: string | null;
  /** JSON text: the weekly opening hours. */
  readonly hours: string | null;
  readonly price_level: number | null;
  /** JSON text: `{why_go, must_see, …}`. */
  readonly editorial: string | null;
  readonly timezone: string | null;
  readonly destination_tz: string | null;
  readonly destination_name: string | null;
  readonly destination_slug: string | null;
  readonly guide_slug: string | null;
}

const PLACE_GUIDE_SQL = `(SELECT s.guide_slug FROM critter_sets s
      WHERE s.destination_id = p.destination_id AND s.guide_slug IS NOT NULL LIMIT 1)`;
const poiSql = (
  perCity: boolean,
) => `SELECT p.id, p.destination_id, p.name, p.name_local, p.category, p.lat, p.lng,
    p.address, p.hours, p.price_level, p.editorial, p.timezone,
    d.tz AS destination_tz, d.name AS destination_name, d.slug AS destination_slug,
    ${destinationGuideSql(perCity, 'd.critter_key', PLACE_GUIDE_SQL)} AS guide_slug
  FROM pois p LEFT JOIN destinations d ON d.id = p.destination_id WHERE p.id = ?`;
const POI_TABLES = ['pois', 'destinations', 'critter_sets', ...DESTINATION_GUIDE_TABLES];

/**
 * The phone's row for a place: the trip's own cards and a browsed destination's places. A place
 * the phone lacks is read through the api by the page (`usePlaceRow`, which asks the api for the
 * profile either way), so this read stays local and the page asks the api once.
 */
export function usePoi(poiId: string | null): {
  readonly row: PoiRow | null;
  readonly loaded: boolean;
} {
  const perCity = useGuidesPerCity();
  const live = useLiveRows<PoiRow>(poiSql(perCity), poiId === null ? null : [poiId], POI_TABLES);
  return { row: live.rows[0] ?? null, loaded: live.loaded };
}

export interface CrewMember {
  readonly uid: string;
  readonly name: string;
  /** Order of joining the crew: fixes the member's colour. */
  readonly joinIndex: number;
}

const CREW_SQL = `SELECT m.user_id, u.display_name FROM trips t
    JOIN crew_members m ON m.crew_id = t.crew_id AND m.status = 'active'
    LEFT JOIN users u ON u.id = m.user_id
  WHERE t.id = ? ORDER BY m.created_at, m.user_id`;
const CREW_TABLES = ['trips', 'crew_members', 'users'];

export function useTripCrew(tripId: string | null): readonly CrewMember[] {
  const { rows } = useLiveRows<{ user_id: string; display_name: string | null }>(
    CREW_SQL,
    tripId === null ? null : [tripId],
    CREW_TABLES,
  );
  return rows.map((row, index) => ({
    uid: row.user_id,
    name: row.display_name ?? '',
    joinIndex: index,
  }));
}

export const PLACE_TRIP_SQL = `SELECT coalesce(t.tz, (SELECT d.tz FROM destinations d WHERE d.id = t.destination_id)) AS tz,
    t.destination_id,
    (SELECT u.display_name FROM must_dos m LEFT JOIN users u ON u.id = m.owner_id
      WHERE m.trip_id = t.id AND m.poi_id = ? AND m.deleted_at IS NULL
      ORDER BY m.created_at LIMIT 1) AS must_do_owner
  FROM trips t WHERE t.id = ?`;
const TRIP_TABLES = ['trips', 'must_dos', 'users', 'destinations'];

export interface TripFacts {
  readonly tz: string | null;
  readonly destinationId: string | null;
  /** The crewmate who put this place on their must-do list, when someone did. */
  readonly mustDoOwner: string | null;
}

export function useTripFacts(tripId: string | null, poiId: string | null): TripFacts {
  const row = useLiveRows<{
    tz: string | null;
    destination_id: string | null;
    must_do_owner: string | null;
  }>(PLACE_TRIP_SQL, tripId === null ? null : [poiId ?? '', tripId], TRIP_TABLES).rows[0];
  return {
    tz: row?.tz ?? null,
    destinationId: row?.destination_id ?? null,
    mustDoOwner: row?.must_do_owner ?? null,
  };
}
