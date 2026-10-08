/**
 * The TRIPS tab's root: with one trip it is that trip's hub; with more it is the trip switcher,
 * one row per trip not archived: under way, coming up, then being planned ("Bali · in progress",
 * "Kyoto · voting"), with trips that are over and trips called off in their own groups at the foot.
 * With no trip ahead, a way back to Home to start one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and route paths, never copy. */
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { useTripStreams } from '@/data/powersync/use-trip-streams';

import { useLiveRows, useOwnerUid } from '../hub/data/live-rows';
import { guideOr } from '../hub/guide';
import { tripHubRoute } from '../hub/routes';
import { TripListView } from './trip-list-view';
import type { TripListRow } from './trip-row';

export const MY_TRIPS_SQL = `SELECT t.id, t.status, t.start_date, t.end_date,
    d.name AS destination_name, g.slug AS guide_slug
  FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id
  WHERE t.status <> 'archived'
    AND (t.id IN (SELECT trip_id FROM trip_participants WHERE user_id = ?1)
      OR t.crew_id IN (SELECT crew_id FROM crew_members WHERE user_id = ?1 AND status = 'active'))
  ORDER BY CASE t.status WHEN 'in_trip' THEN 0 WHEN 'pre_trip' THEN 1 WHEN 'post_trip' THEN 3
      WHEN 'cancelled' THEN 4 ELSE 2 END,
    coalesce(t.start_date, '9999'), t.created_at`;
const TABLES = ['trips', 'destinations', 'guides', 'trip_participants', 'crew_members'];

/** One trip: its hub with the trip's streams held (the tab's own route has no trip layout). */
function SingleTrip({
  tripId,
  hub,
}: {
  readonly tripId: string;
  readonly hub: (tripId: string) => ReactNode;
}) {
  useTripStreams(tripId);
  return hub(tripId);
}

export function TripListScreen({ hub }: { readonly hub: (tripId: string) => ReactNode }) {
  const me = useOwnerUid();
  const rows = useLiveRows<TripListRow>(MY_TRIPS_SQL, me === null ? null : [me], TABLES);
  // One live trip and nothing called off: the tab is that trip's hub.
  const only = rows.rows.length === 1 ? rows.rows[0] : undefined;
  if (only !== undefined && only.status !== 'cancelled') {
    return <SingleTrip tripId={only.id} hub={hub} />;
  }
  return (
    <TripListView
      state={rows.loaded ? 'ready' : 'loading'}
      trips={rows.rows.map((row) => ({ ...row, guide_slug: guideOr(row.guide_slug) }))}
      onOpen={(tripId) => router.push(tripHubRoute(tripId))}
      onHome={() => router.navigate('/')}
    />
  );
}
