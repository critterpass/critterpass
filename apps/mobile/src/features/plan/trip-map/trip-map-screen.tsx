/**
 * The trip map route's screen over the synced plan (7a-1…7a-3, 7i-1): reads the plan I see and
 * everything around it, keeps the chosen day (the `day` the link names, else today during the
 * trip, else the first day with stops), reads that day's legs and opens SHARE over it.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import type { MapSheetSnap } from '@/ui/sheet/map-sheet-snap';

import { hubDay } from '../hub/plan-hub';
import { tripPlanRoutes } from '../hub/routes';
import { useDayRoute } from './day-route';
import { ShareSheet } from './share-sheet';
import { TripMapView } from './trip-map-view';
import { useTripMapModel } from './use-trip-map-model';

export function TripMapScreen({
  tripId,
  day,
  sheet,
}: {
  readonly tripId: string;
  readonly day?: number | null | undefined;
  readonly sheet?: MapSheetSnap | undefined;
}) {
  const { data, model } = useTripMapModel(tripId);
  const [chosen, setChosen] = useState<number | null>(day ?? null);
  const [sharing, setSharing] = useState(false);
  const dayNo =
    chosen ??
    hubDay(
      model.days.map((entry) => ({
        dayNo: entry.dayNo,
        date: entry.date,
        stops: entry.stops.length,
      })),
      data.today,
    );
  const selected = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = useDayRoute(data.plan.versionId, selected);
  if (!data.loaded) return null;
  return (
    <>
      <TripMapView
        model={model}
        dayNo={dayNo}
        onDayNo={setChosen}
        route={route}
        initialSnap={sheet}
        onShare={() => setSharing(true)}
        onOpenDay={(n) => router.push(tripPlanRoutes.day(tripId, n))}
      />
      {sharing ? <ShareSheet plan={data.plan} onClose={() => setSharing(false)} /> : null}
    </>
  );
}
