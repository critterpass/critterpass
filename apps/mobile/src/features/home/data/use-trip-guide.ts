/**
 * The guide of what the person is in right now, for the tab bar's guide button and anything else
 * that draws "the guide" outside a trip's own screens: the guide of the Home crew's trip under way,
 * else of its next confirmed trip. Read from the same synced `trips` rows Home's cards draw their
 * guide from, so the button and the next-trip card never disagree.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useContext, useEffect, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import type { ActiveGuide } from '@/lib/navigation/active-guide';

import { isGuideId } from '../format';
import { watchQuery } from './watch-query';

export interface TripGuideRow {
  readonly id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly guide_slug: string | null;
}

/** Trips the crew has locked in and not yet finished. */
const LOCKED_IN: readonly string[] = ['in_trip', 'pre_trip', 'confirmed'];

/**
 * The trip under way wins; else the locked-in trip that starts first. A trip still being voted on,
 * set up or drafted has no say (its guide can still change), and neither has one whose guide the
 * app has no sticker for: both leave the default guide.
 */
export function currentTripGuide(trips: readonly TripGuideRow[]): ActiveGuide | null {
  const current = trips
    .filter((trip) => LOCKED_IN.includes(trip.status))
    .sort((a, b) => {
      const under = Number(b.status === 'in_trip') - Number(a.status === 'in_trip');
      if (under !== 0) return under;
      if (a.start_date === b.start_date) return a.id.localeCompare(b.id);
      if (a.start_date === null) return 1;
      if (b.start_date === null) return -1;
      return a.start_date.localeCompare(b.start_date);
    })[0];
  return current !== undefined && isGuideId(current.guide_slug)
    ? { guideId: current.guide_slug }
    : null;
}

/** The locked-in trips of the Home crew (the chosen one, else the first joined). */
export const TRIP_GUIDE_SQL = `SELECT t.id, t.status, t.start_date, g.slug AS guide_slug
  FROM trips t LEFT JOIN guides g ON g.id = t.guide_id
  WHERE t.status IN ('in_trip', 'pre_trip', 'confirmed') AND t.crew_id = (
    SELECT m.crew_id FROM crew_members m JOIN crews c ON c.id = m.crew_id
    WHERE m.status = 'active' AND m.user_id = (SELECT value FROM local_state WHERE id = ?)
    ORDER BY coalesce(m.crew_id = (SELECT s.active_crew_id FROM user_settings s
                                    WHERE s.user_id = m.user_id), 0) DESC, m.created_at, c.id
    LIMIT 1)`;
const TRIP_GUIDE_TABLES = [
  'trips',
  'guides',
  'crew_members',
  'crews',
  'user_settings',
  'local_state',
];

/**
 * A stable hook for `provideActiveGuide`. The tab bar also renders where no session's database is
 * open (a first launch offline, the dev gallery's shell), and there it reports no guide.
 */
export function useCurrentTripGuide(): ActiveGuide | null {
  const db = useContext(LocalFirstContext)?.db ?? null;
  const [rows, setRows] = useState<readonly TripGuideRow[]>([]);
  useEffect(() => {
    if (db === null) {
      setRows([]);
      return undefined;
    }
    return watchQuery<TripGuideRow>(
      db,
      TRIP_GUIDE_SQL,
      [OWNER_UID_KEY],
      TRIP_GUIDE_TABLES,
      setRows,
    );
  }, [db]);
  return currentTripGuide(rows);
}
