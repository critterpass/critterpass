/**
 * Who the guide sheet talks to (docs/product-decisions.md, the context guide): the trip named by
 * the route, else the trip the user is on now, else the next confirmed one, else the latest
 * proposal or draft; with none at all the home guide (Tokek) answers. The same order the server
 * uses to open a thread, read from the synced trips.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveQuery } from './live-rows';

export interface GuideTripContext {
  readonly tripId: string;
  readonly crewId: string;
  readonly destination: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  /** Active crew members, the asker included. */
  readonly crewSize: number;
}

export interface GuideContext {
  readonly uid: string | null;
  readonly trip: GuideTripContext | null;
  /** The guide's slug (`tokek`, `pon`, ...) and display name. */
  readonly guideSlug: string;
  readonly guideName: string;
  readonly ready: boolean;
}

interface Row {
  readonly uid: string | null;
  readonly trip_id: string | null;
  readonly crew_id: string | null;
  readonly destination: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly crew_size: number | null;
  readonly slug: string | null;
  readonly name: string | null;
}

const TABLES = ['trips', 'destinations', 'guides', 'crew_members', 'local_state'];

const RANKED = `SELECT t.* FROM trips t
  WHERE t.status NOT IN ('archived', 'cancelled') AND (? IS NULL OR t.id = ?)
  ORDER BY
    CASE
      WHEN t.status = 'in_trip' OR (t.start_date <= date('now') AND t.end_date >= date('now')) THEN 0
      WHEN t.status IN ('confirmed', 'pre_trip') AND coalesce(t.start_date, date('now')) >= date('now') THEN 1
      WHEN t.status IN ('proposed', 'draft_review', 'drafting', 'redrafting', 'setup') THEN 2
      ELSE 3
    END,
    CASE WHEN t.status IN ('confirmed', 'pre_trip') THEN t.start_date END ASC NULLS LAST,
    t.updated_at DESC
  LIMIT 1`;

const SQL = `SELECT (SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}') AS uid,
    t.id AS trip_id, t.crew_id, d.name AS destination, t.start_date, t.end_date,
    (SELECT count(*) FROM crew_members cm WHERE cm.crew_id = t.crew_id AND cm.status = 'active') AS crew_size,
    g.slug, g.name
  FROM (SELECT 1) one
  LEFT JOIN (${RANKED}) t ON 1 = 1
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id`;

export const HOME_GUIDE = { slug: 'tokek', name: 'Tokek' } as const;

export function useGuideContext(tripId: string | null): GuideContext {
  const rows = useLiveQuery<Row>(SQL, [tripId, tripId], TABLES);
  const row = rows?.[0];
  if (row === undefined) {
    return {
      uid: null,
      trip: null,
      guideSlug: HOME_GUIDE.slug,
      guideName: HOME_GUIDE.name,
      ready: false,
    };
  }
  return {
    uid: row.uid,
    trip:
      row.trip_id === null || row.crew_id === null
        ? null
        : {
            tripId: row.trip_id,
            crewId: row.crew_id,
            destination: row.destination,
            startDate: row.start_date,
            endDate: row.end_date,
            crewSize: row.crew_size ?? 1,
          },
    guideSlug: row.slug ?? HOME_GUIDE.slug,
    guideName: row.name ?? HOME_GUIDE.name,
    ready: true,
  };
}
