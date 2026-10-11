/**
 * Where a plan day stands on drivers, for any card: a driver is set (who drives), it needs no
 * driver, the member said NOT NOW (folds to "No ride" for them only, at once, before the queued
 * dismissal syncs back), or it has a pickup gap with its reason.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names. */
import { pickupGapFor, rideAppsFor, type GapStop, type PickupGap } from '@cp/domain';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { dismissGapCommand } from '../shared/commands';
import { useAssignments, useDismissedDays } from '../shared/use-drivers';
import { useLiveRows } from '../shared/use-live-rows';

const COUNTRY_SQL = `SELECT d.country FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE t.id = ?`;

export type DriverLeg =
  | { readonly kind: 'none' }
  | { readonly kind: 'assigned'; readonly name: string }
  | { readonly kind: 'no_ride' }
  | { readonly kind: 'gap'; readonly gap: PickupGap; readonly notNow: () => void };

export function useDriverLeg(
  tripId: string,
  date: string | null,
  stops: readonly GapStop[],
  stay: { readonly lat: number; readonly lng: number } | null,
): DriverLeg {
  const dismiss = useCommand(dismissGapCommand);
  const dismissed = useDismissedDays(tripId);
  const [folded, setFolded] = useState(false);
  const assignments = useAssignments(tripId);
  const { rows } = useLiveRows<{ country: string | null }>(
    COUNTRY_SQL,
    [tripId],
    ['trips', 'destinations'],
  );
  if (date === null) return { kind: 'none' };
  const assigned = assignments.rows.find((row) => row.day_date === date);
  if (assigned !== undefined) return { kind: 'assigned', name: assigned.name ?? '' };
  const gap = pickupGapFor({ date, stops }, stay, rideAppsFor(rows[0]?.country ?? null).length > 0);
  if (gap === null) return { kind: 'none' };
  if (folded || dismissed.has(date)) return { kind: 'no_ride' };
  return {
    kind: 'gap',
    gap,
    notNow: () => {
      setFolded(true);
      void dismiss.send({ trip_id: tripId, date });
    },
  };
}
