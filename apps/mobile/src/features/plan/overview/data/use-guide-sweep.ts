/**
 * The one-off highlight sweep on days the guide changed since I last looked (3e-1): applied guide
 * change sets newer than this device's seen marker (`local_state`) name the days to sweep; once
 * the sweep has played the marker moves to the newest one, so each change sweeps once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useCallback, useContext, useMemo } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { guideTouchedDays, type PlanItem } from '../model/plan-model';
import { useLiveRows } from './live-rows';
import { guideSeenKey, SEEN_SQL, SEEN_TABLES, type GuideChangeRow } from './plan-rows';

export interface GuideSweep {
  readonly days: ReadonlySet<number>;
  readonly markSeen: () => void;
}

const FIRST_LOOK_MS = 24 * 60 * 60 * 1000;

/**
 * The change sets newer than `seen`; before this device has seen any, only the last day's, so a
 * fresh install does not sweep the whole trip's history.
 */
export function unseenChanges(
  changes: readonly GuideChangeRow[],
  seen: string | null,
  now: Date = new Date(),
): GuideChangeRow[] {
  const floor = seen === null ? now.getTime() - FIRST_LOOK_MS : Date.parse(seen);
  return changes.filter((row) => row.updated_at !== null && Date.parse(row.updated_at) > floor);
}

export function useGuideSweep(
  tripId: string | null,
  changes: readonly GuideChangeRow[],
  items: readonly PlanItem[],
): GuideSweep {
  const db = useContext(LocalFirstContext)?.db ?? null;
  const key = tripId === null ? null : guideSeenKey(tripId);
  const seen = useLiveRows<{ value: string }>(SEEN_SQL, key === null ? null : [key], SEEN_TABLES);
  const unseen = useMemo(
    () => (seen.loaded ? unseenChanges(changes, seen.rows[0]?.value ?? null) : []),
    [changes, seen.loaded, seen.rows],
  );
  const days = useMemo(() => guideTouchedDays(unseen, items), [unseen, items]);
  const newest = unseen.reduce<number | null>((max, row) => {
    const at = row.updated_at === null ? Number.NaN : Date.parse(row.updated_at);
    return Number.isNaN(at) || (max !== null && max >= at) ? max : at;
  }, null);
  const markSeen = useCallback(() => {
    if (db === null || key === null || newest === null) return;
    void db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      key,
      new Date(newest).toISOString(),
    ]);
  }, [db, key, newest]);
  return { days, markSeen };
}
