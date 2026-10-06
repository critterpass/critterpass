/**
 * The place the Add to plan sheet adds: the phone's place by its id (the trip's own places and a
 * destination's recommended ones), else the trip's idea for it (or a dropped pin opened by the
 * idea's own id), else the place from the api (a search result, a link, chat), with the name, kind
 * and spot the sheet shows and the stop carries. The stop carries the place's id; its card
 * reaches the phone with the next sync.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { shownName } from '@cp/domain';
import { useMemo } from 'react';

import { usePlaceRead } from '@/data/places/place-read';
import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { useLiveRows } from '@/data/plan/live-rows';
import { dataOf } from '@/data/travel-data/freshness';

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
  const onPhone = rows.rows[0];
  const read = usePlaceRead(rows.loaded && onPhone === undefined ? placeId : null);
  const remote = dataOf(read);
  // The name in the reader's language (`@cp/domain` `shownName`), as every list shows it.
  const readsLocal = useReadsLocalNames(onPhone?.destination_id ?? remote?.destinationId);
  return useMemo(() => {
    const place: SubjectRow | undefined =
      onPhone ??
      (remote === undefined
        ? undefined
        : {
            poi_id: remote.id,
            idea_id: null,
            name: remote.name,
            name_local: remote.nameLocal,
            category: remote.category,
            lat: remote.lat,
            lng: remote.lng,
            destination_id: remote.destinationId,
          });
    // Still asking the api: not loaded yet, so the sheet waits rather than saying it is gone.
    const loaded = rows.loaded && (onPhone !== undefined || read.status !== 'loading');
    if (place === undefined) return { loaded, subject: null };
    const idea = rows.rows.find((row) => row.idea_id !== null);
    return {
      loaded,
      subject: {
        poiId: place.poi_id,
        ideaId: idea?.idea_id ?? null,
        name: shownName({ name: place.name, nameLocal: place.name_local }, readsLocal),
        category: place.category,
        lat: place.lat,
        lng: place.lng,
      },
    };
  }, [rows.loaded, rows.rows, onPhone, remote, read.status, readsLocal]);
}
