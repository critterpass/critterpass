/**
 * The open day map route's screen (7b-2) over the synced plan: the day's legs, the chosen day (the
 * picker changes it), back to the day plan, and a card's stop opened in the day plan's sheet.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { tripPlanRoutes } from '../hub/routes';
import { useDayRoute } from '../trip-map/day-route';
import { useTripMapModel } from '../trip-map/use-trip-map-model';
import { DayMapView } from './day-map-view';

export function DayMapScreen({
  tripId,
  dayNo: initialDay,
}: {
  readonly tripId: string;
  readonly dayNo: number;
}) {
  const { data, model } = useTripMapModel(tripId);
  const [dayNo, setDayNo] = useState(initialDay);
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = useDayRoute(data.plan.versionId, day);
  if (!data.loaded) return null;
  return (
    <DayMapView
      model={model}
      dayNo={dayNo}
      onDayNo={setDayNo}
      route={route}
      versionId={data.plan.versionId}
      onBack={() => router.back()}
      onOpenStop={(stableId) => router.push(tripPlanRoutes.day(tripId, dayNo, stableId))}
    />
  );
}
