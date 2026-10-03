/**
 * The legs of one day of one plan version: the synced `plan_legs` rows read live, with an "about"
 * estimate for any pair that has none yet (`dayLegs`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import { dayLegs, type DayLeg, type LegEnd, type StoredLeg } from './day-legs';

export const LEGS_SQL = `SELECT from_key, to_key, mode, minutes, meters, source, approx
  FROM plan_legs WHERE version_id = ? AND day_id = ?`;
const LEGS_TABLES = ['plan_legs'];

export interface DayLegsRead {
  readonly loaded: boolean;
  /** A leg per pair of consecutive `ends`. */
  readonly legs: readonly DayLeg[];
}

/** `ends`: the day in order, usually the stay, the stops, and the stay again. */
export function useDayLegs(
  versionId: string | null,
  dayId: string | null,
  ends: readonly LegEnd[],
): DayLegsRead {
  const stored = useLiveRows<StoredLeg>(
    LEGS_SQL,
    versionId === null || dayId === null ? null : [versionId, dayId],
    LEGS_TABLES,
  );
  return useMemo(
    () => ({ loaded: stored.loaded, legs: dayLegs(ends, stored.rows) }),
    [ends, stored.loaded, stored.rows],
  );
}
