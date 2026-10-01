/**
 * The saved hub's local reads: the viewer's saved destinations and places with the offline queue
 * applied, what the device knows about each (its name, category and destination), and their lists.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

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
  const lists = useLiveRows<SavedList>(LISTS_SQL, uid === null ? null : [uid], LISTS_TABLES);

  const rows = useMemo(() => {
    const known = new Map<string, SavedSubject>(
      subjects.rows.map((row) => [
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
    );
    const synced = items.rows.map((row): SavedRow => ({
      id: row.id,
      refId: row.ref_id,
      listName: row.list_name,
      subject: known.get(row.ref_id) ?? null,
      pending: false,
    }));
    return applyQueue(synced, queue.rows.flatMap(queuedOp), known);
  }, [items.rows, queue.rows, subjects.rows]);

  return { rows, lists: lists.rows, loaded: items.loaded && subjects.loaded };
}
