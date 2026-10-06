/**
 * The saved hub's reads: the viewer's saved destinations and places with the offline queue
 * applied, what is known about each (its name, category and destination) and their lists. A saved
 * place the phone does not hold is read through the api (`GET /v1/places/{id}`), whose last good
 * copy answers offline, so a place never synced still shows in its destination's group.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useEffect, useMemo, useState } from 'react';

import { readPlace, type PlaceWire } from '@/data/places/place-read';
import { useTravelDataReader, type TravelDataReader } from '@/data/travel-data/client';
import { dataOf } from '@/data/travel-data/freshness';

import { useLiveRows } from './data/live-rows';
import { useMyUid } from './queries';
import {
  applyQueue,
  type QueuedSavedOp,
  type SavedItemKind,
  type SavedRow,
  type SavedSubject,
} from './saved-model';

const ITEMS_SQL = `SELECT id, ref_id, list_name FROM saved_items
  WHERE user_id = ? AND kind IN ('place', 'poi') ORDER BY created_at, id`;
const ITEMS_TABLES = ['saved_items'];

const QUEUE_SQL = `SELECT id, cmd,
    json_extract(envelope, '$.payload.place_id') AS place_id,
    json_extract(envelope, '$.payload.item_id') AS item_id,
    json_extract(envelope, '$.payload.list_name') AS list_name
  FROM commands WHERE cmd IN ('save_place', 'unsave_place', 'move_saved_item') ORDER BY seq`;
const QUEUE_TABLES = ['commands'];

const SUBJECTS_SQL = `SELECT p.id, 'poi' AS kind, p.name, p.category, p.destination_id,
    d.name AS destination_name, d.slug AS destination_slug
  FROM pois p LEFT JOIN destinations d ON d.id = p.destination_id
  WHERE p.id IN (SELECT value FROM json_each(?))
  UNION ALL
  SELECT d.id, 'place' AS kind, d.name, NULL, d.id, d.name, d.slug FROM destinations d
  WHERE d.id IN (SELECT value FROM json_each(?))`;
const SUBJECTS_TABLES = ['pois', 'destinations'];

const DESTINATIONS_SQL = `SELECT id, name, slug FROM destinations
  WHERE id IN (SELECT value FROM json_each(?))`;

const LISTS_SQL = `SELECT id, name FROM saved_lists WHERE user_id = ? ORDER BY position, created_at`;
const LISTS_TABLES = ['saved_lists'];

interface QueueRow {
  readonly id: string;
  readonly cmd: string;
  readonly place_id: string | null;
  readonly item_id: string | null;
  readonly list_name: string | null;
}

interface SubjectRow {
  readonly id: string;
  readonly kind: SavedItemKind;
  readonly name: string;
  readonly category: string | null;
  readonly destination_id: string | null;
  readonly destination_name: string | null;
  readonly destination_slug: string | null;
}

/** Places asked of the api at a time, so a long saved list does not open dozens of requests. */
const READ_BATCH = 6;

/** The saved places the phone does not hold, read from the api or their last good copies. */
export async function readMissingPlaces(
  reader: TravelDataReader | null,
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<readonly PlaceWire[]> {
  const found: PlaceWire[] = [];
  for (let at = 0; at < ids.length && signal?.aborted !== true; at += READ_BATCH) {
    const states = await Promise.all(
      ids
        .slice(at, at + READ_BATCH)
        .map((id) => readPlace(reader, id, signal === undefined ? {} : { signal })),
    );
    for (const state of states) {
      const place = dataOf(state);
      if (place !== undefined) found.push(place);
    }
  }
  return found;
}

/** The api's places as saved subjects, named for their destinations the catalogue holds. */
export function apiSubjects(
  places: readonly PlaceWire[],
  destinations: readonly { readonly id: string; readonly name: string; readonly slug: string }[],
): ReadonlyMap<string, SavedSubject> {
  const byId = new Map(destinations.map((row) => [row.id, row]));
  return new Map(
    places.map((place) => {
      const destination = place.destinationId === null ? undefined : byId.get(place.destinationId);
      return [
        place.id,
        {
          kind: 'poi',
          name: place.name,
          category: place.category,
          destinationId: place.destinationId,
          destinationName: destination?.name ?? null,
          destinationSlug: destination?.slug ?? null,
        },
      ];
    }),
  );
}

/** Saved places the phone has no row for, through the api; empty until they land. */
function useApiSubjects(missing: readonly string[]): ReadonlyMap<string, SavedSubject> {
  const reader = useTravelDataReader();
  const key = JSON.stringify(missing);
  const [read, setRead] = useState<{ key: string; places: readonly PlaceWire[] } | null>(null);
  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    if (ids.length === 0) return undefined;
    const controller = new AbortController();
    void readMissingPlaces(reader, ids, controller.signal).then((places) => {
      if (!controller.signal.aborted) setRead({ key, places });
    });
    return () => controller.abort();
  }, [reader, key]);
  const places = read?.key === key ? read.places : NO_PLACES;
  const destinationIds = JSON.stringify(
    [...new Set(places.flatMap((place) => place.destinationId ?? []))].sort(),
  );
  const destinations = useLiveRows<{ id: string; name: string; slug: string }>(
    DESTINATIONS_SQL,
    places.length === 0 ? null : [destinationIds],
    ['destinations'],
  ).rows;
  return useMemo(() => apiSubjects(places, destinations), [places, destinations]);
}

