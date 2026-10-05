/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
/**
 * The open day map route's screen (7b-2) over the synced plan: the day's legs, the trip's chosen
 * day (the picker changes it for every view of the plan), back to the day plan, and a card's or a
 * pin's stop opened in its sheet over the map, so closing it returns to the map she was on.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { hrefFor } from '@/lib/navigation/screen-registry';

import { ItemSheetHost } from '../day/item-sheet-host';
import { announceEdit, useDayEditing } from '../day/use-day-editing';
import { useChosenDay } from '../trip-map/chosen-day';
import { legTravel } from './reschedule';
import { useDayRoute } from '../trip-map/day-route';
import { useTripMapModel } from '../trip-map/use-trip-map-model';
import { useBackToTrip } from './back-to-trip';
import { DayGone } from './day-gone';
import { DayMapView } from './day-map-view';

export function DayMapScreen({
  tripId,
  dayNo: initialDay,
}: {
  readonly tripId: string;
  readonly dayNo: number;
}) {
  const { data, model } = useTripMapModel(tripId);
  const [chosen, setDayNo] = useChosenDay(tripId, initialDay);
  const dayNo = chosen ?? initialDay;
  const [openId, setOpenId] = useState<string | null>(null);
  const editor = useDayEditing(data.plan);
  const backToTrip = useBackToTrip(tripId).onBack;
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = useDayRoute(data.plan.versionId, day);
  if (!data.loaded) return null;
  if (day === null) return <DayGone onBack={backToTrip} />;
  const open = day.items.find((entry) => entry.stableId === openId) ?? null;
  return (
    <>
      <DayMapView
        model={model}
        dayNo={dayNo}
        onDayNo={setDayNo}
        route={route}
        versionId={data.plan.versionId}
        onBack={() => router.back()}
        onOpenStop={setOpenId}
        onOpenPlace={(placeId) => {
          const place = hrefFor('7e-1', { placeId, tripId });
          if (place !== undefined) router.push(place);
        }}
      />
      {open === null ? null : (
        <ItemSheetHost
          key={open.stableId}
          plan={data.plan}
          item={open}
          slot={{ dayNo, date: day.date ?? '' }}
          editor={editor}
          announce={announceEdit}
          travel={legTravel(route.legs)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
