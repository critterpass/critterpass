/**
 * The place the Add to plan sheet adds, from synced rows: a curated place by its id, else the
 * trip's idea for it (a place the phone holds no row for, or a dropped pin opened by the idea's
 * own id), with the name, kind and spot the sheet shows and the stop carries.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { shownName } from '@cp/domain';
import { useMemo } from 'react';

import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { useLiveRows } from '@/data/plan/live-rows';

export interface AddSubject {
  readonly poiId: string | null;
  /** The trip idea this add places, if the place is one. */
  readonly ideaId: string | null;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

const SUBJECT_SQL = `SELECT p.id AS poi_id, NULL AS idea_id, p.name, p.name_local, p.category, p.lat,
    p.lng, (SELECT t.destination_id FROM trips t WHERE t.id = ?2) AS destination_id, 0 AS rank
    FROM pois p WHERE p.id = ?1
  UNION ALL
  SELECT i.poi_id, i.id AS idea_id, i.name, i.name_local, i.category, i.lat, i.lng,
    (SELECT t.destination_id FROM trips t WHERE t.id = ?2) AS destination_id, 1 AS rank
    FROM trip_ideas i
   WHERE i.trip_id = ?2 AND i.deleted_at IS NULL AND (i.poi_id = ?1 OR i.id = ?1)
  ORDER BY rank`;

interface SubjectRow {
  readonly poi_id: string | null;
  readonly idea_id: string | null;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly destination_id: string | null;
}

export function useAddSubject(
  tripId: string,
  placeId: string,
): { readonly loaded: boolean; readonly subject: AddSubject | null } {
  const rows = useLiveRows<SubjectRow>(
    SUBJECT_SQL,
    [placeId, tripId],
    ['pois', 'trip_ideas', 'trips'],
  );
  // The name in the reader's language (`@cp/domain` `shownName`), as every list shows it.
  const readsLocal = useReadsLocalNames(rows.rows[0]?.destination_id);
  return useMemo(() => {
    const place = rows.rows[0];
    if (place === undefined) return { loaded: rows.loaded, subject: null };
    const idea = rows.rows.find((row) => row.idea_id !== null);
    return {
      loaded: rows.loaded,
      subject: {
        poiId: place.poi_id,
        ideaId: idea?.idea_id ?? null,
        name: shownName({ name: place.name, nameLocal: place.name_local }, readsLocal),
        category: place.category,
        lat: place.lat,
        lng: place.lng,
      },
    };
  }, [rows.loaded, rows.rows, readsLocal]);
}