const NO_PLACES: readonly PlaceWire[] = [];

function queuedOp(row: QueueRow): QueuedSavedOp[] {
  if (row.cmd === 'save_place' && row.place_id !== null) {
    return [{ cmd: 'save_place', id: row.id, placeId: row.place_id, listName: row.list_name }];
  }
  if (row.cmd === 'unsave_place' && row.place_id !== null) {
    return [{ cmd: 'unsave_place', placeId: row.place_id }];
  }
  if (row.cmd === 'move_saved_item' && row.item_id !== null) {
    return [{ cmd: 'move_saved_item', itemId: row.item_id, listName: row.list_name }];
  }
  return [];
}

export interface SavedList {
  readonly id: string;
  readonly name: string;
}

export interface Saved {
  readonly rows: readonly SavedRow[];
  readonly lists: readonly SavedList[];
  readonly loaded: boolean;
}

export function useSaved(): Saved {
  const uid = useMyUid();
  const items = useLiveRows<{ id: string; ref_id: string; list_name: string | null }>(
    ITEMS_SQL,
    uid === null ? null : [uid],
    ITEMS_TABLES,
  );
  const queue = useLiveRows<QueueRow>(QUEUE_SQL, [], QUEUE_TABLES);
  const refs = useMemo(
    () =>
      JSON.stringify(
        [
          ...new Set([
            ...items.rows.map((row) => row.ref_id),
            ...queue.rows.flatMap((row) => (row.place_id === null ? [] : [row.place_id])),
          ]),
        ].sort(),
      ),
    [items.rows, queue.rows],
  );
  const subjects = useLiveRows<SubjectRow>(SUBJECTS_SQL, [refs, refs], SUBJECTS_TABLES);
  // Only once the phone has answered: what it lacks is then asked of the api.
  const missing = useMemo(() => {
    if (!subjects.loaded) return [];
    const held = new Set(subjects.rows.map((row) => row.id));
    return (JSON.parse(refs) as string[]).filter((id) => !held.has(id));
  }, [subjects.loaded, subjects.rows, refs]);
  const remote = useApiSubjects(missing);
  const lists = useLiveRows<SavedList>(LISTS_SQL, uid === null ? null : [uid], LISTS_TABLES);

  const rows = useMemo(() => {
    const known = new Map<string, SavedSubject>([
      ...remote,
      ...subjects.rows.map((row): [string, SavedSubject] => [
        row.id,
        {
          kind: row.kind,
          name: row.name,
          category: row.category,
          destinationId: row.destination_id,
          destinationName: row.destination_name,
          destinationSlug: row.destination_slug,
        },
      ]),
    ]);
    const synced = items.rows.map((row): SavedRow => ({
      id: row.id,
      refId: row.ref_id,
      listName: row.list_name,
      subject: known.get(row.ref_id) ?? null,
      pending: false,
    }));
    return applyQueue(synced, queue.rows.flatMap(queuedOp), known);
  }, [items.rows, queue.rows, subjects.rows, remote]);

  return { rows, lists: lists.rows, loaded: items.loaded && subjects.loaded };
}
