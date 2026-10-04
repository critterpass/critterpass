/**
 * The place the Add to plan sheet adds, from synced rows: a curated place by its id, else the
 * trip's idea for it (a place the phone holds no row for, or a dropped pin opened by the idea's
 * own id), with the name, kind and spot the sheet shows and the stop carries.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

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

const SUBJECT_SQL = `SELECT p.id AS poi_id, NULL AS idea_id, p.name, p.category, p.lat, p.lng, 0 AS rank
    FROM pois p WHERE p.id = ?1
  UNION ALL
  SELECT i.poi_id, i.id AS idea_id, i.name, i.category, i.lat, i.lng, 1 AS rank
    FROM trip_ideas i
   WHERE i.trip_id = ?2 AND i.deleted_at IS NULL AND (i.poi_id = ?1 OR i.id = ?1)
  ORDER BY rank`;

interface SubjectRow {
  readonly poi_id: string | null;
  readonly idea_id: string | null;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

export function useAddSubject(
  tripId: string,
  placeId: string,
): { readonly loaded: boolean; readonly subject: AddSubject | null } {
  const rows = useLiveRows<SubjectRow>(SUBJECT_SQL, [placeId, tripId], ['pois', 'trip_ideas']);
  return useMemo(() => {
    const place = rows.rows[0];
    if (place === undefined) return { loaded: rows.loaded, subject: null };
    const idea = rows.rows.find((row) => row.idea_id !== null);
    return {
      loaded: rows.loaded,
      subject: {
        poiId: place.poi_id,
        ideaId: idea?.idea_id ?? null,
        name: place.name,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
      },
    };
  }, [rows.loaded, rows.rows]);
}
