/**
 * The guide of what the person is in right now, for the tab bar's guide button and anything else
 * that draws "the guide" outside a trip's own screens (the inbox's empty state): the guide of the
 * trip Home is showing, which is the Home crew's trip under way, else its next trip, planned or
 * locked. Read from the same synced `trips` rows Home's card draws its guide from, so the button,
 * the card and the chat it opens never disagree. Before any trip has a guide it is the default.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useContext, useEffect, useState } from 'react';

import { feedGuides } from '@/data/guides';
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

/** Trips that are over or called off: Home no longer shows them as the next one. */
const OVER: readonly string[] = ['post_trip', 'archived', 'cancelled'];

/**
 * The trip under way wins; else the trip that starts first, whether it is still being planned or
 * already locked in (a trip with no dates yet comes last). A trip with no guide yet (still voting
 * on its place) or one whose guide this phone does not know has no say: the next one does, and
 * with none the default guide stays.
 */
export function currentTripGuide(trips: readonly TripGuideRow[]): ActiveGuide | null {
  const current = trips
    .filter((trip) => !OVER.includes(trip.status) && isGuideId(trip.guide_slug))
    .sort((a, b) => {
      const under = Number(b.status === 'in_trip') - Number(a.status === 'in_trip');
      if (under !== 0) return under;
      if (a.start_date === b.start_date) return a.id.localeCompare(b.id);
      if (a.start_date === null) return 1;
      if (b.start_date === null) return -1;
      return a.start_date.localeCompare(b.start_date);
    })[0];
  return current === undefined || current.guide_slug === null
    ? null
    : { guideId: current.guide_slug };
}

/** The trips of the Home crew (the chosen one, else the first joined) that are not over. */
export const TRIP_GUIDE_SQL = `SELECT t.id, t.status, t.start_date, g.slug AS guide_slug
  FROM trips t LEFT JOIN guides g ON g.id = t.guide_id
  WHERE t.status NOT IN ('post_trip', 'archived', 'cancelled') AND t.crew_id = (
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
  const [read, setRead] = useState<{
    readonly db: unknown;
    readonly rows: readonly TripGuideRow[];
  } | null>(null);
  // The shell is where every session's guide rows and the per-city switch start arriving.
  useEffect(() => (db === null ? undefined : feedGuides(db)), [db]);
  useEffect(() => {
    if (db === null) return undefined;
    return watchQuery<TripGuideRow>(
      db,
      TRIP_GUIDE_SQL,
      [OWNER_UID_KEY],
      TRIP_GUIDE_TABLES,
      (rows) => setRead({ db, rows }),
    );
  }, [db]);
  // Rows read from another session's database (or none open now) are not this one's.
  return currentTripGuide(read !== null && read.db === db ? read.rows : []);
}
