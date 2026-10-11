/** The caller's trips for the premium Trips tab, live from the synced rows. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { useLiveRows, useOwnerUid } from '@/features/trip/hub/data/live-rows';

import type { PremiumTripRow } from './trips-model';

const TRIPS_SQL = `SELECT t.id, t.crew_id, t.status, t.start_date, t.end_date, t.tz, t.plan_progress,
    d.name AS destination_name, d.slug AS destination_slug, g.slug AS guide_slug
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  WHERE t.status <> 'cancelled'
    AND (t.id IN (SELECT trip_id FROM trip_participants WHERE user_id = ?1)
      OR t.crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = ?1 AND status = 'active'))
  ORDER BY coalesce(t.start_date, '9999'), t.created_at`;
const TABLES = ['trips', 'destinations', 'guides', 'trip_participants', 'crew_members'];

const ACTIVE_CREW_SQL = `SELECT s.active_crew_id AS id FROM user_settings s
  JOIN crew_members m ON m.crew_id = s.active_crew_id AND m.user_id = s.user_id AND m.status = 'active'
  WHERE s.user_id = ?
  UNION ALL SELECT crew_id AS id FROM crew_members WHERE user_id = ? AND status = 'active'
  LIMIT 1`;
const ACTIVE_CREW_TABLES = ['user_settings', 'crew_members'];

export interface PremiumTrips {
  readonly loaded: boolean;
  readonly rows: readonly PremiumTripRow[];
  /** The crew a new vote starts in: the one Home shows, else any crew of the caller's. */
  readonly crewId: string | null;
}

export function usePremiumTrips(): PremiumTrips {
  const me = useOwnerUid();
  const result = useLiveRows<PremiumTripRow>(TRIPS_SQL, me === null ? null : [me], TABLES);
  const crew = useLiveRows<{ id: string }>(
    ACTIVE_CREW_SQL,
    me === null ? null : [me, me],
    ACTIVE_CREW_TABLES,
  );
  return { loaded: result.loaded, rows: result.rows, crewId: crew.rows[0]?.id ?? null };
}
