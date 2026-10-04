/**
 * Where the crew stands on a place, from the synced `place_stances` rows (the trip's stream), so a
 * stance said on another phone shows here as soon as it syncs, and the screen reads offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import type { StanceLine } from './split-model';

const STANCES_SQL = `SELECT user_id, stance, note FROM place_stances
  WHERE trip_id = ? AND poi_id = ? ORDER BY created_at, user_id`;
const STANCES_TABLES = ['place_stances'];

export function useStances(tripId: string, poiId: string): readonly StanceLine[] {
  const { rows } = useLiveRows<{ user_id: string; stance: string; note: string | null }>(
    STANCES_SQL,
    [tripId, poiId],
    STANCES_TABLES,
  );
  return useMemo(
    () =>
      rows.flatMap((row) =>
        row.stance === 'want' || row.stance === 'rather_not'
          ? [{ userId: row.user_id, stance: row.stance, note: row.note }]
          : [],
      ),
    [rows],
  );
}
