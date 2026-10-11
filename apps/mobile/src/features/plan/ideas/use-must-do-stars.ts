/**
 * Must-do stars on Ideas (4.40): each member stars one saved place as their must-do (their primary
 * must-do), and starring another moves it. Reads the trip's must-dos from synced rows (whose star
 * is on which place, how many of the crew have starred one); a star is the member's whole list sent
 * again (`set_must_dos`) with this place first, so it waits in the queue offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { MUST_DOS_PER_MEMBER } from '@cp/domain';
import { useMemo } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useQuietLiveRows } from '@/data/powersync/live-rows';

import { setMustDosCommand } from '../../setup/data/commands';

const SQL = `SELECT id, owner_id, poi_id, title, priority FROM must_dos
  WHERE trip_id = ? AND deleted_at IS NULL ORDER BY priority, created_at, id`;
const TABLES = ['must_dos'];

export interface MustDoRow {
  readonly id: string;
  readonly owner_id: string;
  readonly poi_id: string | null;
  readonly title: string;
  readonly priority: number;
}

export interface StarItem {
  readonly id?: string;
  readonly poi_id?: string;
  readonly text: string;
  readonly priority: number;
}

/**
 * My list after starring (or unstarring) a place: the place becomes my one primary must-do, my
 * earlier primary goes, my other must-dos stay; tapping my own star again takes it off.
 */
export function starredList(
  mine: readonly MustDoRow[],
  place: { readonly poiId: string; readonly name: string },
): StarItem[] {
  const current = mine.find((row) => row.priority === 0);
  const rest = mine
    .filter((row) => row.priority !== 0 && row.poi_id !== place.poiId)
    .map((row) => ({
      id: row.id,
      ...(row.poi_id === null ? {} : { poi_id: row.poi_id }),
      text: row.title,
      priority: row.priority,
    }));
  if (current?.poi_id === place.poiId) return rest;
  return [{ poi_id: place.poiId, text: place.name, priority: 0 }, ...rest].slice(
    0,
    MUST_DOS_PER_MEMBER,
  );
}

export function useMustDoStars(tripId: string, me: string | null) {
  const rows = useQuietLiveRows<MustDoRow>(SQL, [tripId], TABLES);
  const send = useCommand(setMustDosCommand);
  return useMemo(() => {
    const mine = rows.rows.filter((row) => row.owner_id === me);
    const primaries = rows.rows.filter((row) => row.priority === 0 && row.poi_id !== null);
    /** Whose primary must-do each place is. */
    const starredBy = new Map<string, string[]>();
    for (const row of primaries) {
      const poiId = row.poi_id ?? '';
      starredBy.set(poiId, [...(starredBy.get(poiId) ?? []), row.owner_id]);
    }
    const owners = new Set(rows.rows.map((row) => row.owner_id));
    return {
      loaded: rows.loaded,
      myStar: mine.find((row) => row.priority === 0)?.poi_id ?? null,
      starredBy,
      starredCount: owners.size,
      star: (place: { readonly poiId: string; readonly name: string }) =>
        void send.send({ trip_id: tripId, items: starredList(mine, place) }),
    };
  }, [rows.rows, rows.loaded, me, send, tripId]);
}
